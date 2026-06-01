# 🏍️ Ridera Admin Dashboard

A real-time Firebase admin dashboard for the **Ridera** motorcycle safety IoT system.

## Features
- 🚨 **Crash Dashboard** — live crash map with GPS coordinates, severity, speed
- 👥 **Registered Users** — browse all users, click to view profile & crash history
- 🔌 **Device Dashboard** — live telemetry, GPS, WiFi info from Ridera IoT devices

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: Firebase Realtime Database
- **Maps**: Leaflet.js + CartoDB Dark tiles
- **Frontend**: Vanilla HTML/CSS/JS (no framework)

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add Firebase credentials
Place your Firebase Admin SDK service account JSON at:
```
cd C:\Users\USER\.vscode\ridera-admin-dashboard-master\ridera-admin-dashboard-master
```
Or set the `FIREBASE_CREDENTIALS` environment variable with the JSON string.

### 3. Run locally
```bash
node server.js
```
Open [http://localhost:3000](http://localhost:3000)

## Environment Variables
| Variable | Description |
|----------|-------------|
| `FIREBASE_CREDENTIALS` | Firebase service account JSON (for deployment) |
| `PORT` | Server port (default: 3000) |

## Project Structure
```
├── server.js          # Express API + Firebase Admin
├── public/
│   ├── index.html     # SPA shell
│   ├── style.css      # Dark theme styles
│   └── app.js         # Client-side routing & logic
└── package.json
```
