// Unit tests for HOD services, CSV export, RBAC, and Admin schemas (runs without needing a live PostgreSQL database)
// Run with: node --test tests/hod_unit.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { requireRole } = require('../src/middleware/auth');
const hod = require('../src/services/hod');
const db = require('../src/db');

test('requireRole middleware blocks unauthorized roles with 403', () => {
  const guard = requireRole('hod');
  let status = null;
  let json = null;
  const res = {
    status: (s) => { status = s; return { json: (j) => { json = j; } }; },
  };

  // Student should be rejected
  guard({ user: { id: 'u1', role: 'student' }, originalUrl: '/api/hod/overview' }, res, () => {
    assert.fail('next() should not be called for unauthorized role');
  });
  assert.strictEqual(status, 403);
  assert(json.error.includes('permission'));

  // Teacher should be rejected
  status = null;
  guard({ user: { id: 'u2', role: 'teacher' }, originalUrl: '/api/hod/overview' }, res, () => {
    assert.fail('next() should not be called for teacher');
  });
  assert.strictEqual(status, 403);

  // HOD should be allowed
  let nextCalled = false;
  guard({ user: { id: 'u3', role: 'hod' }, originalUrl: '/api/hod/overview' }, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true);
});

test('generateDepartmentReportCsv generates well-formatted CSV with headers and sections', async () => {
  // Mock db.query for department report queries
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    const s = String(sql);
    if (s.includes('FROM departments WHERE hod_user_id')) {
      return { rows: [{ id: 'dept-123', department_name: 'Computer Science', hod_user_id: params[0] }] };
    }
    if (s.includes('SELECT count(*)::int AS count FROM faculty')) {
      return { rows: [{ count: 3 }] };
    }
    if (s.includes('SELECT count(*)::int AS count FROM students')) {
      return { rows: [{ count: 24 }] };
    }
    if (s.includes('SELECT count(*)::int AS count FROM courses')) {
      return { rows: [{ count: 2 }] };
    }
    if (s.includes('SELECT count(DISTINCT sub.id)::int AS count FROM subjects')) {
      return { rows: [{ count: 6 }] };
    }
    if (s.includes('e.classroom_id IS NULL')) {
      return {
        rows: [{ id: 'e1', subject_code: 'BCA401', subject_name: 'DBMS', course_name: 'BCA', exam_type: 'Practical Viva', exam_date: '2026-12-01', start_time: '14:00', end_time: '16:00' }],
        rowCount: 1,
      };
    }
    if (s.includes('examinations e') && s.includes('count(*)::int')) {
      return { rows: [{ count: 4 }] };
    }
    if (s.includes('FROM faculty f')) {
      return {
        rows: [{
          id: 'f1', employee_number: 'EMP001', full_name: 'Prof. Rahul Verma', email: 'rahul@uni.test',
          is_active: true, weekly_classes: 6,
          subjects: [{ subject_code: 'BCA401', subject_name: 'DBMS', course_name: 'BCA', semester: 4, academic_year: '2026-27' }],
        }],
      };
    }
    if (s.includes('FROM courses c')) {
      return {
        rows: [{ id: 'c1', course_name: 'BCA', duration_years: 3, student_count: 14, subject_count: 6 }],
      };
    }
    if (s.includes('FROM subjects sub')) {
      return {
        rows: [{ id: 's1', subject_code: 'BCA401', subject_name: 'DBMS', semester: 4, course_id: 'c1', course_name: 'BCA', assigned_faculty: 'Prof. Rahul Verma', faculty_employee_number: 'EMP001' }],
      };
    }
    if (s.includes('marks_not_entered') || s.includes('student_marks m')) {
      return {
        rows: [{ id: 'e2', subject_code: 'BCA402', subject_name: 'Python', course_name: 'BCA', exam_type: 'Internal 1', exam_date: '2026-10-15', room_number: 'Room 201', building_name: 'Main Block', enrolled_students: 8, marks_entered: 0 }],
        rowCount: 1,
      };
    }
    if (s.includes('unassigned_subjects') || s.includes('faculty_subjects fs ON fs.subject_id = sub.id')) {
      return { rows: [], rowCount: 0 };
    }
    if (s.includes('ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = \'present\')')) {
      if (s.includes('GROUP BY sub.id')) {
        return { rows: [{ subject_code: 'BCA401', subject_name: 'DBMS', course_name: 'BCA', semester: 4, total_sessions: 20, attendance_pct: 88.5 }] };
      }
      return { rows: [{ overall_attendance_pct: 87.2, total_attendance_records: 120, present_records: 105, absent_records: 10, leave_records: 5 }] };
    }
    if (s.includes('ROUND(AVG(m.marks_obtained), 1) AS average_marks')) {
      return { rows: [{ subject_code: 'BCA401', subject_name: 'DBMS', exam_type: 'Internal 1', exam_date: '2026-10-15', students_graded: 8, average_marks: 68.5, lowest_marks: 55.0, highest_marks: 85.0, pass_percentage: 100.0 }] };
    }
    if (s.includes('COUNT(t.id)::int AS weekly_classes')) {
      return { rows: [{ full_name: 'Prof. Rahul Verma', employee_number: 'EMP001', subjects_count: 1, weekly_classes: 6 }] };
    }
    if (s.includes('COUNT(s.id)::int AS student_count')) {
      return { rows: [{ course_name: 'BCA', semester: 4, student_count: 8 }] };
    }
    if (s.includes('FROM notices n')) {
      return { rows: [{ id: 'n1', title: 'CS Hackathon', content: 'Open to BCA students', category: 'event', is_published: true, published_at: '2026-11-19', department_id: 'dept-123', department_name: 'Computer Science', created_by_name: 'Dr. Meera Sharma' }] };
    }
    return { rows: [], rowCount: 0 };
  };

  try {
    const csv = await hod.generateDepartmentReportCsv('user-hod-cs');
    assert(typeof csv === 'string');
    assert(csv.includes('DEPARTMENT EXECUTIVE REPORT,Computer Science'));
    assert(csv.includes('--- DEPARTMENT SUMMARY ---'));
    assert(csv.includes('Faculty Members,3'));
    assert(csv.includes('Enrolled Students,24'));
    assert(csv.includes('--- FACULTY WORKLOAD ---'));
    assert(csv.includes('EMP001,Prof. Rahul Verma'));
    assert(csv.includes('--- COURSES OFFERED ---'));
    assert(csv.includes('BCA,3,14,6'));
    assert(csv.includes('--- PENDING ACTIVITIES ---'));
    assert(csv.includes('Exams Without Room,BCA401,Practical Viva'));
  } finally {
    db.query = originalQuery;
  }
});

test('getHodDepartment throws 403 if user is not an assigned HOD', async () => {
  const originalQuery = db.query;
  db.query = async () => ({ rows: [] });
  try {
    await hod.getHodDepartment('not-an-hod-user');
    assert.fail('Should have thrown an error');
  } catch (err) {
    assert.strictEqual(err.status, 403);
    assert(err.message.includes('Head of Department'));
  } finally {
    db.query = originalQuery;
  }
});

test('SECURITY: HOD database queries strictly scope by department_id', async () => {
  const originalQuery = db.query;
  const queriesRecorded = [];
  db.query = async (sql, params) => {
    queriesRecorded.push({ sql: String(sql), params });
    if (String(sql).includes('FROM departments WHERE hod_user_id')) {
      return { rows: [{ id: 'dept-security-cs', department_name: 'Computer Science' }] };
    }
    return { rows: [] };
  };

  try {
    await hod.getDepartmentFaculty('hod-cs-user');
    const facultyQuery = queriesRecorded.find((q) => q.sql.includes('FROM faculty f'));
    assert(facultyQuery, 'Query for faculty must execute');
    assert(facultyQuery.sql.includes('WHERE f.department_id = $1'), 'Must scope faculty by department_id');
    assert.deepStrictEqual(facultyQuery.params, ['dept-security-cs'], 'Param must match the HOD department ID');

    queriesRecorded.length = 0;
    await hod.getDepartmentCourses('hod-cs-user');
    const coursesQuery = queriesRecorded.find((q) => q.sql.includes('FROM courses c'));
    assert(coursesQuery, 'Query for courses must execute');
    assert(coursesQuery.sql.includes('WHERE c.department_id = $1'), 'Must scope courses by department_id');
    assert.deepStrictEqual(coursesQuery.params, ['dept-security-cs']);

    queriesRecorded.length = 0;
    await hod.getDepartmentPendingActivities('hod-cs-user');
    const pendingExamsQuery = queriesRecorded.find((q) => q.sql.includes('WHERE c.department_id = $1 AND e.classroom_id IS NULL'));
    assert(pendingExamsQuery, 'Query for pending exams must execute');
    assert.deepStrictEqual(pendingExamsQuery.params, ['dept-security-cs']);
  } finally {
    db.query = originalQuery;
  }
});

test('HOD and Teacher tools are registered in tools catalog with correct permissions', () => {
  const { registry } = require('../src/tools');

  // Teacher next class tool
  assert(registry.teacher_next_class, 'teacher_next_class tool must be registered');
  assert.deepStrictEqual(registry.teacher_next_class.roles, ['teacher']);
  assert.strictEqual(registry.teacher_next_class.personal, true);

  // HOD tools
  const hodToolNames = [
    'hod_department_overview',
    'hod_faculty_and_subjects',
    'hod_courses_offered',
    'hod_schedule_and_exams',
    'hod_pending_activities',
    'hod_department_analytics',
    'hod_department_notices',
  ];

  for (const name of hodToolNames) {
    const tool = registry[name];
    assert(tool, `Tool ${name} must be registered`);
    assert.deepStrictEqual(tool.roles, ['hod'], `${name} must be restricted strictly to HOD role`);
    assert.strictEqual(tool.kind, 'department_records');
  }
});

test('assignExamClassroom validates department scope and assigns room', async () => {
  const originalQuery = db.query;
  const recorded = [];
  try {
    db.query = async (sql, params) => {
      recorded.push({ sql: String(sql), params });
      if (String(sql).includes('FROM departments WHERE hod_user_id')) {
        return { rows: [{ id: 'dept-cs', department_name: 'Computer Science', hod_user_id: params[0] }] };
      }
      if (String(sql).includes('FROM examinations e') && String(sql).includes('WHERE e.id = $1 AND c.department_id = $2')) {
        return { rows: [{ id: params[0], exam_type: 'Practical Assessment', subject_code: 'BCA401', subject_name: 'DBMS' }] };
      }
      if (String(sql).includes('FROM classrooms WHERE id = $1')) {
        return { rows: [{ id: params[0] }] };
      }
      if (String(sql).includes('UPDATE examinations')) {
        return { rows: [{ id: params[1], classroom_id: params[0], exam_type: 'Practical Assessment' }] };
      }
      return { rows: [] };
    };

    const res = await hod.assignExamClassroom('hod-user-id', 'exam-123', 'room-456');
    assert.strictEqual(res.id, 'exam-123');
    assert.strictEqual(res.classroom_id, 'room-456');

    // Cross-department check: rejection if exam does not belong to department
    db.query = async (sql, params) => {
      if (String(sql).includes('FROM departments WHERE hod_user_id')) {
        return { rows: [{ id: 'dept-cs', department_name: 'Computer Science', hod_user_id: params[0] }] };
      }
      return { rows: [] }; // No exam found in department
    };

    await assert.rejects(
      () => hod.assignExamClassroom('hod-user-id', 'exam-other-dept', 'room-456'),
      /Examination not found in your department/
    );
  } finally {
    db.query = originalQuery;
  }
});

test('scheduleExamination inserts examination scoped to department subject', async () => {
  const originalQuery = db.query;
  try {
    db.query = async (sql, params) => {
      if (String(sql).includes('FROM departments WHERE hod_user_id')) {
        return { rows: [{ id: 'dept-cs', department_name: 'Computer Science', hod_user_id: params[0] }] };
      }
      if (String(sql).includes('FROM subjects s') && String(sql).includes('WHERE s.id = $1 AND c.department_id = $2')) {
        return { rows: [{ id: params[0], subject_code: 'BCA401', subject_name: 'DBMS' }] };
      }
      if (String(sql).includes('INSERT INTO examinations')) {
        return { rows: [{ id: 'new-exam-id', subject_id: params[0], exam_type: params[1], exam_date: params[2], start_time: params[3], end_time: params[4], classroom_id: params[5] }] };
      }
      return { rows: [] };
    };

    const created = await hod.scheduleExamination('hod-user-id', {
      subject_id: 'subj-1',
      exam_type: 'Unit Test 1',
      exam_date: '2026-12-05',
      start_time: '10:00',
      end_time: '12:00',
      classroom_id: null,
    });

    assert.strictEqual(created.id, 'new-exam-id');
    assert.strictEqual(created.exam_type, 'Unit Test 1');
    assert.strictEqual(created.classroom_id, null);
  } finally {
    db.query = originalQuery;
  }
});

test('assignExamGradingFaculty validates department scope for both exam and faculty', async () => {
  const originalQuery = db.query;
  try {
    db.query = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM departments WHERE hod_user_id')) {
        return { rows: [{ id: 'dept-cs', department_name: 'Computer Science', hod_user_id: params[0] }] };
      }
      if (s.includes('FROM examinations e') && s.includes('WHERE e.id = $1 AND c.department_id = $2')) {
        return { rows: [{ id: params[0], exam_type: 'Unit Test 1', subject_code: 'BCA203', subject_name: 'Discrete Mathematics' }] };
      }
      if (s.includes('FROM faculty f') && s.includes('WHERE f.id = $1 AND f.department_id = $2')) {
        return params[0] === 'fac-cs'
          ? { rows: [{ id: 'fac-cs', full_name: 'Prof. Rahul Verma', employee_number: 'EMP001' }] }
          : { rows: [] };
      }
      if (s.includes('UPDATE examinations')) {
        return {
          rows: [{
            id: params[2],
            exam_type: 'Unit Test 1',
            exam_date: '2026-11-22',
            grading_faculty_id: params[0],
            grading_assigned_at: '2026-11-27',
          }],
        };
      }
      return { rows: [] };
    };

    const assigned = await hod.assignExamGradingFaculty('hod-cs', 'exam-1', 'fac-cs');
    assert.strictEqual(assigned.grading_faculty_id, 'fac-cs');
    assert.strictEqual(assigned.grading_faculty_name, 'Prof. Rahul Verma');

    await assert.rejects(
      () => hod.assignExamGradingFaculty('hod-cs', 'exam-1', 'fac-other-dept'),
      /does not belong to your department/
    );
  } finally {
    db.query = originalQuery;
  }
});

test('faculty.submitExamMarks rejects unassigned teacher and non-enrolled students', async () => {
  const facultyService = require('../src/services/faculty');
  const originalQuery = db.query;
  try {
    db.query = async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM faculty f') && s.includes('WHERE f.user_id = $1')) {
        return { rows: [{ id: 'fac-1', employee_number: 'EMP001', department_id: 'dept-cs', department_name: 'Computer Science', full_name: 'Prof. Rahul Verma', email: 'teacher@uni.test' }] };
      }
      if (s.includes('FROM examinations e') && s.includes('WHERE e.id = $1')) {
        return {
          rows: [{
            id: params[0],
            subject_id: 'subj-1',
            grading_faculty_id: params[0] === 'exam-other' ? 'fac-2' : 'fac-1',
            exam_type: 'Unit Test 1',
            subject_code: 'BCA203',
          }],
        };
      }
      if (s.includes('FROM student_enrollments WHERE subject_id = $1')) {
        return { rows: [{ student_id: 'stu-enrolled' }] };
      }
      return { rows: [] };
    };

    await assert.rejects(
      () => facultyService.submitExamMarks('u-teacher-1', 'exam-other', [{ student_id: 'stu-enrolled', marks_obtained: 80 }]),
      /not assigned to grade/
    );

    await assert.rejects(
      () => facultyService.submitExamMarks('u-teacher-1', 'exam-mine', [{ student_id: 'stu-outsider', marks_obtained: 80 }]),
      /not enrolled in this subject/
    );
  } finally {
    db.query = originalQuery;
  }
});

test('spreadsheet parser reads UTF-8 BOM CSV, quoted cells, and XLSX buffers', () => {
  const zlib = require('zlib');
  const { parseCsvText, parseMarksSpreadsheet } = require('../src/services/spreadsheet');

  const csvRows = parseCsvText('\uFEFFstudent_number,full_name,marks_obtained\r\nBCA401001,"Patel, Riya",88.5\r\nBCA401002,Aman Singh,72\r\n');
  assert.deepStrictEqual(csvRows, [
    ['student_number', 'full_name', 'marks_obtained'],
    ['BCA401001', 'Patel, Riya', '88.5'],
    ['BCA401002', 'Aman Singh', '72'],
  ]);

  // Build minimal valid .xlsx ZIP in memory with sharedStrings + sheet1
  function makeZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const { name, content } of files) {
      const nameBuf = Buffer.from(name, 'utf8');
      const rawBuf = Buffer.from(content, 'utf8');
      const compBuf = zlib.deflateRawSync(rawBuf);

      const local = Buffer.alloc(30 + nameBuf.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(8, 8);
      local.writeUInt32LE(compBuf.length, 18);
      local.writeUInt32LE(rawBuf.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      nameBuf.copy(local, 30);
      localParts.push(local, compBuf);

      const central = Buffer.alloc(46 + nameBuf.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(8, 10);
      central.writeUInt32LE(compBuf.length, 20);
      central.writeUInt32LE(rawBuf.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt32LE(offset, 42);
      nameBuf.copy(central, 46);
      centralParts.push(central);

      offset += local.length + compBuf.length;
    }
    const cdBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, cdBuf, eocd]);
  }

  const xlsxBuf = makeZip([
    {
      name: 'xl/sharedStrings.xml',
      content: '<sst><si><t>student_number</t></si><si><t>marks_obtained</t></si><si><t>BCA2023001</t></si></sst>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content:
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>91</v></c></row>' +
        '</sheetData></worksheet>',
    },
  ]);

  const parsedXlsx = parseMarksSpreadsheet({ originalname: 'marks.xlsx', buffer: xlsxBuf, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.strictEqual(parsedXlsx.format, 'xlsx');
  assert.deepStrictEqual(parsedXlsx.rows, [
    ['student_number', 'marks_obtained'],
    ['BCA2023001', '91'],
  ]);
});

test('time helpers compute Monday week start and weekly timetable dates', () => {
  const { getWeekStart, addDays, getWeekDatesForDays } = require('../src/services/time');
  assert.strictEqual(getWeekStart('2026-11-27'), '2026-11-23');
  assert.strictEqual(getWeekStart('2026-11-23'), '2026-11-23');
  assert.strictEqual(getWeekStart('2026-11-29'), '2026-11-23');
  assert.strictEqual(addDays('2026-11-23', 6), '2026-11-29');
  assert.deepStrictEqual(
    getWeekDatesForDays('2026-11-23', [3, 4]).map((d) => `${d.date}:${d.short_day}`),
    ['2026-11-25:Wed', '2026-11-26:Thu']
  );
});

test('uploadWeeklyAttendanceFromFile rejects blank cells and non-P/A codes with needs_reupload', async () => {
  const facultyService = require('../src/services/faculty');
  const originalQuery = db.query;
  try {
    db.query = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM faculty f') && s.includes('WHERE f.user_id = $1')) {
        return { rows: [{ id: 'fac-1', employee_number: 'EMP001', department_id: 'dept-cs', department_name: 'Computer Science', full_name: 'Prof. Rahul Verma', email: 'teacher@uni.test' }] };
      }
      if (s.includes('FROM subjects sub') && s.includes('is_assigned')) {
        return { rows: [{ id: 'subj-402', subject_code: 'BCA402', subject_name: 'Python Programming', semester: 4, course_name: 'BCA', is_assigned: true }] };
      }
      if (s.includes('FROM timetables')) {
        return { rows: [{ day_of_week: 3 }, { day_of_week: 4 }] };
      }
      if (s.includes('FROM student_enrollments en')) {
        return { rows: [{ student_id: 's1', student_number: 'BCA2023001', full_name: 'Riya Patel', email: 'student1@uni.test' }] };
      }
      return { rows: [] };
    };

    const csvInvalid = 'student_number,full_name,2026-11-25 (Wed),2026-11-26 (Thu)\nBCA2023001,Riya Patel,X,\n';
    await assert.rejects(
      () =>
        facultyService.uploadWeeklyAttendanceFromFile('u-teacher-1', 'subj-402', '2026-11-23', {
          originalname: 'att.csv',
          mimetype: 'text/csv',
          buffer: Buffer.from(csvInvalid, 'utf8'),
        }),
      (err) => err.status === 400 && err.payload?.needs_reupload === true && err.payload.missing_entries.length === 1 && err.payload.invalid_entries.length === 1
    );
  } finally {
    db.query = originalQuery;
  }
});

