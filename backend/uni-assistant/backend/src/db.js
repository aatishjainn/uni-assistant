const { Pool } = require('pg');
const { db } = require('./config');
module.exports = new Pool({ ...db, max: 10 });
