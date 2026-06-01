const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// ─── Initialize Firebase ─────────────────────────────────────────────────────
// On Render: set FIREBASE_SERVICE_ACCOUNT_BASE64 env var (base64-encoded JSON).
// Locally: falls back to the service account JSON file next to the project root.
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
  );
} else {
  serviceAccount = require(path.join(__dirname, "..", "ridera-dg7-firebase-adminsdk-fbsvc-aff8ccd5da.json"));
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ridera-dg7-default-rtdb.firebaseio.com/",
});

const database = admin.database();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CRASH_KEYWORDS = ["crash", "accident", "incident", "collide", "collision", "error", "fault", "emergency", "sos"];

function hasCrashKeyword(str) {
  const lower = String(str).toLowerCase();
  return CRASH_KEYWORDS.some((kw) => lower.includes(kw));
}

function findCrashes(data, currentPath = "") {
  const results = [];

  if (data === null || data === undefined) return results;

  if (typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const fullPath = `${currentPath}/${key}`;

      // Key itself is crash-related
      if (hasCrashKeyword(key)) {
        results.push({ path: fullPath, key, data: value });
      }

      // Recurse into object
      results.push(...findCrashes(value, fullPath));
    }
  } else if (Array.isArray(data)) {
    data.forEach((item, i) => {
      results.push(...findCrashes(item, `${currentPath}/${i}`));
    });
  } else if (typeof data === "string" && hasCrashKeyword(data)) {
    results.push({ path: currentPath, value: data });
  }

  return results;
}

function printStructure(data, currentPath = "", depth = 0) {
  const indent = "  ".repeat(depth);

  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const fullPath = `${currentPath}/${key}`;
      const count = typeof value === "object" && value !== null ? Object.keys(value).length : 1;
      console.log(`${indent}📁  ${fullPath}  (${count} children)`);
      if (depth < 3) printStructure(value, fullPath, depth + 1); // Limit depth for readability
    }
  } else if (Array.isArray(data)) {
    console.log(`${indent}  → [Array with ${data.length} items]`);
  } else {
    console.log(`${indent}  → ${String(data).substring(0, 200)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("=".repeat(70));
  console.log("🔥  FIREBASE REALTIME DATABASE — CRASH FINDER");
  console.log("    Project : ridera-dg7");
  console.log("    DB URL  : https://ridera-dg7-default-rtdb.firebaseio.com/");
  console.log("=".repeat(70));


  console.log("\n📡  Connecting to Firebase Realtime Database...\n");

  try {
    const snapshot = await database.ref("/").once("value");
    const rootData = snapshot.val();

    if (!rootData) {
      console.log("❌  Database is empty or access was denied.");
      process.exit(1);
    }

    // ── Step 1: Root-level nodes ──────────────────────────────────────────
    const rootKeys = Object.keys(rootData);
    console.log("=".repeat(70));
    console.log(`🗂️   ROOT-LEVEL NODES  (${rootKeys.length} found)`);
    console.log("=".repeat(70));
    rootKeys.forEach((key, i) => {
      const val = rootData[key];
      const count = typeof val === "object" && val !== null ? Object.keys(val).length : 1;
      console.log(`  ${i + 1}. /${key}   →  ${count} record(s)`);
    });

    // ── Step 2: Full structure ────────────────────────────────────────────
    console.log("\n" + "=".repeat(70));
    console.log("🌲  FULL DATABASE STRUCTURE (up to 3 levels deep)");
    console.log("=".repeat(70));
    printStructure(rootData);

    // ── Step 3: Search for crash data ─────────────────────────────────────
    console.log("\n" + "=".repeat(70));
    console.log("🔍  SEARCHING FOR CRASH / INCIDENT DATA...");
    console.log("=".repeat(70));

    const crashes = findCrashes(rootData);

    if (crashes.length > 0) {
      console.log(`\n✅  Found ${crashes.length} crash-related entries:\n`);
      crashes.forEach((entry, i) => {
        console.log("─".repeat(60));
        console.log(`  #${i + 1}  📍 PATH: ${entry.path}`);
        if ("data" in entry) {
          console.log(`       KEY : ${entry.key}`);
          console.log(`       DATA:\n${JSON.stringify(entry.data, null, 4)}`);
        } else {
          console.log(`       VALUE: ${entry.value}`);
        }
      });
    } else {
      console.log("\n⚠️   No entries with crash-related keywords were found in keys/values.");
      console.log("     Try reviewing the full structure printed above.");
    }

    // ── Step 4: Save full DB dump ─────────────────────────────────────────
    const outputPath = path.join(__dirname, "full_database_dump.json");
    fs.writeFileSync(outputPath, JSON.stringify(rootData, null, 2), "utf-8");
    console.log(`\n✅  Full database saved → ${outputPath}`);

    console.log("\n" + "=".repeat(70));
  } catch (err) {
    console.error("❌  Error connecting to Firebase:", err.message);
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
