// Agent mode: the model PLANS (which tools to call, in what order, when to stop); this code DECIDES what actually runs.
//  - the model only ever sees tools its role is allowed to use, and every call is re-checked here
//  - tool arguments are validated against strict schemas (no user ids, no free-form SQL, nothing unexpected)
//  - hard limits on steps, tool calls and time; every run is audited and leaves a trace
//  - the final answer's numbers are checked against what the tools returned, with one self-correction attempt
const { z } = require('zod');
const config = require('../config');
const db = require('../db');
const audit = require('../audit');
const ai = require('./ai');
const retrieval = require('./retrieval');
const records = require('./records');
const { registry } = require('../tools');

const ALL_ROLES = ['student', 'teacher', 'hod', 'admin', 'applicant', 'visitor'];
const MAX_CALLS_PER_STEP = 3;
const TOOL_TIMEOUT_MS = 15000;
const DAY = z.enum(['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'week']);
const noArgs = { doc: '{}', schema: z.object({}).strict() };
const dayArgs = { doc: '{"day": "today|tomorrow|monday..sunday|week (optional)"}', schema: z.object({ day: DAY.optional() }).strict() };

// argument documentation (shown to the model) + the schema that is actually enforced
const ARGS = {
  student_timetable: dayArgs,
  teacher_timetable: dayArgs,
  campus_location: { doc: '{"place": "name of a room or facility"}', schema: z.object({ place: z.string().trim().min(1).max(100) }).strict() },
  campus_route: {
    doc: '{"place": "destination", "from_place": "start (optional, defaults to the main gate)", "step_free": true or false (optional)}',
    schema: z.object({ place: z.string().trim().min(1).max(100), from_place: z.string().trim().min(1).max(100).optional(), step_free: z.boolean().optional() }).strict(),
  },
};

// exact arithmetic, so the model never has to do it: classes to attend IN A ROW to reach the target
function classesNeeded(present, total, target) {
  if (total <= 0 || (100 * present) / total >= target) return 0;
  return Math.ceil((target * total - 100 * present) / (100 - target) - 1e-9);
}

const EXTRA = {
  search_documents: {
    roles: ALL_ROLES,
    description: 'Search the approved university documents (policies, syllabus, examination procedures, hostel, library, handbook, calendar). Returns numbered excerpts you can cite like [1].',
    doc: '{"query": "what to look for"}',
    schema: z.object({ query: z.string().trim().min(2).max(200) }).strict(),
    run: async ({ user, state }, { query }) => {
      const hits = await retrieval.search(query, user.role);
      if (!hits.length) return { excerpts: [], note: 'No approved document matches this search.' };
      return {
        excerpts: hits.map((h) => {
          const n = state.excerpts.length + 1;
          state.excerpts.push({ n, title: h.title, page: h.page_number, document_id: h.document_id });
          return { n, source: h.title, page: h.page_number, text: h.chunk_text };
        }),
      };
    },
  },
  attendance_planner: {
    roles: ['student'],
    description: "Exact calculation of how many more classes IN A ROW the signed-in student must attend in each subject to reach a target attendance percentage (default 75). Use this instead of doing the arithmetic yourself.",
    doc: '{"target_percent": a number from 50 to 95 (optional, default 75)}',
    schema: z.object({ target_percent: z.number().min(50).max(95).optional() }).strict(),
    run: async ({ user }, { target_percent = 75 }) => {
      const att = await records.getAttendance(user.id);
      const subjects = att.subjects.map((s) => ({
        subject: s.subject_name, present: s.present, total: s.total, current_percentage: Number(s.percentage),
        classes_needed_in_a_row: classesNeeded(s.present, s.total, target_percent),
      }));
      return { target_percent, subjects, total_classes_needed: subjects.reduce((n, s) => n + s.classes_needed_in_a_row, 0),
        already_meets_target_in_every_subject: subjects.every((s) => s.classes_needed_in_a_row === 0) };
    },
  },
  current_time: {
    roles: ALL_ROLES,
    description: "Today's date, weekday and the current time at the university.",
    doc: '{}',
    schema: z.object({}).strict(),
    run: async ({ now }) => ({ date: now.date, weekday: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][now.dow], time: now.time }),
  },
};

// The tools one role may use: existing registry tools + the agent-only tools above
function availableTools(role) {
  const tools = new Map();
  for (const [name, t] of Object.entries(registry)) {
    if (!t.roles.includes(role)) continue;
    const a = ARGS[name] || noArgs;
    tools.set(name, { description: t.description, doc: a.doc, schema: a.schema, run: (ctx, args) => t.run({ user: ctx.user, now: ctx.now }, { message: '', ...args }) });
  }
  for (const [name, t] of Object.entries(EXTRA)) if (t.roles.includes(role)) tools.set(name, t);
  return tools;
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('tool timed out')), ms))]);

function summarize(result) {                       // a short, readable summary for the trace (not the full data)
  if (!result || typeof result !== 'object') return String(result ?? '');
  const parts = Object.entries(result).slice(0, 4).map(([k, v]) => Array.isArray(v) ? `${k}: ${v.length} item${v.length === 1 ? '' : 's'}`
    : v && typeof v === 'object' ? `${k}: {…}` : `${k}: ${String(v).slice(0, 40)}`);
  return parts.join('; ');
}

async function execute(name, rawArgs, ctx, tools) {
  const tool = tools.get(name);
  if (!tool) return { ok: false, denied: true, error: `Unknown or not permitted tool "${String(name).slice(0, 40)}". Use only: ${[...tools.keys()].join(', ')}` };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: `Invalid arguments for ${name}: ${parsed.error.issues[0].message}. Expected ${tool.doc}` };
  try {
    const out = (await withTimeout(tool.run(ctx, parsed.data), TOOL_TIMEOUT_MS)) || {};
    const { _ui: ui, ...result } = out;           // _ui is for the app (e.g. "show on map"), not for the model
    return { ok: true, result, ui };
  } catch (err) {
    console.error(`agent tool ${name} failed:`, err.message);
    return { ok: false, error: 'The tool failed. Try a different approach or say the information is unavailable.' };
  }
}

// ---- grounding check: every non-trivial number in the answer must come from a tool result or the question
const numbersIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);
function ungroundedNumbers(answer, observations, question) {
  const allowed = new Set([...numbersIn(JSON.stringify(observations.map((o) => o.result ?? null))), ...numbersIn(question)]);
  return [...new Set(numbersIn(answer).filter((n) => !(Number.isInteger(n) && n <= 10) && !allowed.has(n)))];
}

async function enforceRate(user) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1 AND action = 'agent_start' AND created_at > now() - interval '1 minute'", [user.id]);
  if (rows[0].n >= config.agentRunsPerMinute) {
    const e = new Error('agent rate limit'); e.status = 429; e.userMessage = 'Agent mode is limited to a few runs per minute. Please wait a moment.';
    throw e;
  }
}

async function plan(payload) {                      // one retry if the model returned an invalid plan
  try { return await ai.agentStep(payload); } catch (first) {
    console.error('agent planning failed, retrying once:', first.message);
    return ai.agentStep(payload);
  }
}

async function runAgent({ user, message, history, now }) {
  await enforceRate(user);
  const started = Date.now();
  await audit(user.id, 'agent_start', 'chat', null, { role: user.role });
  const tools = availableTools(user.role);
  const toolDocs = [...tools].map(([name, t]) => ({ name, description: t.description.slice(0, 400), args: t.doc }));
  const state = { excerpts: [] };
  const ctx = { user, now, state };
  const hist = history.slice(-4).map((h) => ({ role: h.role, content: String(h.content).slice(0, 3000) }));
  const observations = [];
  const trace = [];
  let toolCalls = 0, ui = null, repaired = false, hint = null, answer = null;

  for (let step = 1; ; step++) {
    if (step > config.agentMaxSteps + (repaired ? 1 : 0)) break;
    const force = step >= config.agentMaxSteps || toolCalls >= config.agentMaxToolCalls || Date.now() - started > config.agentTimeoutMs;
    const out = await plan({
      question: message, history: hist, tools: toolDocs, step: Math.min(step, config.agentMaxSteps), max_steps: config.agentMaxSteps, force_final: force, hint,
      user: { first_name: user.full_name.split(' ')[0].slice(0, 60), role: user.role },
      observations: observations.map((o) => ({ tool: o.tool.slice(0, 60), args: o.args, ok: o.ok, result: o.ok ? o.result : null, error: o.ok ? null : String(o.error).slice(0, 500) })),
    });
    hint = null;

    if (out.final) {                                                   // the model wants to answer
      const bad = ungroundedNumbers(out.final, observations, message);
      if (bad.length && !repaired) {                                   // self-correction: one chance to fix unsupported numbers
        repaired = true;
        hint = `Your draft contains numbers that no tool returned: ${bad.slice(0, 6).join(', ')}. Rewrite the answer using only numbers from the observations (call a tool if you need more data), or say the figure is not available.`;
        trace.push({ step, thought: out.thought, repair: { unsupported_numbers: bad.slice(0, 6) } });
        continue;
      }
      answer = bad.length ? `${out.final}\n\n_(Some figures could not be verified against the university records.)_` : out.final;
      trace.push({ step, thought: out.thought, final: true });
      break;
    }

    const entry = { step, thought: out.thought, calls: [] };
    for (const [i, call] of (out.calls || []).entries()) {
      let res;
      if (i >= MAX_CALLS_PER_STEP || toolCalls >= config.agentMaxToolCalls) res = { ok: false, error: 'Tool call limit reached. Give your final answer with what you have.' };
      else {
        const t0 = Date.now();
        res = await execute(call.tool, call.args, ctx, tools);
        res.ms = Date.now() - t0;
        toolCalls++;
        if (res.denied) await audit(user.id, 'agent_tool_denied', 'chat', null, { tool: String(call.tool).slice(0, 60), role: user.role });
        if (res.ui) ui = res.ui;
      }
      observations.push({ tool: String(call.tool), args: call.args || {}, ok: res.ok, result: res.result, error: res.error });
      entry.calls.push({ tool: String(call.tool), args: call.args || {}, ok: res.ok, ms: res.ms ?? 0, summary: res.ok ? summarize(res.result) : res.error.slice(0, 160) });
    }
    trace.push(entry);
  }

  if (!answer) throw new Error('agent did not finish');
  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
  const sources = state.excerpts.filter((e) => cited.includes(e.n));
  await audit(user.id, 'agent_run', 'chat', null, {
    steps: trace.length, tool_calls: toolCalls, tools: [...new Set(observations.map((o) => o.tool))], repaired, ms: Date.now() - started });
  return { answer, intent: 'agent', sources, ui, trace };
}

module.exports = { runAgent, availableTools, classesNeeded, ungroundedNumbers, execute };
