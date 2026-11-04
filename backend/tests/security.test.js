// Run with the API + database running:  npm test
// Covers the assignment's mandatory security test (student cannot reach another student's data).
const { test, after } = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');

const BASE = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'Password@123';

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* empty body */ }
  return { status: r.status, json };
}
async function login(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  assert.strictEqual(r.status, 200, `login failed for ${email}`);
  return r.json;
}

after(() => db.end());

test('no token -> 401', async () => {
  assert.strictEqual((await api('/api/students/me/attendance')).status, 401);
});

test('student gets only their own attendance', async () => {
  const a = await login('student1@uni.test');
  const b = await login('student2@uni.test');
  const ra = await api('/api/students/me/attendance', { token: a.token });
  const rb = await api('/api/students/me/attendance', { token: b.token });
  assert.strictEqual(ra.status, 200);
  assert.notStrictEqual(ra.json.overall_percentage, rb.json.overall_percentage);
});

test('client-supplied student id is ignored', async () => {
  const a = await login('student1@uni.test');
  const b = await login('student2@uni.test');
  const plain = await api('/api/students/me/attendance', { token: a.token });
  const tampered = await api(`/api/students/me/attendance?studentId=${b.user.id}&user_id=${b.user.id}`, { token: a.token });
  assert.deepStrictEqual(tampered.json, plain.json);
});

test("no route exists to read another student's marks", async () => {
  const a = await login('student1@uni.test');
  const b = await login('student2@uni.test');
  assert.strictEqual((await api(`/api/students/${b.user.id}/marks`, { token: a.token })).status, 404);
});

test('student cannot use teacher-only data', async () => {
  const a = await login('student1@uni.test');
  assert.strictEqual((await api('/api/faculty/me/timetable', { token: a.token })).status, 403);
});

test("student cannot read another user's chat session", async () => {
  const a = await login('student1@uni.test');
  const b = await login('student2@uni.test');
  const s = await db.query("INSERT INTO chat_sessions (user_id, session_title) VALUES ($1,'private test') RETURNING id", [b.user.id]);
  const id = s.rows[0].id;
  try {
    assert.strictEqual((await api(`/api/chat/sessions/${id}`, { token: a.token })).status, 404);
    assert.strictEqual((await api('/api/chat', { method: 'POST', token: a.token, body: { message: 'hi', sessionId: id } })).status, 404);
  } finally {
    await db.query('DELETE FROM chat_sessions WHERE id = $1', [id]);
  }
});

test('registration cannot choose a role', async () => {
  const email = `t${Date.now()}@uni.test`;
  const bad = await api('/api/auth/register', { method: 'POST', body: { full_name: 'Test User', email, password: 'Password@123', role: 'admin' } });
  assert.strictEqual(bad.status, 400);
  const ok = await api('/api/auth/register', { method: 'POST', body: { full_name: 'Test User', email, password: 'Password@123' } });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.json.user.role, 'applicant');
});
