const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const path = require("path");

// ─── Firebase Init ────────────────────────────────────────────────────────────
// On Render: set FIREBASE_SERVICE_ACCOUNT_BASE64 env var (base64-encoded JSON).
// Locally: falls back to the service account JSON file.
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
  );
} else {
  serviceAccount = require(path.join(__dirname, "..", "ridera-dg7-firebase-adminsdk.json"));
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ridera-dg7-default-rtdb.firebaseio.com/",
});

const db = admin.database();

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Session token for API (set RIDERA_SESSION_TOKEN in production).
const SESSION_TOKEN = process.env.RIDERA_SESSION_TOKEN || "ridera-admin-token";

function requireApiAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!req.path.startsWith("/api")) return next();
  if (req.method === "POST" && req.path === "/api/login") return next();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token === SESSION_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

app.use(requireApiAuth);

// Serve static files from the public/ folder
app.use(express.static(path.join(__dirname, "public")));

// ─── Crash Finder — latest Riding Crash / Riding Crash (Upright) per user ────
// Matches both human-readable ("Riding Crash (Upright)") and underscore ("riding_crash_upright")
function isAllowedCrashType(type) {
  if (!type) return false;
  const t = type.toLowerCase().replace(/[\s()_-]/g, "");
  return t.includes("ridingcrash");
}

function findCrashes(data) {
  const results = [];
  if (!data || typeof data !== "object") return results;

  const users = data.users || {};
  for (const [uid, user] of Object.entries(users)) {
    if (!user || typeof user !== "object") continue;
    const history = user.crash_history || {};

    // Collect only allowed crash types for this user
    const userCrashes = [];
    for (const [cid, crash] of Object.entries(history)) {
      if (!crash || typeof crash !== "object") continue;
      if (isAllowedCrashType(crash.type)) {
        userCrashes.push({ path: `/Ridera/users/${uid}/crash_history/${cid}`, key: cid, data: crash });
      }
    }

    if (userCrashes.length === 0) continue;

    // Sort by createdAt descending — keep only the newest
    userCrashes.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));
    results.push(userCrashes[0]);
  }
  return results;
}

// ─── API: Debug (raw Firebase dump) ─────────────────────────────────────────
app.get("/api/debug", async (req, res) => {
  try {
    const snap = await db.ref("/Ridera").once("value");
    const d = snap.val() || {};
    // Return just top-level keys + first user's structure
    const userKeys = Object.keys(d.users || {});
    const firstUid = userKeys[0];
    const firstUser = firstUid ? d.users[firstUid] : null;
    const crashHistoryKeys = firstUser ? Object.keys(firstUser.crash_history || {}) : [];
    const firstCrash = crashHistoryKeys[0] ? firstUser.crash_history[crashHistoryKeys[0]] : null;
    res.json({
      topLevelKeys: Object.keys(d),
      totalUsers: userKeys.length,
      firstUserId: firstUid,
      firstUserKeys: firstUser ? Object.keys(firstUser) : [],
      crashHistoryKeys,
      firstCrash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Overview (Crash Alert page) ────────────────────────────────────────
app.get("/api/overview", async (req, res) => {
  try {
    const snapshot = await db.ref("/Ridera").once("value");
    const d = snapshot.val() || {};

    const crashes = findCrashes(d);
    const totalUsers = Object.keys(d.users || {}).length;
    const totalDevices = Object.keys(d.devices || {}).length;

    res.json({
      crashes,
      totalUsers,
      totalDevices,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("/api/overview error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: All Users ───────────────────────────────────────────────────────────
app.get("/api/users", async (req, res) => {
  try {
    const snapshot = await db.ref("/Ridera/users").once("value");
    const users = snapshot.val() || {};
    res.json({ users });
  } catch (err) {
    console.error("/api/users error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Single User ─────────────────────────────────────────────────────────
app.get("/api/users/:id", async (req, res) => {
  try {
    const snapshot = await db.ref(`/Ridera/users/${req.params.id}`).once("value");
    const user = snapshot.val();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("/api/users/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: All Devices ─────────────────────────────────────────────────────────
app.get("/api/devices", async (req, res) => {
  try {
    const snapshot = await db.ref("/Ridera/devices").once("value");
    const devices = snapshot.val() || {};
    res.json({ devices });
  } catch (err) {
    console.error("/api/devices error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Login ───────────────────────────────────────────────────────────────
// Prefer env in production so credentials are not only in source.
const ADMIN_EMAIL = process.env.RIDERA_ADMIN_EMAIL || "iot.ridera@gmail.com";
const ADMIN_PASSWORD = process.env.RIDERA_ADMIN_PASSWORD || "jhonides12345";

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: SESSION_TOKEN });
  }
  return res.status(401).json({ success: false, error: "Invalid email or password" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`🏍️  Ridera Admin Server running!`);
  console.log(`🌐  Open: http://localhost:${PORT}`);
  console.log(`🔥  Firebase: ridera-dg7`);
  console.log("=".repeat(50));
});