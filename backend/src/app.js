const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/faqs', async (req, res, next) => {
  try {
    const db = require('./db');
    const { rows } = await db.query('SELECT id, question, answer, category FROM faqs WHERE is_published ORDER BY category, question');
    res.json({ faqs: rows });
  } catch (err) {
    next(err);
  }
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/students', require('./routes/students'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/hod', require('./routes/hod'));
app.use('/api/admissions', require('./routes/admissions'));
app.use('/api/campus', require('./routes/campus'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message, ...(err.payload || {}) });
  }
  console.error(err);            // details stay in the server log only
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
