/**
 * EFT Quest Intel — Map Data Fetcher
 * Run this from your tqt folder:  node fetch-map-data.mjs
 *
 * Fetches from two sources:
 *   1. tarkov.dev GraphQL API  — map images, map metadata
 *   2. TarkovTracker/tarkovdata — quest GPS coordinates (topPercent / leftPercent)
 *
 * Output files saved to your tqt folder:
 *   maps.json        — map images + metadata from tarkov.dev
 *   map-gps.json     — quest GPS markers from TarkovTracker
 */

import fs from "fs";

const TARKOV_API = "https://api.tarkov.dev/graphql";
const TARKOVTRACKER_QUESTS = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json";
const TARKOVTRACKER_MAPS   = "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/maps.json";

// ── 1. Fetch maps from tarkov.dev ────────────────────────────────────────────
console.log("Fetching maps from tarkov.dev...");
const mapsQuery = `{
  maps {
    id
    name
    normalizedName
    wiki
    description
    raidDuration
    players
    svgLink
    enemies { name }
    extracts { id name faction position { x y z } }
    hazards { name position { x y z } }
    spawns { position { x y z } sides categories }
    lootContainers {
      lootContainer { id name }
      position { x y z }
    }
  }
}`;

let mapsData = null;
try {
  const res = await fetch(TARKOV_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: mapsQuery }),
  });
  mapsData = await res.json();
  console.log(`  ✓ Got ${mapsData?.data?.maps?.length ?? 0} maps`);
} catch (e) {
  console.error("  ✗ tarkov.dev maps failed:", e.message);
  // Try a minimal fallback query without the 3D fields that might not exist
  try {
    const res2 = await fetch(TARKOV_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ maps { id name normalizedName wiki svgLink description raidDuration players } }` }),
    });
    mapsData = await res2.json();
    console.log(`  ✓ Got ${mapsData?.data?.maps?.length ?? 0} maps (minimal)`);
  } catch (e2) {
    console.error("  ✗ Fallback also failed:", e2.message);
  }
}

if (mapsData?.data?.maps) {
  fs.writeFileSync("maps.json", JSON.stringify(mapsData.data, null, 2));
  console.log("  → Saved maps.json");

  // Print a quick summary of what fields came back
  const sample = mapsData.data.maps[0];
  console.log("\n  Sample map fields:", Object.keys(sample).join(", "));
  if (sample.extracts) console.log(`  Sample extract count: ${sample.extracts?.length}`);
} else {
  console.log("  ! No map data — check errors above");
}

// ── 2. Fetch TarkovTracker quest GPS data ────────────────────────────────────
console.log("\nFetching TarkovTracker quest GPS data...");
try {
  const res = await fetch(TARKOVTRACKER_QUESTS);
  const raw = await res.json();

  // Filter to only quests that have GPS coordinates on at least one objective
  let questsWithGPS = 0;
  let totalObjectivesWithGPS = 0;

  const gpsData = {};
  for (const [questId, quest] of Object.entries(raw)) {
    const objsWithGPS = Object.entries(quest.objectives || {}).filter(
      ([, obj]) => obj.gps
    );
    if (objsWithGPS.length > 0) {
      questsWithGPS++;
      totalObjectivesWithGPS += objsWithGPS.length;
      gpsData[questId] = {
        id: questId,
        title: quest.title,
        wiki: quest.wiki,
        objectives: objsWithGPS.map(([objId, obj]) => ({
          id: objId,
          type: obj.type,
          description: obj.description,
          gps: obj.gps, // { topPercent, leftPercent, floor }
          map: obj.map,
        })),
      };
    }
  }

  console.log(`  ✓ ${questsWithGPS} quests have GPS coordinates`);
  console.log(`  ✓ ${totalObjectivesWithGPS} objectives with GPS total`);

  // Show a sample
  const firstKey = Object.keys(gpsData)[0];
  if (firstKey) {
    const sample = gpsData[firstKey];
    console.log(`\n  Sample quest: "${sample.title}"`);
    console.log(`  First objective GPS:`, JSON.stringify(sample.objectives[0].gps));
  }

  fs.writeFileSync("map-gps.json", JSON.stringify(gpsData, null, 2));
  console.log("\n  → Saved map-gps.json");

} catch (e) {
  console.error("  ✗ TarkovTracker GPS fetch failed:", e.message);
}

// ── 3. Fetch TarkovTracker maps.json (SVG metadata) ──────────────────────────
console.log("\nFetching TarkovTracker maps metadata...");
try {
  const res = await fetch(TARKOVTRACKER_MAPS);
  const raw = await res.json();
  console.log(`  ✓ Got ${Object.keys(raw).length} maps`);

  // Show what fields exist
  const firstMap = Object.values(raw)[0];
  console.log("  Map fields:", Object.keys(firstMap).join(", "));
  if (firstMap.svg) console.log("  SVG fields:", Object.keys(firstMap.svg).join(", "));

  fs.writeFileSync("tarkovtracker-maps.json", JSON.stringify(raw, null, 2));
  console.log("  → Saved tarkovtracker-maps.json");

} catch (e) {
  console.error("  ✗ TarkovTracker maps fetch failed:", e.message);
}

console.log("\n✓ All done. Share the output files with Claude to continue the build.");
