// Tests for HOD Assistant, Admin Panel Gaps, Teacher Next Classroom, and Chatbot Feedback
// Safe to run with in-process Express server and database:  node --test tests/hod.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const PASSWORD = 'Password@123';
let BASE, appServer, db, ai;
const originals = {};

before(async () => {
  process.env.CHAT_RATE_LIMIT = '1000';
  const app = require('../src/app');
  db = require('../src/db');
  ai = require('../src/services/ai');
  Object.assign(originals, { classify: ai.classify, answer: ai.answer, chat: ai.chat });

  // Deterministic mock for AI
  ai.classify = async (message) => {
    if (/next (?:class|classroom)/i.test(message)) return { intent: 'teacher_next_class', about_other_person: false, day: null };
    if (/overview/i.test(message)) return { intent: 'hod_department_overview', about_other_person: false, day: null };
    if (/pending/i.test(message)) return { intent: 'hod_pending_activities', about_other_person: false, day: null };
    if (/analytics/i.test(message)) return { intent: 'hod_department_analytics', about_other_person: false, day: null };
    return { intent: 'unclear', about_other_person: false, day: null };
  };
  ai.answer = async (payload) => ({ answer: 'MOCK_ANSWER:' + JSON.stringify(payload.data), sources: [] });
  ai.chat = async (message) => ({ answer: 'GENERAL:' + message, sources: [] });

  appServer = app.listen(0, '127.0.0.1');
  await new Promise((r) => appServer.once('listening', r));
  BASE = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  Object.assign(ai, originals);
  if (appServer) appServer.close();
  if (db) await db.end();
});

const tokens = {};
async function login(email) {
  if (tokens[email]) return tokens[email];
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.strictEqual(r.status, 200, `login failed for ${email}`);
  const data = await r.json();
  tokens[email] = data.token;
  return tokens[email];
}

async function api(email, method, path, body) {
  const headers = {};
  if (email) headers.Authorization = `Bearer ${await login(email)}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const contentType = r.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { json = await r.json(); } catch { /* ignore */ }
  } else if (contentType.includes('text/')) {
    json = await r.text();
  }
  return { status: r.status, json, headers: r.headers };
}

// ----------------------------------------------------------------
// 1. RBAC Tests: Non-HOD users cannot access /api/hod/*
// ----------------------------------------------------------------
test('student cannot access HOD routes -> 403', async () => {
  const r = await api('student1@uni.test', 'GET', '/api/hod/overview');
  assert.strictEqual(r.status, 403);
});

test('teacher cannot access HOD routes -> 403', async () => {
  const r = await api('teacher@uni.test', 'GET', '/api/hod/overview');
  assert.strictEqual(r.status, 403);
});

test('unauthenticated visitor cannot access HOD routes -> 401', async () => {
  const r = await api(null, 'GET', '/api/hod/overview');
  assert.strictEqual(r.status, 401);
});

// ----------------------------------------------------------------
// 2. THE KEY SECURITY TEST: Data Isolation between Departments
//    Computer Science HOD must NEVER see Management data, and reverse.
// ----------------------------------------------------------------
test('SECURITY: CS HOD overview returns Computer Science, MG HOD returns Management', async () => {
  const cs = await api('hod@uni.test', 'GET', '/api/hod/overview');
  const mg = await api('hod2@uni.test', 'GET', '/api/hod/overview');

  assert.strictEqual(cs.status, 200);
  assert.strictEqual(mg.status, 200);

  assert.strictEqual(cs.json.department.name, 'Computer Science');
  assert.strictEqual(mg.json.department.name, 'Management');
  assert.notStrictEqual(cs.json.department.id, mg.json.department.id);
});

test('SECURITY: CS HOD faculty list contains only CS teachers, never Management teachers', async () => {
  const cs = await api('hod@uni.test', 'GET', '/api/hod/faculty');
  const mg = await api('hod2@uni.test', 'GET', '/api/hod/faculty');

  assert.strictEqual(cs.status, 200);
  assert.strictEqual(mg.status, 200);

  const csNames = cs.json.faculty.map((f) => f.full_name);
  const mgNames = mg.json.faculty.map((f) => f.full_name);

  // CS faculty: Prof. Rahul Verma, Prof. Neha Gupta, Prof. Sanjay Rao
  assert(csNames.includes('Prof. Rahul Verma'), 'CS HOD must see Prof. Rahul Verma');
  assert(!csNames.includes('Prof. Pooja Jain'), 'CS HOD must NEVER see Management faculty Prof. Pooja Jain');
  assert(!csNames.includes('Prof. Vikram Mehta'), 'CS HOD must NEVER see Management faculty Prof. Vikram Mehta');

  // MG faculty: Prof. Pooja Jain, Prof. Vikram Mehta
  assert(mgNames.includes('Prof. Pooja Jain'), 'Management HOD must see Prof. Pooja Jain');
  assert(!mgNames.includes('Prof. Rahul Verma'), 'Management HOD must NEVER see CS faculty Prof. Rahul Verma');
  assert(!mgNames.includes('Prof. Neha Gupta'), 'Management HOD must NEVER see CS faculty Prof. Neha Gupta');
});

test('SECURITY: CS HOD courses list contains BCA and MCA, never BBA', async () => {
  const cs = await api('hod@uni.test', 'GET', '/api/hod/courses');
  const mg = await api('hod2@uni.test', 'GET', '/api/hod/courses');

  assert.strictEqual(cs.status, 200);
  assert.strictEqual(mg.status, 200);

  const csCourses = cs.json.courses.map((c) => c.course_name);
  const mgCourses = mg.json.courses.map((c) => c.course_name);

  assert(csCourses.includes('BCA'), 'CS courses must include BCA');
  assert(csCourses.includes('MCA'), 'CS courses must include MCA');
  assert(!csCourses.includes('BBA'), 'CS HOD must NEVER see Management course BBA');

  assert(mgCourses.includes('BBA'), 'Management courses must include BBA');
  assert(!mgCourses.includes('BCA'), 'Management HOD must NEVER see CS course BCA');
  assert(!mgCourses.includes('MCA'), 'Management HOD must NEVER see CS course MCA');
});

test('SECURITY: CS HOD schedule and exams only contains CS subjects, never BBA subjects', async () => {
  const cs = await api('hod@uni.test', 'GET', '/api/hod/schedule-exams');
  const mg = await api('hod2@uni.test', 'GET', '/api/hod/schedule-exams');

  assert.strictEqual(cs.status, 200);
  assert.strictEqual(mg.status, 200);

  const csExamSubjects = cs.json.examinations.map((e) => e.subject_code);
  const mgExamSubjects = mg.json.examinations.map((e) => e.subject_code);

  assert(csExamSubjects.some((c) => c.startsWith('BCA') || c.startsWith('MCA')));
  assert(!csExamSubjects.some((c) => c.startsWith('BBA')), 'CS HOD must NEVER see BBA exams');

  assert(mgExamSubjects.some((c) => c.startsWith('BBA')));
  assert(!mgExamSubjects.some((c) => c.startsWith('BCA') || c.startsWith('MCA')), 'MG HOD must NEVER see BCA/MCA exams');
});

test('SECURITY: Department notices are strictly isolated between HODs', async () => {
  const csNotices = await api('hod@uni.test', 'GET', '/api/hod/notices');
  const mgNotices = await api('hod2@uni.test', 'GET', '/api/hod/notices');

  assert.strictEqual(csNotices.status, 200);
  assert.strictEqual(mgNotices.status, 200);

  const csTitles = csNotices.json.notices.map((n) => n.title);
  const mgTitles = mgNotices.json.notices.map((n) => n.title);

  assert(!csTitles.includes('Management Industry Conclave'), 'CS HOD must not see Management notices');
  assert(!mgTitles.includes('CS Department Hackathon 2026'), 'MG HOD must not see CS notices');
});

// ----------------------------------------------------------------
// 3. Department Analytics (Aggregates Only)
// ----------------------------------------------------------------
test('HOD analytics returns strictly aggregated statistics without individual student IDs', async () => {
  const res = await api('hod@uni.test', 'GET', '/api/hod/analytics');
  assert.strictEqual(res.status, 200);
  const data = res.json;

  assert(data.overall_attendance !== undefined);
  assert(data.overall_attendance.overall_attendance_pct !== undefined);
  assert(Array.isArray(data.subject_attendance));
  assert(Array.isArray(data.exam_performance));
  assert(Array.isArray(data.faculty_workload));
  assert(Array.isArray(data.student_distribution));

  // Verify no individual student rows exist in analytics response
  const rawString = JSON.stringify(data);
  assert(!rawString.includes('student_id'), 'Analytics must not contain student_id');
  assert(!rawString.includes('student_number'), 'Analytics must not contain student_number');
});

// ----------------------------------------------------------------
// 4. Pending Activities
// ----------------------------------------------------------------
test('HOD pending activities reports exams without rooms and missing marks', async () => {
  const res = await api('hod@uni.test', 'GET', '/api/hod/pending');
  assert.strictEqual(res.status, 200);
  assert(res.json.total_pending_count >= 0);
  assert(Array.isArray(res.json.exams_without_rooms));
  assert(Array.isArray(res.json.marks_not_entered));
  assert(Array.isArray(res.json.unassigned_subjects));
});

// ----------------------------------------------------------------
// 5. Department Report & CSV
// ----------------------------------------------------------------
test('HOD departmental report and CSV generation', async () => {
  const report = await api('hod@uni.test', 'GET', '/api/hod/report');
  assert.strictEqual(report.status, 200);
  assert.strictEqual(report.json.overview.department.name, 'Computer Science');

  const csv = await api('hod@uni.test', 'GET', '/api/hod/report/csv');
  assert.strictEqual(csv.status, 200);
  assert(typeof csv.json === 'string', 'CSV response must be string text');
  assert(csv.json.includes('DEPARTMENT EXECUTIVE REPORT,Computer Science'));
  assert(csv.json.includes('--- FACULTY WORKLOAD ---'));
  assert(csv.json.includes('Prof. Rahul Verma'));
});

// ----------------------------------------------------------------
// 6. Teacher Next Classroom
// ----------------------------------------------------------------
test('Teacher next classroom returns upcoming teaching class with room info', async () => {
  const res = await api('teacher@uni.test', 'GET', '/api/faculty/me/next-class');
  assert.strictEqual(res.status, 200);
  assert(res.json.next_class !== null);
  assert(res.json.next_class.room !== undefined);
  assert(res.json.next_class.building !== undefined);

  // Student cannot access teacher next-class endpoint
  const denied = await api('student1@uni.test', 'GET', '/api/faculty/me/next-class');
  assert.strictEqual(denied.status, 403);
});

// ----------------------------------------------------------------
// 7. Chatbot Feedback (Thumbs Up / Down)
// ----------------------------------------------------------------
test('Chatbot feedback: submit thumbs up/down on assistant answers', async () => {
  // 1. Send chat message as student1
  const chatRes = await api('student1@uni.test', 'POST', '/api/chat', {
    message: 'Hello, what is the university schedule?',
  });
  assert.strictEqual(chatRes.status, 200);
  assert(chatRes.json.messageId, 'Chat response must return assistant messageId');
  const messageId = chatRes.json.messageId;

  // 2. Submit Thumbs Up (rating = 5)
  const fb1 = await api('student1@uni.test', 'POST', '/api/chat/feedback', {
    messageId,
    rating: 5,
    comments: 'Very helpful answer!',
  });
  assert.strictEqual(fb1.status, 200);
  assert.strictEqual(fb1.json.feedback.rating, 5);

  // 3. User can change vote to Thumbs Down (rating = 1) -> upsert
  const fb2 = await api('student1@uni.test', 'POST', '/api/chat/feedback', {
    messageId,
    rating: 1,
    comments: 'Changed my mind',
  });
  assert.strictEqual(fb2.status, 200);
  assert.strictEqual(fb2.json.feedback.rating, 1);

  // 4. Another user CANNOT rate someone else's message -> 404
  const fbOther = await api('student2@uni.test', 'POST', '/api/chat/feedback', {
    messageId,
    rating: 5,
  });
  assert.strictEqual(fbOther.status, 404);
});

// ----------------------------------------------------------------
// 8. Admin Panel Gaps: User, Department, Faculty, Course, FAQ
// ----------------------------------------------------------------
test('Admin user management: list, create, and deactivate', async () => {
  const adminList = await api('admin@uni.test', 'GET', '/api/admin/users');
  assert.strictEqual(adminList.status, 200);
  assert(adminList.json.users.length > 0);

  // Non-admin gets 403
  const forbidden = await api('student1@uni.test', 'GET', '/api/admin/users');
  assert.strictEqual(forbidden.status, 403);

  // Get a department ID for creating a teacher
  const deptList = await api('admin@uni.test', 'GET', '/api/admin/departments');
  const csDeptId = deptList.json.departments.find((d) => d.department_name === 'Computer Science').id;

  // Create new teacher
  const testEmail = `newteacher_${Date.now()}@uni.test`;
  const created = await api('admin@uni.test', 'POST', '/api/admin/users', {
    full_name: 'Dr. Test Faculty',
    email: testEmail,
    password: 'Password@123',
    role: 'teacher',
    department_id: csDeptId,
  });
  assert.strictEqual(created.status, 201);
  const newUserId = created.json.user.id;

  // Deactivate the user
  const deact = await api('admin@uni.test', 'PATCH', `/api/admin/users/${newUserId}`, {
    is_active: false,
  });
  assert.strictEqual(deact.status, 200);

  // Deactivated user cannot log in
  const loginFail = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'Password@123' }),
  });
  assert.strictEqual(loginFail.status, 401);

  // Reactivate user
  const react = await api('admin@uni.test', 'PATCH', `/api/admin/users/${newUserId}`, {
    is_active: true,
  });
  assert.strictEqual(react.status, 200);

  // Reactivated user can log in
  const loginOk = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'Password@123' }),
  });
  assert.strictEqual(loginOk.status, 200);
});

test('Admin FAQ management: list, create, update, and delete', async () => {
  // 1. List FAQs
  const list = await api('admin@uni.test', 'GET', '/api/admin/faqs');
  assert.strictEqual(list.status, 200);
  assert(Array.isArray(list.json.faqs));

  // 2. Create FAQ
  const created = await api('admin@uni.test', 'POST', '/api/admin/faqs', {
    question: 'How do I issue a library card?',
    answer: 'Visit the central library front desk with your student ID card.',
    category: 'Library',
    is_published: true,
  });
  assert.strictEqual(created.status, 201);
  const faqId = created.json.faq.id;

  // 3. Update FAQ
  const updated = await api('admin@uni.test', 'PUT', `/api/admin/faqs/${faqId}`, {
    question: 'How do I issue or renew a library card?',
    answer: 'Visit the central library or renew online via student portal.',
    category: 'Library',
    is_published: true,
  });
  assert.strictEqual(updated.status, 200);

  // 4. Delete FAQ
  const deleted = await api('admin@uni.test', 'DELETE', `/api/admin/faqs/${faqId}`);
  assert.strictEqual(deleted.status, 204);
});
