const { Database } = require("better-sqlite3");
const db = new Database("./sqlite.db");
console.log("=== USERS ===");
console.log(db.prepare("SELECT * FROM users").all());
console.log("=== SESSIONS ===");
console.log(db.prepare("SELECT * FROM sessions").all());
console.log("=== BUSES ===");
console.log(db.prepare("SELECT * FROM buses").all());
db.close();
