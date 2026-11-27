const router = require('express').Router();
const { z } = require('zod');
const hod = require('../services/hod');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('hod'));

const uuid = z.string().uuid();
const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const bad = (res, msg) => res.status(400).json({ error: msg });

router.get('/overview', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentOverview(req.user.id));
}));

router.get('/faculty', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentFaculty(req.user.id));
}));

router.get('/courses', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentCourses(req.user.id));
}));

router.get('/schedule-exams', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentScheduleAndExams(req.user.id));
}));

router.get('/pending', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentPendingActivities(req.user.id));
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentAnalytics(req.user.id));
}));

router.get('/notices', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentNotices(req.user.id));
}));

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  category: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  is_published: z.boolean().default(false),
}).strict();

router.post('/notices', asyncHandler(async (req, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const created = await hod.createDepartmentNotice(req.user.id, parsed.data);
  res.status(201).json({ notice: created });
}));

router.patch('/notices/:id', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return bad(res, 'Invalid notice id');
  const parsed = z.object({ is_published: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, 'is_published (true/false) is required');
  const updated = await hod.updateDepartmentNotice(req.user.id, req.params.id, parsed.data);
  res.json(updated);
}));

router.get('/report', asyncHandler(async (req, res) => {
  res.json(await hod.getDepartmentReport(req.user.id));
}));

router.get('/report/csv', asyncHandler(async (req, res) => {
  const csv = await hod.generateDepartmentReportCsv(req.user.id);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="department-report.csv"');
  res.send(csv);
}));

router.get('/classrooms', asyncHandler(async (req, res) => {
  res.json(await hod.getClassrooms());
}));

router.patch('/examinations/:id/classroom', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return bad(res, 'Invalid examination id');
  const schema = z.object({
    classroom_id: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const updated = await hod.assignExamClassroom(req.user.id, req.params.id, parsed.data.classroom_id);
  res.json({ success: true, examination: updated });
}));

router.patch('/examinations/:id/grading-assignee', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return bad(res, 'Invalid examination id');
  const schema = z.object({
    faculty_id: z.string().uuid().nullable(),
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const updated = await hod.assignExamGradingFaculty(req.user.id, req.params.id, parsed.data.faculty_id);
  res.json({ success: true, examination: updated });
}));

router.post('/subjects/:id/assign-faculty', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return bad(res, 'Invalid subject id');
  const schema = z.object({
    faculty_id: z.string().uuid(),
    academic_year: z.string().trim().min(4).max(20).default('2026-27'),
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const result = await hod.assignSubjectFaculty(
    req.user.id,
    req.params.id,
    parsed.data.faculty_id,
    parsed.data.academic_year
  );
  res.json({ success: true, ...result });
}));

router.post('/attendance/remind', asyncHandler(async (req, res) => {
  const schema = z.object({
    subject_id: z.string().uuid(),
    week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'week_start must be YYYY-MM-DD'),
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  res.json(await hod.sendAttendanceReminder(req.user.id, parsed.data.subject_id, parsed.data.week_start));
}));

const timetableSchema = z.object({
  faculty_id: z.string().uuid(),
  classroom_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(1).max(7),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'start_time must be HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'end_time must be HH:MM'),
}).strict().refine((d) => d.end_time > d.start_time, {
  message: 'end_time must be after start_time',
  path: ['end_time'],
});

router.post('/subjects/:id/timetable', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return bad(res, 'Invalid subject id');
  const parsed = timetableSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const slot = await hod.scheduleSubjectTimetableSlot(req.user.id, req.params.id, parsed.data);
  res.status(201).json({ success: true, timetable: slot });
}));

const examSchema = z.object({
  subject_id: z.string().uuid(),
  exam_type: z.string().trim().min(1).max(100),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'exam_date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'start_time must be HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'end_time must be HH:MM'),
  classroom_id: z.string().uuid().nullable().optional(),
}).refine((data) => data.end_time > data.start_time, {
  message: 'end_time must be after start_time',
  path: ['end_time'],
});

router.post('/examinations', asyncHandler(async (req, res) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const created = await hod.scheduleExamination(req.user.id, parsed.data);
  res.status(201).json({ success: true, examination: created });
}));

module.exports = router;
