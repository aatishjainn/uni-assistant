// Inserts DUMMY data only (never real people). Dev password for every dummy user: Password@123
//   npm run seed               -> seeds an empty database (exits if already seeded)
//   npm run seed -- --reset    -> WIPES all data (except roles) and seeds again
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const PASSWORD = 'Password@123';
const reset = process.argv.includes('--reset');

function lastWeekdays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const SUBJECTS = {
  BCA: { 4: [['BCA401', 'Database Management Systems'], ['BCA402', 'Python Programming'], ['BCA403', 'Computer Networks']],
         2: [['BCA201', 'C Programming'], ['BCA202', 'Digital Electronics'], ['BCA203', 'Discrete Mathematics']] },
  MCA: { 2: [['MCA201', 'Advanced Java'], ['MCA202', 'Cloud Computing'], ['MCA203', 'Machine Learning']] },
  BBA: { 4: [['BBA401', 'Marketing Management'], ['BBA402', 'Financial Management'], ['BBA403', 'Business Analytics']] },
};
// subject code -> faculty key
const TEACHES = { BCA401: 't1', BCA402: 't1', BCA403: 't2', BCA203: 't2', MCA201: 't2', BCA201: 't3', BCA202: 't3', MCA202: 't3',
                  MCA203: 't3', BBA401: 't4', BBA402: 't4', BBA403: 't5' };
const LAB_SUBJECTS = { BCA402: 'Computer Lab 1', BCA201: 'Computer Lab 2', MCA201: 'Computer Lab 1', MCA203: 'Computer Lab 2', BBA403: 'Computer Lab 2' };
// groups of students: [course, semester, room, first names...]
const GROUPS = [
  ['BCA', 4, 'Room 201 (BCA)', ['Riya Patel', 'Aman Singh', 'Ananya Gupta', 'Rohan Mehta', 'Sneha Iyer', 'Karan Malhotra', 'Priya Nair', 'Vikas Yadav']],
  ['BCA', 2, 'Room 202 (BCA)', ['Isha Kapoor', 'Arjun Reddy', 'Neha Joshi', 'Sahil Khan', 'Tanvi Desai', 'Rahul Das']],
  ['MCA', 2, 'Room 203 (MCA)', ['Meghna Rao', 'Harsh Vora', 'Divya Menon', 'Yash Chauhan', 'Pooja Bansal']],
  ['BBA', 4, 'Room 301 (BBA)', ['Nikhil Saxena', 'Aditi Pandey', 'Manish Tiwari', 'Simran Kaur', 'Dev Mishra']],
];
const TIMES = [['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'], ['14:00', '15:00'], ['15:00', '16:00']];

(async () => {
  const c = await db.connect();
  try {
    if (reset) {
      await c.query('TRUNCATE users, departments, buildings, notices, knowledge_documents CASCADE');
      console.log('Existing data wiped.');
    } else if ((await c.query("SELECT 1 FROM users WHERE email = 'admin@uni.test'")).rowCount) {
      console.log('Already seeded. Use "npm run seed -- --reset" to wipe and reseed.');
      return;
    }
    await c.query('BEGIN');
    const hash = await bcrypt.hash(PASSWORD, 10);
    const one = async (sql, args) => (await c.query(sql, args)).rows[0].id;
    const mkUser = (role, name, email) => one(
      `INSERT INTO users (role_id, full_name, email, password_hash)
       VALUES ((SELECT id FROM roles WHERE role_name=$1), $2, $3, $4) RETURNING id`, [role, name, email, hash]);

    await mkUser('admin', 'Dummy Admin', 'admin@uni.test');
    const hod1 = await mkUser('hod', 'Dr. Meera Sharma', 'hod@uni.test');
    const hod2 = await mkUser('hod', 'Dr. Anil Kapoor', 'hod2@uni.test');

    const deptCS = await one("INSERT INTO departments (department_name, hod_user_id) VALUES ('Computer Science', $1) RETURNING id", [hod1]);
    const deptMG = await one("INSERT INTO departments (department_name, hod_user_id) VALUES ('Management', $1) RETURNING id", [hod2]);

    const courses = {};
    courses.BCA = await one("INSERT INTO courses (department_id, course_name, duration_years) VALUES ($1,'BCA',3) RETURNING id", [deptCS]);
    courses.MCA = await one("INSERT INTO courses (department_id, course_name, duration_years) VALUES ($1,'MCA',2) RETURNING id", [deptCS]);
    courses.BBA = await one("INSERT INTO courses (department_id, course_name, duration_years) VALUES ($1,'BBA',3) RETURNING id", [deptMG]);
    const deptOf = { BCA: deptCS, MCA: deptCS, BBA: deptMG };

    const subjectId = {};
    for (const [course, sems] of Object.entries(SUBJECTS)) {
      for (const [sem, list] of Object.entries(sems)) {
        for (const [code, name] of list) {
          subjectId[code] = await one(
            'INSERT INTO subjects (course_id, subject_code, subject_name, semester) VALUES ($1,$2,$3,$4) RETURNING id',
            [courses[course], code, name, Number(sem)]);
        }
      }
    }

    // Faculty
    const facultyDefs = [['t1', 'Prof. Rahul Verma', 'teacher@uni.test', deptCS], ['t2', 'Prof. Neha Gupta', 'teacher2@uni.test', deptCS],
      ['t3', 'Prof. Sanjay Rao', 'teacher3@uni.test', deptCS], ['t4', 'Prof. Pooja Jain', 'teacher4@uni.test', deptMG],
      ['t5', 'Prof. Vikram Mehta', 'teacher5@uni.test', deptMG]];
    const faculty = {};
    let e = 1;
    for (const [key, name, email, dept] of facultyDefs) {
      const u = await mkUser('teacher', name, email);
      faculty[key] = await one('INSERT INTO faculty (user_id, employee_number, department_id) VALUES ($1,$2,$3) RETURNING id',
        [u, `EMP${String(e++).padStart(3, '0')}`, dept]);
    }

    // Campus
    const main = await one("INSERT INTO buildings (building_name, latitude, longitude) VALUES ('Main Block', 23.2599, 77.4126) RETURNING id");
    const acad = await one("INSERT INTO buildings (building_name, latitude, longitude) VALUES ('Academic Block', 23.2606, 77.4135) RETURNING id");
    const room = {};
    const mkRoom = async (b, name, floor, type) => {
      room[name] = await one('INSERT INTO classrooms (building_id, room_number, floor_number, room_type) VALUES ($1,$2,$3,$4) RETURNING id', [b, name, floor, type]);
    };
    for (const [name, floor, type] of [['Computer Lab 1', 1, 'lab'], ['Computer Lab 2', 1, 'lab'], ['Seminar Hall', 0, 'hall'], ['Library', 0, 'library'],
      ['Administrative Office', 0, 'office'], ['Examination Department', 1, 'office'], ['HOD Office - Computer Science', 2, 'office']]) await mkRoom(main, name, floor, type);
    for (const [name, floor] of [['Room 201 (BCA)', 2], ['Room 202 (BCA)', 2], ['Room 203 (MCA)', 2], ['Room 301 (BBA)', 3]]) await mkRoom(acad, name, floor, 'classroom');

    // Faculty -> subjects
    const year = '2026-27';
    for (const [code, key] of Object.entries(TEACHES)) {
      await c.query('INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year) VALUES ($1,$2,$3)', [faculty[key], subjectId[code], year]);
    }

    // Students, enrollments, timetable
    const days = lastWeekdays(10);
    const counters = {};
    let studentNo = 1;
    let slotK = 0;
    const att = { s: [], sub: [], d: [], st: [] };
    const subjectsAll = [];       // {code, ids:[studentRowIds]}
    for (const [gIdx, [course, sem, groupRoom, names]] of GROUPS.entries()) {
      const subs = SUBJECTS[course][sem];
      const studentRows = [];
      for (const [sIdx, fullName] of names.entries()) {
        const u = await mkUser('student', fullName, `student${studentNo}@uni.test`);
        counters[course] = (counters[course] || 0) + 1;
        const yearCode = course === 'BCA' && sem === 4 ? 2023 : course === 'BCA' ? 2025 : course === 'MCA' ? 2025 : 2023;
        const sid = await one(
          `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [u, `${course}${yearCode}${String(counters[course]).padStart(3, '0')}`, deptOf[course], courses[course], sem]);
        studentRows.push(sid);
        studentNo++;
        for (const [sub] of subs) {
          await c.query('INSERT INTO student_enrollments (student_id, subject_id, academic_year) VALUES ($1,$2,$3)', [sid, subjectId[sub], year]);
        }
        // attendance: first two students have fixed, clearly different patterns (used by the security tests)
        subs.forEach(([code], subjIdx) => {
          days.forEach((d, i) => {
            let st = 'present';
            if (gIdx === 0 && sIdx === 0) st = i === 3 ? 'absent' : 'present';
            else if (gIdx === 0 && sIdx === 1) st = i % 2 === 0 ? 'present' : 'absent';
            else if ((sIdx * 3 + subjIdx * 5 + i * 7) % 6 === 0) st = 'absent';
            else if ((sIdx + i) % 13 === 0) st = 'leave';
            att.s.push(sid); att.sub.push(subjectId[code]); att.d.push(d); att.st.push(st);
          });
        });
      }
      subjectsAll.push({ course, sem, subs, studentRows });

      // two weekly sessions per subject, each in its own unique (day, time) slot => no clashes
      for (const [code] of subs) {
        for (let session = 0; session < 2; session++) {
          const k = slotK++;
          const [st, en] = TIMES[Math.floor(k / 5) % TIMES.length];
          await c.query(
            'INSERT INTO timetables (subject_id, faculty_id, classroom_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6)',
            [subjectId[code], faculty[TEACHES[code]], room[LAB_SUBJECTS[code] || groupRoom], (k % 5) + 1, st, en]);
        }
      }
    }
    await c.query(
      `INSERT INTO attendance (student_id, subject_id, class_date, status)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::date[], $4::text[])`, [att.s, att.sub, att.d, att.st]);

    // Exams: one finished (with marks) and one upcoming (no marks yet) per subject
    const marks = { s: [], ex: [], m: [] };
    const fixed = { BCA401: [78, 55], BCA402: [85, 60], BCA403: [72, 48] };   // Riya vs Aman (kept for tests)
    let subjCount = 0;
    for (const g of subjectsAll) {
      for (const [code] of g.subs) {
        const done = await one(
          `INSERT INTO examinations (subject_id, exam_type, exam_date, start_time, end_time, classroom_id)
           VALUES ($1,'Internal Test 1', CURRENT_DATE - 30, '10:00','12:00',$2) RETURNING id`, [subjectId[code], room[g.course === 'BCA' ? (g.sem === 4 ? 'Room 201 (BCA)' : 'Room 202 (BCA)') : g.course === 'MCA' ? 'Room 203 (MCA)' : 'Room 301 (BBA)']]);
        await c.query(
          `INSERT INTO examinations (subject_id, exam_type, exam_date, start_time, end_time, classroom_id)
           VALUES ($1,'Mid-Semester Exam', CURRENT_DATE + $2::int, '10:00','13:00',$3)`,
          [subjectId[code], 10 + subjCount, room[g.course === 'BCA' ? (g.sem === 4 ? 'Room 201 (BCA)' : 'Room 202 (BCA)') : g.course === 'MCA' ? 'Room 203 (MCA)' : 'Room 301 (BBA)']]);
        g.studentRows.forEach((sid, idx) => {
          let m = 40 + ((idx * 7 + subjCount * 13) % 55);
          if (fixed[code] && idx < 2 && g.course === 'BCA' && g.sem === 4) m = fixed[code][idx];
          marks.s.push(sid); marks.ex.push(done); marks.m.push(m);
        });
        subjCount++;
      }
    }
    await c.query(
      `INSERT INTO student_marks (student_id, examination_id, marks_obtained)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::numeric[])`, [marks.s, marks.ex, marks.m]);

    // Admissions (DUMMY values). Missing fields are deliberately left NULL to test "no fabricated information":
    // MCA has no deadline / link / scholarship; BBA has no scholarship.
    await c.query(
      `INSERT INTO admissions (course_id, eligibility, application_deadline, fee_amount, status,
                               required_documents, application_url, contact_info, scholarship_info) VALUES
        ($1, '10+2 in any stream with at least 45% marks (dummy data)', CURRENT_DATE + 30, 45000, 'approved',
             '10th and 12th marksheets, ID proof, passport-size photographs, transfer certificate (dummy data)',
             'https://example.edu/apply/bca', 'admissions@example.edu, +91-00000-00000 (dummy)',
             'Merit scholarship of 10% fee waiver for 12th marks above 85% (dummy data)'),
        ($2, 'Bachelor degree with Mathematics at 10+2 or graduation level (dummy data)', NULL, 60000, 'approved',
             'Graduation marksheets, ID proof, passport-size photographs (dummy data)',
             NULL, 'admissions@example.edu, +91-00000-00000 (dummy)', NULL),
        ($3, '10+2 in any stream with at least 50% marks (dummy data)', CURRENT_DATE + 45, 50000, 'approved',
             '10th and 12th marksheets, ID proof, passport-size photographs (dummy data)',
             'https://example.edu/apply/bba', 'admissions@example.edu, +91-00000-00000 (dummy)', NULL)`,
      [courses.BCA, courses.MCA, courses.BBA]);

    await c.query(
      `INSERT INTO notices (title, content, category, published_at, is_published) VALUES
        ('Mid-Semester Exam Schedule Released', 'The mid-semester examination schedule is now available. (dummy notice)', 'examination', now(), true),
        ('Library Timings Extended', 'The library will remain open until 8 PM during exams. (dummy notice)', 'library', now(), true),
        ('Holiday Notice', 'The university will be closed for the festival holiday. (dummy notice)', 'general', now(), true)`);

    await c.query('COMMIT');
    console.log(`Seeded dummy data: ${studentNo - 1} students, ${facultyDefs.length} teachers, 2 HODs, 1 admin.`);
    console.log(`Logins (password for all: ${PASSWORD}):`);
    console.log('  admin@uni.test, hod@uni.test, hod2@uni.test, teacher@uni.test ... teacher5@uni.test, student1@uni.test ... student24@uni.test');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await db.end();
  }
})();
