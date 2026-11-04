// Runs every .sql file in ../db/migrations (in name order) against the configured database.
// Replaces Docker's auto-run. Safe to stop and fix: it refuses to run twice.
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  try {
    const done = await db.query("SELECT to_regclass('public.users') AS t");
    if (done.rows[0].t) { console.log('Tables already exist. Nothing to do.'); return; }
    for (const f of files) {
      console.log('Running', f, '...');
      await db.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    }
    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
