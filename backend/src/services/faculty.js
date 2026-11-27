const db = require('../db');
const audit = require('../audit');
const config = require('../config');
const { parseMarksSpreadsheet } = require('./spreadsheet');
const { addDays, getWeekStart, getCurrentWeekStart, getWeekDatesForDays } = require('./time');

async function getFacultyByUserId(userId) {
  const { rows } = await db.query(
    `SELECT f.id, f.employee_number, f.department_id, d.department_name, u.full_name, u.email
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       JOIN departments d ON d.id = f.department_id
      WHERE f.user_id = $1`,
    [userId]
  );
  if (!rows[0]) {
    const err = new Error('Faculty profile not found for your account.');
    err.status = 403;
    throw err;
  }
  return rows[0];
}

async function getGradingTasks(userId) {
  const fac = await getFacultyByUserId(userId);
  const { rows } = await db.query(
    `SELECT e.id, sub.id AS subject_id, sub.subject_code, sub.subject_name,
            c.course_name, sub.semester, e.exam_type,
            to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
            to_char(e.start_time, 'HH24:MI') AS start_time,
            to_char(e.end_time, 'HH24:MI') AS end_time,
            cr.room_number, b.building_name,
            to_char(e.grading_assigned_at, 'YYYY-MM-DD') AS grading_assigned_at,
            abu.full_name AS assigned_by_name,
            (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id) AS enrolled_students,
            (SELECT COUNT(*)::int FROM student_marks m WHERE m.examination_id = e.id) AS marks_entered
       FROM examinations e
       JOIN subjects sub ON sub.id = e.subject_id
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN classrooms cr ON cr.id = e.classroom_id
       LEFT JOIN buildings b ON b.id = cr.building_id
       LEFT JOIN users abu ON abu.id = e.grading_assigned_by
      WHERE e.grading_faculty_id = $1
      ORDER BY
        ((SELECT COUNT(*)::int FROM student_marks m WHERE m.examination_id = e.id) <
         (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = sub.id)) DESC,
        e.exam_date ASC,
        e.start_time ASC`,
    [fac.id]
  );

  const exams = rows.map((r) => ({
    ...r,
    is_completed: r.enrolled_students > 0 && r.marks_entered >= r.enrolled_students,
  }));

  return {
    faculty: fac,
    pending_count: exams.filter((e) => !e.is_completed).length,
    exams,
  };
}

async function assertAssignedGradingExam(facultyId, examId) {
  const { rows } = await db.query(
    `SELECT e.id, e.subject_id, e.grading_faculty_id, e.exam_type,
            to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
            to_char(e.start_time, 'HH24:MI') AS start_time,
            to_char(e.end_time, 'HH24:MI') AS end_time,
            sub.subject_code, sub.subject_name, sub.semester, c.course_name,
            cr.room_number, b.building_name
       FROM examinations e
       JOIN subjects sub ON sub.id = e.subject_id
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN classrooms cr ON cr.id = e.classroom_id
       LEFT JOIN buildings b ON b.id = cr.building_id
      WHERE e.id = $1`,
    [examId]
  );
  if (!rows[0]) {
    const err = new Error('Examination not found');
    err.status = 404;
    throw err;
  }
  if (rows[0].grading_faculty_id !== facultyId) {
    const err = new Error('You are not assigned to grade this examination');
    err.status = 403;
    throw err;
  }
  return rows[0];
}

async function getExamStudentsForGrading(userId, examId) {
  const fac = await getFacultyByUserId(userId);
  const exam = await assertAssignedGradingExam(fac.id, examId);

  const { rows } = await db.query(
    `SELECT DISTINCT ON (s.student_number, s.id)
            s.id AS student_id, s.student_number, u.full_name, u.email,
            CASE WHEN m.marks_obtained IS NULL THEN NULL ELSE m.marks_obtained::float8 END AS marks_obtained,
            to_char(m.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_marks m ON m.examination_id = $1 AND m.student_id = s.id
      WHERE en.subject_id = $2
      ORDER BY s.student_number ASC, s.id ASC`,
    [examId, exam.subject_id]
  );

  return {
    examination: exam,
    students: rows,
  };
}

async function submitExamMarks(userId, examId, marksList) {
  const fac = await getFacultyByUserId(userId);
  const exam = await assertAssignedGradingExam(fac.id, examId);

  const enrolledRes = await db.query(
    'SELECT DISTINCT student_id FROM student_enrollments WHERE subject_id = $1',
    [exam.subject_id]
  );
  const enrolledSet = new Set(enrolledRes.rows.map((r) => r.student_id));

  const deduped = new Map();
  for (const item of marksList) {
    if (!enrolledSet.has(item.student_id)) {
      const err = new Error('One or more students are not enrolled in this subject');
      err.status = 400;
      throw err;
    }
    deduped.set(item.student_id, Math.round(Number(item.marks_obtained) * 100) / 100);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const [studentId, score] of deduped.entries()) {
      await client.query(
        `INSERT INTO student_marks (examination_id, student_id, marks_obtained, graded_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (examination_id, student_id)
         DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained,
                       graded_by = EXCLUDED.graded_by,
                       updated_at = now()`,
        [examId, studentId, score, userId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const countsRes = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM student_marks WHERE examination_id = $1) AS marks_entered,
            (SELECT COUNT(DISTINCT student_id)::int FROM student_enrollments WHERE subject_id = $2) AS enrolled_students`,
    [examId, exam.subject_id]
  );

  await audit(userId, 'teacher_submit_exam_marks', 'examination', examId, {
    faculty_id: fac.id,
    subject_code: exam.subject_code,
    saved_count: deduped.size,
  });

  return {
    success: true,
    saved_count: deduped.size,
    marks_entered: countsRes.rows[0]?.marks_entered || 0,
    enrolled_students: countsRes.rows[0]?.enrolled_students || 0,
  };
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const STUDENT_ID_HEADERS = new Set([
  'student_number',
  'roll_number',
  'roll_no',
  'roll',
  'student_id',
  'reg_no',
  'registration_number',
  'email',
  'student_email',
]);

const MARKS_HEADERS = new Set([
  'marks_obtained',
  'marks',
  'mark',
  'score',
  'obtained_marks',
  'total_marks',
]);

async function uploadExamMarksFromFile(userId, examId, file) {
  const fac = await getFacultyByUserId(userId);
  const exam = await assertAssignedGradingExam(fac.id, examId);

  const { format, rows } = parseMarksSpreadsheet(file);
  if (rows.length < 2) {
    const err = new Error('The uploaded file is empty or contains no student mark rows. Please upload a new CSV.');
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const headers = rows[0].map(normalizeHeader);
  const idColIdx = headers.findIndex((h) => STUDENT_ID_HEADERS.has(h));
  const marksColIdx = headers.findIndex((h) => MARKS_HEADERS.has(h));

  if (idColIdx === -1 || marksColIdx === -1) {
    const err = new Error(
      'Could not find required columns. Expected columns like "student_number" (or "roll_number") and "marks_obtained" (or "marks"). Please upload a new CSV.'
    );
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const enrolledRes = await db.query(
    `SELECT DISTINCT ON (s.id)
            s.id AS student_id, s.student_number, u.full_name, u.email
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id
       JOIN users u ON u.id = s.user_id
      WHERE en.subject_id = $1
      ORDER BY s.id`,
    [exam.subject_id]
  );

  const byRoll = new Map();
  const byEmail = new Map();
  const byUuid = new Map();

  for (const st of enrolledRes.rows) {
    byRoll.set(String(st.student_number).trim().toUpperCase(), st);
    byEmail.set(String(st.email).trim().toLowerCase(), st);
    byUuid.set(String(st.student_id).toLowerCase(), st);
  }

  const parsedMarks = new Map();
  const missingStudents = [];
  const invalidRows = [];
  const unknownStudents = [];
  const seenStudentIds = new Set();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = i + 1;
    const rawIdentifier = String(r[idColIdx] ?? '').trim();
    const rawMark = String(r[marksColIdx] ?? '').trim();

    if (!rawIdentifier && !rawMark) continue;
    if (!rawIdentifier) {
      invalidRows.push({ row: rowNumber, reason: 'Missing student roll number / identifier' });
      continue;
    }

    const st =
      byRoll.get(rawIdentifier.toUpperCase()) ||
      byEmail.get(rawIdentifier.toLowerCase()) ||
      byUuid.get(rawIdentifier.toLowerCase());

    if (!st) {
      unknownStudents.push({ row: rowNumber, identifier: rawIdentifier });
      continue;
    }

    seenStudentIds.add(st.student_id);

    if (rawMark === '' || rawMark === '-' || rawMark.toLowerCase() === 'na' || rawMark.toLowerCase() === 'n/a') {
      missingStudents.push({
        student_id: st.student_id,
        student_number: st.student_number,
        full_name: st.full_name,
        reason: `Blank marks at row ${rowNumber}`,
      });
      continue;
    }

    const num = Number(rawMark);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      invalidRows.push({
        row: rowNumber,
        student_number: st.student_number,
        full_name: st.full_name,
        value: rawMark,
        reason: 'Marks must be a number between 0 and 100',
      });
      continue;
    }

    parsedMarks.set(st.student_id, Math.round(num * 100) / 100);
  }

  // Check for enrolled students completely missing from the uploaded file
  for (const st of enrolledRes.rows) {
    if (!seenStudentIds.has(st.student_id)) {
      missingStudents.push({
        student_id: st.student_id,
        student_number: st.student_number,
        full_name: st.full_name,
        reason: 'Student not present in uploaded file',
      });
    }
  }

  if (missingStudents.length > 0 || invalidRows.length > 0 || unknownStudents.length > 0) {
    const parts = [];
    if (missingStudents.length > 0) parts.push(`${missingStudents.length} student(s) have missing marks`);
    if (invalidRows.length > 0) parts.push(`${invalidRows.length} row(s) have invalid marks`);
    if (unknownStudents.length > 0) parts.push(`${unknownStudents.length} unrecognized student(s)`);

    const err = new Error(
      `Cannot import marks: ${parts.join(', ')}. Please fix the file and upload a new CSV.`
    );
    err.status = 400;
    err.payload = {
      needs_reupload: true,
      missing_students: missingStudents,
      invalid_rows: invalidRows,
      unknown_students: unknownStudents,
    };
    throw err;
  }

  const marksArray = Array.from(parsedMarks.entries()).map(([student_id, marks_obtained]) => ({
    student_id,
    marks_obtained,
  }));

  const saved = await submitExamMarks(userId, examId, marksArray);
  await audit(userId, 'teacher_upload_exam_marks_file', 'examination', examId, {
    format,
    filename: String(file.originalname || '').slice(0, 120),
    saved_count: saved.saved_count,
  });

  return {
    ...saved,
    format,
  };
}

function escapeCsvCell(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

async function getBlankMarksCsv(userId, examId) {
  const fac = await getFacultyByUserId(userId);
  const exam = await assertAssignedGradingExam(fac.id, examId);

  const { rows } = await db.query(
    `SELECT DISTINCT ON (s.student_number, s.id)
            s.student_number, u.full_name
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id
       JOIN users u ON u.id = s.user_id
      WHERE en.subject_id = $1
      ORDER BY s.student_number ASC, s.id ASC`,
    [exam.subject_id]
  );

  const lines = [
    'student_number,full_name,marks_obtained',
    ...rows.map((r) => `${escapeCsvCell(r.student_number)},${escapeCsvCell(r.full_name)},`),
  ];

  const safeExamType = String(exam.exam_type || 'exam').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return {
    filename: `${exam.subject_code}_${safeExamType}_blank_marks.csv`,
    csv: lines.join('\r\n'),
  };
}

async function assertTeacherSubject(facultyId, subjectId) {
  const { rows } = await db.query(
    `SELECT sub.id, sub.subject_code, sub.subject_name, sub.semester, c.course_name,
            EXISTS (
              SELECT 1 FROM faculty_subjects fs WHERE fs.subject_id = sub.id AND fs.faculty_id = $2
            ) AS is_assigned
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
      WHERE sub.id = $1`,
    [subjectId, facultyId]
  );
  if (!rows[0]) {
    const err = new Error('Subject not found');
    err.status = 404;
    throw err;
  }
  if (!rows[0].is_assigned) {
    const err = new Error('You are not assigned to teach this subject');
    err.status = 403;
    throw err;
  }
  return rows[0];
}

async function getSubjectScheduledDates(facultyId, subjectId, weekStart) {
  let { rows } = await db.query(
    `SELECT DISTINCT day_of_week
       FROM timetables
      WHERE subject_id = $1 AND faculty_id = $2
      ORDER BY day_of_week`,
    [subjectId, facultyId]
  );
  if (rows.length === 0) {
    ({ rows } = await db.query(
      `SELECT DISTINCT day_of_week
         FROM timetables
        WHERE subject_id = $1
        ORDER BY day_of_week`,
      [subjectId]
    ));
  }
  return getWeekDatesForDays(weekStart, rows.map((r) => r.day_of_week));
}

async function getAttendanceSheets(userId, weekParam) {
  const fac = await getFacultyByUserId(userId);
  const currentWeekStart = getCurrentWeekStart(config.tz);
  const weekStart = getWeekStart(weekParam || currentWeekStart);
  const weekEnd = addDays(weekStart, 6);

  const { rows } = await db.query(
    `SELECT DISTINCT ON (sub.id)
            sub.id AS subject_id, sub.subject_code, sub.subject_name, sub.semester,
            c.course_name,
            (SELECT COUNT(DISTINCT en.student_id)::int
               FROM student_enrollments en
              WHERE en.subject_id = sub.id) AS enrolled_students,
            to_char(was.submitted_at, 'YYYY-MM-DD HH24:MI') AS submitted_at,
            was.days_recorded,
            was.records_count,
            (SELECT COUNT(*)::int
               FROM attendance a
              WHERE a.subject_id = sub.id
                AND a.class_date BETWEEN $2::date AND $3::date) AS records_in_week,
            COALESCE(
              (SELECT array_agg(DISTINCT t.day_of_week ORDER BY t.day_of_week)
                 FROM timetables t
                WHERE t.subject_id = sub.id AND t.faculty_id = $1),
              '{}'
            ) AS timetable_days
       FROM faculty_subjects fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN courses c ON c.id = sub.course_id
       LEFT JOIN weekly_attendance_submissions was
              ON was.subject_id = sub.id AND was.week_start = $2::date
      WHERE fs.faculty_id = $1
      ORDER BY sub.id, sub.subject_code`,
    [fac.id, weekStart, weekEnd]
  );

  const sheets = rows
    .map((r) => {
      const scheduledDates = getWeekDatesForDays(weekStart, r.timetable_days);
      const expectedRecords = r.enrolled_students * scheduledDates.length;
      const isSubmitted = Boolean(r.submitted_at) || (expectedRecords > 0 && r.records_in_week >= expectedRecords);
      return {
        subject_id: r.subject_id,
        subject_code: r.subject_code,
        subject_name: r.subject_name,
        semester: r.semester,
        course_name: r.course_name,
        enrolled_students: r.enrolled_students,
        scheduled_dates: scheduledDates,
        submitted_at: r.submitted_at || null,
        days_recorded: r.days_recorded || 0,
        records_in_week: r.records_in_week || 0,
        is_submitted: isSubmitted,
      };
    })
    .sort((a, b) => Number(a.is_submitted) - Number(b.is_submitted) || a.subject_code.localeCompare(b.subject_code));

  return {
    faculty: fac,
    week_start: weekStart,
    week_end: weekEnd,
    current_week_start: currentWeekStart,
    missing_count: sheets.filter((s) => !s.is_submitted).length,
    sheets,
  };
}

async function getBlankAttendanceCsv(userId, subjectId, weekParam) {
  const fac = await getFacultyByUserId(userId);
  const subj = await assertTeacherSubject(fac.id, subjectId);
  const weekStart = getWeekStart(weekParam || getCurrentWeekStart(config.tz));
  const scheduledDates = await getSubjectScheduledDates(fac.id, subjectId, weekStart);

  const { rows } = await db.query(
    `SELECT DISTINCT ON (s.student_number, s.id)
            s.student_number, u.full_name
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id
       JOIN users u ON u.id = s.user_id
      WHERE en.subject_id = $1
      ORDER BY s.student_number ASC, s.id ASC`,
    [subjectId]
  );

  const dateHeaders = scheduledDates.map((d) => `${d.date} (${d.short_day})`);
  const blankCols = scheduledDates.map(() => '').join(',');
  const lines = [
    ['student_number', 'full_name', ...dateHeaders].join(','),
    ...rows.map((r) => `${escapeCsvCell(r.student_number)},${escapeCsvCell(r.full_name)},${blankCols}`),
  ];

  return {
    filename: `${subj.subject_code}_week_${weekStart}_attendance_blank.csv`,
    csv: lines.join('\r\n'),
  };
}

async function getWeeklyAttendanceRecords(userId, subjectId, weekParam) {
  const fac = await getFacultyByUserId(userId);
  const subj = await assertTeacherSubject(fac.id, subjectId);
  const weekStart = getWeekStart(weekParam || getCurrentWeekStart(config.tz));
  const weekEnd = addDays(weekStart, 6);
  const scheduledDates = await getSubjectScheduledDates(fac.id, subjectId, weekStart);

  const [studentsRes, attRes] = await Promise.all([
    db.query(
      `SELECT DISTINCT ON (s.student_number, s.id)
              s.id AS student_id, s.student_number, u.full_name, u.email
         FROM student_enrollments en
         JOIN students s ON s.id = en.student_id
         JOIN users u ON u.id = s.user_id
        WHERE en.subject_id = $1
        ORDER BY s.student_number ASC, s.id ASC`,
      [subjectId]
    ),
    db.query(
      `SELECT student_id, to_char(class_date, 'YYYY-MM-DD') AS class_date, status
         FROM attendance
        WHERE subject_id = $1 AND class_date BETWEEN $2::date AND $3::date`,
      [subjectId, weekStart, weekEnd]
    ),
  ]);

  const statusMap = new Map();
  const extraDateMap = new Map();
  for (const r of attRes.rows) {
    statusMap.set(`${r.student_id}|${r.class_date}`, r.status);
    if (!extraDateMap.has(r.class_date)) {
      const [y, m, d] = r.class_date.split('-').map(Number);
      const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const dow = jsDow === 0 ? 7 : jsDow;
      extraDateMap.set(r.class_date, getWeekDatesForDays(weekStart, [dow])[0]);
    }
  }

  const allDatesMap = new Map();
  for (const d of scheduledDates) allDatesMap.set(d.date, d);
  for (const [dt, info] of extraDateMap.entries()) {
    if (!allDatesMap.has(dt)) allDatesMap.set(dt, info);
  }
  const mergedDates = Array.from(allDatesMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const students = studentsRes.rows.map((st) => {
    const statuses = {};
    for (const d of mergedDates) {
      statuses[d.date] = statusMap.get(`${st.student_id}|${d.date}`) || null;
    }
    return { ...st, statuses };
  });

  return {
    subject: subj,
    week_start: weekStart,
    week_end: weekEnd,
    scheduled_dates: mergedDates,
    students,
  };
}

function parseAttendanceCode(rawVal) {
  const v = String(rawVal ?? '').trim().toLowerCase();
  if (!v || v === '-' || v === 'na' || v === 'n/a') return { missing: true };
  if (v === 'p' || v === 'present') return { status: 'present' };
  if (v === 'a' || v === 'absent') return { status: 'absent' };
  if (v === 'l' || v === 'leave') return { status: 'leave' };
  return { invalid: true };
}

async function uploadWeeklyAttendanceFromFile(userId, subjectId, weekParam, file) {
  const fac = await getFacultyByUserId(userId);
  const subj = await assertTeacherSubject(fac.id, subjectId);
  const weekStart = getWeekStart(weekParam || getCurrentWeekStart(config.tz));
  const weekEnd = addDays(weekStart, 6);
  const scheduledDates = await getSubjectScheduledDates(fac.id, subjectId, weekStart);

  const { format, rows } = parseMarksSpreadsheet(file);
  if (rows.length < 2) {
    const err = new Error('The uploaded attendance file is empty or has no student rows. Please download the blank CSV for this week and upload a filled CSV.');
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const rawHeaders = rows[0];
  const normHeaders = rawHeaders.map(normalizeHeader);
  const idColIdx = normHeaders.findIndex((h) => STUDENT_ID_HEADERS.has(h));
  if (idColIdx === -1) {
    const err = new Error('Could not find a "student_number" (or "roll_number") column. Please download the blank CSV for this week and upload a new CSV.');
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const dateCols = [];
  for (let c = 0; c < rawHeaders.length; c++) {
    if (c === idColIdx) continue;
    const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(String(rawHeaders[c] || ''));
    if (m) dateCols.push({ colIdx: c, date: m[1] });
  }

  if (dateCols.length === 0) {
    const err = new Error('No class date columns (YYYY-MM-DD) were found. Please download the blank CSV for this week and upload a new CSV.');
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const outOfWeek = dateCols.filter((dc) => dc.date < weekStart || dc.date > weekEnd).map((dc) => dc.date);
  if (outOfWeek.length > 0) {
    const err = new Error(
      `This file contains dates (${outOfWeek.join(', ')}) outside the selected week (${weekStart} to ${weekEnd}). Please download this week's blank CSV and upload a new CSV.`
    );
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const colDateSet = new Set(dateCols.map((dc) => dc.date));
  const missingScheduleDates = scheduledDates.filter((sd) => !colDateSet.has(sd.date)).map((sd) => `${sd.date} (${sd.short_day})`);
  if (missingScheduleDates.length > 0) {
    const err = new Error(
      `Missing class date column(s): ${missingScheduleDates.join(', ')}. Please download this week's blank CSV and upload a new CSV.`
    );
    err.status = 400;
    err.payload = { needs_reupload: true };
    throw err;
  }

  const enrolledRes = await db.query(
    `SELECT DISTINCT ON (s.id)
            s.id AS student_id, s.student_number, u.full_name, u.email
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id
       JOIN users u ON u.id = s.user_id
      WHERE en.subject_id = $1
      ORDER BY s.id`,
    [subjectId]
  );

  const byRoll = new Map();
  const byEmail = new Map();
  const byUuid = new Map();
  for (const st of enrolledRes.rows) {
    byRoll.set(String(st.student_number).trim().toUpperCase(), st);
    byEmail.set(String(st.email).trim().toLowerCase(), st);
    byUuid.set(String(st.student_id).toLowerCase(), st);
  }

  const missingStudents = [];
  const missingEntries = [];
  const invalidEntries = [];
  const unknownStudents = [];
  const seenStudentIds = new Set();
  const entriesMap = new Map(); // `${student_id}|${date}` -> { student_id, date, status }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = i + 1;
    const rawIdentifier = String(r[idColIdx] ?? '').trim();
    const hasAnyDateValue = dateCols.some((dc) => String(r[dc.colIdx] ?? '').trim() !== '');
    if (!rawIdentifier && !hasAnyDateValue) continue;

    if (!rawIdentifier) {
      invalidEntries.push({ row: rowNumber, date: '', value: '', reason: 'Missing student roll number / identifier' });
      continue;
    }

    const st =
      byRoll.get(rawIdentifier.toUpperCase()) ||
      byEmail.get(rawIdentifier.toLowerCase()) ||
      byUuid.get(rawIdentifier.toLowerCase());

    if (!st) {
      unknownStudents.push({ row: rowNumber, identifier: rawIdentifier });
      continue;
    }

    seenStudentIds.add(st.student_id);

    for (const dc of dateCols) {
      const rawCell = String(r[dc.colIdx] ?? '').trim();
      const parsed = parseAttendanceCode(rawCell);
      if (parsed.missing) {
        missingEntries.push({
          row: rowNumber,
          student_number: st.student_number,
          full_name: st.full_name,
          date: dc.date,
          reason: `Blank attendance for ${dc.date}`,
        });
      } else if (parsed.invalid) {
        invalidEntries.push({
          row: rowNumber,
          student_number: st.student_number,
          full_name: st.full_name,
          date: dc.date,
          value: rawCell,
          reason: `Invalid code "${rawCell}" — use P for Present or A for Absent`,
        });
      } else {
        entriesMap.set(`${st.student_id}|${dc.date}`, {
          student_id: st.student_id,
          date: dc.date,
          status: parsed.status,
        });
      }
    }
  }

  for (const st of enrolledRes.rows) {
    if (!seenStudentIds.has(st.student_id)) {
      missingStudents.push({
        student_id: st.student_id,
        student_number: st.student_number,
        full_name: st.full_name,
        reason: 'Student missing from uploaded attendance file',
      });
    }
  }

  if (missingStudents.length > 0 || missingEntries.length > 0 || invalidEntries.length > 0 || unknownStudents.length > 0) {
    const parts = [];
    if (missingStudents.length > 0) parts.push(`${missingStudents.length} student(s) omitted`);
    if (missingEntries.length > 0) parts.push(`${missingEntries.length} blank attendance cell(s)`);
    if (invalidEntries.length > 0) parts.push(`${invalidEntries.length} invalid attendance value(s)`);
    if (unknownStudents.length > 0) parts.push(`${unknownStudents.length} unrecognized student(s)`);

    const err = new Error(
      `Cannot save attendance: ${parts.join(', ')}. Fill P (Present) or A (Absent) for every student and upload a new CSV.`
    );
    err.status = 400;
    err.payload = {
      needs_reupload: true,
      missing_students: missingStudents,
      missing_entries: missingEntries,
      invalid_entries: invalidEntries,
      unknown_students: unknownStudents,
    };
    throw err;
  }

  const entries = Array.from(entriesMap.values());
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const item of entries) {
      await client.query(
        `INSERT INTO attendance (student_id, subject_id, class_date, status)
         VALUES ($1, $2, $3::date, $4)
         ON CONFLICT (student_id, subject_id, class_date)
         DO UPDATE SET status = EXCLUDED.status`,
        [item.student_id, subjectId, item.date, item.status]
      );
    }
    await client.query(
      `INSERT INTO weekly_attendance_submissions (subject_id, faculty_id, week_start, submitted_at, submitted_by, days_recorded, records_count)
       VALUES ($1, $2, $3::date, now(), $4, $5, $6)
       ON CONFLICT (subject_id, week_start)
       DO UPDATE SET faculty_id = EXCLUDED.faculty_id,
                     submitted_at = now(),
                     submitted_by = EXCLUDED.submitted_by,
                     days_recorded = EXCLUDED.days_recorded,
                     records_count = EXCLUDED.records_count`,
      [subjectId, fac.id, weekStart, userId, dateCols.length, entries.length]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const presentCount = entries.filter((e) => e.status === 'present').length;
  const absentCount = entries.filter((e) => e.status === 'absent').length;

  await audit(userId, 'teacher_upload_weekly_attendance', 'subject', subjectId, {
    subject_code: subj.subject_code,
    week_start: weekStart,
    format,
    days_recorded: dateCols.length,
    records_count: entries.length,
  });

  return {
    success: true,
    subject_code: subj.subject_code,
    week_start: weekStart,
    days_recorded: dateCols.length,
    records_count: entries.length,
    present_count: presentCount,
    absent_count: absentCount,
    format,
  };
}

module.exports = {
  getFacultyByUserId,
  getGradingTasks,
  getExamStudentsForGrading,
  getBlankMarksCsv,
  submitExamMarks,
  uploadExamMarksFromFile,
  getAttendanceSheets,
  getBlankAttendanceCsv,
  getWeeklyAttendanceRecords,
  uploadWeeklyAttendanceFromFile,
};
