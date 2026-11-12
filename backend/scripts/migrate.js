// Applies every .sql file in ../db/migrations that has not been applied yet (in name order).
// Safe to run any time:  npm run migrate
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await db.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

    // A database created before this tracking existed (e.g. by Docker) already has the first migration.
    const hasUsers = (await client.query("SELECT to_regclass('public.users') AS t")).rows[0].t;
    if (hasUsers && !applied.has(files[0])) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [files[0]]);
      applied.add(files[0]);
    }

    let ran = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      console.log('Running', f, '...');
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        ran++;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    console.log(ran ? `Migration complete (${ran} file${ran > 1 ? 's' : ''}).` : 'Database is up to date. Nothing to do.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
})();
