const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const db = require('../db');
const audit = require('../audit');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');

// Only FAILED attempts count toward the login limit (brute-force protection)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many failed login attempts. Try again later.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-ups from this network. Try again later.' } });

const loginSchema = z.object({ email: z.string().email().max(255), password: z.string().min(1).max(200) });
const registerSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
}).strict(); // .strict(): a "role" field in the body is rejected, not ignored

// Compared against when the email does not exist, so response time doesn't reveal valid emails
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });
}

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  const { email, password } = parsed.data;

  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, r.role_name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE lower(u.email) = lower($1) AND u.is_active`, [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    await audit(user ? user.id : null, 'login_failed', 'user', user ? user.id : null, { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  await audit(user.id, 'login_success', 'user', user.id);
  res.json({ token: sign(user), user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
}));

// Public sign-up can ONLY create an 'applicant'. Other roles are assigned by an admin / the seed script.
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Name, valid email and a password of 8+ characters are required' });
  const { full_name, email, password } = parsed.data;

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (role_id, full_name, email, password_hash)
       VALUES ((SELECT id FROM roles WHERE role_name = 'applicant'), $1, $2, $3)
       RETURNING id, full_name, email`, [full_name, email.toLowerCase(), hash]);
    await audit(rows[0].id, 'register', 'user', rows[0].id);
    res.status(201).json({ user: { ...rows[0], role: 'applicant' } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    throw e;
  }
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
