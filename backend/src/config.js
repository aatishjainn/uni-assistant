const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (check your .env file)`);
  return v;
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  aiUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  aiToken: required('AI_SERVICE_TOKEN'),
  // Either one DATABASE_URL (hosted DB such as Neon) or the separate DB_* values (local DB)
  db: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        database: required('DB_NAME'),
      },
};
