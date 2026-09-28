const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { logActivity, JWT_SECRET } = require('../middleware');
const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  const { name, email, password, registrationNo, firmName, city, appVersion, platform } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id,name,email,password_hash,registration_no,firm_name,city,status,app_version,platform,first_login,created_at)
    VALUES (?,?,?,?,?,?,?,'pending',?,?,datetime('now'),datetime('now'))`
  ).run(id, name.trim(), email.toLowerCase().trim(), hash, registrationNo||'', firmName||'', city||'', appVersion||'', platform||'windows');
  logActivity(id, 'REGISTER', { name, email, appVersion }, req);
  res.json({ success: true, message: 'Registration submitted! Please wait for admin approval. You will be notified when approved.' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, appVersion, platform } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'banned') return res.status(403).json({ error: 'BANNED', message: 'Your access has been revoked. Contact support.' });
  if (user.status === 'pending') return res.status(403).json({ error: 'PENDING', message: 'Your account is pending admin approval. Please wait.' });
  if (user.status === 'rejected') return res.status(403).json({ error: 'REJECTED', message: 'Your registration was not approved. Contact support.' });

  // Update last login
  db.prepare('UPDATE users SET last_login=datetime("now"), last_active=datetime("now"), login_count=login_count+1, app_version=?, platform=?, updated_at=datetime("now") WHERE id=?')
    .run(appVersion||user.app_version, platform||user.platform, user.id);

  const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
  logActivity(user.id, 'LOGIN', { appVersion }, req);

  // Check for updates
  const latest = db.prepare('SELECT * FROM app_versions WHERE is_latest=1 ORDER BY id DESC LIMIT 1').get();
  const updateAvailable = latest && latest.version !== (appVersion||'0.0.0') && latest.version > (appVersion||'0.0.0');

  res.json({
    success: true, token,
    user: { id: user.id, name: user.name, email: user.email, registrationNo: user.registration_no, firmName: user.firm_name, city: user.city, status: user.status },
    update: updateAvailable ? { available: true, version: latest.version, releaseNotes: latest.release_notes, downloadUrl: latest.download_url, mandatory: !!latest.is_mandatory } : { available: false }
  });
});

// Verify token (check status on app start)
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  if (!token) return res.json({ valid: false });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(d.id);
    if (!user) return res.json({ valid: false });
    if (user.status === 'banned') return res.json({ valid: false, error: 'BANNED', message: 'Your access has been revoked.' });
    db.prepare('UPDATE users SET last_active=datetime("now") WHERE id=?').run(user.id);
    const latest = db.prepare('SELECT * FROM app_versions WHERE is_latest=1 ORDER BY id DESC LIMIT 1').get();
    const appVer = req.query.v || user.app_version || '0';
    const updateAvailable = latest && latest.version !== appVer && latest.version > appVer;
    res.json({
      valid: true,
      user: { id: user.id, name: user.name, email: user.email, status: user.status },
      update: updateAvailable ? { available: true, version: latest.version, releaseNotes: latest.release_notes, downloadUrl: latest.download_url, mandatory: !!latest.is_mandatory } : { available: false }
    });
  } catch(e) { res.json({ valid: false }); }
});

// Change password
router.post('/change-password', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  const { oldPassword, newPassword } = req.body;
  if (!token || !oldPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(d.id);
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Old password incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password_hash=?, updated_at=datetime("now") WHERE id=?').run(hash, user.id);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
});

module.exports = router;
