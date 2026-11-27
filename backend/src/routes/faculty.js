const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const records = require('../services/records');
const faculty = require('../services/faculty');
const campus = require('../services/campus');
const { nowInTz, DAY_NAMES } = require('../services/time');
const config = require('../config');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('teacher'));

const uuid = z.string().uuid();
const bad = (res, msg) => res.status(400).json({ error: msg });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const receiveCsvOrExcel = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : 'Invalid file upload');
});

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

router.get('/me/grading-tasks', asyncHandler(async (req, res) => {
  res.json(await faculty.getGradingTasks(req.user.id));
}));

router.get('/me/grading-tasks/:examId/students', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.examId).success) return bad(res, 'Invalid examination id');
  res.json(await faculty.getExamStudentsForGrading(req.user.id, req.params.examId));
}));

router.get('/me/grading-tasks/:examId/template', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.examId).success) return bad(res, 'Invalid examination id');
  const { filename, csv } = await faculty.getBlankMarksCsv(req.user.id, req.params.examId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

const marksSchema = z.object({
  marks: z.array(
    z.object({
      student_id: z.string().uuid(),
      marks_obtained: z.coerce.number().finite().min(0).max(100),
    }).strict()
  ).min(1, 'Enter marks for at least one student').max(500),
}).strict();

router.put('/me/grading-tasks/:examId/marks', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.examId).success) return bad(res, 'Invalid examination id');
  const parsed = marksSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  res.json(await faculty.submitExamMarks(req.user.id, req.params.examId, parsed.data.marks));
}));

router.post('/me/grading-tasks/:examId/upload-marks', receiveCsvOrExcel, asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.examId).success) return bad(res, 'Invalid examination id');
  if (!req.file) return bad(res, 'Please select a .csv or .xlsx marks file to upload');
  res.json(await faculty.uploadExamMarksFromFile(req.user.id, req.params.examId, req.file));
}));

const weekQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'week must be YYYY-MM-DD').optional();

router.get('/me/attendance-sheets', asyncHandler(async (req, res) => {
  const w = weekQuerySchema.safeParse(req.query.week);
  if (!w.success) return bad(res, w.error.issues[0].message);
  res.json(await faculty.getAttendanceSheets(req.user.id, w.data));
}));

router.get('/me/attendance-sheets/:subjectId/template', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.subjectId).success) return bad(res, 'Invalid subject id');
  const w = weekQuerySchema.safeParse(req.query.week);
  if (!w.success) return bad(res, w.error.issues[0].message);
  const { filename, csv } = await faculty.getBlankAttendanceCsv(req.user.id, req.params.subjectId, w.data);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

router.get('/me/attendance-sheets/:subjectId/records', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.subjectId).success) return bad(res, 'Invalid subject id');
  const w = weekQuerySchema.safeParse(req.query.week);
  if (!w.success) return bad(res, w.error.issues[0].message);
  res.json(await faculty.getWeeklyAttendanceRecords(req.user.id, req.params.subjectId, w.data));
}));

router.post('/me/attendance-sheets/:subjectId/upload', receiveCsvOrExcel, asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.subjectId).success) return bad(res, 'Invalid subject id');
  const w = weekQuerySchema.safeParse(req.query.week);
  if (!w.success) return bad(res, w.error.issues[0].message);
  if (!req.file) return bad(res, 'Please select a .csv or .xlsx attendance file to upload');
  res.json(await faculty.uploadWeeklyAttendanceFromFile(req.user.id, req.params.subjectId, w.data, req.file));
}));

module.exports = router;
