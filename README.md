# Parking Observatory — Glitch Deployment Guide

## What's in this folder

```
parking-observatory-glitch/
├── server.js          ← Express backend + SQLite database
├── package.json       ← Dependencies
├── public/
│   └── index.html     ← The full map UI
└── README.md          ← This file
```

---

## How to deploy on Glitch (step by step)

### 1. Create a Glitch account
Go to **glitch.com** and sign up (free, no credit card).

### 2. Create a new project
Click **New Project → Import from GitHub** — or simply click
**New Project → glitch-hello-node** to get a blank Node.js project.

### 3. Upload these files
In the Glitch editor you'll see a file tree on the left.

- Click each file in the tree and **replace its contents** with the
  contents of the files in this folder.
- For `public/index.html`: in Glitch, create a folder called `public`
  first (click **New File**, type `public/index.html`).
- Delete any files Glitch created that you don't need
  (e.g. `views/`, `README.md` defaults).

The final file tree in Glitch should look like:
```
.data/               ← Glitch creates this automatically (don't touch)
public/
  index.html
package.json
server.js
```

### 4. Set your encryption key
In the Glitch editor, click **".env"** in the left sidebar.
Add one line:
```
PLATE_KEY=your-secret-32-character-key-here
```
Make it at least 32 random characters. This encrypts all license plates
in the database. **Write it down somewhere safe** — if you lose it,
stored plates cannot be decrypted.

Example key (generate your own!):
```
PLATE_KEY=Kx7mP2nQ9rL4vB8wY1tZ6cA3jE0sFhUi
```

### 5. That's it — Glitch installs dependencies and starts automatically
Your app will be live at:
```
https://YOUR-PROJECT-NAME.glitch.me
```
Share that URL with your neighbors.

---

## How data is stored

Glitch persists a special `.data/` folder across restarts and deploys.
The SQLite database (`observatory.db`) lives there automatically —
no setup needed.

**What's stored:**
- Vehicle type, color, street
- Encrypted license plate (AES-256-GCM)
- Coordinates rounded to ~10 m
- Anonymous session token (no accounts, no names)
- Timestamps

**What's never stored:**
- Reporter identity
- Plain-text license plates
- Exact GPS coordinates

---

## Keeping it running

Glitch free tier "sleeps" projects after 5 minutes of inactivity.
The first visitor after sleep waits ~10 seconds for it to wake up.

To keep it always awake (optional):
- Sign up at **uptimerobot.com** (free)
- Add a monitor pointing to `https://YOUR-PROJECT-NAME.glitch.me/api/stats`
- Set interval to 4 minutes
- UptimeRobot pings it every 4 minutes, keeping it awake

---

## Upgrading later

When you outgrow Glitch (more users, need backups, custom domain):
- Export your `.data/observatory.db` file from Glitch
- Move to **Railway.app** — same Node.js code works, PostgreSQL instead of SQLite
- Or move to **Vercel + Supabase** for the full production setup described in the PRD
