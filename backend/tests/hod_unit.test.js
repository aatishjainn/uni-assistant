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

