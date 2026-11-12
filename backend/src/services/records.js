// Every query here is filtered by the AUTHENTICATED user's id (from the verified token).
// There is deliberately no function that accepts "some other student's id".
const db = require('../db');

async function getAttendance(userId) {
  const { rows } = await db.query(
    `SELECT sub.subject_code, sub.subject_name,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
            COUNT(*)::int AS total,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'present') / COUNT(*), 1) AS percentage
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN subjects sub ON sub.id = a.subject_id
      WHERE s.user_id = $1
      GROUP BY sub.id ORDER BY sub.subject_code`, [userId]);
  const present = rows.reduce((n, r) => n + r.present, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  return { overall_percentage: total ? Math.round((1000 * present) / total) / 10 : null, subjects: rows };
}

async function getStudentTimetable(userId) {
  const { rows } = await db.query(
    `SELECT t.day_of_week, t.start_time, t.end_time, sub.subject_name, u.full_name AS teacher,
            c.room_number, c.floor_number, b.building_name
       FROM students s
       JOIN student_enrollments e ON e.student_id = s.id
       JOIN timetables t ON t.subject_id = e.subject_id
       JOIN subjects sub ON sub.id = t.subject_id
       JOIN faculty f ON f.id = t.faculty_id
       JOIN users u ON u.id = f.user_id
       JOIN classrooms c ON c.id = t.classroom_id
       JOIN buildings b ON b.id = c.building_id
      WHERE s.user_id = $1
      ORDER BY t.day_of_week, t.start_time`, [userId]);
  return rows;
}

async function getUpcomingExams(userId, fromDate) {
  const { rows } = await db.query(
    `SELECT sub.subject_name, e.exam_type, to_char(e.exam_date,'YYYY-MM-DD') AS exam_date,
            to_char(e.start_time,'HH24:MI') AS start_time, to_char(e.end_time,'HH24:MI') AS end_time,
            c.room_number, b.building_name
       FROM students s
       JOIN student_enrollments en ON en.student_id = s.id
       JOIN examinations e ON e.subject_id = en.subject_id
       JOIN subjects sub ON sub.id = e.subject_id
       LEFT JOIN classrooms c ON c.id = e.classroom_id
       LEFT JOIN buildings b ON b.id = c.building_id
      WHERE s.user_id = $1 AND e.exam_date >= $2::date
      ORDER BY e.exam_date, e.start_time LIMIT 5`, [userId, fromDate]);
  return rows;
}

async function getMarks(userId) {
  const { rows } = await db.query(
    `SELECT sub.subject_name, e.exam_type, to_char(e.exam_date,'YYYY-MM-DD') AS exam_date, m.marks_obtained
       FROM student_marks m
       JOIN students s ON s.id = m.student_id
       JOIN examinations e ON e.id = m.examination_id
       JOIN subjects sub ON sub.id = e.subject_id
      WHERE s.user_id = $1
      ORDER BY e.exam_date, sub.subject_name`, [userId]);
  return rows;
}

async function getSemesterSubjects(userId) {
  const { rows } = await db.query(
    `SELECT c.course_name, s.semester, sub.subject_code, sub.subject_name
       FROM students s
       JOIN courses c ON c.id = s.course_id
       JOIN subjects sub ON sub.course_id = s.course_id AND sub.semester = s.semester
      WHERE s.user_id = $1
      ORDER BY sub.subject_code`, [userId]);
  return rows;
}

async function getFacultyTimetable(userId) {
  const { rows } = await db.query(
    `SELECT t.day_of_week, t.start_time, t.end_time, sub.subject_name,
            c.room_number, c.floor_number, b.building_name
       FROM faculty f
       JOIN timetables t ON t.faculty_id = f.id
       JOIN subjects sub ON sub.id = t.subject_id
       JOIN classrooms c ON c.id = t.classroom_id
       JOIN buildings b ON b.id = c.building_id
      WHERE f.user_id = $1
      ORDER BY t.day_of_week, t.start_time`, [userId]);
  return rows;
}

async function getFacultySubjects(userId) {
  const { rows } = await db.query(
    `SELECT sub.subject_code, sub.subject_name, c.course_name, sub.semester, fs.academic_year
       FROM faculty f
       JOIN faculty_subjects fs ON fs.faculty_id = f.id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN courses c ON c.id = sub.course_id
      WHERE f.user_id = $1
      ORDER BY sub.subject_code`, [userId]);
  return rows;
}

module.exports = { getAttendance, getStudentTimetable, getUpcomingExams, getMarks, getSemesterSubjects,
  getFacultyTimetable, getFacultySubjects };

// ---------- public, approved university records ----------
async function getAdmissions() {
  const { rows } = await db.query(
    `SELECT c.course_name, d.department_name, c.duration_years, a.eligibility,
            to_char(a.application_deadline, 'YYYY-MM-DD') AS application_deadline, a.fee_amount,
            a.required_documents, a.application_url, a.contact_info, a.scholarship_info
       FROM admissions a JOIN courses c ON c.id = a.course_id JOIN departments d ON d.id = c.department_id
      WHERE a.status = 'approved' ORDER BY c.course_name LIMIT 50`);
  return rows;
}

async function getDepartments() {
  const { rows } = await db.query(
    `SELECT d.department_name, u.full_name AS head_of_department,
            COALESCE(array_agg(c.course_name ORDER BY c.course_name) FILTER (WHERE c.id IS NOT NULL), '{}') AS courses
       FROM departments d LEFT JOIN users u ON u.id = d.hod_user_id LEFT JOIN courses c ON c.department_id = d.id
      GROUP BY d.id, u.full_name ORDER BY d.department_name`);
  return rows;
}

async function getNotices() {
  const { rows } = await db.query(
    `SELECT title, content, category, to_char(published_at, 'YYYY-MM-DD') AS published
       FROM notices WHERE is_published ORDER BY published_at DESC NULLS LAST LIMIT 5`);
  return rows;
}

module.exports.getAdmissions = getAdmissions;
module.exports.getDepartments = getDepartments;
module.exports.getNotices = getNotices;
