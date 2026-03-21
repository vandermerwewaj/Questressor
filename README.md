# ☠️ Questressor

> *The tool that aggravates your progress — or aggravates you into making it.*

A full-featured Escape from Tarkov quest intelligence system built for two PMC operators. Tracks suffering per player, maps quest chains as a war tree, pins objective locations on interactive tactical maps, and generates AI-powered debrief reports to document who's falling behind.

React + Vite frontend. Node.js + Express backend. All intel stored locally — no accounts, no cloud, no extraction fees.

---

## CAPABILITIES

**Quest Log** — All 494 quests filterable by trader, searchable by name. One click to mark complete — prerequisite quests auto-complete, uncompleting cascades forward through the chain. Alphabetical. No excuses.
![Intel Board  Original Size](https://github.com/user-attachments/assets/f77dfd09-8e2f-4556-99d5-4d0f6f496b54)


**Quest Tree** — Visual directed graph of quest chains per trader. Click any node to illuminate its full ancestor/descendant chain in that trader's colour. Green dot means you're cleared hot.
![DP Chain  Original Size](https://github.com/user-attachments/assets/1e7fa5d0-8ecc-4063-9e17-38680b505158)

**Tactical Map** — 10 maps with per-floor switching. 197 GPS-positioned quest objectives plotted as colour-coded pins. Scroll to zoom toward cursor, drag to pan, toggle labels, hide completed objectives. Click any pin to open the full intel flyout — selected quest pins pulse and number themselves so you know exactly where to be.
![Tactical  Original Size](https://github.com/user-attachments/assets/f1eab00c-179f-4705-8a5d-44fc4d224065)

**Unlockables** — Full catalogue of 224 trader offer unlocks with quest chain progress. Know what you're grinding toward before you grind.
![Contraband  Original Size](https://github.com/user-attachments/assets/34795dd6-faa6-46d7-9f80-35a38562548b)

**Operator Compare** — Side-by-side PMC stats, trader-by-trader standings, bragging rights board, and an optional AI-generated debrief report powered by Claude. Useful for establishing who needs to be embarrassed into playing more.
![Debrief  Original Size](https://github.com/user-attachments/assets/eef36f6e-0acb-4ceb-8e4c-bab335e32423)

**Dual Operator** — Separate progress tracking per PMC. Second operator connects over LAN from their own machine. Progress saves automatically.

---

## REQUIREMENTS

- **Node.js 18 or higher** — https://nodejs.org (LTS version)

---

## DEPLOYMENT — FIRST TIME

**Step 1 — Install dependencies**

Open Command Prompt in the `questressor` folder (click the address bar in File Explorer, type `cmd`, Enter):

```
npm install
```

**Step 2 — Run the setup script**

```
node setup.mjs
```

This fetches all intel in one operation:
- Quest and trader data from tarkov.dev API → `tasks.json`, `traders.json`
- Quest GPS coordinates from TarkovTracker → `map-gps.json`
- All 10 tactical map SVGs → `maps\` folder

**Step 3 — Build and deploy**

```
npm run build
npm start
```

Open http://localhost:3001. You're in.

---

## DAILY DEPLOYMENT

```
npm start
```

Open http://localhost:3001. Only run `npm run build` again if source files were modified.

---

## SECOND OPERATOR (LAN)

Find your IP: press `Win+R` → type `cmd` → type `ipconfig` → look for **IPv4 Address**.

They visit `http://<your-ip>:3001` in their browser. Progress is tracked separately per operator.

If they can't connect, Windows Firewall is blocking exfil on port 3001:
`Windows Security → Firewall → Advanced Settings → Inbound Rules → New Rule → Port → TCP → 3001 → Allow`

---

## OPERATOR CALLSIGNS

Click the ✎ pencil icon in the header to rename in-app. Or breach `config.json` directly:

```json
{
  "users": {
    "user1": { "name": "Dad", "color": "#c8a84b" },
    "user2": { "name": "Declan", "color": "#4a9eed" }
  }
}
```

---

## AI DEBRIEF (optional)

The Compare tab can generate an EFT-flavored intelligence report using the Claude API. Useful for psychological warfare between operators.

1. Acquire an API key at https://console.anthropic.com
2. Create `.env` in the folder (in Notepad: Save as type → All Files → filename `.env`):
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
3. `npm install dotenv`
4. Deploy with: `node -r dotenv/config server.js`

---

## INTEL REFRESH

BSG updates quests. Run this after any major patch:

```
node setup.mjs
```

Re-fetches all quest data, trader data, and GPS coordinates. Your `progress.json` is never touched — your suffering persists across refreshes.

---

## INTEL QUERIES (reference)

The setup script handles these automatically. Documented here if manual extraction is ever needed at https://api.tarkov.dev/graphql.

<details>
<summary>Tasks query</summary>

```graphql
query GetTasks {
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
}
```

Wrap result as `{ "data": { "tasks": [...] } }` and save as `tasks.json`.
</details>

<details>
<summary>Traders query</summary>

```graphql
query GetTraders {
  traders {
    id name normalizedName imageLink
    levels { level requiredPlayerLevel requiredReputation requiredCommerce }
  }
}
```

Wrap result as `{ "data": { "traders": [...] } }` and save as `traders.json`.
</details>

---

## FOLDER STRUCTURE

```
questressor\
├── src\
│   ├── App.jsx           ← entire frontend
│   └── main.jsx
├── maps\                 ← tactical map SVGs (generated by setup)
├── server.js             ← Express backend
├── package.json
├── vite.config.js
├── index.html
├── config.json           ← operator callsigns and colours
├── progress.json         ← auto-created, stores all suffering
├── tasks.json            ← quest intel (generated by setup)
├── traders.json          ← trader intel (generated by setup)
├── map-gps.json          ← objective GPS data (generated by setup)
├── setup.mjs             ← full intel fetch — run this first
└── .env                  ← optional, AI debrief key
```

---

## INTEL SOURCES

- Quest and trader data — [tarkov.dev](https://tarkov.dev) GraphQL API (community maintained, open)
- Quest GPS coordinates — [TarkovTracker/tarkovdata](https://github.com/TarkovTracker/tarkovdata) (community maintained, open)
- Tactical map SVGs — [TarkovTracker/tarkovdata](https://github.com/TarkovTracker/tarkovdata)
- AI debrief — [Anthropic Claude API](https://console.anthropic.com) (optional, requires key)

197 of 494 quests have GPS coordinates — these are static objective quests: mark locations, item pickups, stash plants. Kill-count quests don't need map pins. You already know what to do.

---

## FIELD TROUBLESHOOTING

**"Port already in use"** — change `3001` in the last line of `server.js` to any open port.

**Blank page on load** — run `npm run build` before `npm start`.

**Map tab shows no map** — run `node setup.mjs`, confirm `maps\` folder was created.

**Second operator can't connect** — check Windows Firewall above, or change port to `8080`.

---

## CREDITS

Built with [Claude](https://claude.ai) by Anthropic. Quest intel from [tarkov.dev](https://tarkov.dev). Tactical maps from [TarkovTracker](https://github.com/TarkovTracker/tarkovdata).

Not affiliated with Battlestate Games. All suffering is your own.
