const router = require('express').Router();
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../config');
const db = require('../db');
const audit = require('../audit');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { processDocument, removeFile } = require('../services/documents');
const campus = require('../services/campus');

router.use(authenticate, requireRole('admin'));

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const bad = (res, msg) => res.status(400).json({ error: msg });
const validId = (req, res) => (uuid.safeParse(req.params.id).success ? true : (bad(res, 'Invalid id'), false));

// ---------------------------------------------------------------- documents
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
const receiveFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  bad(res, err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.maxUploadMb} MB)` : 'Invalid upload');
});

const DOC_TYPES = ['syllabus', 'notice', 'policy', 'admission', 'calendar', 'faq', 'handbook', 'other'];
const uploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  document_type: z.enum(DOC_TYPES),
  visibility: z.enum(['public', 'staff', 'admin']).default('public'),
  expires_at: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  approve: z.enum(['true', 'false']).default('false'),
});

// Never trust the file name or the browser-reported type: check the extension AND the file's real signature.
function detectKind(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const b = file.buffer;
  if (ext === '.pdf' && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (ext === '.docx' && b[0] === 0x50 && b[1] === 0x4b && b.includes('word/document.xml')) return 'docx';
  return null;
}

router.post('/documents', receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) return bad(res, 'Choose a PDF or DOCX file');
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const kind = detectKind(req.file);
  if (!kind) return bad(res, 'Only genuine PDF and DOCX files are accepted');

  const f = parsed.data;
  const storagePath = `${crypto.randomUUID()}.${kind}`;            // random name: the upload's own name is never used on disk
  await fs.mkdir(config.storageDir, { recursive: true });
  await fs.writeFile(path.join(config.storageDir, storagePath), req.file.buffer, { mode: 0o600 });

  const { rows } = await db.query(
    `INSERT INTO knowledge_documents (title, storage_path, document_type, status, is_approved, uploaded_by, visibility, expires_at, original_filename)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8) RETURNING id, title, document_type, status, is_approved, visibility, expires_at`,
    [f.title, storagePath, f.document_type, f.approve === 'true', req.user.id, f.visibility, f.expires_at || null,
      path.basename(req.file.originalname).slice(0, 200)]);
  await audit(req.user.id, 'document_upload', 'knowledge_document', rows[0].id, { title: f.title, kind, bytes: req.file.size });
  setImmediate(() => processDocument(rows[0].id).catch((e) => console.error(e)));    // index in the background
  res.status(202).json({ document: rows[0] });
}));

router.get('/documents', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.id, d.title, d.document_type, d.status, d.status_detail, d.is_approved, d.visibility,
            to_char(d.expires_at,'YYYY-MM-DD') AS expires_at, d.chunk_count, d.original_filename, d.created_at,
            u.full_name AS uploaded_by
       FROM knowledge_documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.created_at DESC LIMIT 200`);
  res.json({ documents: rows });
}));

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  is_approved: z.boolean().optional(),
  visibility: z.enum(['public', 'staff', 'admin']).optional(),
  expires_at: z.preprocess(emptyToNull, dateStr.nullable().optional()),
}).strict();

router.patch('/documents/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, 'Invalid fields');
  const p = parsed.data;
  const sets = []; const params = [req.params.id];
  for (const col of ['title', 'is_approved', 'visibility', 'expires_at']) {
    if (p[col] !== undefined) { params.push(p[col]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  const { rowCount } = await db.query(`UPDATE knowledge_documents SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) return res.status(404).json({ error: 'Document not found' });
  await audit(req.user.id, 'document_update', 'knowledge_document', req.params.id, p);
  res.json({ ok: true });
}));

router.post('/documents/:id/reindex', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const { rows } = await db.query('SELECT status FROM knowledge_documents WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
  if (rows[0].status === 'indexing') return bad(res, 'This document is already being indexed');
  await db.query("UPDATE knowledge_documents SET status = 'pending', status_detail = NULL WHERE id = $1", [req.params.id]);
  await audit(req.user.id, 'document_reindex', 'knowledge_document', req.params.id);
  setImmediate(() => processDocument(req.params.id).catch((e) => console.error(e)));
  res.status(202).json({ ok: true });
}));

router.delete('/documents/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const { rows } = await db.query('DELETE FROM knowledge_documents WHERE id = $1 RETURNING storage_path, title', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
  await removeFile(rows[0].storage_path);
  await audit(req.user.id, 'document_delete', 'knowledge_document', req.params.id, { title: rows[0].title });
  res.status(204).end();
}));

// ---------------------------------------------------------------- admissions
const textOrNull = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional());
const admissionSchema = z.object({
  eligibility: textOrNull,
  application_deadline: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  fee_amount: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(100000000).nullable().optional()),
  required_documents: textOrNull,
  application_url: z.preprocess(emptyToNull, z.string().url().max(500).regex(/^https:\/\//, 'Link must start with https://').nullable().optional()),
  contact_info: textOrNull,
  scholarship_info: textOrNull,
  status: z.enum(['draft', 'approved', 'closed']).optional(),
}).strict();

router.get('/admissions', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id, c.course_name, a.eligibility, to_char(a.application_deadline,'YYYY-MM-DD') AS application_deadline,
            a.fee_amount, a.required_documents, a.application_url, a.contact_info, a.scholarship_info, a.status
       FROM admissions a JOIN courses c ON c.id = a.course_id ORDER BY c.course_name`);
  res.json({ admissions: rows });
}));

router.put('/admissions/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = admissionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const p = parsed.data;
  const sets = []; const params = [req.params.id];
  for (const [col, val] of Object.entries(p)) {
    if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  const { rowCount } = await db.query(`UPDATE admissions SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  if (!rowCount) return res.status(404).json({ error: 'Admission record not found' });
  await audit(req.user.id, 'admission_update', 'admission', req.params.id, p);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- admission applications
router.get('/admission-applications', asyncHandler(async (req, res) => {
  const statusFilter = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : null;
  const search = typeof req.query.q === 'string' && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;

  const conditions = [];
  const params = [];
  if (statusFilter) {
    params.push(statusFilter);
    conditions.push(`app.status = $${params.length}`);
  }
  if (search) {
    params.push(search);
    conditions.push(
      `(app.application_number ILIKE $${params.length} OR app.full_name ILIKE $${params.length} OR app.email ILIKE $${params.length} OR c.course_name ILIKE $${params.length})`
    );
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [listRes, countsRes] = await Promise.all([
    db.query(
      `SELECT app.id, app.application_number, app.applicant_user_id, app.course_id,
              c.course_name, d.department_name,
              app.full_name, app.email, app.phone,
              to_char(app.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              app.gender, app.address, app.previous_qualification, app.previous_institution,
              app.percentage_or_gpa::float8 AS percentage_or_gpa, app.passing_year,
              app.guardian_name, app.guardian_phone, app.statement_of_purpose,
              app.status, app.admin_remarks,
              ru.full_name AS reviewed_by_name,
              to_char(app.reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed_at,
              to_char(app.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
              ur.role_name AS applicant_user_role
         FROM admission_applications app
         JOIN courses c ON c.id = app.course_id
         JOIN departments d ON d.id = c.department_id
         LEFT JOIN users ru ON ru.id = app.reviewed_by
         LEFT JOIN users au ON au.id = app.applicant_user_id
         LEFT JOIN roles ur ON ur.id = au.role_id
        ${whereClause}
        ORDER BY
          CASE app.status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
          app.created_at DESC
        LIMIT 200`,
      params
    ),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
              COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
         FROM admission_applications`
    ),
  ]);

  res.json({
    applications: listRes.rows,
    counts: countsRes.rows[0] || { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
  });
}));

const reviewApplicationSchema = z.object({
  status: z.enum(['pending', 'under_review', 'approved', 'rejected']),
  admin_remarks: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable().optional()),
  enroll_student: z.boolean().optional().default(false),
}).strict();

router.patch('/admission-applications/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = reviewApplicationSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { status, admin_remarks, enroll_student } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const appRes = await client.query(
      `SELECT app.id, app.application_number, app.applicant_user_id, app.course_id,
              c.course_name, c.department_id
         FROM admission_applications app
         JOIN courses c ON c.id = app.course_id
        WHERE app.id = $1`,
      [req.params.id]
    );
    const existing = appRes.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Admission application not found' });
    }

    const updatedRes = await client.query(
      `UPDATE admission_applications
          SET status = $2,
              admin_remarks = $3,
              reviewed_by = $4,
              reviewed_at = now(),
              applicant_seen_at = NULL,
              updated_at = now()
        WHERE id = $1
       RETURNING id, application_number, status, admin_remarks,
                 to_char(reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed_at`,
      [req.params.id, status, admin_remarks ?? null, req.user.id]
    );

    let enrolledStudent = null;
    if (status === 'approved' && enroll_student && existing.applicant_user_id) {
      const stuCheck = await client.query('SELECT id, student_number FROM students WHERE user_id = $1', [existing.applicant_user_id]);
      if (!stuCheck.rowCount) {
        await client.query(
          "UPDATE users SET role_id = (SELECT id FROM roles WHERE role_name = 'student'), updated_at = now() WHERE id = $1",
          [existing.applicant_user_id]
        );
        const year = new Date().getFullYear();
        const studentNo = `${existing.course_name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}${year}${String(Math.floor(100 + Math.random() * 900))}`;
        const insStu = await client.query(
          `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
           VALUES ($1, $2, $3, $4, 1)
           RETURNING id, student_number`,
          [existing.applicant_user_id, studentNo, existing.department_id, existing.course_id]
        );
        enrolledStudent = insStu.rows[0];

        // Enroll in available semester 1 (or lowest semester) subjects for the course
        await client.query(
          `INSERT INTO student_enrollments (student_id, subject_id, academic_year)
           SELECT $1, sub.id, $2
             FROM subjects sub
            WHERE sub.course_id = $3
              AND sub.semester = COALESCE((SELECT MIN(semester) FROM subjects WHERE course_id = $3), 1)
           ON CONFLICT (student_id, subject_id, academic_year) DO NOTHING`,
          [enrolledStudent.id, `${year}-${String((year + 1) % 100).padStart(2, '0')}`, existing.course_id]
        );
      }
    }

    await client.query('COMMIT');
    await audit(req.user.id, 'admin_admission_application_review', 'admission_application', req.params.id, {
      application_number: existing.application_number,
      status,
      enroll_student: Boolean(enrolledStudent),
    });

    res.json({
      success: true,
      application: updatedRes.rows[0],
      enrolled_student: enrolledStudent,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ---------------------------------------------------------------- notices
const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  category: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  is_published: z.boolean().default(false),
}).strict();

router.get('/notices', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, title, content, category, is_published, to_char(published_at,'YYYY-MM-DD') AS published_at FROM notices ORDER BY published_at DESC NULLS FIRST, title LIMIT 100");
  res.json({ notices: rows });
}));

router.post('/notices', asyncHandler(async (req, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const n = parsed.data;
  const { rows } = await db.query(
    `INSERT INTO notices (title, content, category, is_published, published_at, created_by)
     VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN now() ELSE NULL END, $5) RETURNING id`,
    [n.title, n.content, n.category || null, n.is_published, req.user.id]);
  await audit(req.user.id, 'notice_create', 'notice', rows[0].id, { title: n.title, published: n.is_published });
  res.status(201).json({ id: rows[0].id });
}));

router.patch('/notices/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = z.object({ is_published: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, 'is_published (true/false) is required');
  const { rowCount } = await db.query(
    `UPDATE notices SET is_published = $2, published_at = CASE WHEN $2 THEN COALESCE(published_at, now()) ELSE published_at END WHERE id = $1`,
    [req.params.id, parsed.data.is_published]);
  if (!rowCount) return res.status(404).json({ error: 'Notice not found' });
  await audit(req.user.id, 'notice_update', 'notice', req.params.id, parsed.data);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- campus (buildings, places, QR codes)
router.get('/campus/buildings', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, building_name, latitude, longitude, description FROM buildings ORDER BY building_name');
  res.json({ buildings: rows });
}));

const buildingSchema = z.object({
  building_name: z.string().trim().min(1).max(100).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  description: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
}).strict();

router.put('/campus/buildings/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = buildingSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const sets = []; const params = [req.params.id];
  for (const [col, val] of Object.entries(parsed.data)) {
    if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  const { rowCount } = await db.query(`UPDATE buildings SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) return res.status(404).json({ error: 'Building not found' });
  campus.invalidate();
  await audit(req.user.id, 'building_update', 'building', req.params.id, parsed.data);
  res.json({ ok: true });
}));

router.get('/campus/places', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.id, n.node_name, n.node_type, n.floor_number, n.qr_code, n.keywords, n.is_public, b.building_name
       FROM navigation_nodes n JOIN buildings b ON b.id = n.building_id
      WHERE n.node_type IN ('room','entrance') ORDER BY b.building_name, n.floor_number, n.node_name`);
  res.json({ places: rows });
}));

const placeSchema = z.object({
  node_name: z.string().trim().min(1).max(100).optional(),
  keywords: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
  is_public: z.boolean().optional(),
}).strict();

router.put('/campus/places/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const p = parsed.data;
  const sets = []; const params = [req.params.id];
  for (const col of ['node_name', 'keywords', 'is_public']) {
    if (p[col] !== undefined) { params.push(p[col]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE navigation_nodes SET ${sets.join(', ')} WHERE id = $1 AND node_type IN ('room','entrance') RETURNING classroom_id`, params);
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Place not found' }); }
    // keep the room name used by timetables and exams in step with the map
    if (p.node_name && rows[0].classroom_id) await client.query('UPDATE classrooms SET room_number = $2 WHERE id = $1', [rows[0].classroom_id, p.node_name]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Another room in this building already has that name' });
    throw e;
  } finally {
    client.release();
  }
  campus.invalidate();
  await audit(req.user.id, 'place_update', 'navigation_node', req.params.id, p);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- analytics
router.get('/analytics', asyncHandler(async (req, res) => {
  const q = (sql) => db.query(sql).then((r) => r.rows);
  const [totals, perDay, intents, denied, docs, rating] = await Promise.all([
    q(`SELECT (SELECT count(*)::int FROM chat_sessions) AS conversations,
              (SELECT count(*)::int FROM chat_messages WHERE sender = 'user') AS questions,
              (SELECT count(DISTINCT user_id)::int FROM chat_sessions) AS active_users`),
    q(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS questions
         FROM chat_messages WHERE sender = 'user' AND created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
    q(`SELECT source_metadata->>'intent' AS intent, count(*)::int AS count FROM chat_messages
        WHERE sender = 'assistant' AND jsonb_typeof(source_metadata) = 'object' AND source_metadata ? 'intent'
        GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT count(*)::int AS count FROM audit_logs WHERE action = 'chat_access_denied'`),
    q(`SELECT count(*) FILTER (WHERE status = 'indexed' AND is_approved)::int AS live,
              count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*)::int AS total FROM knowledge_documents`),
    q('SELECT round(avg(rating), 2) AS average, count(*)::int AS count FROM feedback'),
  ]);
  res.json({ totals: totals[0], questions_per_day: perDay, intents, denied_attempts: denied[0].count, documents: docs[0], feedback: rating[0] });
}));

// ---------------------------------------------------------------- user management
router.get('/users', asyncHandler(async (req, res) => {
  const { search, role, limit = 200, offset = 0 } = req.query;
  const conditions = [];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`(lower(u.full_name) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR lower(COALESCE(s.student_number, '')) LIKE $${params.length} OR lower(COALESCE(f.employee_number, '')) LIKE $${params.length})`);
  }
  if (role && role.trim()) {
    params.push(role.trim());
    conditions.push(`r.role_name = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Number(limit) || 200);
  const limitParam = `$${params.length}`;
  params.push(Number(offset) || 0);
  const offsetParam = `$${params.length}`;

  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.email, u.is_active,
            to_char(u.created_at, 'YYYY-MM-DD') AS created_at,
            r.role_name AS role,
            COALESCE(s.department_id, f.department_id, dh.id) AS department_id,
            COALESCE(ds.department_name, df.department_name, dh.department_name) AS department_name,
            s.student_number, s.semester, c.course_name, c.id AS course_id,
            f.employee_number
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN departments ds ON ds.id = s.department_id
       LEFT JOIN faculty f ON f.user_id = u.id
       LEFT JOIN departments df ON df.id = f.department_id
       LEFT JOIN departments dh ON dh.hod_user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const countRes = await db.query(
    `SELECT count(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id ${whereClause}`,
    params.slice(0, conditions.length)
  );

  res.json({ users: rows, total: countRes.rows[0].total });
}));

router.get('/roles', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, role_name FROM roles ORDER BY role_name');
  res.json({ roles: rows });
}));

const createUserSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200).default('Password@123'),
  role: z.enum(['student', 'teacher', 'hod', 'admin', 'applicant', 'visitor']),
  department_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  course_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  semester: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(12).nullable().optional()),
  student_number: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  employee_number: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
}).strict();

router.post('/users', asyncHandler(async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const u = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [u.email]);
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(u.password, 10);
    const userRes = await client.query(
      `INSERT INTO users (role_id, full_name, email, password_hash, is_active)
       VALUES ((SELECT id FROM roles WHERE role_name = $1), $2, $3, $4, true)
       RETURNING id, full_name, email`,
      [u.role, u.full_name, u.email.toLowerCase(), hash]
    );
    const userId = userRes.rows[0].id;

    if (u.role === 'student') {
      if (!u.department_id || !u.course_id || !u.semester) {
        await client.query('ROLLBACK');
        return bad(res, 'department_id, course_id, and semester are required for students');
      }
      const sNum = u.student_number || `STU${Date.now().toString().slice(-6)}`;
      await client.query(
        `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, sNum, u.department_id, u.course_id, u.semester]
      );
    } else if (u.role === 'teacher') {
      if (!u.department_id) {
        await client.query('ROLLBACK');
        return bad(res, 'department_id is required for teachers');
      }
      const eNum = u.employee_number || `EMP${Date.now().toString().slice(-4)}`;
      await client.query(
        `INSERT INTO faculty (user_id, employee_number, department_id)
         VALUES ($1, $2, $3)`,
        [userId, eNum, u.department_id]
      );
    } else if (u.role === 'hod') {
      if (u.department_id) {
        await client.query(
          'UPDATE departments SET hod_user_id = $1 WHERE id = $2',
          [userId, u.department_id]
        );
      }
    }

    await client.query('COMMIT');
    await audit(req.user.id, 'admin_user_create', 'user', userId, {
      full_name: u.full_name,
      email: u.email,
      role: u.role,
    });
    res.status(201).json({ user: { id: userId, full_name: u.full_name, email: u.email, role: u.role } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  role: z.enum(['student', 'teacher', 'hod', 'admin', 'applicant', 'visitor']).optional(),
  department_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  course_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  semester: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(12).nullable().optional()),
  password: z.preprocess(emptyToNull, z.string().min(8).max(200).nullable().optional()),
}).strict();

router.patch('/users/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const data = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query(
      `SELECT u.id, u.full_name, u.email, u.is_active, r.role_name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1`,
      [req.params.id]
    );
    if (!cur.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const sets = [];
    const params = [req.params.id];
    if (data.full_name !== undefined) {
      params.push(data.full_name);
      sets.push(`full_name = $${params.length}`);
    }
    if (data.is_active !== undefined) {
      params.push(data.is_active);
      sets.push(`is_active = $${params.length}`);
    }
    if (data.role !== undefined) {
      sets.push(`role_id = (SELECT id FROM roles WHERE role_name = '${data.role}')`);
    }
    if (data.password) {
      const hash = await bcrypt.hash(data.password, 10);
      params.push(hash);
      sets.push(`password_hash = $${params.length}`);
    }

    if (sets.length) {
      await client.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
    }

    const effectiveRole = data.role || cur.rows[0].role;

    if (effectiveRole === 'student') {
      if (data.department_id || data.course_id || data.semester) {
        const studentSets = [];
        const studentParams = [req.params.id];
        if (data.department_id) { studentParams.push(data.department_id); studentSets.push(`department_id = $${studentParams.length}`); }
        if (data.course_id) { studentParams.push(data.course_id); studentSets.push(`course_id = $${studentParams.length}`); }
        if (data.semester) { studentParams.push(data.semester); studentSets.push(`semester = $${studentParams.length}`); }

        const sChk = await client.query('SELECT 1 FROM students WHERE user_id = $1', [req.params.id]);
        if (sChk.rowCount) {
          if (studentSets.length) {
            await client.query(`UPDATE students SET ${studentSets.join(', ')} WHERE user_id = $1`, studentParams);
          }
        } else if (data.department_id && data.course_id) {
          await client.query(
            `INSERT INTO students (user_id, student_number, department_id, course_id, semester)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.params.id, `STU${Date.now().toString().slice(-6)}`, data.department_id, data.course_id, data.semester || 1]
          );
        }
      }
    } else if (effectiveRole === 'teacher') {
      if (data.department_id) {
        const fChk = await client.query('SELECT 1 FROM faculty WHERE user_id = $1', [req.params.id]);
        if (fChk.rowCount) {
          await client.query('UPDATE faculty SET department_id = $2 WHERE user_id = $1', [req.params.id, data.department_id]);
        } else {
          await client.query(
            `INSERT INTO faculty (user_id, employee_number, department_id)
             VALUES ($1, $2, $3)`,
            [req.params.id, `EMP${Date.now().toString().slice(-4)}`, data.department_id]
          );
        }
      }
    } else if (effectiveRole === 'hod') {
      if (data.department_id) {
        await client.query('UPDATE departments SET hod_user_id = $1 WHERE id = $2', [req.params.id, data.department_id]);
      }
    }

    await client.query('COMMIT');
    await audit(req.user.id, 'admin_user_update', 'user', req.params.id, data);
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ---------------------------------------------------------------- department management
router.get('/departments', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.id, d.department_name, d.hod_user_id, u.full_name AS hod_name, u.email AS hod_email,
            COUNT(DISTINCT f.id)::int AS faculty_count,
            COUNT(DISTINCT s.id)::int AS student_count,
            COUNT(DISTINCT c.id)::int AS course_count
       FROM departments d
       LEFT JOIN users u ON u.id = d.hod_user_id
       LEFT JOIN faculty f ON f.department_id = d.id
       LEFT JOIN students s ON s.department_id = d.id
       LEFT JOIN courses c ON c.department_id = d.id
      GROUP BY d.id, d.department_name, d.hod_user_id, u.full_name, u.email
      ORDER BY d.department_name`
  );
  res.json({ departments: rows });
}));

const departmentSchema = z.object({
  department_name: z.string().trim().min(2).max(100),
  hod_user_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
}).strict();

router.post('/departments', asyncHandler(async (req, res) => {
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { department_name, hod_user_id } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO departments (department_name, hod_user_id) VALUES ($1, $2) RETURNING id, department_name, hod_user_id',
      [department_name, hod_user_id || null]
    );
    if (hod_user_id) {
      await client.query(
        "UPDATE users SET role_id = (SELECT id FROM roles WHERE role_name = 'hod') WHERE id = $1",
        [hod_user_id]
      );
    }
    await client.query('COMMIT');
    await audit(req.user.id, 'department_create', 'department', rows[0].id, { department_name });
    res.status(201).json({ department: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'A department with this name already exists' });
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/departments/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { department_name, hod_user_id } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE departments SET department_name = $1, hod_user_id = $2 WHERE id = $3 RETURNING id',
      [department_name, hod_user_id || null, req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Department not found' });
    }
    if (hod_user_id) {
      await client.query(
        "UPDATE users SET role_id = (SELECT id FROM roles WHERE role_name = 'hod') WHERE id = $1",
        [hod_user_id]
      );
    }
    await client.query('COMMIT');
    await audit(req.user.id, 'department_update', 'department', req.params.id, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'A department with this name already exists' });
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/departments/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  try {
    const { rowCount } = await db.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Department not found' });
    await audit(req.user.id, 'department_delete', 'department', req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete department with active courses, faculty, or students.' });
    }
    throw err;
  }
}));

// ---------------------------------------------------------------- faculty management
router.get('/faculty', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT f.id, f.user_id, f.employee_number, f.department_id, d.department_name,
            u.full_name, u.email, u.is_active,
            COALESCE(
              json_agg(
                json_build_object(
                  'fs_id', fs.id,
                  'subject_id', sub.id,
                  'subject_code', sub.subject_code,
                  'subject_name', sub.subject_name,
                  'course_name', c.course_name,
                  'academic_year', fs.academic_year
                ) ORDER BY sub.subject_code
              ) FILTER (WHERE sub.id IS NOT NULL),
              '[]'
            ) AS subjects
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       JOIN departments d ON d.id = f.department_id
       LEFT JOIN faculty_subjects fs ON fs.faculty_id = f.id
       LEFT JOIN subjects sub ON sub.id = fs.subject_id
       LEFT JOIN courses c ON c.id = sub.course_id
      GROUP BY f.id, f.user_id, f.employee_number, f.department_id, d.department_name, u.full_name, u.email, u.is_active
      ORDER BY u.full_name`
  );
  res.json({ faculty: rows });
}));

const assignSubjectSchema = z.object({
  subject_id: uuid,
  academic_year: z.string().trim().min(4).max(20).default('2026-27'),
}).strict();

router.post('/faculty/:id/assign-subject', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = assignSubjectSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { subject_id, academic_year } = parsed.data;

  try {
    await db.query(
      `INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year)
       VALUES ($1, $2, $3)
       ON CONFLICT (faculty_id, subject_id, academic_year) DO NOTHING`,
      [req.params.id, subject_id, academic_year]
    );
    await audit(req.user.id, 'faculty_assign_subject', 'faculty', req.params.id, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Faculty or subject not found' });
    throw err;
  }
}));

router.delete('/faculty/:id/subjects/:subjectId', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  if (!uuid.safeParse(req.params.subjectId).success) return bad(res, 'Invalid subject id');

  await db.query(
    'DELETE FROM faculty_subjects WHERE faculty_id = $1 AND subject_id = $2',
    [req.params.id, req.params.subjectId]
  );
  await audit(req.user.id, 'faculty_unassign_subject', 'faculty', req.params.id, { subject_id: req.params.subjectId });
  res.status(204).end();
}));

// ---------------------------------------------------------------- course & subject management
router.get('/courses', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.course_name, c.duration_years, c.department_id, d.department_name,
            COUNT(DISTINCT s.id)::int AS student_count,
            COUNT(DISTINCT sub.id)::int AS subject_count
       FROM courses c
       JOIN departments d ON d.id = c.department_id
       LEFT JOIN students s ON s.course_id = c.id
       LEFT JOIN subjects sub ON sub.course_id = c.id
      GROUP BY c.id, c.course_name, c.duration_years, c.department_id, d.department_name
      ORDER BY d.department_name, c.course_name`
  );
  res.json({ courses: rows });
}));

const courseSchema = z.object({
  course_name: z.string().trim().min(2).max(100),
  department_id: uuid,
  duration_years: z.coerce.number().int().min(1).max(6),
}).strict();

router.post('/courses', asyncHandler(async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { course_name, department_id, duration_years } = parsed.data;

  const { rows } = await db.query(
    'INSERT INTO courses (course_name, department_id, duration_years) VALUES ($1, $2, $3) RETURNING id, course_name, department_id, duration_years',
    [course_name, department_id, duration_years]
  );
  await audit(req.user.id, 'course_create', 'course', rows[0].id, parsed.data);
  res.status(201).json({ course: rows[0] });
}));

router.put('/courses/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { course_name, department_id, duration_years } = parsed.data;

  const { rowCount } = await db.query(
    'UPDATE courses SET course_name = $1, department_id = $2, duration_years = $3 WHERE id = $4',
    [course_name, department_id, duration_years, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Course not found' });
  await audit(req.user.id, 'course_update', 'course', req.params.id, parsed.data);
  res.json({ ok: true });
}));

router.delete('/courses/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  try {
    const { rowCount } = await db.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Course not found' });
    await audit(req.user.id, 'course_delete', 'course', req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Cannot delete course with active subjects or enrolled students.' });
    throw err;
  }
}));

router.get('/subjects', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sub.id, sub.subject_code, sub.subject_name, sub.semester, sub.course_id,
            c.course_name, d.id AS department_id, d.department_name,
            u.full_name AS assigned_faculty_name, f.id AS assigned_faculty_id
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       JOIN departments d ON d.id = c.department_id
       LEFT JOIN faculty_subjects fs ON fs.subject_id = sub.id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
      ORDER BY d.department_name, c.course_name, sub.semester, sub.subject_code`
  );
  res.json({ subjects: rows });
}));

const subjectSchema = z.object({
  course_id: uuid,
  subject_code: z.string().trim().min(2).max(20),
  subject_name: z.string().trim().min(2).max(100),
  semester: z.coerce.number().int().min(1).max(12),
}).strict();

router.post('/subjects', asyncHandler(async (req, res) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { course_id, subject_code, subject_name, semester } = parsed.data;

  try {
    const { rows } = await db.query(
      'INSERT INTO subjects (course_id, subject_code, subject_name, semester) VALUES ($1, $2, $3, $4) RETURNING id, subject_code, subject_name, semester, course_id',
      [course_id, subject_code.toUpperCase(), subject_name, semester]
    );
    await audit(req.user.id, 'subject_create', 'subject', rows[0].id, parsed.data);
    res.status(201).json({ subject: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this subject code already exists' });
    throw err;
  }
}));

router.put('/subjects/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { course_id, subject_code, subject_name, semester } = parsed.data;

  try {
    const { rowCount } = await db.query(
      'UPDATE subjects SET course_id = $1, subject_code = $2, subject_name = $3, semester = $4 WHERE id = $5',
      [course_id, subject_code.toUpperCase(), subject_name, semester, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Subject not found' });
    await audit(req.user.id, 'subject_update', 'subject', req.params.id, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this subject code already exists' });
    throw err;
  }
}));

router.delete('/subjects/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  try {
    const { rowCount } = await db.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Subject not found' });
    await audit(req.user.id, 'subject_delete', 'subject', req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Cannot delete subject with enrolled students, timetable slots, or marks.' });
    throw err;
  }
}));

// ---------------------------------------------------------------- FAQ management
router.get('/faqs', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, question, answer, category, is_published,
            to_char(created_at, 'YYYY-MM-DD') AS created_at,
            to_char(updated_at, 'YYYY-MM-DD') AS updated_at
       FROM faqs
      ORDER BY category, created_at DESC`
  );
  res.json({ faqs: rows });
}));

const faqSchema = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3).max(3000),
  category: z.string().trim().min(2).max(50).default('General'),
  is_published: z.boolean().default(true),
}).strict();

router.post('/faqs', asyncHandler(async (req, res) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { question, answer, category, is_published } = parsed.data;

  const { rows } = await db.query(
    `INSERT INTO faqs (question, answer, category, is_published)
     VALUES ($1, $2, $3, $4)
     RETURNING id, question, answer, category, is_published, to_char(created_at, 'YYYY-MM-DD') AS created_at`,
    [question, answer, category, is_published]
  );
  await audit(req.user.id, 'faq_create', 'faq', rows[0].id, { question, category });
  res.status(201).json({ faq: rows[0] });
}));

router.put('/faqs/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const { question, answer, category, is_published } = parsed.data;

  const { rowCount } = await db.query(
    `UPDATE faqs
        SET question = $1, answer = $2, category = $3, is_published = $4, updated_at = now()
      WHERE id = $5`,
    [question, answer, category, is_published, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'FAQ not found' });
  await audit(req.user.id, 'faq_update', 'faq', req.params.id, parsed.data);
  res.json({ ok: true });
}));

router.delete('/faqs/:id', asyncHandler(async (req, res) => {
  if (!validId(req, res)) return;
  const { rowCount } = await db.query('DELETE FROM faqs WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'FAQ not found' });
  await audit(req.user.id, 'faq_delete', 'faq', req.params.id);
  res.status(204).end();
}));

module.exports = router;
