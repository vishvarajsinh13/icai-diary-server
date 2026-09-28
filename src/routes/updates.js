const express = require('express');
const { db } = require('../database');
const router = express.Router();

// Public endpoint — check for latest version (no auth needed)
router.get('/latest', (req, res) => {
  const latest = db.prepare('SELECT * FROM app_versions WHERE is_latest=1 ORDER BY id DESC LIMIT 1').get();
  if (!latest) return res.json({ version: '1.0.0', available: false });
  const clientVersion = req.query.v || '0.0.0';
  const updateAvailable = latest.version !== clientVersion && latest.version > clientVersion;
  res.json({
    currentVersion: clientVersion,
    latestVersion: latest.version,
    available: updateAvailable,
    mandatory: !!latest.is_mandatory,
    releaseNotes: latest.release_notes,
    downloadUrl: latest.download_url,
    fileSize: latest.file_size,
    platform: latest.platform,
    publishedAt: latest.created_at,
  });
});

// Get all versions history
router.get('/history', (req, res) => {
  const versions = db.prepare('SELECT version, release_notes, is_latest, is_mandatory, file_size, created_at FROM app_versions ORDER BY id DESC').all();
  res.json({ versions });
});

module.exports = router;
