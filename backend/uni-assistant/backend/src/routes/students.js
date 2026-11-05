const router = require('express').Router();
const records = require('../services/records');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('student'));

// NOTE: there is deliberately no :studentId in any route. A student can only ever
// reach their own records, because every query is filtered by the verified token's user id.
router.get('/me/attendance', asyncHandler(async (req, res) => res.json(await records.getAttendance(req.user.id))));
router.get('/me/timetable', asyncHandler(async (req, res) => res.json({ timetable: await records.getStudentTimetable(req.user.id) })));

module.exports = router;
