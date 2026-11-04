const db = require('./db');

// Audit logging must never break the request, so errors are only logged.
module.exports = async function audit(userId, action, entityType = null, entityId = null, details = null) {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
};
