const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { handleMessage } = require('../services/orchestrator');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Per-user limit (protects the free Gemini quota too)
router.use('/', rateLimit({ windowMs: 60 * 1000, limit: config.chatRateLimit, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user.id, validate: false,
  message: { error: 'You are sending messages too fast. Please wait a moment.' } }));

const uuid = z.string().uuid();
const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: uuid.optional(),
  mode: z.enum(['simple', 'detailed']).default('simple'),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Message is required (max 4000 characters)' });
  const { message, sessionId, mode } = parsed.data;

  let sessionIdToUse = sessionId;
  let isNew = false;
  if (sessionId) {
    // Ownership check: the session must belong to the authenticated user
    const own = await db.query('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.id]);
    if (!own.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
  } else {
    const created = await db.query(
      'INSERT INTO chat_sessions (user_id, session_title) VALUES ($1,$2) RETURNING id',
      [req.user.id, message.slice(0, 60)]);
    sessionIdToUse = created.rows[0].id;
    isNew = true;
  }

  // History is loaded from OUR database, never trusted from the client
  const hist = await db.query(
    `SELECT sender, message, source_metadata FROM (
       SELECT sender, message, source_metadata, created_at FROM chat_messages
        WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20) t
      ORDER BY created_at ASC`, [sessionIdToUse]);
  const history = hist.rows.map((r) => ({ role: r.sender, content: r.message }));
  const lastAssistant = [...hist.rows].reverse().find((r) => r.sender === 'assistant');
  const lastIntent = lastAssistant?.source_metadata?.intent || null;

  let ai;
  try {
    ai = await handleMessage({ user: req.user, message, history, mode, lastIntent });
  } catch (err) {
    console.error('AI call failed:', err.message);
    if (isNew) await db.query('DELETE FROM chat_sessions WHERE id = $1', [sessionIdToUse]);
    return res.status(503).json({ error: 'The assistant is busy right now. Please try again in a moment.' });
  }

  await db.query(
    `INSERT INTO chat_messages (session_id, sender, message, source_metadata, created_at) VALUES
       ($1,'user',$2,NULL, clock_timestamp()),
       ($1,'assistant',$3,$4, clock_timestamp() + interval '1 millisecond')`,
    [sessionIdToUse, message, ai.answer, JSON.stringify({ intent: ai.intent, sources: ai.sources || [] })]);

  res.json({ sessionId: sessionIdToUse, answer: ai.answer, sources: ai.sources || [] });
}));

// List only the caller's conversations
router.get('/sessions', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, session_title, created_at FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]);
  res.json({ sessions: rows });
}));

router.get('/sessions/:id', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const s = await db.query('SELECT id, session_title, created_at FROM chat_sessions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]);
  if (!s.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
  const m = await db.query(
    'SELECT id, sender, message, source_metadata, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
    [req.params.id]);
  res.json({ session: s.rows[0], messages: m.rows });
}));

// "Clear chat history" for one conversation
router.delete('/sessions/:id', asyncHandler(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const r = await db.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Conversation not found' });
  res.status(204).end();
}));

module.exports = router;
