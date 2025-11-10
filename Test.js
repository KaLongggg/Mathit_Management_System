// index.cjs — WhatsApp bot + API endpoint (Docker-ready, CommonJS)

// Node 20 has global fetch/Headers/Request/Response — no undici polyfill needed.
require('dotenv').config();

const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const Mustache = require('mustache');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// -------- helpers --------
function hkLocalToChatId(local8) {
  const digits = String(local8 || '').replace(/[^\d]/g, '');
  if (!/^\d{8}$/.test(digits)) throw new Error(`Invalid HK local number: ${local8}`);
  return `852${digits}@c.us`;
}

const renderTemplate = (tpl, row) => Mustache.render(tpl || '', row || {});

/**
 * Resolve a media path:
 * - If it's an absolute path, return as-is.
 * - If it's a relative path with slashes, join against CWD.
 * - If it's just a bare filename (no slash), assume it's under ./assets/
 */
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

// -------- WhatsApp client --------
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  webVersionCache: { type: 'none' },
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    // ✅ isolate browser profile so locks don't collide
    userDataDir: process.env.CHROME_USER_DATA_DIR || '/app/chrome-data',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  }
});


// QR / lifecycle logs
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('authenticated', () => console.log('? Authenticated'));
client.on('ready', async () => console.log('?? Bot ready!'));
client.on('disconnected', reason => console.error('?? Disconnected:', reason));

// Simple echo handler example
client.on('message', async (msg) => {
  try {
    const text = (msg.body || '').trim().toLowerCase();
    if (text === 'hi') {
      return msg.reply('?? Hello! This is Mathit Oscar Sir ???');
    }
  } catch (err) {
    console.error('Handler error:', err);
  }
});

client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n?? Shutting down…');
  try { await client.destroy(); } catch {}
  process.exit(0);
});

// -------- API server --------
const app = express();
app.use(bodyParser.json());

// Optional: simple token gate
const REQUIRED_TOKEN = process.env.BOT_SHARED_SECRET || '';
app.use((req, res, next) => {
  if (!REQUIRED_TOKEN) return next();
  const token = req.header('X-API-KEY') || '';
  if (token === REQUIRED_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// Send single
app.post('/send', async (req, res) => {
  try {
    const { phone, message, image_path, pdf_path, template, data } = req.body;
    if (!phone || (!message && !template)) {
      return res.status(400).json({ error: 'phone and message (or template) are required' });
    }
    const chatId = hkLocalToChatId(String(phone));
    const text = template ? renderTemplate(template, data) : message;
    await sendMessageWithAttachments(client, chatId, text, { image_path, pdf_path });
    console.log(`?? API sent to ${chatId}: ${text}`);
    res.json({ ok: true, sent: true });
  } catch (err) {
    console.error('? API send failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Broadcast
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message, image_path, pdf_path, template, data } = req.body;
    if (!Array.isArray(phones) || (!message && !template)) {
      return res.status(400).json({ error: 'phones[] and message (or template) are required' });
    }
    let sent = 0, failed = 0, errors = [];
    for (const p of phones) {
      try {
        const chatId = hkLocalToChatId(String(p));
        const text = template ? renderTemplate(template, data) : message;
        await sendMessageWithAttachments(client, chatId, text, { image_path, pdf_path });
        sent++;
      } catch (e) {
        failed++;
        errors.push({ phone: p, error: e.message });
        console.error(`?? Failed to ${p}:`, e.message);
      }
    }
    res.json({ ok: true, sent, failed, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`? API listening on http://localhost:${PORT}`));
