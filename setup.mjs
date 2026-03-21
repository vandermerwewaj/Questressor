/**
 * EFT Quest Intel Tracker — First-Time Setup Script
 * ===================================================
 * Run this once from your tqt folder:
 *
 *   node setup.mjs
 *
 * What it does:
 *   1. Fetches all quest data from tarkov.dev GraphQL API → tasks.json
 *   2. Fetches all trader data from tarkov.dev GraphQL API → traders.json
 *   3. Fetches quest GPS coordinates from TarkovTracker   → map-gps.json
 *   4. Downloads all 10 map SVG files                     → maps/ folder
 *
 * After this completes, run:
 *   npm run build
 *   npm start
 *
 * To refresh data after a game update, just run this script again.
 * Your progress.json is never touched by this script.
 */

import fs from "fs";
import path from "path";

const TARKOV_API           = "https://api.tarkov.dev/graphql";
const TARKOVTRACKER_QUESTS = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json";
const SVG_BASE             = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/maps/svg/";

const SVG_FILES = [
  "Factory.svg",
  "Customs.svg",
  "Woods.svg",
  "Shoreline.svg",
  "Interchange.svg",
  "Labs.svg",
  "Reserve.svg",
  "Lighthouse.svg",
  "StreetsOfTarkov.svg",
  "GroundZero.svg",
];

const TASKS_QUERY = `{
  tasks {
    id name experience wikiLink taskImageLink minPlayerLevel
    trader { id name }
    map { id name normalizedName }
    taskRequirements { task { id name } status }
    objectives {
      id type description optional maps { id name }
      ... on TaskObjectiveItem { items { id name shortName wikiLink } count foundInRaid }
      ... on TaskObjectiveShoot { target count bodyParts zoneNames }
      ... on TaskObjectiveBasic { zones { id map { name } } }
      ... on TaskObjectiveUseItem { useAny { id name } count zoneNames }
      ... on TaskObjectiveTraderLevel { trader { name } level }
    }
    startRewards { items { item { id name } count } traderStanding { trader { name } standing } }
    finishRewards {
      items { item { id name } count }
      offerUnlock { trader { name } item { id name } level }
      traderStanding { trader { name } standing }
      traderUnlock { id name }
      skillLevelReward { name level }
      craftUnlock { id }
    }
  }
}`;

const TRADERS_QUERY = `{
  traders {
    id name normalizedName imageLink
    levels { level requiredPlayerLevel requiredReputation requiredCommerce }
  }
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const gql = async (query) => {
  const res = await fetch(TARKOV_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const step = (n, total, label) =>
  console.log(`\n[${n}/${total}] ${label}`);

const ok  = msg => console.log(`  ✓ ${msg}`);
const err = msg => console.log(`  ✗ ${msg}`);

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════");
console.log("  EFT Quest Intel Tracker — Setup");
console.log("═══════════════════════════════════════════");

const TOTAL = 4;

// 1. Tasks
step(1, TOTAL, "Fetching quest data from tarkov.dev...");
try {
  const data = await gql(TASKS_QUERY);
  if (data.errors) throw new Error(data.errors[0].message);
  const count = data.data?.tasks?.length ?? 0;
  fs.writeFileSync("tasks.json", JSON.stringify(data.data, null, 2));
  ok(`${count} quests saved → tasks.json`);
} catch (e) {
  err(`Failed: ${e.message}`);
  console.log("  Try running the query manually at https://api.tarkov.dev/graphql");
}

// 2. Traders
step(2, TOTAL, "Fetching trader data from tarkov.dev...");
try {
  const data = await gql(TRADERS_QUERY);
  if (data.errors) throw new Error(data.errors[0].message);
  const count = data.data?.traders?.length ?? 0;
  fs.writeFileSync("traders.json", JSON.stringify(data.data, null, 2));
  ok(`${count} traders saved → traders.json`);
} catch (e) {
  err(`Failed: ${e.message}`);
}

// 3. GPS quest coordinates
step(3, TOTAL, "Fetching quest GPS coordinates from TarkovTracker...");
try {
  const res = await fetch(TARKOVTRACKER_QUESTS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();

  const gpsData = {};
  let questCount = 0, objCount = 0;

  for (const [questId, quest] of Object.entries(raw)) {
    const objsWithGPS = Object.entries(quest.objectives || {}).filter(([, o]) => o.gps);
    if (!objsWithGPS.length) continue;
    questCount++;
    objCount += objsWithGPS.length;
    gpsData[questId] = {
      id: questId,
      title: quest.title,
      wiki: quest.wiki || "",
      objectives: objsWithGPS.map(([objId, obj]) => ({
        id: objId,
        type: obj.type,
        description: obj.description || "",
        map: obj.map ?? obj.location ?? null,
        gps: obj.gps,
      })),
    };
  }

  fs.writeFileSync("map-gps.json", JSON.stringify(gpsData, null, 2));
  ok(`${questCount} quests with GPS, ${objCount} objectives → map-gps.json`);
} catch (e) {
  err(`Failed: ${e.message}`);
}

// 4. SVG map files
step(4, TOTAL, "Downloading map SVG files from TarkovTracker...");
if (!fs.existsSync("maps")) fs.mkdirSync("maps");

let downloaded = 0, skipped = 0, failed = [];

for (const file of SVG_FILES) {
  const outPath = path.join("maps", file);
  if (fs.existsSync(outPath)) {
    skipped++;
    continue;
  }
  try {
    const res = await fetch(SVG_BASE + file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("<svg") && !text.includes("<SVG")) throw new Error("Not an SVG");
    fs.writeFileSync(outPath, text);
    downloaded++;
    console.log(`  ✓ ${file} (${Math.round(text.length / 1024)}KB)`);
  } catch (e) {
    failed.push(file);
    err(`${file} — ${e.message}`);
  }
}

if (skipped)           ok(`${skipped} SVG(s) already present, skipped`);
if (failed.length)     err(`${failed.length} SVG(s) failed — try running setup again`);
if (downloaded + skipped === SVG_FILES.length) ok("All 10 map SVGs ready → maps/");

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════");
console.log("  Setup complete!");
console.log("  Run:  npm run build");
console.log("        npm start");
console.log("  Then open:  http://localhost:3001");
console.log("═══════════════════════════════════════════\n");
