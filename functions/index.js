const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// ─── Firebase Init ────────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://ridera-dg7-default-rtdb.firebaseio.com/",
});

const db = admin.database();

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const SESSION_TOKEN = process.env.RIDERA_SESSION_TOKEN || "ridera-admin-token";

function requireSession(req, res, next) {
  if (req.method === "OPTIONS") return next();
  const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
  if (req.method === "POST" && /\/login\/?$/.test(pathOnly)) return next();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token === SESSION_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

app.use(requireSession);

const apiRouter = express.Router();

// ─── Admin Credentials (match local server.js; override in Firebase Console → Functions config) ───
const ADMIN_EMAIL = process.env.RIDERA_ADMIN_EMAIL || "iot.ridera@gmail.com";
const ADMIN_PASSWORD = process.env.RIDERA_ADMIN_PASSWORD || "jhonides12345";

// ─── POST /login ─────────────────────────────────────────────────────────────
apiRouter.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: SESSION_TOKEN });
  }
  return res.status(401).json({ success: false, error: "Invalid email or password" });
});

// ─── Crash Helpers ───────────────────────────────────────────────────────────
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
    const userCrashes = [];
    for (const [cid, crash] of Object.entries(history)) {
      if (!crash || typeof crash !== "object") continue;
      if (isAllowedCrashType(crash.type)) {
        userCrashes.push({ path: `/Ridera/users/${uid}/crash_history/${cid}`, key: cid, data: crash });
      }
    }
    if (userCrashes.length === 0) continue;
    userCrashes.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));
    results.push(userCrashes[0]);
  }
  return results;
}

// ─── GET /overview ────────────────────────────────────────────────────────────
apiRouter.get("/overview", async (req, res) => {
  try {
    const snap = await db.ref("/Ridera").once("value");
    const d = snap.val() || {};
    const crashes = findCrashes(d);
    res.json({
      crashes,
      totalUsers: Object.keys(d.users || {}).length,
      // Exclude 'config' — it is a settings node, not a real device
      totalDevices: Object.keys(d.devices || {}).filter(k => k !== 'config').length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /users ───────────────────────────────────────────────────────────────
apiRouter.get("/users", async (req, res) => {
  try {
    const snap = await db.ref("/Ridera/users").once("value");
    res.json({ users: snap.val() || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ─── DELETE /users/:id ────────────────────────────────────────────────────────
apiRouter.delete("/users/:id", async (req, res) => {
  try {

    const uid = req.params.id;

    const snap = await db.ref(`/Ridera/users/${uid}`).once("value");

    if (!snap.exists()) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    await db.ref(`/Ridera/users/${uid}`).remove();

    res.json({
      success: true,
      deletedUser: uid
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
});

// ─── GET /users/:id ───────────────────────────────────────────────────────────
apiRouter.get("/users/:id", async (req, res) => {
  try {
    const snap = await db.ref(`/Ridera/users/${req.params.id}`).once("value");
    const user = snap.val();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /devices ─────────────────────────────────────────────────────────────
apiRouter.get("/devices", async (req, res) => {
  try {
    const snap = await db.ref("/Ridera/devices").once("value");
    const raw = snap.val() || {};
    // Strip the 'config' node — it is a settings record, not a hardware device
    const devices = Object.fromEntries(
      Object.entries(raw).filter(([k]) => k !== 'config')
    );
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /debug ───────────────────────────────────────────────────────────────
apiRouter.get("/debug", async (req, res) => {
  try {
    const snap = await db.ref("/Ridera").once("value");
    const d = snap.val() || {};
    const userKeys = Object.keys(d.users || {});
    const firstUid = userKeys[0];
    const firstUser = firstUid ? d.users[firstUid] : null;
    const crashKeys = firstUser ? Object.keys(firstUser.crash_history || {}) : [];
    res.json({
      topLevelKeys: Object.keys(d),
      totalUsers: userKeys.length,
      firstUserId: firstUid,
      firstUserKeys: firstUser ? Object.keys(firstUser) : [],
      crashHistoryKeys: crashKeys,
      firstCrash: crashKeys[0] ? firstUser.crash_history[crashKeys[0]] : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Export as Cloud Function ─────────────────────────────────────────────────
// Mount routes on both "/" and "/api" so Hosting rewrite paths match local API usage.
app.use("/", apiRouter);
app.use("/api", apiRouter);
exports.api = functions.https.onRequest(app);
