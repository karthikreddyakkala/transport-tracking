const { neon } = require('@neondatabase/serverless');
require('dotenv').config();
const sql = neon(process.env.DATABASE_URL.replace('-pooler', ''));
sql`SELECT 1`.then(console.log).catch(console.error);
