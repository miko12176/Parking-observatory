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
const multer = require('multer');
const exifr = require('exifr');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DATABASE SETUP ─────────────────────────────────────────────────────────
// Use /data as the persistent directory — Railway volumes mounted here persist reliably.
// Fall back to /app/.data if /data is not available (local development).
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory at ${DATA_DIR}`);
}

const DB_PATH = path.join(DATA_DIR, 'observatory.db');
console.log(`Data directory: ${DATA_DIR}`);
console.log(`Opening database at: ${DB_PATH}`);
console.log(`Database file exists: ${fs.existsSync(DB_PATH)}`);
if (fs.existsSync(DB_PATH)) {
  const stat = fs.statSync(DB_PATH);
  console.log(`Database size: ${stat.size} bytes`);
}

const db = new Database(DB_PATH);

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
  `ALTER TABLE vehicles ADD COLUMN source TEXT DEFAULT 'resident'`,
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
  const daysSinceFirst = daysSince(v.first_seen);
  const effectiveDays = Math.max(daysSinceFirst, v.duration_days || 0);

  // Compute estimated parked-since date
  let parkedSinceDate = null;
  if (effectiveDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() - effectiveDays);
    parkedSinceDate = d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

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
    days: effectiveDays,
    parkedSinceDate,
    firstSeen: v.first_seen,
    lastSeen: v.last_seen,
    source: v.source || 'resident',
  };
}

/** Reverse geocode coordinates to street name using Nominatim (free, no key needed) */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ParkingObservatory/1.0 (neighborhood-parking-app)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    // Return the most specific road name available
    return addr.road || addr.pedestrian || addr.path || addr.footway || addr.cycleway || null;
  } catch(e) {
    console.error('Geocode error:', e.message);
    return null;
  }
}

// ── MODERATOR AUTH (TOKEN-BASED) ──────────────────────────────────────────
// /api/mod/auth issues a short-lived token after a correct PIN. Every mod-only
// route below requires that token server-side via requireMod — the PIN screen
// in the frontend is a UI convenience, not the actual access control.
const MOD_TOKEN_TTL_MS = 6 * 3600 * 1000; // 6 hours
const modTokens = new Map(); // token -> expiresAt

function issueModToken() {
  const token = crypto.randomBytes(24).toString('hex');
  modTokens.set(token, Date.now() + MOD_TOKEN_TTL_MS);
  return token;
}

function isValidModToken(token) {
  if (!token) return false;
  const expiresAt = modTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { modTokens.delete(token); return false; }
  return true;
}

// Periodic cleanup of expired tokens so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of modTokens.entries()) {
    if (now > expiresAt) modTokens.delete(token);
  }
}, 30 * 60 * 1000);

/** Express middleware: requires a valid moderator token in the Authorization header. */
function requireMod(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!isValidModToken(token)) {
    return res.status(401).json({ error: 'Moderator authentication required' });
  }
  next();
}

// ── SURVEYOR MODE (in-memory draft store) ─────────────────────────────────
// Raw photo bytes never touch disk. A photo lives in memory, attached to its
// draft, only for the duration of the moderator's review — it is deleted the
// moment that draft is approved or rejected, and a sweep also purges
// abandoned drafts (and their photos) after DRAFT_TTL_MS. Nothing here
// persists across a server restart by design: a draft is not data until a
// human approves it into the real vehicles table.
const surveyorDrafts = new Map(); // draftId -> draft object
const DRAFT_TTL_MS = 2 * 3600 * 1000; // 2 hours — abandoned drafts get swept

setInterval(() => {
  const now = Date.now();
  for (const [id, draft] of surveyorDrafts.entries()) {
    if (now - draft.createdAt > DRAFT_TTL_MS) surveyorDrafts.delete(id);
  }
}, 15 * 60 * 1000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // one photo per request — see surveyor.html for why
});

/** Run a buffer through Plate Recognizer's Snapshot API. Returns { plate, score } or null. */
async function ocrPlate(buffer, filename) {
  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) {
    console.log('OCR: PLATE_RECOGNIZER_TOKEN not configured — skipping');
    return null;
  }
  try {
    const form = new FormData();
    form.append('upload', new Blob([buffer], { type: 'image/jpeg' }), filename || 'photo.jpg');
    form.append('regions', 'de');
    const res = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      body: form,
    });
    const rawBody = await res.text();
    if (!res.ok) {
      console.error(`OCR API error: HTTP ${res.status} — ${rawBody}`);
      return null;
    }
    let data;
    try { data = JSON.parse(rawBody); } catch(e) {
      console.error('OCR: could not parse response:', rawBody);
      return null;
    }
    const best = (data.results || [])[0];
    if (!best) {
      console.log('OCR: no plate detected in this image');
      return null;
    }
    console.log(`OCR: plate "${best.plate}" at score ${best.score}`);
    return { plate: (best.plate || '').toUpperCase(), score: best.score || 0 };
  } catch(e) {
    console.error('OCR request failed:', e.message);
    return null;
  }
}

// ── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/vehicles
 * Query params: filter = all | 14 | 90 | trailer | pending
 */
app.get('/api/vehicles', (req, res) => {
  try {
    let rows = db.prepare('SELECT * FROM vehicles ORDER BY first_seen ASC').all();

    // Compute effective days (max of actual elapsed vs reporter-supplied)
    rows = rows.map(v => ({
      ...v,
      _days: Math.max(daysSince(v.first_seen), v.duration_days || 0)
    }));

    const f = req.query.filter || 'all';
    if (f === '14')      rows = rows.filter(v => v._days >= 14);
    if (f === '90')      rows = rows.filter(v => v._days >= 90);
    if (f === 'trailer') rows = rows.filter(v => v.type === 'Cargo trailer' || v.type === 'Camper trailer');
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
app.post('/api/vehicles', async (req, res) => {
  try {
    const { lat, lng, type, color, colorName, plate, street, notes, sessionId, durationDays } = req.body;

    if (!lat || !lng || !type || !color) {
      return res.status(400).json({ error: 'lat, lng, type, color are required' });
    }
    if (!plate || !plate.trim()) {
      return res.status(400).json({ error: 'plate is required' });
    }

    // Reverse geocode to get actual street name
    const geocodedStreet = await reverseGeocode(lat, lng);
    const streetName = geocodedStreet || street || 'Unknown street';

    const { enc, iv, tag } = encryptPlate(plate.trim().toUpperCase());
    const hint = plateHint(plate.trim().toUpperCase());

    const result = db.prepare(`
      INSERT INTO vehicles
        (lat, lng, type, color, color_name, plate_enc, plate_iv, plate_tag, plate_hint,
         street, notes, status, confidence, confirmations, duration_days, first_seen, last_seen)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 12, 1, ?, datetime('now'), datetime('now'))
    `).run(lat, lng, type, color, colorName || '', enc, iv, tag, hint, streetName, notes || '', durationDays || 0);

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
      .map(v => ({
        ...v,
        // Use the greater of actual days since first_seen vs reporter-supplied duration
        days: Math.max(daysSince(v.first_seen), v.duration_days || 0)
      }));

    const total = all.length;
    const longTerm = all.filter(v => v.days >= 14).length;
    const veryLong = all.filter(v => v.days >= 90).length;
    const trailers = all.filter(v => v.type === 'Cargo trailer' || v.type === 'Camper trailer').length;
    const verified = all.filter(v => v.status === 'verified').length;
    const pending  = all.filter(v => v.status === 'pending').length;
    const avg = total ? Math.round(all.reduce((s,v) => s + v.days, 0) / total) : 0;

    const byDuration = {
      d0_14:  all.filter(v => v.days < 14).length,
      d14_90: all.filter(v => v.days >= 14 && v.days < 90).length,
      d90plus: all.filter(v => v.days >= 90).length,
    };

    res.json({ total, longTerm, veryLong, trailers, verified, pending, avg, byDuration });
  } catch(e) {
    console.error('Stats error:', e);
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
 * On success, issues a short-lived token that gates all mod-only routes.
 */
app.post('/api/mod/auth', (req, res) => {
  const { pin } = req.body;
  const correctPin = process.env.MODERATOR_PIN;
  if (!correctPin) {
    console.log('MOD AUTH: MODERATOR_PIN environment variable is not set');
    return res.status(503).json({ ok: false, error: 'Moderator PIN not configured' });
  }
  const match = (pin || '').trim() === correctPin.trim();
  console.log(`MOD AUTH: attempt received, match: ${match}`);
  if (!match) return res.json({ ok: false });
  res.json({ ok: true, token: issueModToken(), expiresInMs: MOD_TOKEN_TTL_MS });
});

/**
 * DELETE /api/vehicles/:id
 * Moderator-only direct removal. Requires a valid mod token (see requireMod).
 */
app.delete('/api/vehicles/:id', requireMod, (req, res) => {
  try {
    const id = +req.params.id;
    db.prepare('DELETE FROM observations WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM gone_reports WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    res.json({ deleted: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── SURVEYOR MODE ROUTES (all moderator-only) ─────────────────────────────

/**
 * POST /api/surveyor/upload
 * Multipart form, single field "photo". Requires mod token.
 * Extracts EXIF GPS, runs plate OCR, returns a draft (also stored server-side
 * in memory, including the photo as a data URL so the moderator can glance at
 * it while correcting OCR). The photo is never written to disk, and is purged
 * from memory the moment this draft is approved or rejected (or swept after
 * DRAFT_TTL_MS if abandoned).
 */
app.post('/api/surveyor/upload', requireMod, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const buffer = req.file.buffer;
    const mimeType = req.file.mimetype || 'image/jpeg';

    // EXIF GPS extraction — best-effort, many phone photos won't have it
    // if location services were off for the camera app.
    let lat = null, lng = null;
    try {
      const gps = await exifr.gps(buffer);
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        lat = gps.latitude;
        lng = gps.longitude;
      }
    } catch(e) {
      console.log('EXIF extraction failed for this photo:', e.message);
    }

    // Plate OCR — best-effort, returns null on failure/no plate found
    const ocr = await ocrPlate(buffer, req.file.originalname);

    let street = null;
    if (lat && lng) street = await reverseGeocode(lat, lng);

    const draftId = crypto.randomBytes(8).toString('hex');
    const draft = {
      id: draftId,
      createdAt: Date.now(),
      lat, lng,
      street,
      ocrPlate: ocr ? ocr.plate : null,
      ocrScore: ocr ? ocr.score : null,
      hasGps: lat !== null && lng !== null,
      hasPlate: !!(ocr && ocr.plate),
      photoDataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    };
    surveyorDrafts.set(draftId, draft);

    res.status(201).json(draft);
  } catch(e) {
    console.error('Surveyor upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/surveyor/drafts
 * Returns all pending drafts for the current review session.
 */
app.get('/api/surveyor/drafts', requireMod, (req, res) => {
  res.json([...surveyorDrafts.values()].sort((a, b) => a.createdAt - b.createdAt));
});

/**
 * POST /api/surveyor/drafts/:id/approve
 * Body: { lat, lng, type, color, colorName, plate, durationDays }
 * Moderator-confirmed values (may differ from OCR/EXIF originals if corrected).
 * Creates a real vehicle row using the same encryption/schema path as
 * resident reports, tagged source='survey' and starting pre-verified since
 * a human moderator reviewed the photo directly.
 */
app.post('/api/surveyor/drafts/:id/approve', requireMod, async (req, res) => {
  try {
    const draft = surveyorDrafts.get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found or already processed' });

    const { lat, lng, type, color, colorName, plate, durationDays } = req.body;
    if (!lat || !lng || !type || !color) {
      return res.status(400).json({ error: 'lat, lng, type, color are required' });
    }
    if (!plate || !plate.trim()) {
      return res.status(400).json({ error: 'plate is required' });
    }

    const geocodedStreet = await reverseGeocode(lat, lng);
    const streetName = geocodedStreet || draft.street || 'Unknown street';

    const { enc, iv, tag } = encryptPlate(plate.trim().toUpperCase());
    const hint = plateHint(plate.trim().toUpperCase());

    const result = db.prepare(`
      INSERT INTO vehicles
        (lat, lng, type, color, color_name, plate_enc, plate_iv, plate_tag, plate_hint,
         street, notes, status, confidence, confirmations, duration_days, source, first_seen, last_seen)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 60, 1, ?, 'survey', datetime('now'), datetime('now'))
    `).run(lat, lng, type, color, colorName || '', enc, iv, tag, hint, streetName, '', durationDays || 0);

    db.prepare(`
      INSERT INTO observations (vehicle_id, lat, lng, session_id)
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, lat, lng, 'surveyor');

    surveyorDrafts.delete(req.params.id);

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(publicVehicle(vehicle));
  } catch(e) {
    console.error('Draft approval error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/surveyor/drafts/:id/reject
 * Discards a draft without creating a vehicle record.
 */
app.post('/api/surveyor/drafts/:id/reject', requireMod, (req, res) => {
  const existed = surveyorDrafts.delete(req.params.id);
  res.json({ deleted: existed });
});

/**
 * GET /api/mod/ocr-status
 * Mod-only diagnostic endpoint. Checks whether PLATE_RECOGNIZER_TOKEN is set
 * and makes a minimal test call to the Plate Recognizer API to confirm the
 * token is valid and the service is reachable. Does not process any image.
 */
app.get('/api/mod/ocr-status', requireMod, async (req, res) => {
  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) {
    return res.json({ ok: false, stage: 'config', message: 'PLATE_RECOGNIZER_TOKEN environment variable is not set' });
  }
  try {
    // Fetch account statistics — a lightweight authenticated endpoint
    // that confirms the token is valid without consuming a lookup credit.
    const r = await fetch('https://api.platerecognizer.com/v1/statistics/', {
      headers: { Authorization: `Token ${token}` }
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      return res.json({
        ok: true,
        stage: 'api',
        message: 'Token valid and API reachable',
        usage: {
          calls_used: body.usage?.calls,
          calls_limit: body.usage?.max_calls,
          resets_on: body.usage?.resets_on,
        }
      });
    } else {
      return res.json({ ok: false, stage: 'api', status: r.status, message: 'API rejected the token', body });
    }
  } catch(e) {
    return res.json({ ok: false, stage: 'network', message: e.message });
  }
});

/**
 * POST /api/photo-report/process
 * Public — no auth required.
 * Accepts a single photo, extracts EXIF GPS and runs plate OCR.
 * Returns extracted data only; nothing is stored server-side.
 * The client holds state through the self-review step and submits
 * the confirmed result via the existing POST /api/vehicles endpoint.
 */
app.post('/api/photo-report/process', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const buffer = req.file.buffer;

    let lat = null, lng = null;
    try {
      const gps = await exifr.gps(buffer);
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        lat = gps.latitude;
        lng = gps.longitude;
      }
    } catch(e) {
      console.log('EXIF extraction failed:', e.message);
    }

    const ocr = await ocrPlate(buffer, req.file.originalname);
    let street = null;
    if (lat && lng) street = await reverseGeocode(lat, lng);

    // Buffer is not retained — discarded when this request finishes.
    res.json({
      ocrPlate: ocr ? ocr.plate : null,
      ocrScore: ocr ? ocr.score : null,
      hasPlate: !!(ocr && ocr.plate),
      lat, lng,
      hasGps: lat !== null && lng !== null,
      street,
    });
  } catch(e) {
    console.error('Photo process error:', e);
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
  // Count vehicles in DB at startup — confirms data survived the deploy
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM vehicles').get();
    console.log(`Parking Observatory running on port ${PORT}`);
    console.log(`Database: ${path.join(DATA_DIR, 'observatory.db')}`);
    console.log(`Vehicles in database: ${count.n}`);
    console.log(`MODERATOR_PIN configured: ${!!process.env.MODERATOR_PIN}`);
    console.log(`PLATE_KEY configured: ${!!process.env.PLATE_KEY}`);
  } catch(e) {
    console.error('Startup check failed:', e.message);
  }
});
