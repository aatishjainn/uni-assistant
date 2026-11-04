const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('student'));

// NOTE: there is deliberately no :studentId in any route. A student can only ever
// reach their own records, because every query is filtered by the verified token's user id.

router.get('/me/attendance', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sub.subject_code, sub.subject_name,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
            COUNT(*)::int AS total,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'present') / COUNT(*), 1) AS percentage
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN subjects sub ON sub.id = a.subject_id
      WHERE s.user_id = $1
      GROUP BY sub.id ORDER BY sub.subject_code`, [req.user.id]);
  const present = rows.reduce((n, r) => n + r.present, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  res.json({ overall_percentage: total ? Math.round((1000 * present) / total) / 10 : null, subjects: rows });
}));

router.get('/me/timetable', asyncHandler(async (req, res) => {
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
      ORDER BY t.day_of_week, t.start_time`, [req.user.id]);
  res.json({ timetable: rows });
}));

module.exports = router;
