// Runs a few multi-step questions through AGENT MODE against your running stack and prints each answer with its trace.
// Use it to see how the agent behaves with the real model and to count AI requests.
//   node scripts/agentDemo.js                       (student1)
//   node scripts/agentDemo.js teacher@uni.test
const BASE = process.env.API_URL || 'http://localhost:4000';
const email = process.argv[2] || 'student1@uni.test';
const QUESTIONS = {
  student: [
    'What is my attendance and where is my next class?',
    'Which subjects am I at risk in, and how many classes in a row must I attend to reach 75%?',
    'When is my next exam, what room is it in, and how do I get there from the main gate?',
    'What are the library timings and what is the late fine for books?',
    'Plan my day for tomorrow around my classes.',
  ],
  teacher: [
    'What do I teach today and in which rooms?',
    'Which subjects am I assigned, and where is my next classroom?',
    'What is the attendance policy for exams?',
  ],
  other: ['What courses can I apply for, and what is the BCA fee and last date?', 'Where is the library and what are its timings?'],
};

async function call(path, body, token) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async () => {
  const login = await call('/api/auth/login', { email, password: 'Password@123' });
  if (login.status !== 200) { console.error('Login failed. Is the backend running and the database seeded?'); process.exit(1); }
  const role = login.json.user.role;
  const list = QUESTIONS[role] || QUESTIONS.other;
  console.log(`Agent demo as ${email} (${role})\n`);
  let totalMs = 0, totalCalls = 0;
  for (const q of list) {
    const t0 = Date.now();
    const r = await call('/api/chat', { message: q, agent: true }, login.json.token);
    const ms = Date.now() - t0; totalMs += ms;
    console.log(`Q: ${q}`);
    if (r.status !== 200) { console.log(`   -> HTTP ${r.status}: ${r.json.error}\n`); continue; }
    for (const t of r.json.trace || []) {
      if (t.thought) console.log(`   step ${t.step}: ${t.thought}`);
      for (const c of t.calls || []) { totalCalls++; console.log(`     ${c.ok ? 'ok ' : 'ERR'} ${c.tool}${Object.keys(c.args || {}).length ? ' ' + JSON.stringify(c.args) : ''} (${c.ms} ms) ${c.summary}`); }
      if (t.repair) console.log(`     self-check: unsupported numbers ${t.repair.unsupported_numbers} -> corrected`);
    }
    console.log(`   answer (${ms} ms, ${(r.json.trace || []).length} planner calls): ${String(r.json.answer).replace(/\n+/g, ' ').slice(0, 400)}\n`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  console.log(`Done: ${list.length} questions, ${totalCalls} tool calls, ${(totalMs / 1000).toFixed(1)} s total.`);
})();
