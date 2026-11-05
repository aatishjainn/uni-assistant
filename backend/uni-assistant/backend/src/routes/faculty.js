const router = require('express').Router();
const records = require('../services/records');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('teacher'));

router.get('/me/timetable', asyncHandler(async (req, res) => res.json({ timetable: await records.getFacultyTimetable(req.user.id) })));

module.exports = router;
