import { useState, useMemo, useRef, useEffect, useCallback } from "react";


// ─── TRADER COLORS ─────────────────────────────────────────────────────────────
const TC = {
  Prapor:        { base:"#6b1515", light:"#e05252", bg:"rgba(224,82,82,.1)",    label:"#fbb4b4" },
  Therapist:     { base:"#145e32", light:"#2ecc71", bg:"rgba(46,204,113,.1)",   label:"#a8f0c8" },
  Skier:         { base:"#1a3e6e", light:"#4a9eed", bg:"rgba(74,158,237,.1)",   label:"#aad4f8" },
  Peacekeeper:   { base:"#0a4d5c", light:"#1ab5d0", bg:"rgba(26,181,208,.1)",   label:"#9de8f3" },
  Mechanic:      { base:"#3d3d3d", light:"#8a9ba8", bg:"rgba(138,155,168,.1)",  label:"#c8d4db" },
  Ragman:        { base:"#7a4206", light:"#e8921a", bg:"rgba(232,146,26,.1)",   label:"#fcd29a" },
  Jaeger:        { base:"#4d1f6e", light:"#a45ce0", bg:"rgba(164,92,224,.1)",   label:"#d8b4fe" },
  Fence:         { base:"#4a3600", light:"#b8860b", bg:"rgba(184,134,11,.1)",   label:"#f0d070" },
  Ref:           { base:"#6e1f6e", light:"#e040e0", bg:"rgba(224,64,224,.1)",   label:"#f8b4f8" },
  "BTR Driver":  { base:"#1f4d20", light:"#4caf50", bg:"rgba(76,175,80,.1)",    label:"#a5d6a7" },
  Lightkeeper:   { base:"#004d4d", light:"#00bcd4", bg:"rgba(0,188,212,.1)",    label:"#80deea" },
};
const DC = { base:"#252d3a", light:"#5a7060", bg:"rgba(90,112,96,.1)", label:"#9db8a0" };
const tc = (trader) => TC[trader] || DC;

const OBJ_ICONS = {
  shoot:"⚔", kill:"⚔", giveItem:"▣", findItem:"◎", findQuestItem:"◎",
  giveQuestItem:"▣", visit:"◈", extract:"◇", plantItem:"⊕", plantQuestItem:"⊕",
  mark:"⊕", buildWeapon:"⚙", traderLevel:"★", traderStanding:"★",
  skill:"↑", experience:"◈", taskStatus:"○", useItem:"◎", sellItem:"₽",
};

// ─── DATA TRANSFORM ────────────────────────────────────────────────────────────
function transformTasks(raw) {
  return raw.map(t => ({
    id: t.id,
    name: t.name,
    trader: t.trader?.name || "Unknown",
    traderId: t.trader?.id,
    minLevel: t.minPlayerLevel || 1,
    location: t.map?.name || "Any",
    experience: t.experience || 0,
    wikiUrl: t.wikiLink || "#",
    imageUrl: t.taskImageLink,
    prerequisites: (t.taskRequirements || []).map(r => r.task?.id).filter(Boolean),
    objectives: (t.objectives || []).map(o => ({
      id: o.id, type: o.type, description: o.description, optional: o.optional,
      items: o.items || [], count: o.count, foundInRaid: o.foundInRaid,
      target: o.target, bodyParts: o.bodyParts || [], maps: o.maps || [],
      trader: o.trader?.name, level: o.level, zones: o.zones || [],
      useAny: o.useAny || [],
    })),
    rewards: {
      roubles: (t.finishRewards?.items || []).find(i => i.item?.name === "Roubles")?.count || 0,
      items: (t.finishRewards?.items || [])
        .filter(i => i.item?.name !== "Roubles")
        .map(i => ({ name: i.item?.name, count: i.count })),
      traderStanding: (t.finishRewards?.traderStanding || []).map(s => ({
        trader: s.trader?.name, standing: s.standing
      })),
      offerUnlocks: (t.finishRewards?.offerUnlock || []).map(u => ({
        trader: u.trader?.name, item: u.item?.name, itemId: u.item?.id, level: u.level
      })),
      traderUnlocks: (t.finishRewards?.traderUnlock || []).map(u => ({ name: u.name })),
      skillRewards: (t.finishRewards?.skillLevelReward || []).map(s => ({ name: s.name, level: s.level })),
    }
  }));
}

// ─── LAYOUT ENGINE ────────────────────────────────────────────────────────────
function computeLayout(quests) {
  const qmap = Object.fromEntries(quests.map(q => [q.id, q]));

  // Assign each node to a column (layer) based on its deepest prerequisite
  const layers = {};
  const visited = new Set();
  const getLayer = (id) => {
    if (layers[id] !== undefined) return layers[id];
    if (visited.has(id)) { layers[id] = 0; return 0; }
    visited.add(id);
    const q = qmap[id]; if (!q) { layers[id] = 0; return 0; }
    const prereqLayers = q.prerequisites.filter(p => qmap[p]).map(getLayer);
    layers[id] = prereqLayers.length ? Math.max(...prereqLayers) + 1 : 0;
    return layers[id];
  };
  quests.forEach(q => getLayer(q.id));

  // Find chain length for each root node (longest downstream path)
  const chainLen = {};
  const getChainLen = (id) => {
    if (chainLen[id] !== undefined) return chainLen[id];
    const children = quests.filter(q => q.prerequisites.includes(id));
    chainLen[id] = children.length ? 1 + Math.max(...children.map(c => getChainLen(c.id))) : 0;
    return chainLen[id];
  };
  quests.forEach(q => getChainLen(q.id));

  // For each node, find its root ancestor (the layer-0 node it descends from)
  const getRoot = (id) => {
    const q = qmap[id]; if (!q) return id;
    const prereqs = q.prerequisites.filter(p => qmap[p]);
    return prereqs.length ? getRoot(prereqs[0]) : id;
  };

  // Sort root nodes by chain length descending so longest chain is at the top
  const rootNodes = quests.filter(q => !q.prerequisites.some(p => qmap[p]));
  rootNodes.sort((a, b) => getChainLen(b.id) - getChainLen(a.id));

  // Assign a vertical band to each root (and all its descendants share that band)
  const rootRow = {};
  let rowOffset = 0;
  rootNodes.forEach(root => {
    rootRow[root.id] = rowOffset;
    rowOffset++;
  });

  const byLayer = {};
  quests.forEach(q => { const l = layers[q.id] || 0; (byLayer[l] = byLayer[l] || []).push(q.id); });

  // Within each layer, sort nodes so they appear near their chain's vertical band
  Object.keys(byLayer).forEach(l => {
    byLayer[l].sort((a, b) => {
      const ra = rootRow[getRoot(a)] ?? 999;
      const rb = rootRow[getRoot(b)] ?? 999;
      return ra - rb;
    });
  });

  const NW = 162, NH = 50, HG = 212, VG = 84;
  const positions = {};
  Object.entries(byLayer).forEach(([l, ids]) => {
    ids.forEach((id, i) => { positions[id] = { x: parseInt(l) * HG + 16, y: i * VG + 16 }; });
  });
  const maxL = Math.max(...Object.keys(byLayer).map(Number), 0);
  const maxC = Math.max(...Object.values(byLayer).map(a => a.length), 1);
  return { positions, NW, NH, totalW: (maxL + 1) * HG + NW + 32, totalH: maxC * VG + NH + 32 };
}

function getRelated(questId, allTasks) {
  const qmap = Object.fromEntries(allTasks.map(q => [q.id, q]));
  const ancestors = new Set(), descendants = new Set();
  const up = id => qmap[id]?.prerequisites.forEach(p => { if (!ancestors.has(p)) { ancestors.add(p); up(p); } });
  const down = id => allTasks.filter(q => q.prerequisites.includes(id)).forEach(q => {
    if (!descendants.has(q.id)) { descendants.add(q.id); down(q.id); }
  });
  up(questId); down(questId);
  return { ancestors, descendants };
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07090c;overflow:hidden}
.eft-app{font-family:'Rajdhani',sans-serif;background:#07090c;color:#d8dfe8;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
.eft-app::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px);pointer-events:none;z-index:9999}

/* ── Header ── */
.hdr-top{display:flex;align-items:center;height:46px;background:#080b0f;border-bottom:1px solid #1a2030;padding:0 12px;gap:8px;flex-shrink:0}
.hdr-logo{display:flex;align-items:center;gap:8px;flex-shrink:0}
.hdr-logo-text{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;letter-spacing:.14em;color:#c8a84b;text-transform:uppercase}
.hdr-logo-sub{font-family:'Share Tech Mono',monospace;font-size:8px;color:#2e5030;letter-spacing:.06em}
.hdr-users{margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0}
.hdr-tabs{display:flex;align-items:center;height:42px;background:#080b0f;border-bottom:1px solid #1a2030;flex-shrink:0;padding:0 12px;gap:8px}

/* ── Tab select ── */
.tab-select{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase;background:#0d1014;border:1px solid #252d3a;color:#c8a84b;padding:8px 32px 8px 12px;border-radius:2px;cursor:pointer;outline:none;-webkit-appearance:none;appearance:none;flex:1}
.tab-select-wrap{position:relative;flex:1;max-width:320px}
.tab-select-wrap::after{content:'▼';position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#c8a84b;font-size:9px;pointer-events:none}

/* ── Inputs ── */
.search-in{background:#101610;border:1px solid #233023;color:#d8dfe8;padding:6px 12px;font-family:'Share Tech Mono',monospace;font-size:12px;border-radius:2px;outline:none;transition:border-color .2s;min-width:0}
.search-in:focus{border-color:#c8a84b}
.search-in::placeholder{color:#3a4e3c}

/* ── Buttons ── */
.filter-btn{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border:1px solid #233023;background:transparent;color:#5a7060;cursor:pointer;border-radius:2px;transition:all .15s;white-space:nowrap;flex-shrink:0}
.filter-btn:hover{color:#9db8a0;border-color:#3a4a58}
.filter-btn.active{border-color:#c8a84b;background:rgba(200,168,75,.1);color:#c8a84b}
.usr-btn{display:flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid;border-radius:3px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;transition:all .2s;background:transparent;white-space:nowrap}

/* ── Filter rows ── */
.filter-row{padding:7px 12px;border-bottom:1px solid #1a2030;background:#090c10;display:flex;align-items:center;gap:7px}
.filter-row-vendors{padding:6px 12px;border-bottom:1px solid #1a2030;background:#080b0f;display:flex;align-items:center;gap:5px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex-shrink:0}
.filter-row-vendors::-webkit-scrollbar{display:none}

/* ── Cards ── */
.q-card{background:#0d1014;border:1px solid #1a2030;border-left:3px solid;border-radius:2px;margin-bottom:6px;overflow:hidden;transition:background .15s}
.q-card:hover{background:#121a12}
.q-card.done{opacity:.45}
.q-head{padding:9px 13px;cursor:pointer;display:flex;align-items:center;gap:9px;user-select:none}
.q-body{border-top:1px solid #1a2030;padding:13px 15px;font-size:13px}
.chip{font-family:'Share Tech Mono',monospace;font-size:10px;padding:2px 6px;border-radius:2px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.chk{width:20px;height:20px;border:1.5px solid #2a3845;border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;flex-shrink:0;transition:all .15s}

/* ── Flyout ── */
.flyout{position:fixed;top:0;right:0;width:min(370px,100vw);height:100vh;height:100dvh;background:#090c10;border-left:1px solid #1a2030;z-index:800;overflow-y:auto;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1)}
.flyout.open{transform:translateX(0)}
.flyout-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:799;opacity:0;pointer-events:none;transition:opacity .28s}
.flyout-overlay.open{opacity:1;pointer-events:auto}

/* ── Misc ── */
.svg-wrap{overflow:auto;flex:1;min-height:0;background:#090d09;border:1px solid #1a2030;border-radius:2px}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#090c10}
::-webkit-scrollbar-thumb{background:#252d3a;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#3a4a58}
.sec-lbl{font-family:'Share Tech Mono',monospace;font-size:10px;color:#3a4a58;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #1a2030}
.wiki-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:#0d1014;border:1px solid #1a2030;color:#5a7060;text-decoration:none;border-radius:2px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;transition:all .15s;margin-top:6px}
.wiki-btn:hover{color:#9db8a0;border-color:#3a4a58}
.ready-badge{font-family:'Share Tech Mono',monospace;font-size:9px;padding:1px 5px;background:rgba(46,204,113,.15);border:1px solid rgba(46,204,113,.4);color:#2ecc71;border-radius:2px}
.bar-track{height:6px;background:#1a2030;border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.4,0,.2,1)}
.cmp-card{background:#0d1014;border:1px solid #1a2030;border-radius:2px;padding:16px}
.loading{display:flex;align-items:center;justify-content:center;flex:1;flex-direction:column;gap:12px;color:#364858;font-family:'Share Tech Mono',monospace;font-size:12px}

/* ── Map View ── */
.map-wrap{position:relative;overflow:hidden;background:#07090c;flex:1;min-height:0;border:1px solid #1a2030;border-radius:2px;cursor:crosshair}
.map-img{width:100%;height:100%;object-fit:contain;display:block;opacity:.85}
.map-pin{position:absolute;transform:translate(-50%,-50%);cursor:pointer;transition:transform .15s,opacity .15s;z-index:10}
.map-pin:hover{transform:translate(-50%,-50%) scale(1.35);z-index:20}
.map-pin.done{opacity:.25}
.map-pin.done:hover{opacity:.6}
.pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:7px;box-shadow:0 0 6px rgba(0,0,0,.6)}
.pin-tooltip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#090c10;border:1px solid #252d3a;border-radius:2px;padding:6px 9px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;min-width:140px;max-width:220px;z-index:30}
.map-pin:hover .pin-tooltip{opacity:1}
.pin-tooltip-name{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;color:#c8d8ca;margin-bottom:2px}
.pin-tooltip-type{font-family:'Share Tech Mono',monospace;font-size:9px;color:#364858;text-transform:uppercase}
@keyframes mapPinPulse{0%{transform:scale(1);opacity:.9}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}
`;
// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
const Lbl = ({ children }) => <div className="sec-lbl">{children}</div>;
const Chip = ({ children, style }) => <span className="chip" style={style}>{children}</span>;
const fmt = n => n?.toLocaleString() || "0";

function BarRow({ label, val, max, color }) {
  const pct = max ? Math.round((val / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#5a7060" }}>{label}</span>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color }}>{val}/{max}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── QUEST DETAIL FLYOUT ──────────────────────────────────────────────────────
function QuestDetailPanel({ quest, completed, onToggleComplete, onClose, onShowInTree }) {
  if (!quest) return (
    <>
      <div className="flyout-overlay" />
      <div className="flyout" />
    </>
  );
  const c = tc(quest.trader);
  const isDone = completed.has(quest.id);
  const prereqs = quest.prerequisites.map(id => ({id})); // we'll show names from the quest list
  const nextQuests = []; // computed outside — kept simple here
  const allPrereqsDone = quest.prerequisites.every(p => completed.has(p));

  return (
    <>
      <div className="flyout-overlay open" onClick={onClose} />
      <div className="flyout open">
        {/* Header */}
        <div style={{ padding:"15px 18px", background:c.bg, borderBottom:"1px solid #1a2030", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
                <Chip style={{ background:c.bg, color:c.label, border:`1px solid ${c.base}` }}>{quest.trader}</Chip>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8a84b" }}>LVL {quest.minLevel}+</span>
                {!isDone && allPrereqsDone && <span className="ready-badge">CLEARED HOT</span>}
                {isDone && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2ecc71", padding:"1px 5px", background:"rgba(46,204,113,.15)", border:"1px solid rgba(46,204,113,.4)", borderRadius:2 }}>✓ DONE</span>}
              </div>
              <div style={{ fontWeight:700, fontSize:19, color:"#d8dfe8", lineHeight:1.1 }}>{quest.name}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858", marginTop:3 }}>◈ {quest.location}</div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"#364858", cursor:"pointer", fontSize:18, padding:4, lineHeight:1, flexShrink:0 }}>✕</button>
          </div>
        </div>

        <div style={{ padding:"15px 18px" }}>
          {/* Actions */}
          <div style={{ display:"flex", gap:7, marginBottom:16 }}>
            <button onClick={() => onToggleComplete(quest.id)}
              style={{ flex:1, padding:"9px 0", background:isDone?"rgba(46,204,113,.12)":c.bg, border:`1px solid ${isDone?"#2ecc71":c.light}`, color:isDone?"#2ecc71":c.label, cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".12em", textTransform:"uppercase", borderRadius:2 }}>
              {isDone ? "✓ EXTRACTED" : "MARK EXTRACTED"}
            </button>
            <button onClick={onShowInTree}
              style={{ padding:"9px 13px", background:"#0d1014", border:"1px solid #1a2030", color:"#5a7060", cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", borderRadius:2 }}>
              OP CHAIN →
            </button>
          </div>

          {/* Objectives */}
          <div style={{ marginBottom:15 }}>
            <Lbl>ORDERS</Lbl>
            {quest.objectives.map((obj, i) => (
              <div key={i} style={{ display:"flex", gap:9, marginBottom:7, alignItems:"flex-start" }}>
                <span style={{ fontSize:12, color:c.light, flexShrink:0, marginTop:2 }}>{OBJ_ICONS[obj.type]||"•"}</span>
                <div>
                  <span style={{ color: obj.optional?"#4a6050":"#c8d8ca", fontSize:13, lineHeight:1.5 }}>
                    {obj.description}
                    {obj.optional && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858", marginLeft:6 }}>[OPTIONAL]</span>}
                  </span>
                  {obj.items?.length > 0 && (
                    <div style={{ marginTop:4, display:"flex", flexWrap:"wrap", gap:3 }}>
                      {obj.items.slice(0,4).map(item => (
                        <Chip key={item.id||item.name} style={{ background:"rgba(200,168,75,.07)", color:"#c8a84b", border:"1px solid rgba(200,168,75,.2)" }}>
                          {item.shortName||item.name}
                        </Chip>
                      ))}
                      {obj.items.length > 4 && <Chip style={{ color:"#364858", border:"1px solid #1a2030" }}>+{obj.items.length-4} more</Chip>}
                    </div>
                  )}
                  {obj.foundInRaid && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#e05252", marginTop:3 }}>⚑ FOUND IN RAID</div>}
                  {obj.count > 1 && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858", marginTop:2 }}>×{obj.count}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Rewards */}
          <div style={{ marginBottom:15 }}>
            <Lbl>EXTRACTION REWARDS</Lbl>
            <div style={{ display:"flex", gap:18, flexWrap:"wrap", marginBottom:8 }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#c8a84b" }}>◈ {fmt(quest.experience)} XP</span>
              {quest.rewards.roubles > 0 && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#2ecc71" }}>₽ {fmt(quest.rewards.roubles)}</span>}
            </div>
            {quest.rewards.traderStanding.map(s => (
              <div key={s.trader} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a9060", marginBottom:3 }}>
                {s.trader} rep +{s.standing}
              </div>
            ))}
            {quest.rewards.items.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                {quest.rewards.items.map((item, i) => (
                  <Chip key={i} style={{ background:"rgba(46,204,113,.07)", color:"#7de8a0", border:"1px solid rgba(46,204,113,.2)" }}>
                    {item.count > 1 ? `×${item.count} ` : ""}{item.name}
                  </Chip>
                ))}
              </div>
            )}
            {quest.rewards.offerUnlocks.length > 0 && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8a84b", marginBottom:5 }}>STASH UNLOCKED</div>
                {quest.rewards.offerUnlocks.map((u, i) => (
                  <div key={i} style={{ padding:"5px 9px", background:"rgba(200,168,75,.07)", border:"1px solid rgba(200,168,75,.2)", borderRadius:2, marginBottom:4, fontSize:12, color:"#c8a84b", fontFamily:"'Share Tech Mono',monospace" }}>
                    🔓 {u.item} <span style={{ opacity:.5 }}>@ {u.trader} LL{u.level}</span>
                  </div>
                ))}
              </div>
            )}
            {quest.rewards.skillRewards.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                {quest.rewards.skillRewards.map((s, i) => (
                  <Chip key={i} style={{ background:"rgba(164,92,224,.07)", color:"#d8b4fe", border:"1px solid rgba(164,92,224,.2)" }}>
                    ↑ {s.name} Lvl {s.level}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <a href={quest.wikiUrl} target="_blank" rel="noreferrer" className="wiki-btn">
            📖 WIKI — MAPS & FIELD GUIDES
          </a>
        </div>
      </div>
    </>
  );
}

// ─── QUEST CARD ───────────────────────────────────────────────────────────────
function QuestCard({ quest, isExpanded, isDone, canStart, onToggleExpand, onToggleComplete, onDetails }) {
  const c = tc(quest.trader);
  return (
    <div className={`q-card ${isDone ? "done" : ""}`} style={{ borderLeftColor: c.light }}>
      <div className="q-head" onClick={onToggleExpand}>
        <div className="chk" onClick={e => { e.stopPropagation(); onToggleComplete(); }}
          style={{ borderColor: isDone?c.light:"#2a3845", background: isDone?c.bg:"transparent", color:c.light }}>
          {isDone && "✓"}
        </div>
        <span style={{ fontWeight:700, fontSize:15, flex:1, color:isDone?"#4a6050":"#d8dfe8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {quest.name}
        </span>
        {canStart && !isDone && <span className="ready-badge">CLEARED HOT</span>}
        <Chip style={{ background:c.bg, color:c.label, border:`1px solid ${c.base}`, flexShrink:0 }}>{quest.trader}</Chip>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858", flexShrink:0 }}>{quest.location}</span>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8a84b", flexShrink:0 }}>L{quest.minLevel}</span>
        <span style={{ color:"#2a3845", fontSize:10, transform:isExpanded?"rotate(180deg)":"none", transition:"transform .2s", flexShrink:0 }}>▼</span>
      </div>

      {isExpanded && (
        <div className="q-body">
          <div style={{ marginBottom:10 }}>
            {quest.objectives.slice(0, 5).map((obj, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}>
                <span style={{ color:c.light, fontSize:11, flexShrink:0 }}>{OBJ_ICONS[obj.type]||"•"}</span>
                <span style={{ color: obj.optional?"#364858":"#9db8a0", fontSize:13, lineHeight:1.5 }}>{obj.description}</span>
              </div>
            ))}
            {quest.objectives.length > 5 && (
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858" }}>+{quest.objectives.length-5} more orders</div>
            )}
          </div>
          <div style={{ display:"flex", gap:14, marginBottom:10, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#c8a84b" }}>◈ {fmt(quest.experience)} XP</span>
            {quest.rewards.roubles > 0 && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#2ecc71" }}>₽ {fmt(quest.rewards.roubles)}</span>}
            {quest.rewards.offerUnlocks.length > 0 && (
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#e8921a" }}>🔓 {quest.rewards.offerUnlocks.length} cache unlock{quest.rewards.offerUnlocks.length>1?"s":""}</span>
            )}
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <a href={quest.wikiUrl} target="_blank" rel="noreferrer" className="wiki-btn" style={{ flex:1, marginTop:0 }}>📖 FIELD GUIDE</a>
            <button onClick={onDetails} style={{ padding:"9px 13px", background:c.bg, border:`1px solid ${c.base}`, color:c.label, cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", borderRadius:2 }}>
              INTEL →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QUEST LIST VIEW ──────────────────────────────────────────────────────────
function QuestListView({ tasks, completed, toggleCompleted, onSelect }) {
  const [expanded, setExpanded] = useState(new Set());
  const [trader, setTrader] = useState("All");
  const [search, setSearch] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const traders = useMemo(() => ["All", ...new Set(tasks.map(t => t.trader))], [tasks]);

  const toggle = id => setExpanded(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const filtered = useMemo(() => tasks.filter(q => {
    if (hideDone && completed.has(q.id)) return false;
    if (trader !== "All" && q.trader !== trader) return false;
    if (search) { const s = search.toLowerCase(); return q.name.toLowerCase().includes(s) || q.location.toLowerCase().includes(s) || q.trader.toLowerCase().includes(s); }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name)), [trader, search, completed, hideDone, tasks]);

  const canStart = q => !completed.has(q.id) && q.prerequisites.every(p => completed.has(p));
  const doneCount = useMemo(() => tasks.filter(q => completed.has(q.id)).length, [tasks, completed]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Row 1 — Search */}
      <div className="filter-row" style={{ paddingTop:8, paddingBottom:8 }}>
        <input className="search-in" placeholder="SEARCH INTEL..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:0 }} />
        <button className={`filter-btn ${hideDone?"active":""}`} onClick={() => setHideDone(p=>!p)} style={{ flexShrink:0 }}>{hideDone?"SHOW ALL OPS":"PURGE EXFIL'D"}</button>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858", flexShrink:0, whiteSpace:"nowrap" }}>
          {doneCount}/{tasks.length}
        </span>
      </div>
      {/* Row 2 — Vendor filters (single scrolling row) */}
      <div className="filter-row-vendors">
        {traders.map(t => (
          <button key={t} className={`filter-btn ${trader===t?"active":""}`} onClick={() => setTrader(t)}
            style={t!=="All"&&trader===t ? { borderColor:TC[t]?.light, color:TC[t]?.label, background:TC[t]?.bg, flexShrink:0 } : { flexShrink:0 }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:"auto", padding:"10px 10px" }}>
        {filtered.map(q => (
          <QuestCard key={q.id} quest={q}
            isExpanded={expanded.has(q.id)} isDone={completed.has(q.id)} canStart={canStart(q)}
            onToggleExpand={() => toggle(q.id)} onToggleComplete={() => toggleCompleted(q.id)}
            onDetails={() => onSelect(q)} />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:60, color:"#2a3845", fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>
            NO MATCHING OPS — CHECK YOUR SOURCES
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QUEST TREE VIEW ──────────────────────────────────────────────────────────
function QuestTreeView({ tasks, completed, selectedQuest, onSelect }) {
  const [traderFilter, setTraderFilter] = useState("Prapor");
  const [showAll, setShowAll] = useState(false);
  const svgRef = useRef(null);
  const traders = useMemo(() => [...new Set(tasks.map(t => t.trader))], [tasks]);

  const visibleTasks = useMemo(() => {
    if (showAll) return tasks;
    return tasks.filter(t => t.trader === traderFilter);
  }, [tasks, traderFilter, showAll]);

  const layout = useMemo(() => computeLayout(visibleTasks), [visibleTasks]);
  const { positions, NW, NH, totalW, totalH } = layout;

  const { ancestors, descendants } = useMemo(() =>
    selectedQuest ? getRelated(selectedQuest.id, visibleTasks) : { ancestors: new Set(), descendants: new Set() },
    [selectedQuest, visibleTasks]
  );

  const edges = useMemo(() => {
    const idSet = new Set(visibleTasks.map(q => q.id));
    const result = [];
    visibleTasks.forEach(q => {
      q.prerequisites.forEach(pid => {
        if (idSet.has(pid) && positions[pid] && positions[q.id]) result.push({ from: pid, to: q.id });
      });
    });
    return result;
  }, [visibleTasks, positions]);

  useEffect(() => {
    if (selectedQuest && svgRef.current && positions[selectedQuest.id]) {
      const p = positions[selectedQuest.id];
      svgRef.current.scrollTo({ left: Math.max(0, p.x-200), top: Math.max(0, p.y-120), behavior:"smooth" });
    }
  }, [selectedQuest, positions]);

  const selC = selectedQuest ? tc(selectedQuest.trader) : null;

  const nodeOp = q => {
    if (!selectedQuest) return 1;
    if (q.id === selectedQuest.id) return 1;
    if (ancestors.has(q.id) || descendants.has(q.id)) return .9;
    return .15;
  };

  // Returns { stroke, width, marker } for an edge
  const edgeStyle = (from, to) => {
    if (!selectedQuest || !selC) return { stroke:"#1a2030", width:1, bright:false };
    const isAncChain = (ancestors.has(from)||from===selectedQuest.id) && (ancestors.has(to)||to===selectedQuest.id);
    const isDescChain = (descendants.has(from)||from===selectedQuest.id) && (descendants.has(to)||to===selectedQuest.id);
    if (from===selectedQuest.id || to===selectedQuest.id) return { stroke:selC.light, width:2, bright:true };
    if (isAncChain) return { stroke:selC.light+"aa", width:1.5, bright:true };
    if (isDescChain) return { stroke:selC.light+"66", width:1.5, bright:false };
    return { stroke:"#111811", width:1, bright:false };
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", padding:"10px 14px", gap:8 }}>
      {/* Controls */}
      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
        {!showAll && traders.map(t => (
          <button key={t} className={`filter-btn ${traderFilter===t?"active":""}`} onClick={() => setTraderFilter(t)}
            style={traderFilter===t ? { borderColor:TC[t]?.light||"#5a7060", color:TC[t]?.label||"#9db8a0", background:TC[t]?.bg||"rgba(90,112,96,.1)" } : {}}>
            <span style={{ display:"inline-block", width:5, height:5, borderRadius:1, background:traderFilter===t?(TC[t]?.light||"#5a7060"):"#2a3845", marginRight:4, verticalAlign:"middle" }}/>
            {t}
          </button>
        ))}
        <button className={`filter-btn ${showAll?"active":""}`} onClick={() => setShowAll(p=>!p)}
          style={showAll ? { borderColor:"#c8a84b", color:"#c8a84b" } : {}}>
          {showAll ? "◎ ALL TRADERS" : "ALL TRADERS"}
        </button>
        <div style={{ marginLeft:"auto", fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858" }}>
          {visibleTasks.length} tasks · {selectedQuest ? `◈ ${selectedQuest.name}` : "select for intel"}
        </div>
        {selectedQuest && (
          <button onClick={() => onSelect(null)} className="filter-btn">STAND DOWN</button>
        )}
      </div>

      {showAll && visibleTasks.length > 200 && (
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#e8921a", padding:"5px 8px", background:"rgba(232,146,26,.08)", border:"1px solid rgba(232,146,26,.2)", borderRadius:2 }}>
          ⚠ Rendering {visibleTasks.length} nodes — may be slow. Use trader filter for better performance.
        </div>
      )}

      {/* SVG Canvas */}
      <div className="svg-wrap" ref={svgRef}>
        <svg width={totalW} height={totalH}>
          <defs>
            <pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M30 0 L0 0 0 30" fill="none" stroke="rgba(30,43,30,.5)" strokeWidth=".5"/>
            </pattern>
            <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0,1 L6,3.5 L0,6 z" fill="#252d3a"/>
            </marker>
            <marker id="arr-g" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0,1 L6,3.5 L0,6 z" fill="#c8a84b"/>
            </marker>
          </defs>
          <rect width={totalW} height={totalH} fill="url(#g)"/>

          {edges.map((e, i) => {
            const fp = positions[e.from], tp = positions[e.to];
            const fx = fp.x+NW, fy = fp.y+NH/2, tx = tp.x, ty = tp.y+NH/2;
            const cx = (fx+tx)/2;
            const es = edgeStyle(e.from, e.to);
            return (
              <path key={i} d={`M${fx},${fy} C${cx},${fy} ${cx},${ty} ${tx},${ty}`}
                fill="none" stroke={es.stroke} strokeWidth={es.width}
                markerEnd={es.bright?"url(#arr-g)":"url(#arr)"} />
            );
          })}

          {visibleTasks.map(q => {
            const p = positions[q.id]; if (!p) return null;
            const c = tc(q.trader);
            const isDone = completed.has(q.id);
            const isSel = selectedQuest?.id === q.id;
            const canDo = !isDone && q.prerequisites.every(pid => completed.has(pid));
            const op = nodeOp(q);
            const isChain = selectedQuest && (ancestors.has(q.id) || descendants.has(q.id));
            return (
              <g key={q.id} style={{ cursor:"pointer", opacity:op }}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelect(q.id===selectedQuest?.id ? null : q)}>
                {isSel && <rect x={-3} y={-3} width={NW+6} height={NH+6} rx={4} fill={c.light} opacity={.15}/>}
                {canDo && <rect x={-1} y={-1} width={NW+2} height={NH+2} rx={3} fill="transparent"
                  stroke="#2ecc71" strokeWidth={1} opacity={.5} strokeDasharray="3,3"/>}
                <rect width={NW} height={NH} rx={2} fill={isDone?"#0d110d":"#111811"}
                  stroke={isSel?c.light:(isChain&&selC?selC.light:(isDone?"#1a231a":c.base))}
                  strokeWidth={isSel?2:(isChain?1.5:1)}/>
                <rect width={3} height={NH} rx={1} fill={isChain&&selC?selC.light:c.light} opacity={isDone?.2:.85}/>
                <text x={11} y={NH/2-4} fill={isDone?"#364858":"#c8d8ca"} fontSize={11.5}
                  fontFamily="'Rajdhani',sans-serif" fontWeight={700}>
                  {q.name.length>18?q.name.slice(0,17)+"…":q.name}
                </text>
                <text x={11} y={NH/2+10} fill={c.label} fontSize={8.5}
                  fontFamily="'Share Tech Mono',monospace" opacity={isDone?.3:.6}>
                  {q.trader.toUpperCase()} · L{q.minLevel}
                </text>
                {isDone && <text x={NW-14} y={NH/2+5} fill={c.light} fontSize={11} opacity={.4}>✓</text>}
                {canDo && <circle cx={NW-7} cy={7} r={3} fill="#2ecc71" opacity={.8}/>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── UNLOCKABLES VIEW ─────────────────────────────────────────────────────────
function UnlockablesView({ tasks, completed, onSelectQuest }) {
  const [selected, setSelected] = useState(null);
  const [traderFilter, setTraderFilter] = useState("All");
  const [search, setSearch] = useState("");
  const traders = useMemo(() => ["All", ...new Set(tasks.map(t => t.trader))], [tasks]);

  const unlockables = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      t.rewards.offerUnlocks.forEach(u => {
        if (!u.item) return;
        const key = u.item;
        if (!map[key]) map[key] = { item: u.item, itemId: u.itemId, trader: u.trader, traderLevel: u.level, questIds: [] };
        if (!map[key].questIds.includes(t.id)) map[key].questIds.push(t.id);
      });
    });
    return Object.values(map);
  }, [tasks]);

  const taskMap = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks]);

  const getChain = useCallback((questIds) => {
    const visited = new Set(), chain = [];
    const visit = id => {
      if (visited.has(id)) return;
      visited.add(id);
      const q = taskMap[id]; if (!q) return;
      q.prerequisites.forEach(visit);
      chain.push(q);
    };
    questIds.forEach(visit);
    return chain;
  }, [taskMap]);

  const filtered = useMemo(() => unlockables.filter(u => {
    if (traderFilter !== "All" && u.trader !== traderFilter) return false;
    if (search && !u.item.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [unlockables, traderFilter, search]);

  const chain = selected ? getChain(selected.questIds) : [];

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Left */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"9px 16px", borderBottom:"1px solid #1a2030", background:"#090c10", display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
          <input className="search-in" placeholder="SEARCH CONTRABAND..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:160 }}/>
          <div style={{ width:1, height:18, background:"#1a2030", flexShrink:0 }}/>
          {traders.map(t => (
            <button key={t} className={`filter-btn ${traderFilter===t?"active":""}`}
              onClick={() => setTraderFilter(t)}
              style={t!=="All"&&traderFilter===t ? { borderColor:TC[t]?.light, color:TC[t]?.label } : {}}>
              {t}
            </button>
          ))}
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858", marginLeft:"auto" }}>
            {filtered.length} items
          </span>
        </div>
        <div style={{ flex:1, overflow:"auto", padding:14 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:6 }}>
            {filtered.map(u => {
              const c = tc(u.trader);
              const isSel = selected?.item === u.item;
              const ch = getChain(u.questIds);
              const allDone = ch.every(q => completed.has(q.id));
              return (
                <div key={u.item}
                  style={{ padding:"9px 11px", background:isSel?c.bg:"#0d1014", border:`1px solid ${isSel?c.base:"#1a2030"}`, borderLeft:`3px solid ${c.light}`, borderRadius:2, cursor:"pointer", transition:"all .15s" }}
                  onClick={() => setSelected(isSel ? null : u)}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:allDone?"#2ecc71":"#c8d8ca", marginBottom:3, lineHeight:1.3 }}>
                    {allDone?"✓ ":"🔓 "}{u.item}
                  </div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858" }}>
                    {u.trader} LL{u.traderLevel} · {ch.length} quest{ch.length!==1?"s":""}
                  </div>
                  <div style={{ marginTop:5 }}>
                    <div style={{ height:2, background:"#1a2030", borderRadius:1, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${ch.length?ch.filter(q=>completed.has(q.id)).length/ch.length*100:0}%`, background:c.light, borderRadius:1, transition:"width .4s" }}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: chain */}
      <div style={{ width:310, borderLeft:"1px solid #1a2030", background:"#090c10", display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0 }}>
        {!selected ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, color:"#2a3845" }}>
            <div style={{ fontSize:36, opacity:.25 }}>🔓</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, textAlign:"center", lineHeight:1.8 }}>
              SELECT CONTRABAND<br/>TO VIEW<br/>ACQUISITION CHAIN
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding:"13px 15px", borderBottom:"1px solid #1a2030", background:"#0c1015" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#c8a84b", marginBottom:3 }}>ACQUISITION CHAIN —</div>
              <div style={{ fontWeight:700, fontSize:15, color:"#d8dfe8", lineHeight:1.2, marginBottom:4 }}>{selected.item}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858" }}>
                {chain.filter(q=>completed.has(q.id)).length}/{chain.length} ops cleared
              </div>
              <div style={{ marginTop:6, height:3, background:"#1a2030", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${chain.length?chain.filter(q=>completed.has(q.id)).length/chain.length*100:0}%`, background:tc(selected.trader).light, borderRadius:2, transition:"width .5s" }}/>
              </div>
            </div>
            <div style={{ flex:1, overflow:"auto", padding:"14px 13px" }}>
              {chain.map((q, i) => {
                const c = tc(q.trader);
                const isDone = completed.has(q.id);
                const isFinal = selected.questIds.includes(q.id);
                return (
                  <div key={q.id} style={{ position:"relative", paddingLeft:22, marginBottom:9 }}>
                    {i < chain.length-1 && <div style={{ position:"absolute", left:7, top:20, width:1, height:"calc(100% + 2px)", background:"#1a2030" }}/>}
                    <div style={{ position:"absolute", left:3, top:7, width:8, height:8, borderRadius:"50%", background:isDone?"#2ecc71":c.light, border:`2px solid ${isDone?"#2ecc71":c.base}` }}/>
                    <div onClick={() => onSelectQuest(q)}
                      style={{ padding:"7px 9px", background:isFinal?c.bg:"#0d1014", border:`1px solid ${isFinal?c.light:"#1a2030"}`, borderRadius:2, cursor:"pointer" }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:isDone?"#2ecc71":"#c8d8ca", marginBottom:2 }}>
                        {isDone?"✓ ":""}{q.name}
                        {isFinal && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#c8a84b", marginLeft:5 }}>UNLOCK</span>}
                      </div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858" }}>{q.trader} · {q.location}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAP VIEW ─────────────────────────────────────────────────────────────────
const OBJECTIVE_ICONS = { mark:"◈", pickup:"▣", locate:"◎", place:"⊕" };

// Map name → TarkovTracker SVG file + floors
const MAP_META = {
  "Factory":           { file:"Factory.svg",         floors:["Basement","Ground_Floor","First_Floor","Second_Floor"],     default:"Ground_Floor" },
  "Customs":           { file:"Customs.svg",          floors:["Ground_Level"],                                             default:"Ground_Level" },
  "Woods":             { file:"Woods.svg",            floors:["Ground_Level"],                                             default:"Ground_Level" },
  "Shoreline":         { file:"Shoreline.svg",        floors:["Ground_Level","Underground_Level","First_Floor","Second_Floor","Third_Floor"], default:"Ground_Level" },
  "Interchange":       { file:"Interchange.svg",      floors:["Ground_Level","First_Floor","Second_Floor"],               default:"Ground_Level" },
  "The Lab":           { file:"Labs.svg",             floors:["Technical_Level","First_Level","Second_Level"],            default:"Technical_Level" },
  "Reserve":           { file:"Reserve.svg",          floors:["Bunkers","Ground_Level"],                                  default:"Ground_Level" },
  "Lighthouse":        { file:"Lighthouse.svg",       floors:["Ground_Level"],                                            default:"Ground_Level" },
  "Streets of Tarkov": { file:"StreetsOfTarkov.svg",  floors:["Ground_Level","Underground_Level","First_Floor","Second_Floor","Third_Floor","Fourth_Floor","Fifth_Floor"], default:"Ground_Level" },
  "Ground Zero":       { file:"GroundZero.svg",       floors:["Ground_Level","Underground_Level","First_Floor","Second_Floor","Third_Floor"], default:"Ground_Level" },
};

// TarkovTracker numeric map ID → display name
const TT_MAP_ID = {
  0:"Factory", 1:"Customs", 2:"Woods", 3:"Shoreline",
  4:"Interchange", 5:"The Lab", 6:"Reserve", 7:"Lighthouse",
  8:"Streets of Tarkov", 9:"Ground Zero"
};

// Normalise a quest title for fuzzy matching
const normTitle = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function MapView({ tasks, completed, selectedQuest, onSelectQuest }) {
  const [gpsData, setGpsData]             = useState(null);
  const [gpsLoading, setGpsLoading]       = useState(true);
  const [selectedMap, setSelectedMap]     = useState("Customs");
  const [selectedFloor, setSelectedFloor] = useState("Ground_Level");
  const [hideDone, setHideDone]           = useState(false);
  const [showLabels, setShowLabels]       = useState(true);
  const [zoom, setZoom]                   = useState(1);
  const [pan, setPan]                     = useState({ x:0, y:0 });
  const [dragging, setDragging]           = useState(false);
  const dragStart                         = useRef(null);
  // Inline SVG: fetched text per map, cached by map name
  const [svgTexts, setSvgTexts]           = useState({});
  const [svgLoading, setSvgLoading]       = useState(false);
  const [svgViewBox, setSvgViewBox]       = useState(null); // {w, h}
  const svgContainerRef                   = useRef(null);
  const containerRef                      = useRef(null);

  useEffect(() => {
    fetch("/api/mapgps")
      .then(r => r.json())
      .then(d => { setGpsData(d); setGpsLoading(false); })
      .catch(() => setGpsLoading(false));
  }, []);

  // Fetch SVG text when map changes, cache it
  useEffect(() => {
    setZoom(1); setPan({ x:0, y:0 }); setSvgViewBox(null);
    const meta = MAP_META[selectedMap];
    if (!meta) return;
    if (svgTexts[selectedMap]) {
      // Already cached — just parse viewBox
      parseSvgViewBox(svgTexts[selectedMap]);
      return;
    }
    setSvgLoading(true);
    fetch(`/maps/${meta.file}`)
      .then(r => r.text())
      .then(text => {
        setSvgTexts(prev => ({ ...prev, [selectedMap]: text }));
        parseSvgViewBox(text);
        setSvgLoading(false);
      })
      .catch(() => setSvgLoading(false));
  }, [selectedMap]);

  // When floor changes, show/hide SVG groups
  useEffect(() => {
    if (!svgContainerRef.current) return;
    const meta = MAP_META[selectedMap];
    if (!meta || meta.floors.length <= 1) return;
    const svgEl = svgContainerRef.current.querySelector("svg");
    if (!svgEl) return;
    meta.floors.forEach(floor => {
      const group = svgEl.getElementById(floor);
      if (group) group.style.display = floor === selectedFloor ? "" : "none";
    });
  }, [selectedFloor, selectedMap, svgTexts]);

  const parseSvgViewBox = text => {
    const m = text.match(/viewBox=["']([^"']+)["']/i);
    if (m) {
      const parts = m[1].trim().split(/[\s,]+/);
      if (parts.length === 4) setSvgViewBox({ w: parseFloat(parts[2]), h: parseFloat(parts[3]) });
    }
  };

  const meta = MAP_META[selectedMap];

  const titleToTask = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[normTitle(t.name)] = t; });
    return map;
  }, [tasks]);

  const allPins = useMemo(() => {
    if (!gpsData) return [];
    const pins = [];
    Object.values(gpsData).forEach(gpsQuest => {
      const task = titleToTask[normTitle(gpsQuest.title)];
      if (!task) return;
      gpsQuest.objectives.forEach((obj, i) => {
        pins.push({
          key: `${gpsQuest.id}-${i}`,
          task,
          questTitle: gpsQuest.title,
          objType: obj.type,
          objDesc: obj.description || "",
          leftPercent: obj.gps.leftPercent,
          topPercent: obj.gps.topPercent,
          floor: obj.gps.floor,
          mapName: obj.map != null ? (TT_MAP_ID[obj.map] ?? task.location) : task.location,
        });
      });
    });
    return pins;
  }, [gpsData, titleToTask]);

  const visiblePins = useMemo(() => allPins.filter(p => {
    if (p.mapName !== selectedMap && p.mapName !== "Any") return false;
    if (p.floor && p.floor !== selectedFloor) return false;
    return true;
  }), [allPins, selectedMap, selectedFloor]);

  const incompleteCount = visiblePins.filter(p => !completed.has(p.task.id)).length;
  const floorLabel = f => f.replace(/_/g, " ");
  const svgText = svgTexts[selectedMap] || null;

  // Pin positioning — calculate based on viewBox and container size
  const getPinStyle = (leftPct, topPct) => {
    if (!containerRef.current || !svgViewBox) {
      return { left: `${leftPct}%`, top: `${topPct}%` };
    }
    const cW = containerRef.current.offsetWidth;
    const cH = containerRef.current.offsetHeight;
    const imgAspect = svgViewBox.w / svgViewBox.h;
    const conAspect = cW / cH;
    let renderedW, renderedH, offsetX, offsetY;
    if (imgAspect > conAspect) {
      renderedW = cW; renderedH = cW / imgAspect;
      offsetX = 0; offsetY = (cH - renderedH) / 2;
    } else {
      renderedH = cH; renderedW = cH * imgAspect;
      offsetX = (cW - renderedW) / 2; offsetY = 0;
    }
    return { left: offsetX + (leftPct / 100) * renderedW, top: offsetY + (topPct / 100) * renderedH };
  };

  // Scroll wheel zoom toward cursor
  const onWheel = e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom(z => {
      const next = Math.min(6, Math.max(0.5, z + delta));
      // Adjust pan so zoom centres on cursor position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const scale = next / z;
        setPan(p => ({ x: mx - (mx - p.x) * scale, y: my - (my - p.y) * scale }));
      }
      return next;
    });
  };

  const onMouseDown = e => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onMouseMove = e => {
    if (!dragging || !dragStart.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const onMouseUp = () => { setDragging(false); dragStart.current = null; };
  const onMouseLeave = () => { setDragging(false); dragStart.current = null; };

  // Touch pan
  const touchStart = useRef(null);
  const onTouchStart = e => {
    if (e.touches.length !== 1) return;
    touchStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
  };
  const onTouchMove = e => {
    if (e.touches.length !== 1 || !touchStart.current) return;
    e.preventDefault();
    setPan({ x: e.touches[0].clientX - touchStart.current.x, y: e.touches[0].clientY - touchStart.current.y });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Row 1 — map selector */}
      <div className="filter-row" style={{ gap:6, background:"#090c10" }}>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a4a58", flexShrink:0 }}>AO</span>
        <div className="filter-row-vendors" style={{ flex:1, padding:0, border:"none", background:"transparent" }}>
          {Object.keys(MAP_META).map(m => {
            const pinCount = allPins.filter(p => p.mapName === m).length;
            const doneCount = allPins.filter(p => p.mapName === m && completed.has(p.task.id)).length;
            return (
              <button key={m} className={`filter-btn ${selectedMap===m?"active":""}`}
                onClick={() => { setSelectedMap(m); setSelectedFloor(MAP_META[m]?.default || "Ground_Level"); }}
                style={selectedMap===m ? { borderColor:"#c8a84b", color:"#c8a84b" } : { opacity: pinCount>0?1:.3 }}>
                {m}
                {pinCount > 0 && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, marginLeft:4, opacity:.6 }}>{doneCount}/{pinCount}</span>}
              </button>
            );
          })}
        </div>
        {/* Controls */}
        <div style={{ display:"flex", gap:5, flexShrink:0, alignItems:"center" }}>
          <button className={`filter-btn ${hideDone?"active":""}`} onClick={() => setHideDone(p=>!p)}>
            {hideDone ? "SHOW ALL OPS" : "PURGE EXFIL'D"}
          </button>
          <button className={`filter-btn ${showLabels?"active":""}`} onClick={() => setShowLabels(p=>!p)}>
            {showLabels ? "LABELS ON" : "LABELS OFF"}
          </button>
          <div style={{ display:"flex", gap:2 }}>
            <button className="filter-btn" onClick={() => setZoom(z => Math.min(5, z+0.25))} style={{ padding:"4px 8px", fontSize:13 }}>+</button>
            <button className="filter-btn" onClick={() => { setZoom(1); setPan({x:0,y:0}); }} style={{ padding:"4px 7px", fontSize:9 }}>{Math.round(zoom*100)}%</button>
            <button className="filter-btn" onClick={() => setZoom(z => Math.max(0.5, z-0.25))} style={{ padding:"4px 8px", fontSize:13 }}>−</button>
          </div>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#364858" }}>{incompleteCount} active ops</span>
        </div>
      </div>

      {/* Row 2 — floor selector */}
      {meta && meta.floors.length > 1 && (
        <div className="filter-row" style={{ gap:5, background:"#080b0f", paddingTop:5, paddingBottom:5 }}>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3845", flexShrink:0 }}>FLOOR</span>
          {meta.floors.map(f => {
            const fCount = allPins.filter(p => p.mapName === selectedMap && p.floor === f).length;
            return (
              <button key={f} className={`filter-btn ${selectedFloor===f?"active":""}`}
                onClick={() => setSelectedFloor(f)}
                style={selectedFloor===f ? { borderColor:"#c8a84b", color:"#c8a84b", fontSize:10 } : { fontSize:10 }}>
                {floorLabel(f)}
                {fCount > 0 && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, marginLeft:4, opacity:.5 }}>{fCount}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Map canvas */}
      <div className="map-wrap" ref={containerRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
        style={{ overflow:"hidden", cursor: dragging ? "grabbing" : "grab" }}>
        {gpsLoading || svgLoading ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#364858", fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>
            {gpsLoading ? "ACQUIRING GPS INTEL..." : "LOADING TACTICAL MAP..."}
          </div>
        ) : !svgText ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#364858", fontFamily:"'Share Tech Mono',monospace", fontSize:11, textAlign:"center", padding:40 }}>
            NO TACTICAL LOADED — run setup.mjs first
          </div>
        ) : (
          /* Zoom + pan wrapper */
          <div style={{ width:"100%", height:"100%", position:"relative",
                        transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin:"center center",
                        transition: dragging ? "none" : "transform .12s" }}>
            {/* Inline SVG — floor groups toggled via useEffect */}
            <div ref={svgContainerRef} style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", opacity:.88 }}
              dangerouslySetInnerHTML={{ __html: svgText
                ? svgText
                    .replace(/<svg([^>]*)width="[^"]*"/, '<svg$1')
                    .replace(/<svg([^>]*)height="[^"]*"/, '<svg$1')
                    .replace(/<svg/, '<svg preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;width:auto;height:auto;display:block"')
                : "" }}
            />

            {/* Quest pins — positioned relative to the actual rendered image rect */}
            {visiblePins.map((pin, pinIdx) => {
              const isDone = completed.has(pin.task.id);
              if (hideDone && isDone) return null;
              const c = tc(pin.task.trader);
              const icon = OBJECTIVE_ICONS[pin.objType] || "•";
              const pos = getPinStyle(pin.leftPercent, pin.topPercent);
              const isFlyoutQuest = selectedQuest?.id === pin.task.id;
              const pinSize = isFlyoutQuest ? 22 : 16;
              return (
                <div key={pin.key}
                  style={{ position:"absolute", left: pos.left, top: pos.top,
                           transform:"translate(-50%,-50%)", cursor:"pointer",
                           zIndex: isFlyoutQuest ? 25 : 10 }}
                  onClick={() => onSelectQuest(pin.task)}>

                  {/* Pulse ring for flyout-selected quest */}
                  {isFlyoutQuest && (
                    <div style={{
                      position:"absolute", inset:-8, borderRadius:"50%",
                      border:`2px solid ${c.light}`,
                      animation:"mapPinPulse 1.4s ease-out infinite",
                      pointerEvents:"none",
                    }}/>
                  )}

                  {/* Dot */}
                  <div style={{
                    width:pinSize, height:pinSize, borderRadius:"50%",
                    background: isDone ? "#1a231a" : c.light,
                    border: `${isFlyoutQuest?3:2}px solid ${isDone?"#252d3a": isFlyoutQuest?"#fff":c.base}`,
                    boxShadow: isDone ? "none" : isFlyoutQuest
                      ? `0 0 18px ${c.light}, 0 0 6px #fff, 0 0 3px #000`
                      : `0 0 10px ${c.light}cc, 0 0 3px #000`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize: isFlyoutQuest?10:8, color: isDone?"#364858":"#fff", fontWeight:700,
                    transition:"transform .12s, width .15s, height .15s",
                    flexShrink:0,
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform="scale(1.4)"}
                    onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
                    {icon}
                  </div>

                  {/* Objective number badge for flyout quest with multiple objectives */}
                  {isFlyoutQuest && (
                    <div style={{
                      position:"absolute", top:-5, right:-5,
                      width:12, height:12, borderRadius:"50%",
                      background:"#fff", color:"#07090c",
                      fontFamily:"'Share Tech Mono',monospace", fontSize:8, fontWeight:700,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      border:`1px solid ${c.light}`, pointerEvents:"none",
                    }}>
                      {visiblePins.filter(p => p.task.id === pin.task.id).indexOf(pin) + 1}
                    </div>
                  )}

                  {/* Always-on label */}
                  {(showLabels && !isDone) || isFlyoutQuest ? (
                    <div style={{
                      position:"absolute", bottom:`calc(100% + ${isFlyoutQuest?8:3}px)`, left:"50%",
                      transform:"translateX(-50%)",
                      background: isFlyoutQuest ? c.bg : "rgba(7,11,9,.92)",
                      border:`1px solid ${isFlyoutQuest?c.light:c.base}`,
                      borderRadius:2, padding: isFlyoutQuest?"3px 7px":"2px 5px",
                      whiteSpace:"nowrap", pointerEvents:"none",
                      fontFamily: isFlyoutQuest?"'Rajdhani',sans-serif":"'Share Tech Mono',monospace",
                      fontWeight: isFlyoutQuest?700:400,
                      fontSize: isFlyoutQuest?11:8,
                      color: isFlyoutQuest?c.label:"#9db8a0",
                      boxShadow: isFlyoutQuest?`0 2px 8px rgba(0,0,0,.6)`:"none",
                    }}>
                      {pin.questTitle}
                      {isFlyoutQuest && pin.objDesc && (
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:`${c.label}99`, marginTop:2, whiteSpace:"normal", maxWidth:180 }}>
                          {pin.objDesc}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Hover tooltip */}
                  <div className="pin-tooltip" style={{ minWidth:160 }}>
                    <div className="pin-tooltip-name">{pin.questTitle}</div>
                    <div className="pin-tooltip-type" style={{ color:c.label }}>{pin.task.trader} · {pin.objType}</div>
                    {pin.objDesc && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#5a7060", marginTop:3, whiteSpace:"normal" }}>{pin.objDesc}</div>}
                    {isDone && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2ecc71", marginTop:3 }}>✓ EXTRACTED</div>}
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {visiblePins.length === 0 && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                <div style={{ color:"#2a3845", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>
                  NO OBJECTIVES ON RECORD FOR THIS LOCATION{meta?.floors.length > 1 ? " / FLOOR" : ""}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend — outside zoom wrapper so it stays fixed */}
        {!gpsLoading && svgText && visiblePins.length > 0 && (
          <div style={{ position:"absolute", bottom:12, right:12, background:"rgba(7,11,9,.92)", border:"1px solid #252d3a", borderRadius:3, padding:"10px 13px", backdropFilter:"blur(6px)", minWidth:140, zIndex:50 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a4a58", marginBottom:8, letterSpacing:".1em" }}>OBJECTIVE MARKERS</div>
            {[...new Set(visiblePins.map(p => p.task.trader))].map(trader => {
              const c = tc(trader);
              const trPins = visiblePins.filter(p => p.task.trader === trader);
              const done = trPins.filter(p => completed.has(p.task.id)).length;
              return (
                <div key={trader} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <div style={{ width:12, height:12, borderRadius:"50%", background:c.light, flexShrink:0, boxShadow:`0 0 6px ${c.light}` }}/>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, color:c.label }}>{trader}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#364858", marginLeft:"auto" }}>{done}/{trPins.length}</span>
                </div>
              );
            })}
            <div style={{ borderTop:"1px solid #1a2030", marginTop:7, paddingTop:7, display:"flex", flexWrap:"wrap", gap:"4px 10px" }}>
              {Object.entries(OBJECTIVE_ICONS).map(([type, icon]) => (
                <span key={type} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#4a6050" }}>{icon} {type}</span>
              ))}
            </div>
            <div style={{ borderTop:"1px solid #1a2030", marginTop:6, paddingTop:6, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3845" }}>
              scroll to zoom · drag to reposition · click pin for intel
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMPARISON VIEW ──────────────────────────────────────────────────────────
function ComparisonView({ tasks, progress, config }) {
  const [commentary, setCommentary] = useState("");
  const [loading, setLoading] = useState(false);

  const u1 = config?.users?.user1 || { name:"Dad", color:"#c8a84b" };
  const u2 = config?.users?.user2 || { name:"Declan", color:"#4a9eed" };

  const traders = useMemo(() => [...new Set(tasks.map(t => t.trader))], [tasks]);

  const computeStats = useCallback((userKey, userName) => {
    const comp = progress[userKey] || new Set();
    const completedIds = comp instanceof Set ? comp : new Set(comp);
    const completed = tasks.filter(t => completedIds.has(t.id));
    const xp = completed.reduce((s, t) => s + (t.experience || 0), 0);
    const byTrader = traders.map(tr => {
      const all = tasks.filter(t => t.trader === tr);
      return { trader: tr, done: all.filter(t => completedIds.has(t.id)).length, total: all.length };
    });
    return { name: userName, completed: completed.length, total: tasks.length, pct: tasks.length ? Math.round(completed.length/tasks.length*100) : 0, xp, byTrader, completedIds };
  }, [tasks, progress, traders]);

  const s1 = useMemo(() => computeStats("user1", u1.name), [computeStats, u1.name]);
  const s2 = useMemo(() => computeStats("user2", u2.name), [computeStats, u2.name]);

  const unique1 = useMemo(() => tasks.filter(t => s1.completedIds.has(t.id) && !s2.completedIds.has(t.id)).map(t => t.name), [tasks, s1, s2]);
  const unique2 = useMemo(() => tasks.filter(t => s2.completedIds.has(t.id) && !s1.completedIds.has(t.id)).map(t => t.name), [tasks, s1, s2]);

  const traderLeads1 = s1.byTrader.filter(t => {
    const t2 = s2.byTrader.find(x => x.trader === t.trader);
    return t2 && t.done > t2.done;
  }).map(t => t.trader);
  const traderLeads2 = s2.byTrader.filter(t => {
    const t1 = s1.byTrader.find(x => x.trader === t.trader);
    return t1 && t.done > t1.done;
  }).map(t => t.trader);

  const generateCommentary = async () => {
    setLoading(true);
    setCommentary("");
    try {
      const res = await fetch("/api/commentary", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          user1Stats: { ...s1, unique: unique1, traderLeads: traderLeads1 },
          user2Stats: { ...s2, unique: unique2, traderLeads: traderLeads2 },
        })
      });
      const data = await res.json();
      if (data.commentary === "NO_KEY") {
        setCommentary("⚠ ANTHROPIC_API_KEY not set.\n\nTo enable AI commentary:\n1. Create a file called .env in the tqt folder\n2. Add this line: ANTHROPIC_API_KEY=your_key_here\n3. Restart the server with: node -r dotenv/config server.js\n\nOr set it as a system environment variable before running.");
      } else {
        setCommentary(data.commentary || "No response from server.");
      }
    } catch(e) {
      setCommentary(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const StatBlock = ({ stats, color, isLeading }) => (
    <div style={{ background:`linear-gradient(135deg,${color}0d 0%,#0d1014 60%)`, border:`1px solid ${color}44`, borderLeft:`4px solid ${color}`, borderRadius:3, padding:"16px 20px", flex:1, position:"relative", overflow:"hidden" }}>
      {/* Background hex watermark */}
      <div style={{ position:"absolute", right:-10, top:-10, fontSize:80, opacity:.04, lineHeight:1, pointerEvents:"none", color }}>⬡</div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:color, boxShadow:`0 0 8px ${color}` }}/>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:20, color, letterSpacing:".06em" }}>{stats.name}</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:`${color}88`, textTransform:"uppercase", letterSpacing:".1em" }}>ACTIVE PMC</div>
        {isLeading && <div style={{ marginLeft:"auto", fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2ecc71", background:"rgba(46,204,113,.12)", border:"1px solid rgba(46,204,113,.3)", padding:"2px 7px", borderRadius:2 }}>LEADING</div>}
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:14, marginBottom:10 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:40, color, fontWeight:700, lineHeight:1 }}>
          {stats.pct}<span style={{ fontSize:20, opacity:.7 }}>%</span>
        </div>
        <div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:`${color}cc` }}>{stats.completed}/{stats.total} quests</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:`${color}66` }}>◈ {fmt(stats.xp)} XP</div>
        </div>
      </div>
      <div style={{ height:6, background:"#111811", borderRadius:3, overflow:"hidden", border:`1px solid ${color}22` }}>
        <div style={{ height:"100%", width:`${stats.pct}%`, background:`linear-gradient(90deg,${color}66,${color})`, borderRadius:3, transition:"width .8s cubic-bezier(.4,0,.2,1)", boxShadow:`0 0 6px ${color}66` }}/>
      </div>
    </div>
  );

  const lead1 = s1.pct >= s2.pct;
  const lead2 = s2.pct > s1.pct;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"auto", padding:"16px 20px", gap:14 }}>

      {/* Stat blocks */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        <StatBlock stats={s1} color={u1.color} isLeading={lead1} />
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"2px 8px" }}>
          <div style={{ flex:1, height:1, background:"#1a2030" }}/>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3845" }}>VS</span>
          <div style={{ flex:1, height:1, background:"#1a2030" }}/>
        </div>
        <StatBlock stats={s2} color={u2.color} isLeading={lead2} />
      </div>

      {/* Trader breakdown */}
      <div style={{ background:"#090c10", border:"1px solid #1a2030", borderRadius:3, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a4a58", letterSpacing:".12em" }}>TRADER STANDINGS — KILL CONFIRMED</div>
          <div style={{ display:"flex", gap:14 }}>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:u1.color }}>◀ {u1.name}</span>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:u2.color }}>{u2.name} ▶</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {s1.byTrader.filter(t => t.total > 0).map(t1 => {
            const t2 = s2.byTrader.find(x => x.trader === t1.trader);
            const c = tc(t1.trader);
            const p1 = t1.total ? t1.done/t1.total*100 : 0;
            const p2 = t2?.total ? t2.done/t2.total*100 : 0;
            const w1 = t1.done > (t2?.done||0);
            const w2 = (t2?.done||0) > t1.done;
            return (
              <div key={t1.trader} style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr", gap:"0 10px", alignItems:"center", padding:"5px 8px", background:w1||w2?"#0d1210":"transparent", borderRadius:2, borderLeft:`2px solid ${c.base}` }}>
                {/* Left bar — user1 */}
                <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:w1?u1.color:"#364858", minWidth:28, textAlign:"right" }}>{t1.done}/{t1.total}</span>
                  <div style={{ height:8, flex:1, background:"#111811", borderRadius:2, overflow:"hidden", maxWidth:200 }}>
                    <div style={{ height:"100%", width:`${p1}%`, background:w1?`linear-gradient(90deg,${u1.color}88,${u1.color})`:`linear-gradient(90deg,${c.base},${c.base}cc)`, borderRadius:2, transition:"width .5s", marginLeft:"auto", float:"right" }}/>
                  </div>
                </div>
                {/* Trader label */}
                <div style={{ textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <div style={{ width:6, height:6, borderRadius:1, background:c.light, flexShrink:0 }}/>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:c.label, letterSpacing:".04em" }}>{t1.trader}</span>
                </div>
                {/* Right bar — user2 */}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ height:8, flex:1, background:"#111811", borderRadius:2, overflow:"hidden", maxWidth:200 }}>
                    <div style={{ height:"100%", width:`${p2}%`, background:w2?`linear-gradient(90deg,${u2.color}88,${u2.color})`:`linear-gradient(90deg,${c.base},${c.base}cc)`, borderRadius:2, transition:"width .5s" }}/>
                  </div>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:w2?u2.color:"#364858", minWidth:28 }}>{t2?.done||0}/{t2?.total||0}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bragging rights */}
      {(unique1.length > 0 || unique2.length > 0) && (
        <div style={{ display:"flex", gap:10 }}>
          {[{label:u1.name, items:unique1, color:u1.color},{label:u2.name, items:unique2, color:u2.color}].map(({ label, items, color }) => (
            <div key={label} style={{ flex:1, background:`linear-gradient(135deg,${color}08,#090c10)`, border:`1px solid ${color}33`, borderTop:`3px solid ${color}`, borderRadius:3, padding:"12px 14px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:`${color}99`, letterSpacing:".12em", marginBottom:8 }}>
                🎖 {label.toUpperCase()} EXCLUSIVE — {items.length} OP{items.length!==1?"S":""}
              </div>
              {items.length === 0 ? (
                <div style={{ color:"#2a3845", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No confirmed kills</div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {items.slice(0,12).map(name => (
                    <Chip key={name} style={{ background:`${color}14`, color:`${color}dd`, border:`1px solid ${color}33`, fontSize:9 }}>{name}</Chip>
                  ))}
                  {items.length > 12 && <Chip style={{ color:"#364858", border:"1px solid #1a2030" }}>+{items.length-12} more</Chip>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Commentary */}
      <div style={{ background:"#090c10", border:"1px solid #1a2030", borderRadius:3, padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:commentary?12:0 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a4a58", letterSpacing:".12em" }}>
            ◈ AFTER ACTION REPORT — POWERED BY CLAUDE
          </div>
          <button onClick={generateCommentary} disabled={loading}
            style={{ padding:"8px 18px", background:loading?"#0d1014":"rgba(200,168,75,.08)", border:`1px solid ${loading?"#252d3a":"#c8a84b"}`, color:loading?"#364858":"#c8a84b", cursor:loading?"wait":"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".12em", textTransform:"uppercase", borderRadius:2, transition:"all .2s" }}>
            {loading ? "REQUESTING INTEL..." : "GENERATE DEBRIEF"}
          </button>
        </div>
        {commentary && (
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#9db8a0", lineHeight:1.75, background:"#080b0f", padding:"14px 16px", borderRadius:2, border:"1px solid #1a2030", whiteSpace:"pre-wrap" }}>
            {commentary}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("list");
  const [tasks, setTasks] = useState([]);
  const [config, setConfig] = useState(null);
  const [progress, setProgress] = useState({ user1: new Set(), user2: new Set() });
  const [activeUser, setActiveUser] = useState("user1");
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then(r => r.json()),
      fetch("/api/progress").then(r => r.json()),
      fetch("/api/config").then(r => r.json()),
    ]).then(([data, prog, cfg]) => {
      setTasks(transformTasks(data.tasks || []));
      setProgress({ user1: new Set(prog.user1 || []), user2: new Set(prog.user2 || []) });
      setConfig(cfg);
      setDataLoading(false);
    }).catch(e => {
      console.error("Failed to load data:", e);
      setDataLoading(false);
    });
  }, []);

  const toggleCompleted = useCallback((id) => {
    setProgress(prev => {
      const newSet = new Set(prev[activeUser]);
      if (newSet.has(id)) {
        // Uncompleting — also remove any descendants that are marked complete
        newSet.delete(id);
        const { descendants } = getRelated(id, tasks);
        descendants.forEach(did => newSet.delete(did));
      } else {
        // Completing — also mark every ancestor complete
        newSet.add(id);
        const { ancestors } = getRelated(id, tasks);
        ancestors.forEach(aid => newSet.add(aid));
      }
      fetch(`/api/progress/${activeUser}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: [...newSet] })
      });
      return { ...prev, [activeUser]: newSet };
    });
  }, [activeUser, tasks]);

  const saveRename = async () => {
    if (!renaming || !renameVal.trim()) { setRenaming(null); return; }
    const newCfg = { ...config, users: { ...config.users, [renaming]: { ...config.users[renaming], name: renameVal.trim() } } };
    const saved = await fetch("/api/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(newCfg) }).then(r=>r.json());
    setConfig(saved);
    setRenaming(null);
  };

  const u1 = config?.users?.user1 || { name:"Dad", color:"#c8a84b" };
  const u2 = config?.users?.user2 || { name:"Declan", color:"#4a9eed" };
  const activeUserCfg = activeUser === "user1" ? u1 : u2;
  const completedForUser = progress[activeUser] || new Set();

  const pct1 = tasks.length ? Math.round((progress.user1.size / tasks.length) * 100) : 0;
  const pct2 = tasks.length ? Math.round((progress.user2.size / tasks.length) * 100) : 0;

  if (dataLoading) return (
    <div className="eft-app">
      <style>{GSS}</style>
      <div className="loading">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <polygon points="16,3 29,10 29,22 16,29 3,22 3,10" stroke="#c8a84b" strokeWidth="1.5" fill="none" strokeDasharray="50" strokeDashoffset="50">
            <animate attributeName="stroke-dashoffset" from="50" to="0" dur=".8s" fill="freeze"/>
          </polygon>
        </svg>
        INITIALIZING QUESTRESSOR...
      </div>
    </div>
  );

  return (
    <div className="eft-app">
      <style>{GSS}</style>

      {/* Rename modal */}
      {renaming && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#0d1014", border:"1px solid #1a2030", borderRadius:3, padding:24, minWidth:280 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8a84b", marginBottom:12 }}>SET CALLSIGN</div>
            <input className="search-in" value={renameVal} onChange={e=>setRenameVal(e.target.value)}
              onKeyDown={e=>e.key==="Enter"?saveRename():e.key==="Escape"&&setRenaming(null)}
              style={{ width:"100%", marginBottom:12 }} autoFocus />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveRename} style={{ flex:1, padding:"8px", background:"rgba(200,168,75,.1)", border:"1px solid #c8a84b", color:"#c8a84b", cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", borderRadius:2 }}>SAVE</button>
              <button onClick={() => setRenaming(null)} style={{ padding:"8px 14px", background:"transparent", border:"1px solid #1a2030", color:"#5a7060", cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, textTransform:"uppercase", borderRadius:2 }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ flexShrink:0 }}>
        {/* Row 1: Logo + Users */}
        <div className="hdr-top">
          <div className="hdr-logo">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <polygon points="10,2 18,7 18,13 10,18 2,13 2,7" stroke="#c8a84b" strokeWidth="1.2" fill="none"/>
              <polygon points="10,6 14,8.5 14,11.5 10,14 6,11.5 6,8.5" stroke="#c8a84b" strokeWidth=".8" fill="rgba(200,168,75,.12)"/>
            </svg>
            <div>
              <div className="hdr-logo-text">QUESTRESSOR</div>
              <div className="hdr-logo-sub">{tasks.length} OPS LOADED</div>
            </div>
          </div>
          <div className="hdr-users">
            {[{key:"user1",cfg:u1,pct:pct1},{key:"user2",cfg:u2,pct:pct2}].map(({ key, cfg, pct }) => (
              <div key={key} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button className="usr-btn"
                  onClick={() => setActiveUser(key)}
                  style={{ borderColor: activeUser===key ? cfg.color : "#1a2030", color: activeUser===key ? cfg.color : "#364858", background: activeUser===key ? `${cfg.color}18` : "transparent" }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:cfg.color, flexShrink:0 }}/>
                  {cfg.name}
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, opacity:.7 }}>{pct}%</span>
                </button>
                <button onClick={() => { setRenaming(key); setRenameVal(cfg.name); }}
                  style={{ background:"none", border:"none", color:"#252d3a", cursor:"pointer", fontSize:11, padding:"2px 3px", lineHeight:1, flexShrink:0 }} title="Rename">✎</button>
              </div>
            ))}
          </div>
        </div>
        {/* Row 2: Tab dropdown */}
        <div className="hdr-tabs">
          <div className="tab-select-wrap">
            <select className="tab-select" value={tab} onChange={e => setTab(e.target.value)}>
              <option value="list">Intel Board</option>
              <option value="tree">Op Chain</option>
              <option value="map">Tactical</option>
              <option value="unlockables">Contraband</option>
              <option value="compare">Debrief</option>
            </select>
          </div>

        </div>
      </header>

      {/* Content */}
      <main style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {tab === "list" && (
          <QuestListView tasks={tasks} completed={completedForUser} toggleCompleted={toggleCompleted} onSelect={q => setSelectedQuest(q)} />
        )}
        {tab === "tree" && (
          <QuestTreeView tasks={tasks} completed={completedForUser} selectedQuest={selectedQuest} onSelect={q => setSelectedQuest(q)} />
        )}
        {tab === "map" && (
          <MapView tasks={tasks} completed={completedForUser} selectedQuest={selectedQuest} onSelectQuest={q => { setSelectedQuest(q); }} />
        )}
        {tab === "unlockables" && (
          <UnlockablesView tasks={tasks} completed={completedForUser} onSelectQuest={q => { setSelectedQuest(q); setTab("tree"); }} />
        )}
        {tab === "compare" && (
          <ComparisonView tasks={tasks} progress={progress} config={config} />
        )}
      </main>

      {/* Flyout */}
      <QuestDetailPanel
        quest={selectedQuest}
        completed={completedForUser}
        onToggleComplete={toggleCompleted}
        onClose={() => setSelectedQuest(null)}
        onShowInTree={() => setTab("tree")}
      />
    </div>
  );
}
