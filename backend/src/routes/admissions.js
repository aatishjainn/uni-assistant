const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const audit = require('../audit');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');

const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const bad = (res, msg) => res.status(400).json({ error: msg });

// Public: courses currently open for admission
router.get('/courses', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id AS admission_id, c.id AS course_id, c.course_name, c.duration_years,
            d.department_name, a.eligibility,
            to_char(a.application_deadline, 'YYYY-MM-DD') AS application_deadline,
            a.fee_amount, a.required_documents, a.scholarship_info, a.contact_info
       FROM admissions a
       JOIN courses c ON c.id = a.course_id
       JOIN departments d ON d.id = c.department_id
      WHERE a.status = 'approved'
      ORDER BY c.course_name`
  );
  res.json({ courses: rows });
}));

// Applicant-only endpoints
router.get('/my-applications', authenticate, requireRole('applicant'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT app.id, app.application_number, app.course_id, c.course_name, d.department_name,
            app.full_name, app.email, app.phone,
            to_char(app.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
            app.gender, app.address, app.previous_qualification, app.previous_institution,
            app.percentage_or_gpa::float8 AS percentage_or_gpa, app.passing_year,
            app.statement_of_purpose, app.guardian_name, app.guardian_phone,
            app.status, app.admin_remarks,
            (app.status IN ('approved', 'rejected')
             AND (app.applicant_seen_at IS NULL OR (app.reviewed_at IS NOT NULL AND app.applicant_seen_at < app.reviewed_at))) AS has_unseen_decision,
            to_char(app.reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed_at,
            to_char(app.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
       FROM admission_applications app
       JOIN courses c ON c.id = app.course_id
       JOIN departments d ON d.id = c.department_id
      WHERE app.applicant_user_id = $1
      ORDER BY app.created_at DESC`,
    [req.user.id]
  );
  const unseen_decisions_count = rows.filter((r) => r.has_unseen_decision).length;
  res.json({ applications: rows, unseen_decisions_count });
}));

router.post('/my-applications/mark-seen', authenticate, requireRole('applicant'), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    `UPDATE admission_applications
        SET applicant_seen_at = now()
      WHERE applicant_user_id = $1
        AND status IN ('approved', 'rejected')
        AND (applicant_seen_at IS NULL OR (reviewed_at IS NOT NULL AND applicant_seen_at < reviewed_at))`,
    [req.user.id]
  );
  res.json({ ok: true, marked_count: rowCount || 0 });
}));

const applySchema = z.object({
  course_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(20),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD'),
  gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']),
  address: z.string().trim().min(5).max(500),
  previous_qualification: z.string().trim().min(2).max(120),
  previous_institution: z.string().trim().min(2).max(150),
  percentage_or_gpa: z.coerce.number().finite().min(0).max(100),
  passing_year: z.coerce.number().int().min(1990).max(2035),
  guardian_name: z.preprocess(emptyToNull, z.string().trim().max(100).nullable().optional()),
  guardian_phone: z.preprocess(emptyToNull, z.string().trim().max(20).nullable().optional()),
  statement_of_purpose: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
}).strict();

router.post('/apply', authenticate, requireRole('applicant'), asyncHandler(async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const f = parsed.data;

  // Verify course is open for admission
  const admRes = await db.query(
    `SELECT a.id, a.status, a.application_deadline, c.course_name
       FROM admissions a
       JOIN courses c ON c.id = a.course_id
      WHERE a.course_id = $1`,
    [f.course_id]
  );
  const adm = admRes.rows[0];
  if (!adm || adm.status !== 'approved') {
    return bad(res, 'Admissions are not currently open for the selected course');
  }
  if (adm.application_deadline && new Date(adm.application_deadline) < new Date(new Date().toISOString().slice(0, 10))) {
    return bad(res, `The application deadline for ${adm.course_name} has passed`);
  }

  // Prevent duplicate active applications for the same course
  const dupRes = await db.query(
    `SELECT id FROM admission_applications
      WHERE applicant_user_id = $1 AND course_id = $2 AND status IN ('pending', 'under_review', 'approved')
      LIMIT 1`,
    [req.user.id, f.course_id]
  );
  if (dupRes.rowCount) {
    return res.status(409).json({ error: `You already have an active application for ${adm.course_name}` });
  }

  const year = new Date().getFullYear();
  const suffix = String(crypto.randomInt(100000, 999999));
  const applicationNumber = `APP-${year}-${suffix}`;

  const { rows } = await db.query(
    `INSERT INTO admission_applications (
       application_number, applicant_user_id, course_id, full_name, email, phone,
       date_of_birth, gender, address, previous_qualification, previous_institution,
       percentage_or_gpa, passing_year, guardian_name, guardian_phone, statement_of_purpose, status
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
     RETURNING id, application_number, course_id, full_name, email, status,
               to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at`,
    [
      applicationNumber,
      req.user.id,
      f.course_id,
      f.full_name,
      f.email.toLowerCase(),
      f.phone,
      f.date_of_birth,
      f.gender,
      f.address,
      f.previous_qualification,
      f.previous_institution,
      Math.round(f.percentage_or_gpa * 100) / 100,
      f.passing_year,
      f.guardian_name || null,
      f.guardian_phone || null,
      f.statement_of_purpose || null,
    ]
  );

  await audit(req.user.id, 'admission_application_submit', 'admission_application', rows[0].id, {
    application_number: applicationNumber,
    course_id: f.course_id,
    course_name: adm.course_name,
  });

  res.status(201).json({ application: { ...rows[0], course_name: adm.course_name } });
}));

module.exports = router;
