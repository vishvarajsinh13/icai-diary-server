require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB, db } = require('./database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const updateRoutes = require('./routes/updates');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Too many requests' } }));
app.use('/api', rateLimit({ windowMs: 60*1000, max: 200 }));

app.use(express.static(path.join(__dirname,'../public')));
app.use('/admin', express.static(path.join(__dirname,'../admin')));

app.use('/api/auth',    authRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/user',    userRoutes);

app.get('/api/health', (req, res) => {
  try {
    const stats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status="approved" THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN status="pending" THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status="banned" THEN 1 ELSE 0 END) as banned FROM users').get();
    res.json({ status: 'online', serverVersion: process.env.APP_VERSION||'1.0.0', timestamp: new Date().toISOString(), users: stats });
  } catch(e) { res.json({ status: 'online', timestamp: new Date().toISOString() }); }
});

app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname,'../admin/index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname,'../public/index.html')));

initDB();
app.listen(PORT, () => {
  console.log(`\n🚀 ICAI Diary Server on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`🌐 Site: http://localhost:${PORT}\n`);
});
