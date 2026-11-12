const router = require('express').Router();
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');
const config = require('../config');
const db = require('../db');
const audit = require('../audit');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { processDocument, removeFile } = require('../services/documents');

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

module.exports = router;
