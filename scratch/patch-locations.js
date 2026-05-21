const Database = require('better-sqlite3');
const db = new Database('sqlite.db');

try {
  console.log('Adding distance_covered column...');
  db.prepare('ALTER TABLE bus_locations ADD COLUMN distance_covered REAL DEFAULT 0').run();
  console.log('Added distance_covered column.');
} catch (e) {
  if (e.message.includes('duplicate column name')) {
    console.log('distance_covered column already exists.');
  } else {
    console.error('Failed to add distance_covered column:', e.message);
  }
}

db.close();
console.log('Done.');
