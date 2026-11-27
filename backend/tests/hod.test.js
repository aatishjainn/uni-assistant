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

// ----------------------------------------------------------------
// 9. HOD Exam Grading Assignment -> Teacher Grading Flow
// ----------------------------------------------------------------
test('HOD assigns exam grading task to department faculty and assigned teacher grades students', async () => {
  // Find CS subject BCA401 and CS teachers
  const coursesRes = await api('hod@uni.test', 'GET', '/api/hod/courses');
  assert.strictEqual(coursesRes.status, 200);
  const bca401 = coursesRes.json.subjects.find((s) => s.subject_code === 'BCA401');
  assert(bca401, 'BCA401 subject must exist');

  const csFacultyRes = await api('hod@uni.test', 'GET', '/api/hod/faculty');
  const profRahul = csFacultyRes.json.faculty.find((f) => f.email === 'teacher@uni.test');
  assert(profRahul, 'Prof. Rahul Verma must exist in CS faculty');

  const mgFacultyRes = await api('hod2@uni.test', 'GET', '/api/hod/faculty');
  const profPooja = mgFacultyRes.json.faculty.find((f) => f.email === 'teacher4@uni.test');
  assert(profPooja, 'Prof. Pooja Jain must exist in Management faculty');

  // Create a synthetic past exam (so we don't mutate seeded pending exams)
  const createdExam = await api('hod@uni.test', 'POST', '/api/hod/examinations', {
    subject_id: bca401.id,
    exam_type: 'Unit Test 1',
    exam_date: '2026-11-20',
    start_time: '09:00',
    end_time: '10:30',
    classroom_id: null,
  });
  assert.strictEqual(createdExam.status, 201);
  const examId = createdExam.json.examination.id;

  try {
    // 1. Exam appears in HOD pending marks_not_entered
    const pendingBefore = await api('hod@uni.test', 'GET', '/api/hod/pending');
    assert.strictEqual(pendingBefore.status, 200);
    assert(pendingBefore.json.marks_not_entered.some((m) => m.id === examId), 'Synthetic exam must appear in pending marks_not_entered');

    // 2. SECURITY: CS HOD cannot assign grading to Management faculty
    const crossDeptAssign = await api('hod@uni.test', 'PATCH', `/api/hod/examinations/${examId}/grading-assignee`, {
      faculty_id: profPooja.id,
    });
    assert.strictEqual(crossDeptAssign.status, 400);

    // 3. SECURITY: Non-HOD teacher cannot assign grading tasks
    const teacherAssign = await api('teacher@uni.test', 'PATCH', `/api/hod/examinations/${examId}/grading-assignee`, {
      faculty_id: profRahul.id,
    });
    assert.strictEqual(teacherAssign.status, 403);

    // 4. HOD assigns grading task to Prof. Rahul Verma (teacher@uni.test)
    const assigned = await api('hod@uni.test', 'PATCH', `/api/hod/examinations/${examId}/grading-assignee`, {
      faculty_id: profRahul.id,
    });
    assert.strictEqual(assigned.status, 200);
    assert.strictEqual(assigned.json.examination.grading_faculty_id, profRahul.id);
    assert.strictEqual(assigned.json.examination.grading_faculty_name, 'Prof. Rahul Verma');

    // 5. Teacher2 (not assigned to this exam) cannot view or grade it
    const deniedStudents = await api('teacher2@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/students`);
    assert.strictEqual(deniedStudents.status, 403);

    // 6. Assigned teacher sees the exam in their grading tasks
    const tasks = await api('teacher@uni.test', 'GET', '/api/faculty/me/grading-tasks');
    assert.strictEqual(tasks.status, 200);
    const task = tasks.json.exams.find((e) => e.id === examId);
    assert(task, 'Assigned teacher must see the exam in grading tasks');
    assert.strictEqual(task.is_completed, false);

    // 7. Assigned teacher fetches enrolled students
    const studentsRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/students`);
    assert.strictEqual(studentsRes.status, 200);
    assert(studentsRes.json.students.length > 0);

    // 8. Validation rejects out-of-range marks (> 100)
    const badMarks = await api('teacher@uni.test', 'PUT', `/api/faculty/me/grading-tasks/${examId}/marks`, {
      marks: [{ student_id: studentsRes.json.students[0].student_id, marks_obtained: 150 }],
    });
    assert.strictEqual(badMarks.status, 400);

    // 9. Assigned teacher grades all enrolled students
    const marksPayload = studentsRes.json.students.map((st, idx) => ({
      student_id: st.student_id,
      marks_obtained: 60 + idx,
    }));
    const saved = await api('teacher@uni.test', 'PUT', `/api/faculty/me/grading-tasks/${examId}/marks`, {
      marks: marksPayload,
    });
    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.json.marks_entered, studentsRes.json.students.length);

    // 10. Task is now completed for teacher and removed from HOD pending marks_not_entered
    const tasksAfter = await api('teacher@uni.test', 'GET', '/api/faculty/me/grading-tasks');
    const completedTask = tasksAfter.json.exams.find((e) => e.id === examId);
    assert.strictEqual(completedTask.is_completed, true);

    const pendingAfter = await api('hod@uni.test', 'GET', '/api/hod/pending');
    assert(!pendingAfter.json.marks_not_entered.some((m) => m.id === examId), 'Fully graded exam must clear from HOD pending marks_not_entered');

    // 11. HOD can assign a subject to department faculty (and cross-dept faculty is rejected)
    const crossSubjAssign = await api('hod@uni.test', 'POST', `/api/hod/subjects/${bca401.id}/assign-faculty`, {
      faculty_id: profPooja.id,
    });
    assert.strictEqual(crossSubjAssign.status, 400);

    const sameSubjAssign = await api('hod@uni.test', 'POST', `/api/hod/subjects/${bca401.id}/assign-faculty`, {
      faculty_id: profRahul.id,
      academic_year: '2026-27',
    });
    assert.strictEqual(sameSubjAssign.status, 200);
    assert.strictEqual(sameSubjAssign.json.success, true);
  } finally {
    await db.query('DELETE FROM student_marks WHERE examination_id = $1', [examId]);
    await db.query('DELETE FROM examinations WHERE id = $1', [examId]);
  }
});

// ----------------------------------------------------------------
// 10. Teacher Marks Upload via CSV (and missing marks re-upload prompt)
// ----------------------------------------------------------------
test('Teacher uploads CSV of marks; missing marks prompt re-upload without saving, complete CSV saves all marks', async () => {
  const coursesRes = await api('hod@uni.test', 'GET', '/api/hod/courses');
  const bca401 = coursesRes.json.subjects.find((s) => s.subject_code === 'BCA401');
  const csFacultyRes = await api('hod@uni.test', 'GET', '/api/hod/faculty');
  const profRahul = csFacultyRes.json.faculty.find((f) => f.email === 'teacher@uni.test');

  const createdExam = await api('hod@uni.test', 'POST', '/api/hod/examinations', {
    subject_id: bca401.id,
    exam_type: 'Unit Test 2',
    exam_date: '2026-11-21',
    start_time: '11:00',
    end_time: '12:00',
    classroom_id: null,
  });
  assert.strictEqual(createdExam.status, 201);
  const examId = createdExam.json.examination.id;

  async function uploadCsv(email, filename, csvContent) {
    const form = new FormData();
    form.append('file', new Blob([csvContent], { type: 'text/csv' }), filename);
    const r = await fetch(`${BASE}/api/faculty/me/grading-tasks/${examId}/upload-marks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await login(email)}` },
      body: form,
    });
    return { status: r.status, json: await r.json() };
  }

  try {
    await api('hod@uni.test', 'PATCH', `/api/hod/examinations/${examId}/grading-assignee`, {
      faculty_id: profRahul.id,
    });

    const studentsRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/students`);
    const enrolled = studentsRes.json.students;
    assert(enrolled.length >= 2);

    // 0. Download blank CSV template beforehand (and verify unassigned teacher gets 403)
    const deniedTemplate = await api('teacher2@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/template`);
    assert.strictEqual(deniedTemplate.status, 403);

    const templateRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/template`);
    assert.strictEqual(templateRes.status, 200);
    assert(typeof templateRes.json === 'string');
    const templateLines = templateRes.json.trim().split(/\r?\n/);
    assert.strictEqual(templateLines[0], 'student_number,full_name,marks_obtained');
    assert.strictEqual(templateLines.length, enrolled.length + 1);
    assert(templateLines[1].endsWith(','), 'Blank template must leave marks_obtained empty');

    // 1. Incomplete CSV (one blank mark, one omitted student) -> 400 with needs_reupload: true
    const partialRows = enrolled.slice(0, enrolled.length - 1).map((st, idx) =>
      `${st.student_number},"${st.full_name}",${idx === 0 ? '' : 75}`
    );
    const incompleteCsv = ['student_number,full_name,marks_obtained', ...partialRows].join('\n');
    const badRes = await uploadCsv('teacher@uni.test', 'partial_marks.csv', incompleteCsv);
    assert.strictEqual(badRes.status, 400);
    assert.strictEqual(badRes.json.needs_reupload, true);
    assert(badRes.json.error.includes('upload a new CSV'), 'Error message must tell teacher to upload a new CSV');
    assert.strictEqual(badRes.json.missing_students.length, 2, 'Must report both blank-mark student and omitted student');

    // Verify nothing was saved on failed upload
    const checkAfterBad = await api('teacher@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/students`);
    assert(checkAfterBad.json.students.every((s) => s.marks_obtained === null), 'Partial upload must not save incomplete marks');

    // 2. Complete CSV with all students' marks -> 200 and clears pending item
    const fullRows = enrolled.map((st, idx) => `${st.student_number},"${st.full_name}",${70 + idx}`);
    const fullCsv = ['\uFEFFstudent_number,full_name,marks_obtained', ...fullRows].join('\r\n');
    const okRes = await uploadCsv('teacher@uni.test', 'complete_marks.csv', fullCsv);
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(okRes.json.success, true);
    assert.strictEqual(okRes.json.marks_entered, enrolled.length);

    const checkAfterOk = await api('teacher@uni.test', 'GET', `/api/faculty/me/grading-tasks/${examId}/students`);
    assert.strictEqual(checkAfterOk.json.students[0].marks_obtained, 70);
  } finally {
    await db.query('DELETE FROM student_marks WHERE examination_id = $1', [examId]);
    await db.query('DELETE FROM examinations WHERE id = $1', [examId]);
  }
});

// ----------------------------------------------------------------
// 11. Weekly Attendance Sheets: HOD Missing Alert & Teacher Blank CSV / P-A Upload
// ----------------------------------------------------------------
test('HOD pending detects Rahul Verma missing attendance for a class and teacher downloads/uploads weekly P/A CSV', async () => {
  // Temporarily clear current week submission for BCA402 if already uploaded by user, and restore in finally
  const { getCurrentWeekStart } = require('../src/services/time');
  const config = require('../src/config');
  const curWeek = getCurrentWeekStart(config.tz);
  const bca402Row = (await db.query("SELECT id FROM subjects WHERE subject_code = 'BCA402'")).rows[0];
  const prevSub = (await db.query('SELECT * FROM weekly_attendance_submissions WHERE subject_id = $1 AND week_start = $2::date', [bca402Row.id, curWeek])).rows[0] || null;
  const prevAtt = (await db.query("SELECT student_id, to_char(class_date,'YYYY-MM-DD') AS class_date, status FROM attendance WHERE subject_id = $1 AND class_date BETWEEN $2::date AND ($2::date + 6)", [bca402Row.id, curWeek])).rows;

  await db.query('DELETE FROM weekly_attendance_submissions WHERE subject_id = $1 AND week_start = $2::date', [bca402Row.id, curWeek]);
  await db.query('DELETE FROM attendance WHERE subject_id = $1 AND class_date BETWEEN $2::date AND ($2::date + 6)', [bca402Row.id, curWeek]);

  const testWeek = '2026-12-07';
  const nextWeek = '2026-12-14';
  const bca402Id = bca402Row.id;

  try {
    // 1. HOD pending flags Prof. Rahul Verma missing attendance for BCA402
    const pending = await api('hod@uni.test', 'GET', '/api/hod/pending');
    assert.strictEqual(pending.status, 200);
    assert(Array.isArray(pending.json.missing_attendance));
    const rahulMissing = pending.json.missing_attendance.find((m) => m.subject_code === 'BCA402');
    assert(rahulMissing, 'HOD pending must flag BCA402 missing weekly attendance');
    assert.strictEqual(rahulMissing.faculty_name, 'Prof. Rahul Verma');
    assert(!pending.json.missing_attendance.some((m) => m.subject_code === 'BCA401'), 'BCA401 should already be marked submitted for current week');

    // 2. HOD sends reminder (and clean up notice/audit afterward)
    const remindRes = await api('hod@uni.test', 'POST', '/api/hod/attendance/remind', {
      subject_id: rahulMissing.subject_id,
      week_start: rahulMissing.week_start,
    });
    assert.strictEqual(remindRes.status, 200);
    assert.strictEqual(remindRes.json.success, true);

    // 3. Teacher gets fresh weekly sheets for testWeek and nextWeek
    const sheetsRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/attendance-sheets?week=${testWeek}`);
    assert.strictEqual(sheetsRes.status, 200);
    const bca402Sheet = sheetsRes.json.sheets.find((s) => s.subject_code === 'BCA402');
    assert(bca402Sheet, 'Rahul Verma must see BCA402 in attendance sheets');
    assert.strictEqual(bca402Sheet.is_submitted, false);

    // 4. Download blank CSV for testWeek (scheduled Wed 2026-12-09 & Thu 2026-12-10)
    const blankRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/attendance-sheets/${bca402Id}/template?week=${testWeek}`);
    assert.strictEqual(blankRes.status, 200);
    const blankLines = blankRes.json.trim().split(/\r?\n/);
    assert.strictEqual(blankLines[0], 'student_number,full_name,2026-12-09 (Wed),2026-12-10 (Thu)');
    assert(blankLines.length >= 2);
    assert(blankLines[1].endsWith(',,'), 'Blank weekly attendance CSV must leave date columns empty');

    // Unassigned teacher cannot download or upload BCA402 attendance
    const denied = await api('teacher2@uni.test', 'GET', `/api/faculty/me/attendance-sheets/${bca402Id}/template?week=${testWeek}`);
    assert.strictEqual(denied.status, 403);

    async function uploadAttendanceCsv(filename, csvContent) {
      const form = new FormData();
      form.append('file', new Blob([csvContent], { type: 'text/csv' }), filename);
      const r = await fetch(`${BASE}/api/faculty/me/attendance-sheets/${bca402Id}/upload?week=${testWeek}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await login('teacher@uni.test')}` },
        body: form,
      });
      return { status: r.status, json: await r.json() };
    }

    // 5. Incomplete / invalid CSV -> 400 with needs_reupload: true
    const studentLines = blankLines.slice(1).map((line) => line.split(',').slice(0, 2));
    const badCsv = [
      blankLines[0],
      ...studentLines.map(([roll, name], i) => `${roll},${name},${i === 0 ? '' : 'P'},${i === 1 ? 'Z' : 'A'}`),
    ].join('\n');
    const badUpload = await uploadAttendanceCsv('bad_att.csv', badCsv);
    assert.strictEqual(badUpload.status, 400);
    assert.strictEqual(badUpload.json.needs_reupload, true);
    assert(badUpload.json.missing_entries.length >= 1);
    assert(badUpload.json.invalid_entries.length >= 1);

    // 6. Complete P / A CSV -> 200, writes attendance rows & marks testWeek submitted
    const goodCsv = [
      blankLines[0],
      ...studentLines.map(([roll, name], i) => `${roll},${name},${i % 2 === 0 ? 'P' : 'A'},P`),
    ].join('\r\n');
    const okUpload = await uploadAttendanceCsv('good_att.csv', goodCsv);
    assert.strictEqual(okUpload.status, 200);
    assert.strictEqual(okUpload.json.success, true);
    assert.strictEqual(okUpload.json.days_recorded, 2);
    assert.strictEqual(okUpload.json.records_count, studentLines.length * 2);

    // 7. Verify records endpoint returns present/absent statuses and testWeek is submitted while nextWeek is fresh
    const recRes = await api('teacher@uni.test', 'GET', `/api/faculty/me/attendance-sheets/${bca402Id}/records?week=${testWeek}`);
    assert.strictEqual(recRes.status, 200);
    assert.strictEqual(recRes.json.students[0].statuses['2026-12-09'], 'present');

    const afterTestWeek = await api('teacher@uni.test', 'GET', `/api/faculty/me/attendance-sheets?week=${testWeek}`);
    assert.strictEqual(afterTestWeek.json.sheets.find((s) => s.subject_code === 'BCA402').is_submitted, true);

    const afterNextWeek = await api('teacher@uni.test', 'GET', `/api/faculty/me/attendance-sheets?week=${nextWeek}`);
    assert.strictEqual(afterNextWeek.json.sheets.find((s) => s.subject_code === 'BCA402').is_submitted, false);
  } finally {
    await db.query("DELETE FROM attendance WHERE subject_id = $1 AND class_date BETWEEN '2026-12-07'::date AND '2026-12-13'::date", [bca402Id]);
    await db.query("DELETE FROM weekly_attendance_submissions WHERE subject_id = $1 AND week_start = '2026-12-07'::date", [bca402Id]);
    await db.query("DELETE FROM notices WHERE title LIKE 'Weekly Attendance Reminder: BCA402%'");
    await db.query("DELETE FROM audit_logs WHERE action = 'hod_attendance_reminder' AND entity_id = $1", [bca402Id]);
    if (prevSub) {
      await db.query(
        'INSERT INTO weekly_attendance_submissions (subject_id, faculty_id, week_start, submitted_at, submitted_by, days_recorded, records_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (subject_id, week_start) DO NOTHING',
        [prevSub.subject_id, prevSub.faculty_id, prevSub.week_start, prevSub.submitted_at, prevSub.submitted_by, prevSub.days_recorded, prevSub.records_count]
      );
    }
    for (const a of prevAtt) {
      await db.query(
        'INSERT INTO attendance (student_id, subject_id, class_date, status) VALUES ($1,$2,$3::date,$4) ON CONFLICT (student_id, subject_id, class_date) DO UPDATE SET status = EXCLUDED.status',
        [a.student_id, bca402Id, a.class_date, a.status]
      );
    }
  }
});

// ----------------------------------------------------------------
// 12. Unscheduled Subjects (No Weekly Timetable Slots) Pending Action
// ----------------------------------------------------------------
test('HOD pending reports subjects without timetable slots and schedules a clash-free slot', async () => {
  const bca202 = (await db.query("SELECT id FROM subjects WHERE subject_code = 'BCA202'")).rows[0];
  const prevSlots = (await db.query('SELECT * FROM timetables WHERE subject_id = $1', [bca202.id])).rows;
  let createdSlotId = null;

  await db.query('DELETE FROM timetables WHERE subject_id = $1', [bca202.id]);
  try {
    const pending = await api('hod@uni.test', 'GET', '/api/hod/pending');
    assert.strictEqual(pending.status, 200);
    const unscheduled = pending.json.unscheduled_subjects.find((u) => u.subject_code === 'BCA202');
    assert(unscheduled, 'BCA202 must appear in pending unscheduled_subjects');
    assert(unscheduled.faculty_id, 'BCA202 should surface its assigned faculty');

    const rooms = await api('hod@uni.test', 'GET', '/api/hod/classrooms');
    const room202 = rooms.json.find((r) => r.room_number.includes('202')) || rooms.json[0];

    // Pick a clash-free slot on Saturday (day_of_week = 6)
    const scheduled = await api('hod@uni.test', 'POST', `/api/hod/subjects/${bca202.id}/timetable`, {
      faculty_id: unscheduled.faculty_id,
      classroom_id: room202.id,
      day_of_week: 6,
      start_time: '10:00',
      end_time: '11:00',
    });
    assert.strictEqual(scheduled.status, 201);
    createdSlotId = scheduled.json.timetable.id;

    // Duplicate overlapping slot on Saturday 10:00-11:00 must be rejected as a clash -> 400
    const clash = await api('hod@uni.test', 'POST', `/api/hod/subjects/${bca202.id}/timetable`, {
      faculty_id: unscheduled.faculty_id,
      classroom_id: room202.id,
      day_of_week: 6,
      start_time: '10:30',
      end_time: '11:30',
    });
    assert.strictEqual(clash.status, 400);
    assert(clash.json.error.toLowerCase().includes('clash'));

    // Student batch clash: scheduling BCA202 (BCA Sem 2) on Tuesday 10:00-11:00 with a DIFFERENT teacher & room
    // still clashes because BCA Sem 2 already has BCA201 on Tuesday 10:00-11:00
    const csFaculty = await api('hod@uni.test', 'GET', '/api/hod/faculty');
    const profRahul = csFaculty.json.faculty.find((f) => f.email === 'teacher@uni.test');
    const room201 = rooms.json.find((r) => r.room_number.includes('201')) || rooms.json[1];
    const batchClash = await api('hod@uni.test', 'POST', `/api/hod/subjects/${bca202.id}/timetable`, {
      faculty_id: profRahul.id,
      classroom_id: room201.id,
      day_of_week: 2,
      start_time: '10:00',
      end_time: '11:00',
    });
    assert.strictEqual(batchClash.status, 400);
    assert(batchClash.json.error.includes('Student batch conflict'));

    const pendingAfter = await api('hod@uni.test', 'GET', '/api/hod/pending');
    assert(!pendingAfter.json.unscheduled_subjects.some((u) => u.subject_code === 'BCA202'), 'BCA202 must clear from unscheduled_subjects once scheduled');
  } finally {
    if (createdSlotId) await db.query('DELETE FROM timetables WHERE id = $1', [createdSlotId]);
    for (const s of prevSlots) {
      await db.query(
        'INSERT INTO timetables (id, subject_id, faculty_id, classroom_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
        [s.id, s.subject_id, s.faculty_id, s.classroom_id, s.day_of_week, s.start_time, s.end_time]
      );
    }
  }
});

// ----------------------------------------------------------------
// 13. Admission Form System (Applicant Submit -> Admin Review & Enroll)
// ----------------------------------------------------------------
test('Applicant submits admission application, reflects in Admin tab, and Admin can approve & enroll', async () => {
  // 1. Public approved courses list
  const coursesRes = await api(null, 'GET', '/api/admissions/courses');
  assert.strictEqual(coursesRes.status, 200);
  const bba = coursesRes.json.courses.find((c) => c.course_name === 'BBA');
  assert(bba, 'BBA course must be open for admission');

  // 2. Register a fresh applicant and log in
  const testEmail = `app_test_${Date.now()}@uni.test`;
  const regRes = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: 'Arjun Applicant', email: testEmail, password: PASSWORD }),
  });
  assert.strictEqual(regRes.status, 201);
  const applicantUserId = (await regRes.json()).user.id;

  let createdAppId = null;
  try {
    // RBAC: student cannot apply; applicant cannot access admin admission-applications
    const studentApply = await api('student1@uni.test', 'POST', '/api/admissions/apply', {
      course_id: bba.course_id,
      full_name: 'Riya',
      email: 'student1@uni.test',
      phone: '+91-9999999999',
      date_of_birth: '2006-01-01',
      gender: 'Female',
      address: '123 Main Street, Bhopal',
      previous_qualification: '10+2',
      previous_institution: 'Demo School',
      percentage_or_gpa: 85,
      passing_year: 2026,
    });
    assert.strictEqual(studentApply.status, 403);

    const applicantAdminDenied = await api(testEmail, 'GET', '/api/admin/admission-applications');
    assert.strictEqual(applicantAdminDenied.status, 403);

    // 3. Applicant submits admission form
    const submitRes = await api(testEmail, 'POST', '/api/admissions/apply', {
      course_id: bba.course_id,
      full_name: 'Arjun Applicant',
      email: testEmail,
      phone: '+91-9811122233',
      date_of_birth: '2007-08-19',
      gender: 'Male',
      address: '88 Civil Lines, Bhopal',
      previous_qualification: '10+2 Commerce',
      previous_institution: 'Central Public School',
      percentage_or_gpa: 86.4,
      passing_year: 2026,
      guardian_name: 'Rajesh Applicant',
      guardian_phone: '+91-9811100000',
      statement_of_purpose: 'Looking forward to studying management.',
    });
    assert.strictEqual(submitRes.status, 201);
    createdAppId = submitRes.json.application.id;
    assert(submitRes.json.application.application_number.startsWith('APP-'));
    assert.strictEqual(submitRes.json.application.status, 'pending');

    // Duplicate active application for same course -> 409
    const dupRes = await api(testEmail, 'POST', '/api/admissions/apply', {
      course_id: bba.course_id,
      full_name: 'Arjun Applicant',
      email: testEmail,
      phone: '+91-9811122233',
      date_of_birth: '2007-08-19',
      gender: 'Male',
      address: '88 Civil Lines, Bhopal',
      previous_qualification: '10+2 Commerce',
      previous_institution: 'Central Public School',
      percentage_or_gpa: 86.4,
      passing_year: 2026,
    });
    assert.strictEqual(dupRes.status, 409);

    // 4. Applicant sees application in my-applications
    const myApps = await api(testEmail, 'GET', '/api/admissions/my-applications');
    assert.strictEqual(myApps.status, 200);
    assert(myApps.json.applications.some((a) => a.id === createdAppId));

    // 5. Admin sees the new application in admin/admission-applications
    const adminList = await api('admin@uni.test', 'GET', `/api/admin/admission-applications?q=${encodeURIComponent(testEmail)}`);
    assert.strictEqual(adminList.status, 200);
    assert(adminList.json.applications.some((a) => a.id === createdAppId && a.status === 'pending'));

    // 6. Admin approves & enrolls the applicant as a student (first verify unseen decision notification clears once seen)
    const rejectThenSee = await api('admin@uni.test', 'PATCH', `/api/admin/admission-applications/${createdAppId}`, {
      status: 'rejected',
      admin_remarks: 'Please clarify score.',
      enroll_student: false,
    });
    assert.strictEqual(rejectThenSee.status, 200);

    const beforeSeen = await api(testEmail, 'GET', '/api/admissions/my-applications');
    assert.strictEqual(beforeSeen.json.unseen_decisions_count, 1);

    const markSeen = await api(testEmail, 'POST', '/api/admissions/my-applications/mark-seen');
    assert.strictEqual(markSeen.status, 200);
    assert.strictEqual(markSeen.json.marked_count, 1);

    const afterSeen = await api(testEmail, 'GET', '/api/admissions/my-applications');
    assert.strictEqual(afterSeen.json.unseen_decisions_count, 0);

    const approveRes = await api('admin@uni.test', 'PATCH', `/api/admin/admission-applications/${createdAppId}`, {
      status: 'approved',
      admin_remarks: 'Documents verified. Welcome to BBA!',
      enroll_student: true,
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.json.application.status, 'approved');
    assert(approveRes.json.enrolled_student?.student_number, 'Approved applicant should be enrolled as a student');
  } finally {
    if (createdAppId) await db.query('DELETE FROM admission_applications WHERE id = $1', [createdAppId]);
    await db.query('DELETE FROM student_enrollments WHERE student_id IN (SELECT id FROM students WHERE user_id = $1)', [applicantUserId]);
    await db.query('DELETE FROM students WHERE user_id = $1', [applicantUserId]);
    await db.query('DELETE FROM audit_logs WHERE user_id = $1', [applicantUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [applicantUserId]);
  }
});
