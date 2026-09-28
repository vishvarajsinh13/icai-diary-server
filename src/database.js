const path = require('path');
const fs = require('fs');

let db;
try {
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/icai_server.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch(e) {
  console.error('DB init error:', e.message);
  process.exit(1);
}

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      registration_no TEXT,
      firm_name TEXT,
      city TEXT,
      status TEXT DEFAULT 'pending',
      role TEXT DEFAULT 'user',
      app_version TEXT,
      platform TEXT,
      first_login TEXT,
      last_login TEXT,
      last_active TEXT,
      login_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      release_notes TEXT,
      download_url TEXT NOT NULL,
      is_latest INTEGER DEFAULT 0,
      is_mandatory INTEGER DEFAULT 0,
      platform TEXT DEFAULT 'windows',
      file_size TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Create default admin if none exists
  const bcrypt = require('bcryptjs');
  const adminExists = db.prepare('SELECT id FROM admin_accounts WHERE username = ?').get('nakum_admin');
  if (!adminExists) {
    const defaultPass = process.env.ADMIN_PASSWORD || 'IcaiDiary@Admin2025';
    const hash = bcrypt.hashSync(defaultPass, 12);
    db.prepare('INSERT INTO admin_accounts (username, password_hash) VALUES (?, ?)').run('nakum_admin', hash);
    console.log('✅ Admin account created. Username: nakum_admin');
    console.log('🔑 Default password:', defaultPass);
    console.log('⚠️  Change this password in .env file!\n');
  }

  // Insert initial version record if none exists
  const versionExists = db.prepare('SELECT id FROM app_versions LIMIT 1').get();
  if (!versionExists) {
    db.prepare(`INSERT INTO app_versions (version, release_notes, download_url, is_latest, platform, file_size)
      VALUES (?, ?, ?, 1, 'windows', '85 MB')`).run(
      '1.0.0',
      'Initial release of ICAI CA Articleship Work Diary by Nakum Vishvarajsinh.\n- Daily Work Diary (Form 108)\n- Leave Register (Reg 59)\n- Stipend Register (Reg 48)\n- Excel & PDF Export\n- AI Work Log Generator',
      process.env.DOWNLOAD_URL || 'https://github.com/nakum-vishvarajsinh/icai-diary/releases/latest'
    );
  }

  console.log('✅ Database initialized');
}

module.exports = { db, initDB };
