const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('teacher'));

router.get('/me/timetable', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.day_of_week, t.start_time, t.end_time, sub.subject_name,
            c.room_number, c.floor_number, b.building_name
       FROM faculty f
       JOIN timetables t ON t.faculty_id = f.id
       JOIN subjects sub ON sub.id = t.subject_id
       JOIN classrooms c ON c.id = t.classroom_id
       JOIN buildings b ON b.id = c.building_id
      WHERE f.user_id = $1
      ORDER BY t.day_of_week, t.start_time`, [req.user.id]);
  res.json({ timetable: rows });
}));

module.exports = router;
