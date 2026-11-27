// HOD Department Services
// Strict data isolation: EVERY function resolves the HOD's department first via hod_user_id = userId.
// A Computer Science HOD can NEVER see Management data, and the reverse.
// Analytics functions return AGGREGATES ONLY (counts, averages, rates) — never individual student records.

const db = require('../db');
const audit = require('../audit');
const config = require('../config');
const { addDays, getCurrentWeekStart, SHORT_DAY_NAMES } = require('./time');

async function getHodDepartment(userId) {
  const { rows } = await db.query(
    'SELECT id, department_name, hod_user_id FROM departments WHERE hod_user_id = $1',
    [userId]
  );
  if (!rows[0]) {
    const err = new Error('You are not assigned as Head of Department for any department.');
    err.status = 403;
    throw err;
  }
  return rows[0];
}

async function getDepartmentOverview(userId) {
  const dept = await getHodDepartment(userId);
  const deptId = dept.id;

  const [facultyRes, studentsRes, coursesRes, subjectsRes, examsRes, pendingRes] = await Promise.all([
    db.query('SELECT count(*)::int AS count FROM faculty WHERE department_id = $1', [deptId]),
    db.query('SELECT count(*)::int AS count FROM students WHERE department_id = $1', [deptId]),
    db.query('SELECT count(*)::int AS count FROM courses WHERE department_id = $1', [deptId]),
    db.query(
      `SELECT count(DISTINCT sub.id)::int AS count
         FROM subjects sub
         JOIN courses c ON c.id = sub.course_id
        WHERE c.department_id = $1`,
      [deptId]
    ),
    db.query(
      `SELECT count(*)::int AS count
         FROM examinations e
         JOIN subjects sub ON sub.id = e.subject_id
         JOIN courses c ON c.id = sub.course_id
        WHERE c.department_id = $1 AND e.exam_date >= CURRENT_DATE`,
      [deptId]
    ),
    getDepartmentPendingActivities(userId),
  ]);

  return {
    department: {
      id: dept.id,
      name: dept.department_name,
    },
    counts: {
      faculty: facultyRes.rows[0]?.count || 0,
      students: studentsRes.rows[0]?.count || 0,
      courses: coursesRes.rows[0]?.count || 0,
      subjects: subjectsRes.rows[0]?.count || 0,
      upcoming_exams: examsRes.rows[0]?.count || 0,
      pending_activities: pendingRes?.total_pending_count || 0,
    },
  };
}

async function getDepartmentFaculty(userId) {
  const dept = await getHodDepartment(userId);
  const { rows } = await db.query(
    `SELECT f.id, f.employee_number, u.full_name, u.email, u.is_active,
            COUNT(t.id)::int AS weekly_classes,
            COALESCE(
              json_agg(
                json_build_object(
                  'subject_code', sub.subject_code,
                  'subject_name', sub.subject_name,
                  'course_name', c.course_name,
                  'semester', sub.semester,
                  'academic_year', fs.academic_year
                ) ORDER BY sub.subject_code
              ) FILTER (WHERE sub.id IS NOT NULL),
              '[]'
            ) AS subjects
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       LEFT JOIN faculty_subjects fs ON fs.faculty_id = f.id
       LEFT JOIN subjects sub ON sub.id = fs.subject_id
       LEFT JOIN courses c ON c.id = sub.course_id
       LEFT JOIN timetables t ON t.faculty_id = f.id
      WHERE f.department_id = $1
      GROUP BY f.id, f.employee_number, u.full_name, u.email, u.is_active
      ORDER BY u.full_name`,
    [dept.id]
  );

  return {
    department: dept.department_name,
    faculty: rows,
  };
}

async function getDepartmentCourses(userId) {
  const dept = await getHodDepartment(userId);

  const coursesRes = await db.query(
    `SELECT c.id, c.course_name, c.duration_years,
            COUNT(DISTINCT s.id)::int AS student_count,
            COUNT(DISTINCT sub.id)::int AS subject_count
       FROM courses c
       LEFT JOIN students s ON s.course_id = c.id
       LEFT JOIN subjects sub ON sub.course_id = c.id
      WHERE c.department_id = $1
      GROUP BY c.id, c.course_name, c.duration_years
      ORDER BY c.course_name`,
    [dept.id]
  );

  const subjectsRes = await db.query(
    `SELECT sub.id, sub.subject_code, sub.subject_name, sub.semester,
            c.id AS course_id, c.course_name,
            u.full_name AS assigned_faculty,
            f.employee_number AS faculty_employee_number
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN faculty_subjects fs ON fs.subject_id = sub.id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
      WHERE c.department_id = $1
      ORDER BY c.course_name, sub.semester, sub.subject_code`,
    [dept.id]
  );

  return {
    department: dept.department_name,
    courses: coursesRes.rows,
    subjects: subjectsRes.rows,
  };
}

async function getDepartmentScheduleAndExams(userId) {
  const dept = await getHodDepartment(userId);

  const [timetableRes, examsRes] = await Promise.all([
    db.query(
      `SELECT t.id, t.day_of_week,
              to_char(t.start_time, 'HH24:MI') AS start_time,
              to_char(t.end_time, 'HH24:MI') AS end_time,
              sub.subject_code, sub.subject_name, c.course_name, sub.semester,
              u.full_name AS teacher_name,
              cr.room_number, cr.floor_number, b.building_name
         FROM timetables t
         JOIN subjects sub ON sub.id = t.subject_id
         JOIN courses c ON c.id = sub.course_id
         JOIN faculty f ON f.id = t.faculty_id
         JOIN users u ON u.id = f.user_id
         JOIN classrooms cr ON cr.id = t.classroom_id
         JOIN buildings b ON b.id = cr.building_id
        WHERE c.department_id = $1
        ORDER BY t.day_of_week, t.start_time`,
      [dept.id]
    ),
    db.query(
      `SELECT e.id, sub.subject_code, sub.subject_name, c.course_name, sub.semester, e.exam_type,
              to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
              to_char(e.start_time, 'HH24:MI') AS start_time,
              to_char(e.end_time, 'HH24:MI') AS end_time,
              cr.room_number, b.building_name,
              CASE WHEN e.classroom_id IS NULL THEN TRUE ELSE FALSE END AS missing_room,
              e.grading_faculty_id,
              gfu.full_name AS grading_faculty_name,
              gf.employee_number AS grading_faculty_employee_number,
              to_char(e.grading_assigned_at, 'YYYY-MM-DD') AS grading_assigned_at,
              (SELECT COUNT(*)::int FROM student_marks m WHERE m.examination_id = e.id) AS marks_entered,
              (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id) AS total_enrolled
         FROM examinations e
         JOIN subjects sub ON sub.id = e.subject_id
         JOIN courses c ON c.id = sub.course_id
         LEFT JOIN classrooms cr ON cr.id = e.classroom_id
         LEFT JOIN buildings b ON b.id = cr.building_id
         LEFT JOIN faculty gf ON gf.id = e.grading_faculty_id
         LEFT JOIN users gfu ON gfu.id = gf.user_id
        WHERE c.department_id = $1
        ORDER BY e.exam_date DESC, e.start_time`,
      [dept.id]
    ),
  ]);

  return {
    department: dept.department_name,
    timetable: timetableRes.rows,
    examinations: examsRes.rows,
  };
}

async function getDepartmentPendingActivities(userId) {
  const dept = await getHodDepartment(userId);

  // 1. Exams without assigned classrooms
  const examsWithoutRoomsRes = await db.query(
    `SELECT e.id, sub.subject_code, sub.subject_name, c.course_name, e.exam_type,
            to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
            to_char(e.start_time, 'HH24:MI') AS start_time,
            to_char(e.end_time, 'HH24:MI') AS end_time
       FROM examinations e
       JOIN subjects sub ON sub.id = e.subject_id
       JOIN courses c ON c.id = sub.course_id
      WHERE c.department_id = $1 AND e.classroom_id IS NULL
      ORDER BY e.exam_date ASC`,
    [dept.id]
  );

  // 2. Completed examinations missing marks entry
  const marksMissingRes = await db.query(
    `SELECT e.id, sub.id AS subject_id, sub.subject_code, sub.subject_name, c.course_name, sub.semester, e.exam_type,
            to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
            to_char(e.start_time, 'HH24:MI') AS start_time,
            to_char(e.end_time, 'HH24:MI') AS end_time,
            cr.room_number, b.building_name,
            e.grading_faculty_id,
            gfu.full_name AS grading_faculty_name,
            gf.employee_number AS grading_faculty_employee_number,
            to_char(e.grading_assigned_at, 'YYYY-MM-DD') AS grading_assigned_at,
            (SELECT fs.faculty_id FROM faculty_subjects fs WHERE fs.subject_id = sub.id LIMIT 1) AS default_faculty_id,
            (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id) AS enrolled_students,
            (SELECT COUNT(*)::int FROM student_marks m WHERE m.examination_id = e.id) AS marks_entered
       FROM examinations e
       JOIN subjects sub ON sub.id = e.subject_id
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN classrooms cr ON cr.id = e.classroom_id
       LEFT JOIN buildings b ON b.id = cr.building_id
       LEFT JOIN faculty gf ON gf.id = e.grading_faculty_id
       LEFT JOIN users gfu ON gfu.id = gf.user_id
      WHERE c.department_id = $1
        AND e.exam_date <= CURRENT_DATE
        AND (SELECT COUNT(*)::int FROM student_marks m WHERE m.examination_id = e.id) <
            (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id)
      ORDER BY e.exam_date ASC`,
    [dept.id]
  );

  // 3. Subjects without assigned faculty
  const unassignedSubjectsRes = await db.query(
    `SELECT sub.id, sub.subject_code, sub.subject_name, c.course_name, sub.semester
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN faculty_subjects fs ON fs.subject_id = sub.id
      WHERE c.department_id = $1 AND fs.id IS NULL
      ORDER BY c.course_name, sub.semester, sub.subject_code`,
    [dept.id]
  );

  // 4. Classes missing weekly attendance for the current week
  const currentWeekStart = getCurrentWeekStart(config.tz);
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const missingAttendanceRes = await db.query(
    `SELECT DISTINCT ON (sub.id)
            sub.id AS subject_id, sub.subject_code, sub.subject_name, c.course_name, sub.semester,
            f.id AS faculty_id, u.full_name AS faculty_name, f.employee_number AS faculty_employee_number,
            u.email AS faculty_email,
            (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id) AS enrolled_students,
            COALESCE(
              (SELECT array_agg(DISTINCT t.day_of_week ORDER BY t.day_of_week)
                 FROM timetables t
                WHERE t.subject_id = sub.id AND t.faculty_id = f.id),
              '{}'
            ) AS timetable_days,
            EXISTS (
              SELECT 1 FROM audit_logs al
               WHERE al.action = 'hod_attendance_reminder'
                 AND al.entity_id = sub.id
                 AND al.details->>'week_start' = $2
            ) AS reminded
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       JOIN faculty_subjects fs ON sub.id = fs.subject_id
       JOIN faculty f ON f.id = fs.faculty_id
       JOIN users u ON u.id = f.user_id
      WHERE c.department_id = $1
        AND u.is_active = TRUE
        AND EXISTS (SELECT 1 FROM student_enrollments en WHERE en.subject_id = sub.id)
        AND NOT EXISTS (
          SELECT 1 FROM weekly_attendance_submissions was
           WHERE was.subject_id = sub.id AND was.week_start = $2::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
           WHERE a.subject_id = sub.id AND a.class_date BETWEEN $2::date AND $3::date
        )
      ORDER BY sub.id, sub.subject_code`,
    [dept.id, currentWeekStart, currentWeekEnd]
  );

  const missingAttendance = (missingAttendanceRes.rows || []).map((r) => ({
    subject_id: r.subject_id,
    subject_code: r.subject_code,
    subject_name: r.subject_name,
    course_name: r.course_name,
    semester: r.semester,
    faculty_id: r.faculty_id,
    faculty_name: r.faculty_name,
    faculty_employee_number: r.faculty_employee_number,
    faculty_email: r.faculty_email,
    enrolled_students: r.enrolled_students,
    week_start: currentWeekStart,
    week_end: currentWeekEnd,
    scheduled_days: (r.timetable_days || []).map((d) => SHORT_DAY_NAMES[d]).filter(Boolean),
    reminded: Boolean(r.reminded),
  }));

  // 5. Subjects without weekly timetable slots
  const unscheduledSubjectsRes = await db.query(
    `SELECT DISTINCT ON (sub.id)
            sub.id, sub.subject_code, sub.subject_name, c.course_name, sub.semester,
            f.id AS faculty_id, u.full_name AS faculty_name, f.employee_number AS faculty_employee_number
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN faculty_subjects fs ON sub.id = fs.subject_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
      WHERE c.department_id = $1
        AND NOT EXISTS (SELECT 1 FROM timetables t WHERE t.subject_id = sub.id)
      ORDER BY sub.id, sub.subject_code`,
    [dept.id]
  );

  const unscheduledSubjects = unscheduledSubjectsRes.rows || [];

  const total =
    (examsWithoutRoomsRes.rows?.length || 0) +
    (marksMissingRes.rows?.length || 0) +
    (unassignedSubjectsRes.rows?.length || 0) +
    missingAttendance.length +
    unscheduledSubjects.length;

  return {
    department: dept.department_name,
    total_pending_count: total,
    exams_without_rooms: examsWithoutRoomsRes.rows || [],
    marks_not_entered: marksMissingRes.rows || [],
    unassigned_subjects: unassignedSubjectsRes.rows || [],
    missing_attendance: missingAttendance,
    unscheduled_subjects: unscheduledSubjects,
  };
}

async function getDepartmentAnalytics(userId) {
  const dept = await getHodDepartment(userId);

  // AGGREGATES ONLY: never expose individual student grades or names.
  const [overallAttendance, subjectAttendance, examPerformance, facultyWorkload, studentDistribution] = await Promise.all([
    // Department overall attendance rate
    db.query(
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'present') / NULLIF(COUNT(*), 0), 1) AS overall_attendance_pct,
              COUNT(*)::int AS total_attendance_records,
              COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_records,
              COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent_records,
              COUNT(*) FILTER (WHERE a.status = 'leave')::int AS leave_records
         FROM attendance a
         JOIN subjects sub ON sub.id = a.subject_id
         JOIN courses c ON c.id = sub.course_id
        WHERE c.department_id = $1`,
      [dept.id]
    ),

    // Subject-wise aggregate attendance
    db.query(
      `SELECT sub.subject_code, sub.subject_name, c.course_name, sub.semester,
              COUNT(*)::int AS total_sessions,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_pct
         FROM attendance a
         JOIN subjects sub ON sub.id = a.subject_id
         JOIN courses c ON c.id = sub.course_id
        WHERE c.department_id = $1
        GROUP BY sub.id, sub.subject_code, sub.subject_name, c.course_name, sub.semester
        ORDER BY attendance_pct ASC`,
      [dept.id]
    ),

    // Exam performance summaries (aggregates only)
    db.query(
      `SELECT sub.subject_code, sub.subject_name, e.exam_type,
              to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
              COUNT(m.id)::int AS students_graded,
              ROUND(AVG(m.marks_obtained), 1) AS average_marks,
              ROUND(MIN(m.marks_obtained), 1) AS lowest_marks,
              ROUND(MAX(m.marks_obtained), 1) AS highest_marks,
              ROUND(100.0 * COUNT(*) FILTER (WHERE m.marks_obtained >= 50.0) / NULLIF(COUNT(m.id), 0), 1) AS pass_percentage
         FROM examinations e
         JOIN subjects sub ON sub.id = e.subject_id
         JOIN courses c ON c.id = sub.course_id
         LEFT JOIN student_marks m ON m.examination_id = e.id
        WHERE c.department_id = $1 AND e.exam_date <= CURRENT_DATE
        GROUP BY e.id, sub.subject_code, sub.subject_name, e.exam_type, e.exam_date
        ORDER BY e.exam_date DESC`,
      [dept.id]
    ),

    // Faculty workload distribution
    db.query(
      `SELECT u.full_name, f.employee_number,
              COUNT(DISTINCT fs.subject_id)::int AS subjects_count,
              COUNT(t.id)::int AS weekly_classes
         FROM faculty f
         JOIN users u ON u.id = f.user_id
         LEFT JOIN faculty_subjects fs ON fs.faculty_id = f.id
         LEFT JOIN timetables t ON t.faculty_id = f.id
        WHERE f.department_id = $1
        GROUP BY f.id, u.full_name, f.employee_number
        ORDER BY weekly_classes DESC`,
      [dept.id]
    ),

    // Student counts by course and semester
    db.query(
      `SELECT c.course_name, s.semester, COUNT(s.id)::int AS student_count
         FROM students s
         JOIN courses c ON c.id = s.course_id
        WHERE c.department_id = $1
        GROUP BY c.course_name, s.semester
        ORDER BY c.course_name, s.semester`,
      [dept.id]
    ),
  ]);

  return {
    department: dept.department_name,
    overall_attendance: overallAttendance.rows[0],
    subject_attendance: subjectAttendance.rows,
    exam_performance: examPerformance.rows,
    faculty_workload: facultyWorkload.rows,
    student_distribution: studentDistribution.rows,
  };
}

async function getDepartmentNotices(userId) {
  const dept = await getHodDepartment(userId);
  const { rows } = await db.query(
    `SELECT n.id, n.title, n.content, n.category, n.is_published,
            to_char(n.published_at, 'YYYY-MM-DD') AS published_at,
            to_char(n.published_at, 'HH24:MI') AS published_time,
            n.department_id, d.department_name,
            u.full_name AS created_by_name
       FROM notices n
       JOIN departments d ON d.id = n.department_id
       LEFT JOIN users u ON u.id = n.created_by
      WHERE n.department_id = $1
      ORDER BY n.published_at DESC NULLS FIRST, n.title`,
    [dept.id]
  );
  return {
    department: dept.department_name,
    notices: rows,
  };
}

async function createDepartmentNotice(userId, { title, content, category, is_published = false }) {
  const dept = await getHodDepartment(userId);
  const { rows } = await db.query(
    `INSERT INTO notices (title, content, category, is_published, published_at, created_by, department_id)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END, $5, $6)
     RETURNING id, title, content, category, is_published, to_char(published_at, 'YYYY-MM-DD') AS published_at`,
    [title, content, category || null, is_published, userId, dept.id]
  );
  await audit(userId, 'hod_notice_create', 'notice', rows[0].id, {
    title,
    department: dept.department_name,
    is_published,
  });
  return rows[0];
}

async function updateDepartmentNotice(userId, noticeId, { is_published }) {
  const dept = await getHodDepartment(userId);
  const { rowCount } = await db.query(
    `UPDATE notices
        SET is_published = $2,
            published_at = CASE WHEN $2 THEN COALESCE(published_at, now()) ELSE published_at END
      WHERE id = $1 AND department_id = $3`,
    [noticeId, is_published, dept.id]
  );
  if (!rowCount) {
    const err = new Error('Notice not found or does not belong to your department.');
    err.status = 404;
    throw err;
  }
  await audit(userId, 'hod_notice_update', 'notice', noticeId, { is_published });
  return { ok: true };
}

async function getDepartmentReport(userId) {
  const [overview, faculty, courses, pending, analytics, notices] = await Promise.all([
    getDepartmentOverview(userId),
    getDepartmentFaculty(userId),
    getDepartmentCourses(userId),
    getDepartmentPendingActivities(userId),
    getDepartmentAnalytics(userId),
    getDepartmentNotices(userId),
  ]);

  return {
    generated_at: new Date().toISOString(),
    overview,
    faculty: faculty.faculty,
    courses: courses.courses,
    subjects: courses.subjects,
    pending,
    analytics,
    notices: notices.notices,
  };
}

function escapeCsvCell(cell) {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(row) {
  return row.map(escapeCsvCell).join(',');
}

async function generateDepartmentReportCsv(userId) {
  const report = await getDepartmentReport(userId);
  const deptName = report.overview.department.name;
  const counts = report.overview.counts;

  const lines = [
    rowToCsv(['DEPARTMENT EXECUTIVE REPORT', deptName]),
    rowToCsv(['Generated At', report.generated_at]),
    rowToCsv([]),
    rowToCsv(['--- DEPARTMENT SUMMARY ---']),
    rowToCsv(['Metric', 'Count']),
    rowToCsv(['Faculty Members', counts.faculty]),
    rowToCsv(['Enrolled Students', counts.students]),
    rowToCsv(['Courses Offered', counts.courses]),
    rowToCsv(['Curriculum Subjects', counts.subjects]),
    rowToCsv(['Upcoming Examinations', counts.upcoming_exams]),
    rowToCsv(['Pending Action Items', counts.pending_activities]),
    rowToCsv([]),
    rowToCsv(['--- FACULTY WORKLOAD ---']),
    rowToCsv(['Employee ID', 'Faculty Name', 'Email', 'Active', 'Assigned Subjects', 'Weekly Teaching Hours']),
    ...report.faculty.map((f) =>
      rowToCsv([
        f.employee_number,
        f.full_name,
        f.email,
        f.is_active ? 'Yes' : 'No',
        (f.subjects || []).map((s) => `${s.subject_code} (${s.subject_name})`).join('; '),
        f.weekly_classes,
      ])
    ),
    rowToCsv([]),
    rowToCsv(['--- COURSES OFFERED ---']),
    rowToCsv(['Course Name', 'Duration (Years)', 'Enrolled Students', 'Total Subjects']),
    ...report.courses.map((c) =>
      rowToCsv([c.course_name, c.duration_years, c.student_count, c.subject_count])
    ),
    rowToCsv([]),
    rowToCsv(['--- SUBJECT ATTENDANCE (AGGREGATE) ---']),
    rowToCsv(['Subject Code', 'Subject Name', 'Course', 'Semester', 'Total Sessions Held', 'Attendance %']),
    ...report.analytics.subject_attendance.map((sa) =>
      rowToCsv([
        sa.subject_code,
        sa.subject_name,
        sa.course_name,
        sa.semester,
        sa.total_sessions,
        `${sa.attendance_pct ?? 'N/A'}%`,
      ])
    ),
    rowToCsv([]),
    rowToCsv(['--- EXAMINATION RESULTS (AGGREGATE) ---']),
    rowToCsv(['Subject Code', 'Subject Name', 'Exam Type', 'Exam Date', 'Students Graded', 'Average Marks', 'Min Marks', 'Max Marks', 'Pass Rate %']),
    ...report.analytics.exam_performance.map((ep) =>
      rowToCsv([
        ep.subject_code,
        ep.subject_name,
        ep.exam_type,
        ep.exam_date,
        ep.students_graded,
        ep.average_marks,
        ep.lowest_marks,
        ep.highest_marks,
        `${ep.pass_percentage ?? 'N/A'}%`,
      ])
    ),
    rowToCsv([]),
    rowToCsv(['--- PENDING ACTIVITIES ---']),
    rowToCsv(['Category', 'Item Code / Type', 'Title / Description', 'Details']),
    ...report.pending.exams_without_rooms.map((e) =>
      rowToCsv(['Exams Without Room', e.subject_code, e.exam_type, `Date: ${e.exam_date} ${e.start_time}-${e.end_time}`])
    ),
    ...report.pending.marks_not_entered.map((m) =>
      rowToCsv(['Marks Not Entered', m.subject_code, m.exam_type, `Exam Date: ${m.exam_date}, Graded: ${m.marks_entered}/${m.enrolled_students}`])
    ),
    ...report.pending.unassigned_subjects.map((u) =>
      rowToCsv(['Unassigned Subject', u.subject_code, u.subject_name, `Course: ${u.course_name}, Sem: ${u.semester}`])
    ),
    ...(report.pending.missing_attendance || []).map((ma) =>
      rowToCsv([
        'Missing Weekly Attendance',
        ma.subject_code,
        ma.subject_name,
        `Faculty: ${ma.faculty_name}, Week: ${ma.week_start} to ${ma.week_end}`,
      ])
    ),
    ...(report.pending.unscheduled_subjects || []).map((us) =>
      rowToCsv([
        'No Timetable Slot',
        us.subject_code,
        us.subject_name,
        `Course: ${us.course_name}, Sem: ${us.semester}, Faculty: ${us.faculty_name || 'Unassigned'}`,
      ])
    ),
  ];

  return lines.join('\r\n');
}

async function getClassrooms() {
  const { rows } = await db.query(
    `SELECT c.id, c.room_number, c.floor_number, c.room_type, b.building_name
       FROM classrooms c
       JOIN buildings b ON b.id = c.building_id
      ORDER BY b.building_name, c.room_number`
  );
  return rows;
}

async function assignExamClassroom(userId, examId, classroomId) {
  const dept = await getHodDepartment(userId);

  // Check if exam belongs to a course in the HOD's department
  const check = await db.query(
    `SELECT e.id, e.exam_type, s.subject_code, s.subject_name
       FROM examinations e
       JOIN subjects s ON s.id = e.subject_id
       JOIN courses c ON c.id = s.course_id
      WHERE e.id = $1 AND c.department_id = $2`,
    [examId, dept.id]
  );

  if (!check.rows[0]) {
    const err = new Error('Examination not found in your department');
    err.status = 404;
    throw err;
  }

  // If classroomId is provided, verify it exists
  if (classroomId) {
    const roomCheck = await db.query('SELECT id FROM classrooms WHERE id = $1', [classroomId]);
    if (!roomCheck.rows[0]) {
      const err = new Error('Selected classroom does not exist');
      err.status = 400;
      throw err;
    }
  }

  const { rows } = await db.query(
    `UPDATE examinations
        SET classroom_id = $1
      WHERE id = $2
     RETURNING id, exam_type, exam_date, start_time, end_time, classroom_id`,
    [classroomId || null, examId]
  );

  await audit(userId, 'hod_assign_exam_classroom', 'examination', examId, {
    classroom_id: classroomId,
    department_id: dept.id,
  });

  return rows[0];
}

async function scheduleExamination(userId, data) {
  const dept = await getHodDepartment(userId);

  // Validate subject belongs to this department
  const subjCheck = await db.query(
    `SELECT s.id, s.subject_code, s.subject_name
       FROM subjects s
       JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1 AND c.department_id = $2`,
    [data.subject_id, dept.id]
  );

  if (!subjCheck.rows[0]) {
    const err = new Error('Subject not found in your department');
    err.status = 404;
    throw err;
  }

  if (data.classroom_id) {
    const roomCheck = await db.query('SELECT id FROM classrooms WHERE id = $1', [data.classroom_id]);
    if (!roomCheck.rows[0]) {
      const err = new Error('Selected classroom does not exist');
      err.status = 400;
      throw err;
    }
  }

  const { rows } = await db.query(
    `INSERT INTO examinations (subject_id, exam_type, exam_date, start_time, end_time, classroom_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, subject_id, exam_type, exam_date, start_time, end_time, classroom_id`,
    [
      data.subject_id,
      data.exam_type,
      data.exam_date,
      data.start_time,
      data.end_time,
      data.classroom_id || null,
    ]
  );

  await audit(userId, 'hod_schedule_examination', 'examination', rows[0].id, {
    subject_id: data.subject_id,
    exam_type: data.exam_type,
    department_id: dept.id,
  });

  return rows[0];
}

async function assignExamGradingFaculty(userId, examId, facultyId) {
  const dept = await getHodDepartment(userId);

  const examCheck = await db.query(
    `SELECT e.id, e.exam_type, s.subject_code, s.subject_name
       FROM examinations e
       JOIN subjects s ON s.id = e.subject_id
       JOIN courses c ON c.id = s.course_id
      WHERE e.id = $1 AND c.department_id = $2`,
    [examId, dept.id]
  );

  if (!examCheck.rows[0]) {
    const err = new Error('Examination not found in your department');
    err.status = 404;
    throw err;
  }

  let facultyRow = null;
  if (facultyId) {
    const facCheck = await db.query(
      `SELECT f.id, u.full_name, f.employee_number
         FROM faculty f
         JOIN users u ON u.id = f.user_id
        WHERE f.id = $1 AND f.department_id = $2 AND u.is_active = TRUE`,
      [facultyId, dept.id]
    );
    if (!facCheck.rows[0]) {
      const err = new Error('Selected faculty member does not belong to your department or is inactive');
      err.status = 400;
      throw err;
    }
    facultyRow = facCheck.rows[0];
  }

  const { rows } = await db.query(
    `UPDATE examinations
        SET grading_faculty_id = $1::uuid,
            grading_assigned_at = CASE WHEN $1::uuid IS NULL THEN NULL ELSE now() END,
            grading_assigned_by = $2::uuid
      WHERE id = $3
     RETURNING id, exam_type, to_char(exam_date, 'YYYY-MM-DD') AS exam_date,
               grading_faculty_id, to_char(grading_assigned_at, 'YYYY-MM-DD') AS grading_assigned_at`,
    [facultyId || null, facultyId ? userId : null, examId]
  );

  await audit(userId, 'hod_assign_exam_grading', 'examination', examId, {
    faculty_id: facultyId || null,
    faculty_name: facultyRow?.full_name || null,
    department_id: dept.id,
  });

  return {
    ...rows[0],
    grading_faculty_name: facultyRow?.full_name || null,
    grading_faculty_employee_number: facultyRow?.employee_number || null,
  };
}

async function assignSubjectFaculty(userId, subjectId, facultyId, academicYear = '2026-27') {
  const dept = await getHodDepartment(userId);

  const subjCheck = await db.query(
    `SELECT s.id, s.subject_code, s.subject_name
       FROM subjects s
       JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1 AND c.department_id = $2`,
    [subjectId, dept.id]
  );

  if (!subjCheck.rows[0]) {
    const err = new Error('Subject not found in your department');
    err.status = 404;
    throw err;
  }

  const facCheck = await db.query(
    `SELECT f.id, u.full_name, f.employee_number
       FROM faculty f
       JOIN users u ON u.id = f.user_id
      WHERE f.id = $1 AND f.department_id = $2 AND u.is_active = TRUE`,
    [facultyId, dept.id]
  );

  if (!facCheck.rows[0]) {
    const err = new Error('Selected faculty member does not belong to your department or is inactive');
    err.status = 400;
    throw err;
  }

  await db.query(
    `INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year)
     VALUES ($1, $2, $3)
     ON CONFLICT (faculty_id, subject_id, academic_year) DO NOTHING`,
    [facultyId, subjectId, academicYear]
  );

  await audit(userId, 'hod_assign_subject_faculty', 'subject', subjectId, {
    faculty_id: facultyId,
    faculty_name: facCheck.rows[0].full_name,
    academic_year: academicYear,
    department_id: dept.id,
  });

  return {
    subject_id: subjectId,
    faculty_id: facultyId,
    faculty_name: facCheck.rows[0].full_name,
    academic_year: academicYear,
  };
}

async function sendAttendanceReminder(userId, subjectId, weekStart) {
  const dept = await getHodDepartment(userId);

  const { rows } = await db.query(
    `SELECT sub.id, sub.subject_code, sub.subject_name,
            f.id AS faculty_id, u.full_name AS faculty_name
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       JOIN faculty_subjects fs ON sub.id = fs.subject_id
       JOIN faculty f ON f.id = fs.faculty_id
       JOIN users u ON u.id = f.user_id
      WHERE sub.id = $1 AND c.department_id = $2
      LIMIT 1`,
    [subjectId, dept.id]
  );

  if (!rows[0]) {
    const err = new Error('Subject or assigned faculty not found in your department');
    err.status = 404;
    throw err;
  }

  const target = rows[0];
  const title = `Weekly Attendance Reminder: ${target.subject_code} (Week of ${weekStart})`;
  const content = `${target.faculty_name}, please download the blank weekly attendance CSV and upload the filled attendance (P for Present, A for Absent) for ${target.subject_code} - ${target.subject_name} for the week starting ${weekStart}.`;

  await db.query(
    `INSERT INTO notices (title, content, category, is_published, published_at, created_by, department_id)
     VALUES ($1, $2, 'Academics', TRUE, now(), $3, $4)`,
    [title, content, userId, dept.id]
  );

  await audit(userId, 'hod_attendance_reminder', 'subject', subjectId, {
    subject_code: target.subject_code,
    faculty_id: target.faculty_id,
    faculty_name: target.faculty_name,
    week_start: weekStart,
    department_id: dept.id,
  });

  return {
    success: true,
    subject_id: subjectId,
    subject_code: target.subject_code,
    faculty_name: target.faculty_name,
    week_start: weekStart,
  };
}

async function scheduleSubjectTimetableSlot(userId, subjectId, { faculty_id, classroom_id, day_of_week, start_time, end_time }) {
  const dept = await getHodDepartment(userId);

  const subjCheck = await db.query(
    `SELECT s.id, s.subject_code, s.subject_name, s.course_id, s.semester, c.course_name
       FROM subjects s
       JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1 AND c.department_id = $2`,
    [subjectId, dept.id]
  );
  if (!subjCheck.rows[0]) {
    const err = new Error('Subject not found in your department');
    err.status = 404;
    throw err;
  }
  const subj = subjCheck.rows[0];

  const facCheck = await db.query(
    `SELECT f.id, u.full_name
       FROM faculty f
       JOIN users u ON u.id = f.user_id
      WHERE f.id = $1 AND f.department_id = $2 AND u.is_active = TRUE`,
    [faculty_id, dept.id]
  );
  if (!facCheck.rows[0]) {
    const err = new Error('Selected faculty member does not belong to your department or is inactive');
    err.status = 400;
    throw err;
  }

  const roomCheck = await db.query('SELECT id, room_number FROM classrooms WHERE id = $1', [classroom_id]);
  if (!roomCheck.rows[0]) {
    const err = new Error('Selected classroom does not exist');
    err.status = 400;
    throw err;
  }

  // Clash check: same room, same faculty, OR same student batch (course + semester) overlapping on day_of_week
  const clashRes = await db.query(
    `SELECT t.id, sub.subject_code, sub.course_id, sub.semester, c.course_name,
            t.classroom_id, t.faculty_id, cr.room_number, u.full_name AS teacher_name,
            to_char(t.start_time, 'HH24:MI') AS start_time, to_char(t.end_time, 'HH24:MI') AS end_time
       FROM timetables t
       JOIN subjects sub ON sub.id = t.subject_id
       JOIN courses c ON c.id = sub.course_id
       JOIN classrooms cr ON cr.id = t.classroom_id
       JOIN faculty f ON f.id = t.faculty_id
       JOIN users u ON u.id = f.user_id
      WHERE t.day_of_week = $1
        AND t.start_time < $3::time
        AND t.end_time > $2::time
        AND (
          t.classroom_id = $4
          OR t.faculty_id = $5
          OR (sub.course_id = $6 AND sub.semester = $7)
        )
      LIMIT 1`,
    [day_of_week, start_time, end_time, classroom_id, faculty_id, subj.course_id, subj.semester]
  );
  if (clashRes.rows[0]) {
    const cl = clashRes.rows[0];
    const reasons = [];
    if (cl.classroom_id === classroom_id) reasons.push(`Room conflict (${cl.room_number})`);
    if (cl.faculty_id === faculty_id) reasons.push(`Faculty conflict (${cl.teacher_name})`);
    if (cl.course_id === subj.course_id && cl.semester === subj.semester) {
      reasons.push(`Student batch conflict (${cl.course_name} Sem ${cl.semester})`);
    }
    const dayName = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day_of_week] || `Day ${day_of_week}`;
    const err = new Error(
      `Class clash detected (${reasons.join(', ')}): conflicts with ${cl.subject_code} on ${dayName} ${cl.start_time}-${cl.end_time} in ${cl.room_number} (${cl.teacher_name}).`
    );
    err.status = 400;
    throw err;
  }

  const { rows } = await db.query(
    `INSERT INTO timetables (subject_id, faculty_id, classroom_id, day_of_week, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5::time, $6::time)
     RETURNING id, subject_id, faculty_id, classroom_id, day_of_week,
               to_char(start_time, 'HH24:MI') AS start_time,
               to_char(end_time, 'HH24:MI') AS end_time`,
    [subjectId, faculty_id, classroom_id, day_of_week, start_time, end_time]
  );

  await audit(userId, 'hod_schedule_timetable_slot', 'timetable', rows[0].id, {
    subject_id: subjectId,
    subject_code: subjCheck.rows[0].subject_code,
    faculty_id,
    classroom_id,
    day_of_week,
    start_time,
    end_time,
    department_id: dept.id,
  });

  return {
    ...rows[0],
    subject_code: subjCheck.rows[0].subject_code,
    faculty_name: facCheck.rows[0].full_name,
    room_number: roomCheck.rows[0].room_number,
  };
}

module.exports = {
  getHodDepartment,
  getDepartmentOverview,
  getDepartmentFaculty,
  getDepartmentCourses,
  getDepartmentScheduleAndExams,
  getDepartmentPendingActivities,
  getDepartmentAnalytics,
  getDepartmentNotices,
  createDepartmentNotice,
  updateDepartmentNotice,
  getDepartmentReport,
  generateDepartmentReportCsv,
  getClassrooms,
  assignExamClassroom,
  scheduleExamination,
  assignExamGradingFaculty,
  assignSubjectFaculty,
  sendAttendanceReminder,
  scheduleSubjectTimetableSlot,
};
