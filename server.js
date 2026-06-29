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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    type        TEXT NOT NULL,
    color       TEXT NOT NULL,
    color_name  TEXT NOT NULL,
    plate_enc   TEXT,          -- AES-256-GCM encrypted plate
    plate_iv    TEXT,          -- IV for decryption (moderator only)
    plate_tag   TEXT,          -- Auth tag for GCM
    plate_hint  TEXT,          -- e.g. "B ··· 34" shown publicly
    street      TEXT,
    notes       TEXT,
    status      TEXT DEFAULT 'pending',
    confidence  INTEGER DEFAULT 12,
    confirmations INTEGER DEFAULT 1,
    days        INTEGER DEFAULT 0,
    first_seen  TEXT DEFAULT (datetime('now')),
    last_seen   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS observations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER REFERENCES vehicles(id),
    lat         REAL,
    lng         REAL,
    session_id  TEXT,          -- anonymous session token
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

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
    days: daysSince(v.first_seen),
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
    const { lat, lng, type, color, colorName, plate, street, notes, sessionId } = req.body;

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
        (lat, lng, type, color, color_name, plate_enc, plate_iv, plate_tag, plate_hint, street, notes, status, confidence, confirmations, first_seen, last_seen)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 12, 1, datetime('now'), datetime('now'))
    `).run(lat, lng, type, color, colorName || '', enc, iv, tag, hint, street || '', notes || '');

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
