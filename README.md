# Parking Observatory · Karl-Kunger Kiez

A civic web app for documenting long-term parked vehicles in the Karl-Kunger Kiez neighbourhood (Bouchestraße area, 12435 Berlin). Residents report and confirm sightings; a map shows all known vehicles colour-coded by how long they've been parked.

Live on Railway. No build step — plain HTML/CSS/JS frontend served from `/public`, Node.js/Express backend, SQLite database.

---

## Features

### Public (residents)
- **Map view** — Leaflet map with colour-coded pins: green (recent), orange (2+ weeks), red (3+ months), dark (unverified)
- **Report a vehicle** — tap the map, fill in type, colour, and plate; plate is AES-256-GCM encrypted before storage
- **Confirm a sighting** — tap an existing pin to record you saw it today; confidence score rises with each confirmation
- **Report gone** — three independent "gone" reports within 48 hours removes a vehicle from the map
- **Filter & search** — filter by duration (14 days, 90 days), vehicle type (trailers), or status (pending)
- **Stats panel** — totals, duration breakdown, street occupancy

### Moderator only
- **Moderator mode** — PIN-protected; unlocks pin-dragging for repositioning, direct vehicle deletion, and access to Surveyor Mode. Auth issues a short-lived server-side token (6 hours); all protected routes are enforced server-side.
- **Surveyor Mode** (`/surveyor.html`) — bulk photo intake workflow for an initial neighbourhood census walk. Upload up to 15 plate photos per batch; GPS coordinates are extracted from EXIF metadata automatically; plates are read via Plate Recognizer OCR. Every photo becomes a draft for human review before anything goes live — moderator corrects the plate, adjusts the pin, selects type and colour, then approves or rejects. Photos are held in memory only and are discarded the moment a draft is decided.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express 4 |
| Database | SQLite via `better-sqlite3` |
| Maps | Leaflet.js 1.9 |
| Geocoding | OpenStreetMap Nominatim (free, no key) |
| Plate OCR | Plate Recognizer Snapshot API |
| EXIF | `exifr` |
| File upload | `multer` (memory storage — no disk writes) |
| Hosting | Railway |

---

## Environment variables

Set these in Railway's variable panel before deploying.

| Variable | Required | Description |
|---|---|---|
| `PLATE_KEY` | Yes | 32-character AES-256-GCM encryption key for licence plates |
| `MODERATOR_PIN` | Yes | PIN to unlock moderator and surveyor modes |
| `PLATE_RECOGNIZER_TOKEN` | For Surveyor Mode | API token from [platerecognizer.com](https://platerecognizer.com) |
| `PORT` | No | Set automatically by Railway |

---

## Database

SQLite database at `/data/observatory.db` (Railway persistent volume) with a fallback to `.data/observatory.db` for local development.

### Tables

**`vehicles`** — one row per reported vehicle. Key columns:
- `lat`, `lng` — weighted centroid, updated with each confirmation
- `plate_enc`, `plate_iv`, `plate_tag` — AES-256-GCM encrypted plate
- `plate_hint` — public partial plate, e.g. `B ··· 34`
- `status` — `pending` (resident-reported, awaiting confirmation) or `verified`
- `confidence` — 0–99, rises with confirmations
- `source` — `resident` (tap-reported) or `survey` (Surveyor Mode approved)
- `duration_days` — reporter-supplied estimate; display uses whichever is greater between this and days since `first_seen`

**`observations`** — each confirmation event logged with session ID and coordinates.

**`gone_reports`** — "vehicle is gone" votes; three unique sessions within 48 hours triggers removal.

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/vehicles` | Public | All vehicles (accepts `?filter=all\|14\|90\|trailer\|pending`) |
| GET | `/api/vehicles/nearby` | Public | Vehicles within radius of a point |
| POST | `/api/vehicles` | Public | Create resident report |
| POST | `/api/vehicles/:id/confirm` | Public | Confirm a sighting |
| POST | `/api/vehicles/:id/gone` | Public | Report vehicle gone |
| GET | `/api/stats` | Public | Dashboard numbers |
| POST | `/api/mod/auth` | — | Validate PIN; returns a bearer token |
| DELETE | `/api/vehicles/:id` | Mod token | Remove a vehicle |
| POST | `/api/surveyor/upload` | Mod token | Upload one photo; runs EXIF + OCR; returns draft |
| GET | `/api/surveyor/drafts` | Mod token | List pending drafts |
| POST | `/api/surveyor/drafts/:id/approve` | Mod token | Approve draft → creates vehicle record |
| POST | `/api/surveyor/drafts/:id/reject` | Mod token | Discard draft |

---

## Deploying to Railway

1. Push this repository to GitHub.
2. Create a new Railway project linked to the repo.
3. Add a Railway volume mounted at `/data` — the database lives here and survives deploys.
4. Set the environment variables listed above.
5. Railway runs `npm start` (`node server.js`) automatically.

On first start the database and all tables are created automatically. Subsequent deploys run safe `ALTER TABLE` migrations so existing data is never lost.

---

## Local development

```bash
npm install
PLATE_KEY=change-me-in-production-32chars!! \
MODERATOR_PIN=1234 \
node server.js
```

App runs on `http://localhost:3000`. The database falls back to `.data/observatory.db` locally. Surveyor Mode OCR is skipped if `PLATE_RECOGNIZER_TOKEN` is not set — plates can be typed manually in the review queue.

---

## Privacy & GDPR notes

- Licence plates are encrypted with AES-256-GCM before storage; only a partial hint is shown publicly
- GPS coordinates are resolved to street names server-side; raw coordinates are stored but not exposed without context
- Session IDs are random strings generated client-side per browser session; no accounts, no cookies
- Surveyor Mode photos are processed in memory only — never written to disk — and are deleted as soon as a draft is approved or rejected
- Moderator tokens expire after 6 hours and are stored in process memory only (not the database)
