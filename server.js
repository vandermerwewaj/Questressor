import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));
app.use('/maps', express.static(join(__dirname, 'maps')));

const tasksRaw   = JSON.parse(readFileSync(join(__dirname, 'tasks.json'),   'utf8'));
const tradersRaw = JSON.parse(readFileSync(join(__dirname, 'traders.json'), 'utf8'));

const PROGRESS_FILE = join(__dirname, 'progress.json');
let progress = existsSync(PROGRESS_FILE)
  ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  : { user1: [], user2: [] };
const saveProgress = () => writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

const CONFIG_FILE = join(__dirname, 'config.json');
const getConfig = () => existsSync(CONFIG_FILE)
  ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  : { users: { user1: { name: 'Dad', color: '#c8a84b' }, user2: { name: 'Declan', color: '#4a9eed' } } };

app.get('/api/data',     (_req, res) => res.json({ tasks: tasksRaw.data.tasks, traders: tradersRaw.data.traders }));
app.get('/api/progress', (_req, res) => res.json(progress));
app.get('/api/config',   (_req, res) => res.json(getConfig()));

app.get('/api/mapgps', (_req, res) => {
  const f = join(__dirname, 'map-gps.json');
  if (existsSync(f)) res.json(JSON.parse(readFileSync(f, 'utf8')));
  else res.status(404).json({ error: 'map-gps.json not found. Run fetch-map-data-v2.mjs first.' });
});

app.post('/api/progress/:user', (req, res) => {
  const { user } = req.params;
  if (!['user1', 'user2'].includes(user)) return res.status(400).json({ error: 'Invalid user' });
  progress[user] = req.body.completed || [];
  saveProgress();
  res.json({ ok: true });
});

app.post('/api/config', (req, res) => {
  const cfg = getConfig();
  if (req.body.users) cfg.users = { ...cfg.users, ...req.body.users };
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  res.json(cfg);
});

app.post('/api/commentary', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ commentary: "NO_KEY" });

  const { user1Stats: u1, user2Stats: u2 } = req.body;
  const traderLines = (s) => s.byTrader.map(t => `  ${t.trader.padEnd(14)} ${t.done}/${t.total}`).join('\n');

  const prompt = `You are a gruff, darkly humorous Escape from Tarkov veteran giving an intelligence debrief about two PMC operators' quest completion records. Use EFT slang naturally. Reference specific traders by name. Be entertaining with friendly rivalry tone — like a father and son or two brothers competing. Sarcastic but never mean.

OPERATOR DOSSIERS
${u1.name}: ${u1.completed}/${u1.total} quests (${u1.pct}%) | ${u1.xp.toLocaleString()} XP
Trader standings:\n${traderLines(u1)}

${u2.name}: ${u2.completed}/${u2.total} quests (${u2.pct}%) | ${u2.xp.toLocaleString()} XP
Trader standings:\n${traderLines(u2)}

${u1.name} did that ${u2.name} hasn't: ${u1.unique.slice(0,5).join(', ') || 'nothing yet'}
${u2.name} did that ${u1.name} hasn't: ${u2.unique.slice(0,5).join(', ') || 'nothing yet'}
Trader leads: ${u1.name} leads ${u1.traderLeads.join(', ')||'none'} | ${u2.name} leads ${u2.traderLeads.join(', ')||'none'}

Write a punchy 3-4 paragraph debrief in character. Reference at least one specific quest or trader. End with a specific competitive challenge or wager.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await r.json();
    res.json({ commentary: data.content?.[0]?.text || 'Commentary offline.' });
  } catch (e) {
    res.json({ commentary: `Error: ${e.message}` });
  }
});

app.get('*', (_req, res) => {
  const idx = join(__dirname, 'dist', 'index.html');
  if (existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('Run "npm run build" first, or use "npm run dev" for development.');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯 Tarkov Quest Tracker`);
  console.log(`   Local  : http://localhost:${PORT}`);
  console.log(`   Network: http://<your-ip>:${PORT}  ← Declan connects here\n`);
});
