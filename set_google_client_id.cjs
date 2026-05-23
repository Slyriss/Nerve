const Database = require('better-sqlite3');
const db = new Database('C:/Users/GOC/AppData/Roaming/@nerve/desktop/NerveData/nerve.sqlite');
const now = new Date().toISOString();
const clientId = '1092609867457-ops0dv1svm1k59no81q17tturn11kkb5.apps.googleusercontent.com';
const value = JSON.stringify(clientId);
db.prepare(
  "INSERT INTO settings (key, value, updated_at) VALUES ('googleClientId', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
).run(value, now);
const row = db.prepare("SELECT key, value FROM settings WHERE key = 'googleClientId'").get();
console.log('Saved successfully:', row);
db.close();
