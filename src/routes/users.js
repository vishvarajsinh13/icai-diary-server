const express = require('express');
const { db } = require('../database');
const { authenticateUser, logActivity } = require('../middleware');
const router = express.Router();

// Get own profile
router.get('/profile', authenticateUser, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id, name: user.name, email: user.email,
    registrationNo: user.registration_no, firmName: user.firm_name,
    city: user.city, status: user.status, appVersion: user.app_version,
    firstLogin: user.first_login, lastLogin: user.last_login, loginCount: user.login_count,
  });
});

// Update own profile
router.put('/profile', authenticateUser, (req, res) => {
  const { name, registrationNo, firmName, city } = req.body;
  db.prepare('UPDATE users SET name=COALESCE(?,name), registration_no=COALESCE(?,registration_no), firm_name=COALESCE(?,firm_name), city=COALESCE(?,city), updated_at=datetime("now") WHERE id=?')
    .run(name||null, registrationNo||null, firmName||null, city||null, req.user.id);
  logActivity(req.user.id, 'PROFILE_UPDATE', { name, firmName, city }, req);
  res.json({ success: true, message: 'Profile updated' });
});

// Heartbeat — app pings this every 30 min to stay "active"
router.post('/heartbeat', authenticateUser, (req, res) => {
  const { appVersion, platform } = req.body;
  db.prepare('UPDATE users SET last_active=datetime("now"), app_version=COALESCE(?,app_version), platform=COALESCE(?,platform) WHERE id=?')
    .run(appVersion||null, platform||null, req.user.id);
  // Check if banned mid-session
  const fresh = db.prepare('SELECT status FROM users WHERE id=?').get(req.user.id);
  if (fresh.status === 'banned') return res.json({ ok: false, error: 'BANNED', message: 'Your access has been revoked.' });
  // Check for updates
  const latest = db.prepare('SELECT * FROM app_versions WHERE is_latest=1 ORDER BY id DESC LIMIT 1').get();
  const av = appVersion || req.user.app_version || '0';
  const upd = latest && latest.version !== av && latest.version > av;
  res.json({ ok: true, update: upd ? { available: true, version: latest.version, downloadUrl: latest.download_url, mandatory: !!latest.is_mandatory } : { available: false } });
});

module.exports = router;
