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
  tz: process.env.UNIVERSITY_TZ || 'Asia/Kolkata',
  storageDir: process.env.STORAGE_DIR || path.join(__dirname, '..', '..', 'storage'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  embedDimensions: Number(process.env.EMBED_DIMENSIONS || 768),
  ragTopK: Number(process.env.RAG_TOP_K || 5),
  // Vector matches below this cosine similarity are ignored (tune with your embedding model)
  // Share of the question's key terms a chunk must contain to count as a keyword match
  ragMinTermMatch: Number(process.env.RAG_MIN_TERM_MATCH || 0.6),
  ragMinSimilarity: Number(process.env.RAG_MIN_SIMILARITY || 0.6),
  chatRateLimit: Number(process.env.CHAT_RATE_LIMIT || 15),
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
