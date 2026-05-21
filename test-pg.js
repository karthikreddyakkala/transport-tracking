const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function test() {
  try {
    await client.connect();
    const res = await client.query('SELECT 1 as val');
    console.log('PG connected. Result:', res.rows[0].val);
  } catch (err) {
    console.error('PG connect error:', err);
  } finally {
    await client.end();
  }
}

test();
