const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'arivayya-ai-session-secret-change-in-production';

// ─── Data store (replace with PostgreSQL/MongoDB in production) ───────────────
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const OWNERS_FILE = path.join(__dirname, 'data', 'owners.json');
const AUDIT_FILE = path.join(__dirname, 'data', 'audit.json');

function ensureDataFiles() {
  ['data'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  [LEADS_FILE, OWNERS_FILE, AUDIT_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
  });
}
ensureDataFiles();

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getLeads() { return readJSON(LEADS_FILE); }
function saveLead(lead) {
  const leads = getLeads();
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), status: 'New', read: false, ...lead };
  leads.unshift(entry);
  writeJSON(LEADS_FILE, leads);
  audit('lead_created', entry.id, { source: entry.source, interest: entry.interest });
  return entry;
}
function audit(action, leadId, meta = {}) {
  const logs = readJSON(AUDIT_FILE);
  logs.push({ timestamp: new Date().toISOString(), action, leadId, ...meta });
  writeJSON(AUDIT_FILE, logs.slice(-1000)); // keep last 1000
}

// ─── Security & session ──────────────────────────────────────────────────────
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : undefined,
    },
  },
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({ origin: isProduction ? process.env.ALLOWED_ORIGIN?.split(',') || ['https://www.arivayyaai.com'] : true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname), { maxAge: '7d', etag: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests. Please try again later.' } });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many submissions. Please try again in an hour.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts. Please wait 15 minutes.' } });

app.use('/api/', generalLimiter);

// ─── Owner authentication setup (run once) ───────────────────────────────────
// Create initial owner if none exists
function ensureOwnerAccount() {
  const owners = readJSON(OWNERS_FILE);
  if (!owners.length) {
    const defaultPassword = process.env.OWNER_PASSWORD || 'arivayya2026';
    const hash = bcrypt.hashSync(defaultPassword, 12);
    owners.push({ username: 'owner', passwordHash: hash, createdAt: new Date().toISOString() });
    writeJSON(OWNERS_FILE, owners);
    console.log('  ⚠  Created default owner account. Change the password immediately.');
    console.log('     Username: owner');
    console.log('     Password: ' + defaultPassword);
    console.log('     Set OWNER_PASSWORD env variable or edit data/owners.json');
  }
}
ensureOwnerAccount();

// ─── Authentication middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.owner) return next();
  res.status(401).json({ error: 'Authentication required' });
}

// ─── Email transporter ───────────────────────────────────────────────────────
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'Arivayya AI <noreply@arivayyaai.com>';

  if (!host || !user || !pass) {
    console.log('  ⚠  SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env');
    console.log('     Leads will be stored but email notifications will not be sent.');
    return null;
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}
const transporter = createTransporter();

async function sendOwnerNotification(lead) {
  if (!transporter) return;
  const ownerEmail = process.env.OWNER_EMAIL || 'arivayyaai@gmail.com';
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Arivayya AI <noreply@arivayyaai.com>',
      to: ownerEmail,
      subject: `🔔 New enquiry: ${lead.name} — ${lead.interest || lead.source}`,
      text: `New lead from Arivayya AI website:

Name: ${lead.name}
Phone: ${lead.phone}
Business: ${lead.business || 'Not provided'}
Interest: ${lead.interest || 'Not specified'}
Message: ${lead.message || 'No message'}
Source: ${lead.source}
Time: ${new Date(lead.createdAt).toLocaleString()}

View in dashboard: ${process.env.SITE_URL || 'http://localhost:3000'}/dashboard.html`,
      html: `<div style="font-family:DM Sans,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#071a35">🔔 New Enquiry Received</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;font-weight:700;color:#5f6f82">Name</td><td style="padding:8px">${escapeHtml(lead.name)}</td></tr>
          <tr style="background:#f6f9fc"><td style="padding:8px;font-weight:700;color:#5f6f82">Phone</td><td style="padding:8px">${escapeHtml(lead.phone)}</td></tr>
          <tr><td style="padding:8px;font-weight:700;color:#5f6f82">Business</td><td style="padding:8px">${escapeHtml(lead.business || 'Not provided')}</td></tr>
          <tr style="background:#f6f9fc"><td style="padding:8px;font-weight:700;color:#5f6f82">Interest</td><td style="padding:8px">${escapeHtml(lead.interest || 'Not specified')}</td></tr>
          <tr><td style="padding:8px;font-weight:700;color:#5f6f82">Message</td><td style="padding:8px">${escapeHtml(lead.message || 'No message')}</td></tr>
          <tr style="background:#f6f9fc"><td style="padding:8px;font-weight:700;color:#5f6f82">Source</td><td style="padding:8px">${escapeHtml(lead.source)}</td></tr>
          <tr><td style="padding:8px;font-weight:700;color:#5f6f82">Time</td><td style="padding:8px">${new Date(lead.createdAt).toLocaleString()}</td></tr>
        </table>
        <p style="margin-top:20px"><a href="${process.env.SITE_URL || 'http://localhost:3000'}/dashboard.html" style="background:#071a35;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">Open Dashboard →</a></p>
      </div>`,
    });
    console.log(`  ✓ Email notification sent for lead ${lead.id}`);
  } catch (err) {
    console.error('  ✗ Failed to send email notification:', err.message);
  }
}

async function sendWhatsAppNotification(lead) {
  const waNumber = process.env.WHATSAPP_NUMBER; // e.g. 917012623969
  if (!waNumber) return;
  // Use WhatsApp Business API or a service like Twilio
  // For now, log the notification — replace with actual API call
  const text = `*New Enquiry* ${lead.name} — ${lead.interest || lead.source}. Phone: ${lead.phone}. Business: ${lead.business || 'N/A'}. Message: ${(lead.message || 'N/A').slice(0, 200)}`;
  console.log(`  📱 WhatsApp notification (${waNumber}): ${text}`);
  // TODO: Integrate WhatsApp Business API (Meta) or Twilio
}

async function notifyOwner(lead) {
  await sendOwnerNotification(lead);
  await sendWhatsAppNotification(lead);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Submit contact form
app.post('/api/leads/contact', formLimiter, async (req, res) => {
  try {
    const { name, phone, org, type, contactMethod, timeframe, message, consent } = req.body;

    // Server-side validation
    if (!name || !phone || !message) {
      return res.status(400).json({ error: 'Name, phone/email and message are required.' });
    }
    if (!consent) {
      return res.status(400).json({ error: 'You must agree to be contacted.' });
    }
    if (name.length > 100 || phone.length > 100 || message.length > 2000) {
      return res.status(400).json({ error: 'One or more fields exceed the maximum length.' });
    }
    // Basic phone/email format check
    const phoneOk = /^[+\d\s()-]{7,20}$/.test(phone) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phone);
    if (!phoneOk) {
      return res.status(400).json({ error: 'Please enter a valid phone number or email address.' });
    }

    const lead = saveLead({
      name: String(name).trim().slice(0, 100),
      phone: String(phone).trim().slice(0, 100),
      business: String(org || '').trim().slice(0, 100),
      interest: String(type || '').trim().slice(0, 100),
      message: String(message).trim().slice(0, 2000),
      source: 'Contact form',
    });

    notifyOwner(lead);
    res.status(201).json({ success: true, message: 'Enquiry received. We will contact you shortly.', id: lead.id });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us on WhatsApp.' });
  }
});

// Submit gym demo form
app.post('/api/leads/gym', formLimiter, async (req, res) => {
  try {
    const { name, phone, gym, interest, message } = req.body;

    if (!name || !phone || !gym) {
      return res.status(400).json({ error: 'Name, phone number and gym name are required.' });
    }
    if (name.length > 100 || phone.length > 20 || gym.length > 100) {
      return res.status(400).json({ error: 'One or more fields exceed the maximum length.' });
    }

    const lead = saveLead({
      name: String(name).trim().slice(0, 100),
      phone: String(phone).trim().replace(/\D/g, '').slice(-15),
      business: String(gym).trim().slice(0, 100),
      interest: String(interest || '').trim().slice(0, 100),
      message: String(message || '').trim().slice(0, 2000),
      source: 'Gym demo page',
    });

    notifyOwner(lead);
    res.status(201).json({ success: true, message: 'Gym enquiry received. We will reach out shortly.', id: lead.id });
  } catch (err) {
    console.error('Gym form error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us on WhatsApp.' });
  }
});

// Submit chat form
app.post('/api/leads/chat', formLimiter, async (req, res) => {
  try {
    const { name, phone, business, interest, message, contactMethod } = req.body;

    if (!name || !phone || !message) {
      return res.status(400).json({ error: 'Name, phone and message are required.' });
    }
    if (name.length > 100 || phone.length > 20) {
      return res.status(400).json({ error: 'One or more fields exceed the maximum length.' });
    }

    const lead = saveLead({
      name: String(name).trim().slice(0, 100),
      phone: String(phone).trim().replace(/\D/g, '').slice(-15),
      business: String(business || '').trim().slice(0, 100),
      interest: String(interest || '').trim().slice(0, 100),
      message: String(message).trim().slice(0, 2000) + (contactMethod ? ` · Preferred contact: ${contactMethod}` : ''),
      source: 'Web chat',
    });

    notifyOwner(lead);
    res.status(201).json({ success: true, message: 'Enquiry received. We will contact you shortly.', id: lead.id });
  } catch (err) {
    console.error('Chat form error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us on WhatsApp.' });
  }
});

// ─── Owner authentication API ────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  const owners = readJSON(OWNERS_FILE);
  const owner = owners.find(o => o.username === username);

  if (!owner || !bcrypt.compareSync(password, owner.passwordHash)) {
    audit('login_failed', null, { username });
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.owner = { username: owner.username, loggedInAt: new Date().toISOString() };
  audit('login_success', null, { username: owner.username });
  res.json({ success: true, username: owner.username });
});

app.post('/api/auth/logout', (req, res) => {
  audit('logout', null, { username: req.session?.owner?.username });
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: !!req.session?.owner, username: req.session?.owner?.username || null });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Current password and new password (min 8 chars) required.' });
  }
  const owners = readJSON(OWNERS_FILE);
  const idx = owners.findIndex(o => o.username === req.session.owner.username);
  if (idx === -1 || !bcrypt.compareSync(currentPassword, owners[idx].passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  owners[idx].passwordHash = bcrypt.hashSync(newPassword, 12);
  owners[idx].passwordChangedAt = new Date().toISOString();
  writeJSON(OWNERS_FILE, owners);
  audit('password_changed', null, { username: req.session.owner.username });
  res.json({ success: true });
});

// ─── Owner dashboard API ─────────────────────────────────────────────────────
app.get('/api/dashboard/leads', requireAuth, (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  let leads = getLeads();

  if (status) leads = leads.filter(l => l.status === status);
  if (search) {
    const q = search.toLowerCase();
    leads = leads.filter(l => [l.name, l.phone, l.business, l.interest, l.message, l.source].some(v => String(v || '').toLowerCase().includes(q)));
  }

  const total = leads.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  const paginated = leads.slice(start, start + parseInt(limit));

  res.json({
    leads: paginated,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit)),
    stats: {
      total,
      new: leads.filter(l => l.status === 'New').length,
      followUp: leads.filter(l => l.status === 'Follow-up').length,
      trialBooked: leads.filter(l => l.status === 'Trial Booked').length,
      joined: leads.filter(l => l.status === 'Joined').length,
      closed: leads.filter(l => l.status === 'Closed').length,
    }
  });
});

app.patch('/api/dashboard/leads/:id', requireAuth, (req, res) => {
  const leads = getLeads();
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found.' });

  const allowed = ['status', 'read', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  leads[idx] = { ...leads[idx], ...updates, updatedAt: new Date().toISOString() };
  writeJSON(LEADS_FILE, leads);
  audit('lead_updated', req.params.id, { updates: Object.keys(updates), username: req.session.owner.username });

  res.json({ success: true, lead: leads[idx] });
});

app.delete('/api/dashboard/leads/:id', requireAuth, (req, res) => {
  let leads = getLeads();
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found.' });

  const removed = leads.splice(idx, 1)[0];
  writeJSON(LEADS_FILE, leads);
  audit('lead_deleted', req.params.id, { name: removed.name, username: req.session.owner.username });
  res.json({ success: true });
});

app.get('/api/dashboard/export', requireAuth, (req, res) => {
  const leads = getLeads();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=arivayya-leads-${new Date().toISOString().split('T')[0]}.json`);
  res.send(JSON.stringify(leads, null, 2));
});

app.get('/api/dashboard/audit', requireAuth, (req, res) => {
  res.json(readJSON(AUDIT_FILE).slice(-100));
});

// ─── Honeypot endpoint (trap bots) ──────────────────────────────────────────
app.post('/api/honeypot', (req, res) => {
  const { website, phone_confirm } = req.body;
  if (website || phone_confirm) {
    console.log(`  🪤 Honeypot triggered: ${JSON.stringify(req.body)} from ${req.ip}`);
    return res.json({ success: true }); // silently accept to avoid alerting bot
  }
  res.status(400).json({ error: 'Invalid request.' });
});

// ─── SPA fallback for dashboard pages ────────────────────────────────────────
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/gym-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'gym-dashboard.html')));

// ─── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`  Arivayya AI backend running on http://localhost:${PORT}`);
  console.log(`  Environment: ${isProduction ? 'production' : 'development'}`);
  console.log(`  Static files served from: ${__dirname}`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`  Gym dashboard: http://localhost:${PORT}/gym-dashboard.html`);
});

module.exports = app;
