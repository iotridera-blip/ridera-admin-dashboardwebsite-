const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const path = require("path");

// ─── Firebase Init ────────────────────────────────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
  );
} else {
  serviceAccount = require(path.join(__dirname, "..", "ridera-dg7-firebase-adminsdk.json"));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://ridera-dg7-default-rtdb.firebaseio.com/",
  });
}

const db = admin.database();

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ─── Serve responder static files at root ─────────────────────────────────────
// This makes dashboard.html and login.html accessible at / directly
app.use(express.static(path.join(__dirname, "public", "responder")));

// Also serve shared assets from public/ (logo, sounds, etc.)
app.use(express.static(path.join(__dirname, "public")));

// ─── API: Update Responder Status (crash_history entries) ─────────────────────
app.patch("/api/responder-status", async (req, res) => {
  try {
    const { path: fbPath, status } = req.body || {};

    if (!fbPath || !status) {
      return res.status(400).json({ error: "Missing path or status" });
    }

    const allowed = ["alert_received", "on_the_way", "arrived", "resolved"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Use: alert_received | on_the_way | arrived | resolved",
      });
    }

    const updates = { responder_status: status };

    if (status === "alert_received") updates.alert_received_at = Date.now();
    if (status === "on_the_way") updates.on_the_way_at = Date.now();
    if (status === "arrived") updates.arrived_at = Date.now();
    if (status === "resolved") updates.resolved_at = Date.now();

    await db.ref(fbPath).update(updates);

    res.json({ success: true, path: fbPath, responder_status: status });
  } catch (err) {
    console.error("/api/responder-status PATCH error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Root redirect → dashboard.html ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "responder", "dashboard.html"));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`🚑  Ridera Responder Server running!`);
  console.log(`🌐  Open: http://localhost:${PORT}`);
  console.log(`🔥  Firebase: ridera-dg7`);
  console.log("=".repeat(50));
});
