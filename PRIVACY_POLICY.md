# Privacy policy — Parking Observatory

*Draft — last updated 1 July 2026. This is a starting point written for a small community project, not a substitute for legal advice. Because this app processes location data and vehicle registration plates in the EU, have a lawyer review this before treating it as your final policy.*

## What this app is

Parking Observatory is a community tool for the Karl-Kunger Kiez neighbourhood (Bouchestraße area, Berlin) that documents long-term parked vehicles based on resident reports.

## What we collect

**When you report a vehicle:**
- The vehicle's approximate location (GPS coordinates, rounded to roughly 10 metres)
- The licence plate, which is encrypted before storage (AES-256-GCM) — only a partial plate (e.g. "B · · · 34") is ever shown publicly
- Vehicle type and colour, which you select
- If you report by photo: the photo is processed to extract the location and plate text, then discarded. We do not keep a copy of the photo after this.

**Automatically, when you use the app:**
- A random session identifier generated in your browser, used only to prevent duplicate confirmations and "gone" reports on the same vehicle. It is not linked to your name, email, or any account — the app has no accounts.
- No cookies, no tracking, no analytics beyond basic server logs kept for debugging.

**We do not collect:** your name, email address, phone number, or any account information, because the app doesn't have user accounts.

## Third parties we send data to

To provide certain features, some data is sent to external services:

- **Plate Recognizer** (platerecognizer.com) — when you report by photo, the image is sent to this service to read the licence plate. Their own privacy policy applies to that transmission.
- **OpenStreetMap Nominatim** — GPS coordinates are sent to this free, open service to resolve a street name. No plate or personal data is included in this request.
- **Railway** (railway.app) — our hosting provider, which stores the database.

We do not sell data, run ads, or share data with anyone else.

## How long we keep data

- Vehicle reports remain until the vehicle is confirmed gone (three independent reports within 48 hours) or removed by a moderator.
- Photos used for plate/location extraction are not retained — they exist only in server memory for the seconds it takes to process them.
- Encrypted licence plates remain readable only by whoever holds the server's private encryption key.

## Your rights (GDPR)

Because this project may process personal data of people in the EU (a licence plate can be personal data), you may have rights including access, correction, and deletion of data associated with a specific report. Since there are no accounts, requests should be made by contacting the project moderator directly with enough detail (e.g. approximate location and date) to identify the relevant report.

## Moderators

Moderators access the app via a shared PIN and can view, edit, and delete reports. Moderator sessions are temporary (a few hours) and are not tied to a personal account either.

## Changes to this policy

This policy may be updated as the app changes. Check back periodically.

## Contact

For privacy questions or requests, please use the [contact / feedback form](https://docs.google.com/forms/d/e/1FAIpQLSfxUEkKmpR4I9vKp_Yjm_bL460Kzc2yKO0Bi-lB5vlhBZxX5g/viewform).
