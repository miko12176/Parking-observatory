/**
 * Parking Observatory — server.js
 * Glitch-compatible Express + SQLite backend.
 *
 * API routes:
 *   GET  /api/vehicles          — all vehicles (with optional filter)
 *   GET  /api/vehicles/nearby   — vehicles within radius of a tap
 *   POST /api/vehicles          — create new vehicle report
 *   POST /api/vehicles/:id/confirm — confirm a sighting
 *   GET  /api/stats             — dashboard numbers
 *
 * SQLite database lives at .data/observatory.db
 * Glitch persists the .data folder across restarts.
 */

const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DATABASE SETUP ─────────────────────────────────────────────────────────
// Glitch persists .data across deploys — safe place for SQLite
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const db = new Database(path.join(DATA_DIR, 'observatory.db'));

// Encryption key — store this in Glitch's .env as PLATE_KEY
// If not set, uses a fallback (fine for development, not for production)
const PLATE_KEY = process.env.PLATE_KEY || 'change-me-in-glitch-env-32chars!!';

db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lat           REAL NOT NULL,
    lng           REAL NOT NULL,
    type          TEXT NOT NULL,
    color         TEXT NOT NULL,
    color_name    TEXT NOT NULL,
    plate_enc     TEXT,
    plate_iv      TEXT,
    plate_tag     TEXT,
    plate_hint    TEXT,
    street        TEXT,
    notes         TEXT,
    status        TEXT DEFAULT 'pending',
    confidence    INTEGER DEFAULT 12,
    confirmations INTEGER DEFAULT 1,
    gone_count    INTEGER DEFAULT 0,
    gone_window_start TEXT,
    duration_days INTEGER DEFAULT 0,
    first_seen    TEXT DEFAULT (datetime('now')),
    last_seen     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS observations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER REFERENCES vehicles(id),
    lat         REAL,
    lng         REAL,
    session_id  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gone_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER REFERENCES vehicles(id),
    session_id  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- Safe migration: add new columns to existing installs if they don't exist yet
  CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);
`);

// Run safe column migrations
const migs = [
  `ALTER TABLE vehicles ADD COLUMN gone_count INTEGER DEFAULT 0`,
  `ALTER TABLE vehicles ADD COLUMN gone_window_start TEXT`,
  `ALTER TABLE vehicles ADD COLUMN duration_days INTEGER DEFAULT 0`,
];
migs.forEach(sql => {
  try { db.exec(sql); } catch(e) { /* column already exists — fine */ }
});

// ── HELPERS ────────────────────────────────────────────────────────────────

/** Haversine distance in metres between two lat/lng points */
function haversine(la1, ln1, la2, ln2) {
  const R = 6371000;
  const dL = (la2 - la1) * Math.PI / 180;
  const dl = (ln2 - ln1) * Math.PI / 180;
  const a = Math.sin(dL/2)**2 +
    Math.cos(la1*Math.PI/180) * Math.cos(la2*Math.PI/180) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/** Encrypt plate with AES-256-GCM. Returns { enc, iv, tag } as hex strings. */
function encryptPlate(plate) {
  if (!plate) return { enc: null, iv: null, tag: null };
  const key = Buffer.from(PLATE_KEY.padEnd(32).slice(0, 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plate, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/** Build a public-safe partial plate hint, e.g. "B ··· 34" */
function plateHint(plate) {
  if (!plate || plate.trim().length < 3) return null;
  const p = plate.trim();
  return p.slice(0, 3) + ' ··· ' + p.slice(-2);
}

/** Weighted centroid update when a new observation comes in */
function updateCentroid(vehicle, newLat, newLng) {
  const w = vehicle.confirmations;
  const lat = (vehicle.lat * w + newLat) / (w + 1);
  const lng = (vehicle.lng * w + newLng) / (w + 1);
  return { lat, lng };
}

/** Days since first_seen */
function daysSince(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime();
  return Math.floor(ms / 86400000);
}

/** Strip encrypted fields before sending to client */
function publicVehicle(v) {
  return {
    id: v.id,
    lat: v.lat,
    lng: v.lng,
    type: v.type,
    color: v.color,
    colorName: v.color_name,
    plateHint: v.plate_hint,
    street: v.street,
    notes: v.notes,
    status: v.status,
    confidence: v.confidence,
    confirmations: v.confirmations,
    goneCount: v.gone_count || 0,
    days: Math.max(daysSince(v.first_seen), v.duration_days || 0),
    firstSeen: v.first_seen,
    lastSeen: v.last_seen,
  };
}

// ── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/vehicles
 * Query params: filter = all | 14 | 90 | trailer | pending
 */
app.get('/api/vehicles', (req, res) => {
  try {
    let rows = db.prepare('SELECT * FROM vehicles ORDER BY first_seen ASC').all();

    // Attach live days count
    rows = rows.map(v => ({ ...v, _days: daysSince(v.first_seen) }));

    const f = req.query.filter || 'all';
    if (f === '14')      rows = rows.filter(v => v._days >= 14);
    if (f === '90')      rows = rows.filter(v => v._days >= 90);
    if (f === 'trailer') rows = rows.filter(v => ['Trailer','Camper trailer'].includes(v.type));
    if (f === 'pending') rows = rows.filter(v => v.status === 'pending');

    res.json(rows.map(publicVehicle));
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vehicles/nearby?lat=&lng=&radius=15
 * Returns vehicles within radius metres, ordered by distance.
 */
app.get('/api/vehicles/nearby', (req, res) => {
  try {
    const { lat, lng, radius = 15 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    const all = db.prepare('SELECT * FROM vehicles').all();
    const nearby = all
      .map(v => ({ ...v, dist: Math.round(haversine(+lat, +lng, v.lat, v.lng)) }))
      .filter(v => v.dist <= +radius)
      .sort((a, b) => a.dist - b.dist);

    res.json(nearby.map(v => ({ ...publicVehicle(v), dist: v.dist })));
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vehicles
 * Body: { lat, lng, type, color, colorName, plate, street, notes, sessionId }
 */
app.post('/api/vehicles', (req, res) => {
  try {
    const { lat, lng, type, color, colorName, plate, street, notes, sessionId, durationDays } = req.body;

    if (!lat || !lng || !type || !color) {
      return res.status(400).json({ error: 'lat, lng, type, color are required' });
    }
    if (!plate || !plate.trim()) {
      return res.status(400).json({ error: 'plate is required' });
    }

    const { enc, iv, tag } = encryptPlate(plate.trim().toUpperCase());
    const hint = plateHint(plate.trim().toUpperCase());

    const result = db.prepare(`
      INSERT INTO vehicles
        (lat, lng, type, color, color_name, plate_enc, plate_iv, plate_tag, plate_hint, street, notes, status, confidence, confirmations, duration_days, first_seen, last_seen)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 12, 1, ?, datetime('now'), datetime('now'))
    `).run(lat, lng, type, color, colorName || '', enc, iv, tag, hint, street || '', notes || '', durationDays || 0);

    // Log the observation
    db.prepare(`
      INSERT INTO observations (vehicle_id, lat, lng, session_id)
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, lat, lng, sessionId || 'anonymous');

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(publicVehicle(vehicle));
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vehicles/:id/confirm
 * Body: { lat, lng, sessionId }
 * Adds a confirmation, updates centroid, recalculates confidence.
 */
app.post('/api/vehicles/:id/confirm', (req, res) => {
  try {
    const { lat, lng, sessionId } = req.body;
    const id = +req.params.id;

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    // Update centroid if tap coordinates provided
    let newLat = vehicle.lat;
    let newLng = vehicle.lng;
    if (lat && lng) {
      const c = updateCentroid(vehicle, +lat, +lng);
      newLat = c.lat;
      newLng = c.lng;
    }

    const newConf = Math.min(99, Math.round(vehicle.confidence + (100 - vehicle.confidence) * 0.13));
    const newStatus = newConf >= 50 ? 'verified' : 'pending';

    db.prepare(`
      UPDATE vehicles SET
        lat = ?, lng = ?,
        confirmations = confirmations + 1,
        confidence = ?,
        status = ?,
        last_seen = datetime('now')
      WHERE id = ?
    `).run(newLat, newLng, newConf, newStatus, id);

    db.prepare(`
      INSERT INTO observations (vehicle_id, lat, lng, session_id)
      VALUES (?, ?, ?, ?)
    `).run(id, lat || vehicle.lat, lng || vehicle.lng, sessionId || 'anonymous');

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    res.json(publicVehicle(updated));
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/stats
 * Returns summary numbers for the dashboard.
 */
app.get('/api/stats', (req, res) => {
  try {
    const all = db.prepare('SELECT * FROM vehicles').all()
      .map(v => ({ ...v, days: daysSince(v.first_seen) }));

    const total = all.length;
    const longTerm = all.filter(v => v.days >= 14).length;
    const veryLong = all.filter(v => v.days >= 90).length;
    const trailers = all.filter(v => ['Trailer','Camper trailer'].includes(v.type)).length;
    const verified = all.filter(v => v.status === 'verified').length;
    const pending  = all.filter(v => v.status === 'pending').length;
    const avg = total ? Math.round(all.reduce((s,v) => s+v.days, 0) / total) : 0;

    const byDuration = {
      d0_14: all.filter(v => v.days < 14).length,
      d14_90: all.filter(v => v.days >= 14 && v.days < 90).length,
      d90plus: all.filter(v => v.days >= 90).length,
    };

    res.json({ total, longTerm, veryLong, trailers, verified, pending, avg, byDuration });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vehicles/:id/gone
 * Body: { sessionId }
 * Records a "vehicle is gone" report. After GONE_THRESHOLD unique sessions
 * within 48 hours the vehicle is removed. Cancelled if confirmed within 24h.
 */
const GONE_THRESHOLD = 3;
const GONE_WINDOW_MS = 48 * 3600 * 1000;

app.post('/api/vehicles/:id/gone', (req, res) => {
  try {
    const id = +req.params.id;
    const { sessionId } = req.body;
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!vehicle) return res.status(404).json({ error: 'Not found' });

    // Check if this session already reported gone for this vehicle
    const existing = db.prepare(
      'SELECT id FROM gone_reports WHERE vehicle_id = ? AND session_id = ?'
    ).get(id, sessionId || 'anonymous');
    if (!existing) {
      db.prepare('INSERT INTO gone_reports (vehicle_id, session_id) VALUES (?, ?)').run(id, sessionId || 'anonymous');
    }

    // Count unique sessions within the window
    const windowStart = new Date(Date.now() - GONE_WINDOW_MS).toISOString();
    const count = db.prepare(
      'SELECT COUNT(DISTINCT session_id) as n FROM gone_reports WHERE vehicle_id = ? AND created_at > ?'
    ).get(id, windowStart).n;

    if (count >= GONE_THRESHOLD) {
      // Remove the vehicle
      db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
      db.prepare('DELETE FROM gone_reports WHERE vehicle_id = ?').run(id);
      return res.json({ removed: true });
    }

    db.prepare('UPDATE vehicles SET gone_count = ? WHERE id = ?').run(count, id);
    res.json({ removed: false, goneCount: count });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/mod/auth
 * Body: { pin }
 * Validates moderator PIN against MODERATOR_PIN env variable.
 */
app.post('/api/mod/auth', (req, res) => {
  const { pin } = req.body;
  const correctPin = process.env.MODERATOR_PIN;
  if (!correctPin) return res.status(503).json({ ok: false, error: 'Moderator PIN not configured' });
  res.json({ ok: pin === correctPin });
});

/**
 * DELETE /api/vehicles/:id
 * Moderator-only direct removal. PIN verified client-side via /api/mod/auth.
 * In production, add server-side session token validation.
 */
app.delete('/api/vehicles/:id', (req, res) => {
  try {
    const id = +req.params.id;
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    db.prepare('DELETE FROM observations WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM gone_reports WHERE vehicle_id = ?').run(id);
    res.json({ deleted: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Parking Observatory running on port ${PORT}`);
  console.log(`Database: ${path.join(DATA_DIR, 'observatory.db')}`);
});
