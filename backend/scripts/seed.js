// Inserts DUMMY data only. Safe to run once; it exits if already seeded.
// Dev login password for every dummy user: Password@123
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const PASSWORD = 'Password@123';

function lastWeekdays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

(async () => {
  const c = await db.connect();
  try {
    const exists = await c.query("SELECT 1 FROM users WHERE email = 'admin@uni.test'");
    if (exists.rowCount) { console.log('Already seeded. Nothing to do.'); return; }
    await c.query('BEGIN');
    const hash = await bcrypt.hash(PASSWORD, 10);

    const mkUser = async (role, name, email) => (await c.query(
      `INSERT INTO users (role_id, full_name, email, password_hash)
       VALUES ((SELECT id FROM roles WHERE role_name=$1), $2, $3, $4) RETURNING id`,
      [role, name, email, hash])).rows[0].id;

    const adminU = await mkUser('admin', 'Dummy Admin', 'admin@uni.test');
    const hodU = await mkUser('hod', 'Dr. Meera Sharma', 'hod@uni.test');
    const teacherU = await mkUser('teacher', 'Prof. Rahul Verma', 'teacher@uni.test');
    const s1U = await mkUser('student', 'Riya Patel', 'student1@uni.test');
    const s2U = await mkUser('student', 'Aman Singh', 'student2@uni.test');

    const dept = (await c.query(
      "INSERT INTO departments (department_name, hod_user_id) VALUES ('Computer Science', $1) RETURNING id", [hodU])).rows[0].id;
    const bca = (await c.query(
      "INSERT INTO courses (department_id, course_name, duration_years) VALUES ($1,'BCA',3) RETURNING id", [dept])).rows[0].id;
    await c.query("INSERT INTO courses (department_id, course_name, duration_years) VALUES ($1,'MCA',2)", [dept]);

    const subjects = {};
    for (const [code, name] of [['BCA401', 'Database Management Systems'], ['BCA402', 'Python Programming'], ['BCA403', 'Computer Networks']]) {
      subjects[code] = (await c.query(
        'INSERT INTO subjects (course_id, subject_code, subject_name, semester) VALUES ($1,$2,$3,4) RETURNING id',
        [bca, code, name])).rows[0].id;
    }

    const s1 = (await c.query(
      `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
       VALUES ($1,'BCA2023001',$2,$3,4) RETURNING id`, [s1U, dept, bca])).rows[0].id;
    const s2 = (await c.query(
      `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
       VALUES ($1,'BCA2023002',$2,$3,4) RETURNING id`, [s2U, dept, bca])).rows[0].id;
    const fac = (await c.query(
      "INSERT INTO faculty (user_id, employee_number, department_id) VALUES ($1,'EMP001',$2) RETURNING id", [teacherU, dept])).rows[0].id;

    const mainBlock = (await c.query(
      "INSERT INTO buildings (building_name, latitude, longitude) VALUES ('Main Block', 23.2599, 77.4126) RETURNING id")).rows[0].id;
    const acadBlock = (await c.query(
      "INSERT INTO buildings (building_name, latitude, longitude) VALUES ('Academic Block', 23.2606, 77.4135) RETURNING id")).rows[0].id;
    const lab1 = (await c.query(
      "INSERT INTO classrooms (building_id, room_number, floor_number, room_type) VALUES ($1,'Computer Lab 1',1,'lab') RETURNING id", [mainBlock])).rows[0].id;
    const room201 = (await c.query(
      "INSERT INTO classrooms (building_id, room_number, floor_number, room_type) VALUES ($1,'Room 201 (BCA)',2,'classroom') RETURNING id", [acadBlock])).rows[0].id;

    const year = '2026-27';
    for (const code of Object.keys(subjects)) {
      await c.query('INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year) VALUES ($1,$2,$3)', [fac, subjects[code], year]);
      for (const s of [s1, s2]) {
        await c.query('INSERT INTO student_enrollments (student_id, subject_id, academic_year) VALUES ($1,$2,$3)', [s, subjects[code], year]);
      }
    }

    const slots = [
      ['BCA401', 1, '09:00', '10:00', room201], ['BCA402', 1, '10:00', '11:00', lab1],
      ['BCA403', 2, '09:00', '10:00', room201], ['BCA401', 3, '11:00', '12:00', lab1],
      ['BCA402', 4, '09:00', '10:00', room201], ['BCA403', 5, '10:00', '11:00', room201],
    ];
    for (const [code, day, st, en, room] of slots) {
      await c.query(
        'INSERT INTO timetables (subject_id, faculty_id, classroom_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6)',
        [subjects[code], fac, room, day, st, en]);
    }

    // Attendance: Riya mostly present, Aman missing a lot (so the two students clearly differ)
    const days = lastWeekdays(10);
    for (const code of Object.keys(subjects)) {
      for (let i = 0; i < days.length; i++) {
        await c.query('INSERT INTO attendance (student_id, subject_id, class_date, status) VALUES ($1,$2,$3,$4)',
          [s1, subjects[code], days[i], i === 3 ? 'absent' : 'present']);
        await c.query('INSERT INTO attendance (student_id, subject_id, class_date, status) VALUES ($1,$2,$3,$4)',
          [s2, subjects[code], days[i], i % 2 === 0 ? 'present' : 'absent']);
      }
    }

    const marks = { BCA401: [78, 55], BCA402: [85, 60], BCA403: [72, 48] };
    for (const code of Object.keys(subjects)) {
      const ex = (await c.query(
        `INSERT INTO examinations (subject_id, exam_type, exam_date, start_time, end_time, classroom_id)
         VALUES ($1,'Internal Test 1', CURRENT_DATE + 14, '10:00','12:00',$2) RETURNING id`, [subjects[code], room201])).rows[0].id;
      await c.query('INSERT INTO student_marks (examination_id, student_id, marks_obtained) VALUES ($1,$2,$3)', [ex, s1, marks[code][0]]);
      await c.query('INSERT INTO student_marks (examination_id, student_id, marks_obtained) VALUES ($1,$2,$3)', [ex, s2, marks[code][1]]);
    }

    await c.query('COMMIT');
    console.log('Seeded dummy data.\nLogins (password for all: ' + PASSWORD + '):');
    console.log('  admin@uni.test, hod@uni.test, teacher@uni.test, student1@uni.test, student2@uni.test');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await db.end();
  }
})();
