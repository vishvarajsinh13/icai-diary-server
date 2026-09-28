const jwt = require('jsonwebtoken');
const { db } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'icai_diary_jwt_secret_nakum_2025_change_this';

function authenticateUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.status === 'banned') return res.status(403).json({ error: 'BANNED', message: 'Your access has been revoked by the administrator.' });
    if (user.status === 'pending') return res.status(403).json({ error: 'PENDING', message: 'Your account is pending approval. Please wait for admin approval.' });
    if (user.status === 'rejected') return res.status(403).json({ error: 'REJECTED', message: 'Your registration was rejected. Contact support.' });
    req.user = user;
    // Update last active
    db.prepare('UPDATE users SET last_active = datetime("now") WHERE id = ?').run(user.id);
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authenticateAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No admin token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.admin = decoded;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}

function logActivity(userId, action, details, req) {
  try {
    db.prepare('INSERT INTO activity_log (user_id, action, details, ip_address, user_agent) VALUES (?,?,?,?,?)')
      .run(userId, action, JSON.stringify(details)||'', req?.ip||'', req?.headers?.['user-agent']||'');
  } catch(e) {}
}

module.exports = { authenticateUser, authenticateAdmin, logActivity, JWT_SECRET };
