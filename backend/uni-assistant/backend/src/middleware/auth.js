const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const audit = require('../audit');

// Identity comes ONLY from the verified token + a fresh DB lookup.
// Nothing in the request body, query or URL is ever trusted as "who is calling".
async function authenticate(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required' });

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.email, r.role_name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.is_active`,
      [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      audit(req.user.id, 'access_denied', 'route', null, { path: req.originalUrl, role: req.user.role });
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
