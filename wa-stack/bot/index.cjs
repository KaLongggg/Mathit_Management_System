// index.cjs - WhatsApp bot + API endpoint (Docker-ready, CommonJS)
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const Mustache = require('mustache');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { Pool } = require('pg');
const QRCode = require('qrcode');

// ---------------- config ----------------
const AUTH_BASE  = process.env.WWEBJS_DATA_PATH || '.wwebjs_auth';
const CLIENT_ID  = process.env.WWEBJS_CLIENT_ID || 'default';
const REQUIRED_TOKEN = process.env.BOT_SHARED_SECRET || '';
const PORT = Number(process.env.PORT || 3000);

const SEND_MIN_DELAY_MS = Number(process.env.SEND_MIN_DELAY_MS || 1200); // safe default
const SEND_MAX_DELAY_MS = Number(process.env.SEND_MAX_DELAY_MS || 2500); // safe default

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitterDelay() {
  const min = Math.max(0, SEND_MIN_DELAY_MS);
  const max = Math.max(min, SEND_MAX_DELAY_MS);
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ---------------- helpers ----------------
function hkLocalToChatId(local8) {
  const digits = String(local8 || '').replace(/[^\d]/g, '');
  if (!/^\d{8}$/.test(digits)) throw new Error(`Invalid HK local number: ${local8}`);
  return `852${digits}@c.us`;
}

const renderTemplate = (tpl, row) => Mustache.render(tpl || '', row || {});

function resolveMediaPath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  if (p.includes('/') || p.includes('\\')) return path.join(process.cwd(), p);
  return path.join(process.cwd(), 'assets', p);
}

async function sendMessageWithAttachments(client, chatId, text, opts = {}) {
  const imagePath = resolveMediaPath(opts.image_path);
  const pdfPath   = resolveMediaPath(opts.pdf_path);

  if (imagePath) {
    const img = MessageMedia.fromFilePath(imagePath);
    await client.sendMessage(chatId, img, { caption: text });
    return;
  }
  if (pdfPath) {
    const pdf = MessageMedia.fromFilePath(pdfPath);
    await client.sendMessage(chatId, pdf, { caption: text });
    return;
  }
  await client.sendMessage(chatId, text);
}

// ---------------- session lock cleanup ----------------
const SESSION_DIR = path.join(process.cwd(), AUTH_BASE, `session-${CLIENT_ID}`);

function clearChromiumLocks(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('Singleton')) {
        try { fs.rmSync(path.join(dir, f), { force: true }); } catch {}
      }
    }
    const def = path.join(dir, 'Default');
    if (fs.existsSync(def)) {
      for (const f of fs.readdirSync(def)) {
        if (f.startsWith('Singleton')) {
          try { fs.rmSync(path.join(def, f), { force: true }); } catch {}
        }
      }
    }
  } catch {}
}
clearChromiumLocks(SESSION_DIR);

// ---------------- state / queue ----------------
let WA_READY = false;
let RESTARTING = false;
let restartDelay = 2000; // exponential backoff
let stopping = false;

// ---------------- heartbeat: report WA state to Supabase bot_status ----------------
let waState = 'starting';
let currentQr = null; // QR as a PNG data URL while waiting to be scanned; null once linked
const pgPool = new Pool({
  user: process.env.user,
  password: process.env.password,
  host: process.env.host,
  port: Number(process.env.port || 5432),
  database: process.env.dbname,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10000,
});
async function heartbeat(detail) {
  try {
    await pgPool.query(
      `insert into bot_status (id, state, detail, qr, updated_at)
       values ('whatsapp_bot', $1, $2, $3, now())
       on conflict (id) do update set state = excluded.state, detail = excluded.detail, qr = excluded.qr, updated_at = excluded.updated_at`,
      [waState, detail || null, currentQr]
    );
  } catch (e) { console.error('heartbeat failed:', e.message); }
}
setInterval(() => heartbeat(), 30000);

// ---------------- auto-reply workflow state ----------------
const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'conversation_state.json');

function ensureDir(p) { try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch {} }
ensureDir(STATE_DIR);

let convoState = {};
try { convoState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { convoState = {}; }

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(convoState, null, 2)); } catch {}
}

function getUserKey(msg) {
  // msg.from looks like "852xxxxxxxx@c.us"
  return String(msg.from || '').toLowerCase();
}

function getSession(key) {
  convoState[key] ||= {
    step: 'NEW',
    lastReplyAt: 0,
    lockedToHuman: false,
    profile: { form: null, goal: null, weakness: null, mode: null }
  };
  return convoState[key];
}

const REPLY_COOLDOWN_MS = Number(process.env.REPLY_COOLDOWN_MS || 1500);

// simple keyword matcher
function hasAny(text, arr) {
  return arr.some(k => text.includes(k));
}

// ---------------- course recommendation presets ----------------
const COURSES = {
  mc_rescue: {
    name: "【MC補底急救特訓營】",
    fit: "適合目標 Lv2-4，短時間掃 40 個高分常見 MC 題型",
    cta: "想唔想我發課程大綱/試堂俾你？"
  },
  stable2_to4: {
    name: "【補底急救-穩2望4】",
    fit: "由A1 基礎開始補返，集中易拎分課題，穩住合格再衝高",
    cta: "你而家大概幾多分左右？我可以幫你估下最快補邊啲。"
  },
  all_in_one_4_to5: {
    name: "【All-in-One 備戰班-穩4望5】",
    fit: "快速重溫 DSE 重點 + 題型技巧（MC + LQ）",
    cta: "你想主攻邊一部分：MC 準確率定 LQ 步驟分？"
  }
};

function pickCourse(profile) {
  const goal = (profile.goal || '').toLowerCase();
  const weakness = (profile.weakness || '').toLowerCase();

  // very simple rules (you can refine anytime)
  if (hasAny(goal, ['2', 'lv2', 'level2', '穩2']) || hasAny(weakness, ['補底','foundation','唔識','好弱'])) return 'stable2_to4';
  if (hasAny(weakness, ['mc','選擇','multiple'])) return 'mc_rescue';
  if (hasAny(goal, ['5', 'lv5', 'level5', '望5','穩4'])) return 'all_in_one_4_to5';

  // default
  return 'mc_rescue';
}

// single-flight queue: all sends are serialized
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch(err => {
    console.error("Queue task failed:", err);
    throw err; // 重新拋出，外層先會知道失敗
  });
  return queue;
}

// ---------------- WhatsApp client ----------------
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_BASE,
    clientId: CLIENT_ID,
  }),
  puppeteer: {
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      // optional extra stability knobs:
      // '--single-process',
    ]
  }
});

async function restartClient(reason) {
  if (stopping) return;
  if (RESTARTING) return;

  RESTARTING = true;
  WA_READY = false;
  waState = 'restarting';
  heartbeat(String(reason));
  console.error("🔁 Restarting WA client:", reason, `(backoff ${restartDelay}ms)`);

  try { await client.destroy(); } catch {}

  await sleep(restartDelay);
  restartDelay = Math.min(restartDelay * 2, 60000);

  try {
    clearChromiumLocks(SESSION_DIR);
    client.initialize();
  } catch (e) {
    console.error("Init failed:", e);
  } finally {
    RESTARTING = false;
  }
}

// lifecycle logs
client.on('qr', async qr => {
  waState = 'qr';
  try { currentQr = await QRCode.toDataURL(qr); } catch { currentQr = null; }
  heartbeat('Waiting for QR scan');
  console.log("📱 Scan QR to login");
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  waState = 'authenticated';
  currentQr = null;
  heartbeat('Authenticated');
  console.log('✅ Authenticated');
  // authenticated != ready, wait for 'ready'
});

client.on('ready', async () => {
  WA_READY = true;
  waState = 'ready';
  currentQr = null;
  heartbeat('Connected');
  restartDelay = 2000; // reset backoff once stable
  console.log('✅ Bot ready!');
});

client.on('disconnected', reason => {
  waState = 'disconnected';
  heartbeat(String(reason));
  console.error('❌ Disconnected:', reason);
  restartClient(`disconnected:${reason}`);
});

client.on('auth_failure', msg => {
  waState = 'auth_failure';
  heartbeat(String(msg));
  console.error('❌ Auth failure:', msg);
  restartClient(`auth_failure:${msg}`);
});

// safety nets
process.on('unhandledRejection', err => {
  console.error("unhandledRejection:", err);
  restartClient("unhandledRejection");
});
process.on('uncaughtException', err => {
  console.error("uncaughtException:", err);
  restartClient("uncaughtException");
});

client.on('message', async (msg) => {
  try {
    if (msg.fromMe) return;
    if (String(msg.from).endsWith('@g.us')) return; // ignore groups
    const raw = (msg.body || '').trim();
    const text = raw.toLowerCase();
    const key = getUserKey(msg);
    const s = getSession(key);

    // reset command (self-reset)
    if (hasAny(text, ['reset', '重置', '重新開始', '/reset'])) {
      delete convoState[key];
      saveState();
      return msg.reply("✅ 已重置對話狀態～你可以再打「i want to start」重新開始🙂");
    }
    // ignore empty / status
    if (!raw) return;

    // allow manual takeover
    if (hasAny(text, ['真人','搵oscar','找oscar','human','help','support'])) {
      s.lockedToHuman = true;
      saveState();
      return msg.reply("收到👍 我幫你轉交 Oscar（真人）跟進～你可以先講：你係F幾？目標係想穩2/望4/望5？🙂");
    }
    if (s.lockedToHuman) return; // stop bot once handed to human

    // cooldown to avoid double reply storms
    const now = Date.now();
    if (now - s.lastReplyAt < REPLY_COOLDOWN_MS) return;

    // greeting triggers
    //const isGreeting = hasAny(text, ['hi','hello','hey','你好','哈囉','halo','yo']);
    //const isStart = hasAny(text, ['開始','start','了解','course','課程','想報','報名','試堂','試課']);

  const isGreeting = hasAny(text, ['i want to test']);
  const isStart    = hasAny(text, ['i want to start']);
    
    // Step machine
    if (s.step === 'NEW') {
      if (!(isGreeting || isStart)) return;
      if (isGreeting || isStart) {
        s.step = 'ASK_FORM';
        s.lastReplyAt = now;
        saveState();
        return msg.reply(
          "👋 你好！我係 Mathit Oscar Sir 嘅小助手🙂\n" +
          "想快啲幫你推薦合適課程～你而家係 F幾？\n" +
          "回覆：F4 / F5 / F6（或打 4/5/6 都得）"
        );
      }
      // if user says something else, still prompt nicely once
      s.step = 'ASK_FORM';
      s.lastReplyAt = now;
      saveState();
      return msg.reply("👋 你好～想幫你配對課程！你而家係 F幾？回覆 F4 / F5 / F6 🙂");
    }

    if (s.step === 'ASK_FORM') {
      const m = text.match(/f?\s*([456])/);
      if (m) {
        s.profile.form = `F${m[1]}`;
        s.step = 'ASK_GOAL';
        s.lastReplyAt = now;
        saveState();
        return msg.reply(
          `收到✅ 你係 ${s.profile.form}。\n` +
          "你目標想去到邊個等級？\n" +
          "1) 穩2望4（補底）\n" +
          "2) Lv2-4（MC 想快升）\n" +
          "3) 穩4望5（備戰衝星）\n" +
          "回覆 1/2/3 或直接打：穩2 / 望4 / 望5"
        );
      }
      s.lastReplyAt = now;
      saveState();
      return msg.reply("我想確認一下你係 F幾🙂 回覆 F4/F5/F6（或 4/5/6）就可以～");
    }

    if (s.step === 'ASK_GOAL') {
      if (text === '1' || hasAny(text, ['穩2','望4','補底'])) s.profile.goal = '穩2望4';
      else if (text === '2' || hasAny(text, ['mc','lv2','lv3','lv4','2-4'])) s.profile.goal = 'Lv2-4';
      else if (text === '3' || hasAny(text, ['穩4','望5','5'])) s.profile.goal = '穩4望5';

      if (s.profile.goal) {
        s.step = 'ASK_WEAKNESS';
        s.lastReplyAt = now;
        saveState();
        return msg.reply(
          `OK✅ 目標：${s.profile.goal}\n` +
          "你而家最想改善邊樣？\n" +
          "A) MC 準確率\n" +
          "B) LQ 步驟分\n" +
          "C) 幾何\n" +
          "D) 指數/對數/三角\n" +
          "回覆 A/B/C/D（或直接打你最弱嗰part）"
        );
      }

      s.lastReplyAt = now;
      saveState();
      return msg.reply("你可以回覆 1/2/3（或打：穩2 / 望4 / 望5）我先可以配對到最啱你嘅班🙂");
    }

    if (s.step === 'ASK_WEAKNESS') {
      if (text === 'a') s.profile.weakness = 'MC';
      else if (text === 'b') s.profile.weakness = 'LQ';
      else if (text === 'c') s.profile.weakness = 'Geometry';
      else if (text === 'd') s.profile.weakness = 'Algebra/Trig/Log';
      else s.profile.weakness = raw; // free text

      s.step = 'ASK_MODE';
      s.lastReplyAt = now;
      saveState();
      return msg.reply(
        "最後～你想用咩上堂模式？\n" +
        "1) 面授（屯門）\n" +
        "2) Zoom 直播\n" +
        "3) 網上影片（可重溫）\n" +
        "回覆 1/2/3 🙂"
      );
    }

    if (s.step === 'ASK_MODE') {
      if (text === '1') s.profile.mode = '面授（屯門）';
      else if (text === '2') s.profile.mode = 'Zoom 直播';
      else if (text === '3') s.profile.mode = '網上影片（可重溫）';

      if (!s.profile.mode) {
        s.lastReplyAt = now;
        saveState();
        return msg.reply("回覆 1/2/3 就得🙂 你想：面授 / Zoom / 影片？");
      }

      // recommend
      const code = pickCourse(s.profile);
      const c = COURSES[code];

      s.step = 'RECOMMENDED';
      s.lastReplyAt = now;
      saveState();

      return msg.reply(
        "🎯 我幫你配對到呢個：\n" +
        `${c.name}\n` +
        `✨ ${c.fit}\n\n` +
        `📌 你資料：${s.profile.form}｜目標：${s.profile.goal}｜弱項：${s.profile.weakness}｜模式：${s.profile.mode}\n\n` +
        `${c.cta}\n` +
        "（回覆：試堂 / 大綱 / 價錢 / 報名 / 真人）"
      );
    }

    if (s.step === 'RECOMMENDED') {
      if (hasAny(text, ['試堂','試課','trial'])) {
        s.lastReplyAt = now; saveState();
        return msg.reply("可以✅ 你想試邊科/邊個topic先？同埋方便講埋你平時幾多分左右？我幫你安排最有效嘅試堂內容🙂");
      }
      if (hasAny(text, ['大綱','內容','syllabus'])) {
        s.lastReplyAt = now; saveState();
        return msg.reply("OK✅ 我可以發課程大綱俾你～你想要：補底 / MC急救 / All-in-One 邊一個？（回覆 1/2/3）");
      }
      if (hasAny(text, ['價錢','費用','price'])) {
        s.lastReplyAt = now; saveState();
        return msg.reply("收到～價錢會因期數/模式有少少唔同🙂 你想報幾期？（1期/2期/3期/4期）我就可以報返準確價錢同優惠俾你。");
      }

      // fallback
      s.lastReplyAt = now; saveState();
      return msg.reply("收到🙂 你可以回覆：試堂 / 大綱 / 價錢 / 報名 / 真人。我會跟住你嘅需要帶你行下一步～");
    }

  } catch (err) {
    console.error('Handler error:', err);
  }
});

client.initialize();
heartbeat('Process started');

// Graceful shutdown
async function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  console.log(`\n🛑 Shutting down (${sig})...`);
  WA_READY = false;
  try { await client.destroy(); } catch {}
  process.exit(0);
}
process.on('SIGINT', () => shutdown("SIGINT"));
process.on('SIGTERM', () => shutdown("SIGTERM"));

// ---------------- API server ----------------
const app = express();
app.use(bodyParser.json());

// Healthcheck (no auth)
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// token gate
app.use((req, res, next) => {
  if (!REQUIRED_TOKEN) return next();
  const token = req.header('X-API-KEY') || '';
  if (token === REQUIRED_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

// Healthcheck: reflect WA readiness
app.get('/health', (_req, res) => {
  const code = WA_READY ? 200 : 503;
  res.status(code).json({ ok: true, wa_ready: WA_READY, restarting: RESTARTING });
});

// Send single (serialized)
app.post('/send', async (req, res) => {
  try {
    if (!WA_READY) return res.status(503).json({ error: 'whatsapp_not_ready' });

    const { phone, message, image_path, pdf_path, template, data } = req.body;
    if (!phone || (!message && !template)) {
      return res.status(400).json({ error: 'phone and message (or template) are required' });
    }

    const chatId = hkLocalToChatId(String(phone));
    const text = template ? renderTemplate(template, data) : message;

    await enqueue(async () => {
      await sendMessageWithAttachments(client, chatId, text, { image_path, pdf_path });
      await sleep(jitterDelay());
    });

    console.log(`✅ API sent to ${chatId}`);
    res.json({ ok: true, sent: true });

  } catch (err) {
    console.error('❌ API send failed:', err);
    // if this smells like a dead session, trigger restart in background
    const msg = String(err && err.message || err);
    if (
      msg.includes("Session closed") ||
      msg.includes("Target closed") ||
      msg.includes("Protocol error") ||
      msg.includes("Evaluation failed") ||
      msg.includes("markedUnread") ||
      msg.includes("sendSeen") ||
      msg.includes("getChat") ||
      msg.includes("Cannot read properties of undefined")
    ) {
  restartClient(`send_error:${msg.slice(0,120)}`);
}
    res.status(500).json({ error: err.message });
  }
});

// Broadcast (serialized + pacing)
app.post('/broadcast', async (req, res) => {
  try {
    if (!WA_READY) return res.status(503).json({ error: 'whatsapp_not_ready' });

    const { phones, message, image_path, pdf_path, template, data } = req.body;
    if (!Array.isArray(phones) || (!message && !template)) {
      return res.status(400).json({ error: 'phones[] and message (or template) are required' });
    }

    let sent = 0, failed = 0, errors = [];

    for (const p of phones) {
      try {
        const chatId = hkLocalToChatId(String(p));
        const text = template ? renderTemplate(template, data) : message;

        await enqueue(async () => {
          await sendMessageWithAttachments(client, chatId, text, { image_path, pdf_path });
          await sleep(jitterDelay());
        });

        sent++;
      } catch (e) {
        failed++;
        errors.push({ phone: p, error: e.message });
        console.error(`❌ Failed to ${p}:`, e.message);
      }
    }

    res.json({ ok: true, sent, failed, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ API listening on http://localhost:${PORT}`));