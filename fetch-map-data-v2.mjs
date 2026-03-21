/**
 * EFT Quest Intel — Map Data Fetcher v2
 * Run from your tqt folder:  node fetch-map-data-v2.mjs
 *
 * What it does:
 *   1. Re-fetches TarkovTracker quest GPS data — this time keeping the map field
 *   2. Downloads all 10 map SVG files to a local maps/ folder
 *   3. Saves map-gps.json (with map field on each objective)
 *
 * Output:
 *   map-gps.json         — GPS quest data with map field preserved
 *   maps/Factory.svg     — local copy of each map SVG
 *   maps/Customs.svg     — etc...
 */

import fs from "fs";
import path from "path";

const TARKOVTRACKER_QUESTS = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json";

// SVG base URLs to try in order
const SVG_BASES = [
  "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/maps/svg/",
  "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/maps/",
];

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

// ── 1. Fetch GPS quest data preserving map field ──────────────────────────────
console.log("Fetching TarkovTracker quest data (with map field)...");

let gpsData = {};
try {
  const res = await fetch(TARKOVTRACKER_QUESTS);
  const raw = await res.json();

  let questsWithGPS = 0, objectivesWithGPS = 0;

  for (const [questId, quest] of Object.entries(raw)) {
    const objsWithGPS = Object.entries(quest.objectives || {}).filter(
      ([, obj]) => obj.gps
    );
    if (objsWithGPS.length === 0) continue;

    questsWithGPS++;
    objectivesWithGPS += objsWithGPS.length;

    gpsData[questId] = {
      id: questId,
      title: quest.title,
      wiki: quest.wiki || "",
      objectives: objsWithGPS.map(([objId, obj]) => ({
        id: objId,
        type: obj.type,
        description: obj.description || "",
        // map is stored differently in TarkovTracker — try several field names
        map: obj.map ?? obj.location ?? obj.mapId ?? null,
        gps: obj.gps, // { leftPercent, topPercent, floor }
      })),
    };
  }

  console.log(`  ✓ ${questsWithGPS} quests, ${objectivesWithGPS} GPS objectives`);

  // Show map field coverage
  let withMap = 0, withoutMap = 0;
  for (const q of Object.values(gpsData)) {
    for (const obj of q.objectives) {
      if (obj.map) withMap++; else withoutMap++;
    }
  }
  console.log(`  Map field: ${withMap} have it, ${withoutMap} missing it`);

  // Show sample
  const sample = Object.values(gpsData)[0];
  console.log(`\n  Sample: "${sample.title}" obj[0]:`, JSON.stringify(sample.objectives[0]));

  fs.writeFileSync("map-gps.json", JSON.stringify(gpsData, null, 2));
  console.log("  → Saved map-gps.json");

} catch (e) {
  console.error("  ✗ Failed:", e.message);
}

// ── 2. Download SVG map files ─────────────────────────────────────────────────
console.log("\nDownloading SVG map files...");

if (!fs.existsSync("maps")) fs.mkdirSync("maps");

for (const file of SVG_FILES) {
  const outPath = path.join("maps", file);
  if (fs.existsSync(outPath)) {
    console.log(`  ✓ ${file} (already exists, skipping)`);
    continue;
  }

  let downloaded = false;
  for (const base of SVG_BASES) {
    try {
      const res = await fetch(base + file);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes("<svg") && !text.includes("<SVG")) continue; // not an SVG
      fs.writeFileSync(outPath, text);
      console.log(`  ✓ Downloaded ${file} (${Math.round(text.length/1024)}KB)`);
      downloaded = true;
      break;
    } catch (e) {
      // try next base
    }
  }

  if (!downloaded) {
    console.log(`  ✗ Could not download ${file} — will need to be added manually`);
  }
}

// ── 3. Summary ────────────────────────────────────────────────────────────────
const svgDownloaded = SVG_FILES.filter(f => fs.existsSync(path.join("maps", f)));
console.log(`\n✓ Done.`);
console.log(`  GPS quests saved: ${Object.keys(gpsData).length}`);
console.log(`  SVGs downloaded: ${svgDownloaded.length}/${SVG_FILES.length}`);
if (svgDownloaded.length < SVG_FILES.length) {
  const missing = SVG_FILES.filter(f => !fs.existsSync(path.join("maps", f)));
  console.log(`  Missing SVGs: ${missing.join(", ")}`);
}
console.log("\nPaste the output above to Claude to continue.");
