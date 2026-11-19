const router = require('express').Router();
const records = require('../services/records');
const campus = require('../services/campus');
const { nowInTz, DAY_NAMES } = require('../services/time');
const config = require('../config');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('teacher'));

const hm = (t) => String(t).slice(0, 5);
const slot = (r) => ({
  day: DAY_NAMES[r.day_of_week],
  start: hm(r.start_time),
  end: hm(r.end_time),
  subject: r.subject_name,
  room: r.room_number,
  floor: r.floor_number,
  building: r.building_name,
});

router.get('/me/timetable', asyncHandler(async (req, res) => res.json({ timetable: await records.getFacultyTimetable(req.user.id) })));

router.get('/me/subjects', asyncHandler(async (req, res) => res.json({ subjects: await records.getFacultySubjects(req.user.id) })));

router.get('/me/next-class', asyncHandler(async (req, res) => {
  const now = nowInTz(config.tz);
  const rows = await records.getFacultyTimetable(req.user.id);
  const upcoming = rows.find((r) => r.day_of_week > now.dow || (r.day_of_week === now.dow && hm(r.start_time) > now.time));
  const next = upcoming || rows[0] || null;
  const place = next && next.classroom_id ? await campus.nodeForClassroom(next.classroom_id) : null;
  res.json({
    now: `${DAY_NAMES[now.dow]} ${now.time}`,
    next_class: next ? slot(next) : null,
    place: place || null,
  });
}));

module.exports = router;
