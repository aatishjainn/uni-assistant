// Decides how each chat message is handled. The AI only SUGGESTS an intent;
// this code decides whether it is allowed and what data (if any) is fetched.
const db = require('../db');
const audit = require('../audit');
const config = require('../config');
const ai = require('./ai');
const retrieval = require('./retrieval');
const agentRunner = require('./agent');
const { nowInTz } = require('./time');
const { registry, META, catalog } = require('../tools');

const PERSONAL_HINT = /\b(my|me|mine|i|i'm|attendance|timetable|schedule|exams?|marks|grades?|results?|class|classes|classroom|lab|room|semester|subjects?|teach|teaching|assigned|faculty|hod|head|department|admissions?|admit|apply|application|eligib\w*|eligible|fees?|deadline|last date|courses?|documents?|contact|scholarships?|hostel|library|campus|notices?|announcements?|leave|id card|students?|syllabus|policy|policies|rules?|procedure|procedures|grievance|placements?|internships?|transport|certificates?|transcripts?|events?|calendar|where|route|directions?|reach|map|navigate|building|floor|gate|canteen|cafeteria|block|located|location|office|wheelchair)\b/i;
// Words that clearly mean "this university's admissions". The AI classifier can be wrong or unavailable, so these are
// a second opinion: such a question is never answered with generic advice.
const ADMISSION_WORDS = /\b(admissions?|eligib\w*|scholarships?)\b/i;
const DAYS = new Set(['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'week']);

const MSG = {
  other: "I can only share your own records. I can't look up another person's attendance, marks, timetable or personal details.",
  unclear: "I'm not sure what you're asking. Could you rephrase it? I can explain study topics, generate MCQs, answer admission and university questions from approved documents, and (for students) tell you your attendance, timetable, next class, exams and marks.",
  noInfo: "I don't have verified university information about that, so I won't guess. It isn't in the approved documents I have. Please check with the relevant university office.",
};
const denied = (roles) => `I can't help with that for your account. That information is only available to ${roles.join(' / ')} accounts.`;

// Deterministic guard (does not rely on the AI): does the message name some OTHER person?
async function mentionsOtherPerson(message, userId) {
  const { rows } = await db.query(
    `SELECT u.full_name, s.student_number FROM users u LEFT JOIN students s ON s.user_id = u.id
      WHERE u.id <> $1 AND u.is_active LIMIT 5000`, [userId]);
  const text = message.toLowerCase();
  const words = new Set(text.match(/[a-z0-9]+/g) || []);
  for (const r of rows) {
    if (r.student_number && text.includes(r.student_number.toLowerCase())) return true;
    const name = r.full_name.toLowerCase();
    if (text.includes(name)) return true;
    const first = (name.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/, '').match(/[a-z]+/) || [])[0];
    if (first && first.length >= 3 && words.has(first)) return true;
  }
  return false;
}

const clip = (history, n) => history.slice(-n).map((h) => ({ role: h.role, content: String(h.content).slice(0, 3500) }));
const firstName = (user) => user.full_name.split(' ')[0].slice(0, 60);

async function refuse(user, intent, reason, message, text) {
  await audit(user.id, 'chat_access_denied', 'chat', null, { intent, reason, role: user.role, message: message.slice(0, 200) });
  return { answer: text, intent: 'denied', sources: [] };
}

// Answers from approved documents (RAG) and cites the excerpts that were used
async function answerFromDocuments({ user, message, history }) {
  // A short follow-up ("what about MCA?") is searched together with the previous question
  const lastUser = [...history].reverse().find((h) => h.role === 'user');
  const query = message.length < 40 && lastUser ? `${lastUser.content} ${message}` : message;
  const hits = await retrieval.search(query.slice(0, 500), user.role);
  if (!hits.length) return { answer: MSG.noInfo, intent: 'university_info', sources: [] };

  const excerpts = hits.map((h, i) => ({ n: i + 1, source: h.title, page: h.page_number, text: h.chunk_text }));
  const out = await ai.answer({
    kind: 'documents', message, history: clip(history, 4), data: { excerpts },
    user: { first_name: firstName(user), role: user.role },
  });
  const cited = [...new Set([...out.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))]
    .filter((n) => n >= 1 && n <= excerpts.length);
  const sources = cited.map((n) => ({ n, title: hits[n - 1].title, page: hits[n - 1].page_number, document_id: hits[n - 1].document_id }));
  return { answer: out.answer, intent: 'university_info', sources };
}

// Agent mode: the model plans and calls tools step by step (see services/agent.js)
async function runAgentFor({ user, message, history }) {
  // the same deterministic guard as for single tools: a request naming another person never reaches personal-data tools
  const hasPersonalTools = Object.values(registry).some((t) => t.personal && t.roles.includes(user.role));
  if (hasPersonalTools && (await mentionsOtherPerson(message, user.id))) return refuse(user, 'agent', 'other_person', message, MSG.other);
  return agentRunner.runAgent({ user, message, history, now: nowInTz(config.tz) });
}

async function handleMessage({ user, message, history, mode, lastIntent, agent = false }) {
  if (agent) return runAgentFor({ user, message, history });      // the user switched on agent mode: no classification needed

  let intent = 'general_education';
  let aboutOther = false;
  let day = null;
  let place = null;
  let fromPlace = null;
  const valid = new Set(catalog().map((c) => c.name));
  const continuing = Boolean(registry[lastIntent]) || lastIntent === 'university_info';

  // Plain study questions skip classification (saves AI quota and cannot touch any records).
  if (PERSONAL_HINT.test(message) || continuing) {
    try {
      const c = await ai.classify(message, clip(history, 4), catalog());
      intent = valid.has(c.intent) ? c.intent : 'unclear';
      aboutOther = c.about_other_person === true;
      day = DAYS.has(c.day) ? c.day : null;
      place = typeof c.place === 'string' ? c.place.slice(0, 100) : null;
      fromPlace = typeof c.from_place === 'string' ? c.from_place.slice(0, 100) : null;
    } catch (err) {
      console.error('classification failed:', err.message);
      // Do NOT quietly give a generic answer to a question about this university: that looks like a real answer but is not.
      if (ADMISSION_WORDS.test(message)) intent = 'admission_info';
      else throw new Error('classification unavailable');       // the chat route turns this into "assistant is busy, try again"
    }
  }

  // The classifier said "general question", but the message is clearly about this university's admissions
  if (intent === 'general_education' && ADMISSION_WORDS.test(message)) intent = 'admission_info';

  // Short vague follow-ups ("is that all?", "and tomorrow?") continue the previous topic.
  // The role check and the other-person check below still apply to the reused intent.
  if (intent === 'unclear' && continuing && message.length <= 80) intent = lastIntent;

  if (intent === 'unclear') return { answer: MSG.unclear, intent, sources: [] };
  if (intent === 'agent_task') return runAgentFor({ user, message, history });
  if (intent === 'university_info') return answerFromDocuments({ user, message, history });

  const tool = registry[intent];
  if (tool) {
    if (!tool.roles.includes(user.role)) return refuse(user, intent, 'role_not_allowed', message, denied(tool.roles));
    if (tool.personal && (aboutOther || (await mentionsOtherPerson(message, user.id)))) {
      return refuse(user, intent, 'other_person', message, MSG.other);
    }
    const result = await tool.run({ user, now: nowInTz(config.tz) }, { day, place, from_place: fromPlace, message });
    const { _ui: ui, ...data } = result;          // _ui is for the app (e.g. "show on map"), never sent to the AI
    const out = await ai.answer({
      kind: tool.kind, message, history: clip(history, 6), data,
      user: { first_name: firstName(user), role: user.role },
    });
    return { answer: out.answer, intent, sources: [], ui: ui || null };
  }

  const out = await ai.chat(message, clip(history, 20), mode);
  return { answer: out.answer, intent: 'general_education', sources: out.sources || [] };
}

module.exports = { handleMessage, MSG, META };
