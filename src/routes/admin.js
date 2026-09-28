const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database');
const { authenticateAdmin, logActivity, JWT_SECRET } = require('../middleware');
const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_accounts WHERE username=?').get(username);
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, username: admin.username });
});

// ── All routes below require admin auth ───────────────────────────────────

// Dashboard stats
router.get('/stats', authenticateAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status="approved" THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN status="pending" THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status="banned" THEN 1 ELSE 0 END) as banned, SUM(CASE WHEN status="rejected" THEN 1 ELSE 0 END) as rejected FROM users').get();
  const recent = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20').all();
  const todayLogins = db.prepare("SELECT COUNT(*) as c FROM activity_log WHERE action='LOGIN' AND date(created_at)=date('now')").get();
  const activeWeek = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at >= datetime('now','-7 days')").get();
  const versions = db.prepare('SELECT * FROM app_versions ORDER BY id DESC').all();
  res.json({ users, recent, todayLogins: todayLogins.c, activeThisWeek: activeWeek.c, versions });
});

// Get all users
router.get('/users', authenticateAdmin, (req, res) => {
  const { status, search, page=1, limit=50 } = req.query;
  let query = 'SELECT * FROM users';
  const params = [];
  const conditions = [];
  if (status && status !== 'all') { conditions.push('status=?'); params.push(status); }
  if (search) { conditions.push('(name LIKE ? OR email LIKE ? OR registration_no LIKE ? OR firm_name LIKE ?)'); const s=`%${search}%`; params.push(s,s,s,s); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
  const users = db.prepare(query).all(...params);
  const countQ = 'SELECT COUNT(*) as c FROM users' + (conditions.length ? ' WHERE '+conditions.join(' AND ') : '');
  const { c } = db.prepare(countQ).get(...params.slice(0,-2));
  res.json({ users, total: c, page: parseInt(page), pages: Math.ceil(c/parseInt(limit)) });
});

// Get single user
router.get('/users/:id', authenticateAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const logs = db.prepare('SELECT * FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ user, activityLogs: logs });
});

// Update user status (approve/ban/reject/pending)
router.patch('/users/:id/status', authenticateAdmin, (req, res) => {
  const { status, notes } = req.body;
  if (!['approved','pending','banned','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE users SET status=?, notes=COALESCE(?,notes), updated_at=datetime("now") WHERE id=?').run(status, notes||null, req.params.id);
  logActivity(req.params.id, `ADMIN_STATUS_CHANGE`, { status, notes, adminUser: req.admin.username }, req);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  res.json({ success: true, user });
});

// Bulk approve/ban
router.patch('/users/bulk/status', authenticateAdmin, (req, res) => {
  const { ids, status } = req.body;
  if (!ids?.length || !['approved','banned','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid request' });
  const stmt = db.prepare('UPDATE users SET status=?, updated_at=datetime("now") WHERE id=?');
  const update = db.transaction((ids) => { ids.forEach(id => stmt.run(status, id)); });
  update(ids);
  res.json({ success: true, updated: ids.length });
});

// Delete user
router.delete('/users/:id', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM activity_log WHERE user_id=?').run(req.params.id);
  res.json({ success: true });
});

// Add notes to user
router.patch('/users/:id/notes', authenticateAdmin, (req, res) => {
  db.prepare('UPDATE users SET notes=?, updated_at=datetime("now") WHERE id=?').run(req.body.notes||'', req.params.id);
  res.json({ success: true });
});

// ── Version management ─────────────────────────────────────────────────────

// Add new version
router.post('/versions', authenticateAdmin, (req, res) => {
  const { version, releaseNotes, downloadUrl, isMandatory, platform, fileSize } = req.body;
  if (!version || !downloadUrl) return res.status(400).json({ error: 'Version and download URL required' });
  // Mark all others as not latest
  db.prepare('UPDATE app_versions SET is_latest=0').run();
  db.prepare('INSERT INTO app_versions (version,release_notes,download_url,is_latest,is_mandatory,platform,file_size) VALUES (?,?,?,1,?,?,?)')
    .run(version, releaseNotes||'', downloadUrl, isMandatory?1:0, platform||'windows', fileSize||'');
  res.json({ success: true, message: `Version ${version} published. All users will be notified on next app start.` });
});

// Update version
router.put('/versions/:id', authenticateAdmin, (req, res) => {
  const { releaseNotes, downloadUrl, isLatest, isMandatory, fileSize } = req.body;
  if (isLatest) db.prepare('UPDATE app_versions SET is_latest=0').run();
  db.prepare('UPDATE app_versions SET release_notes=?,download_url=?,is_latest=?,is_mandatory=?,file_size=? WHERE id=?')
    .run(releaseNotes||'', downloadUrl||'', isLatest?1:0, isMandatory?1:0, fileSize||'', req.params.id);
  res.json({ success: true });
});

// Delete version
router.delete('/versions/:id', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM app_versions WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Activity logs
router.get('/logs', authenticateAdmin, (req, res) => {
  const { userId, action, page=1, limit=100 } = req.query;
  let q = 'SELECT l.*, u.name, u.email FROM activity_log l LEFT JOIN users u ON l.user_id=u.id';
  const params = [];
  const conds = [];
  if (userId) { conds.push('l.user_id=?'); params.push(userId); }
  if (action) { conds.push('l.action=?'); params.push(action); }
  if (conds.length) q += ' WHERE '+conds.join(' AND ');
  q += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
  res.json({ logs: db.prepare(q).all(...params) });
});

// Change admin password
router.post('/change-password', authenticateAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE admin_accounts SET password_hash=? WHERE username=?').run(hash, req.admin.username);
  res.json({ success: true, message: 'Admin password updated' });
});

module.exports = router;
