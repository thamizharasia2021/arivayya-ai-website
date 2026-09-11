const API_BASE = '/api';
const ICONS = {
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.7" r="1" class="fill"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.7a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4A8 8 0 1 1 20 11.7Z"/><path d="M8.2 8.1c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .7.7 1.3 1.7 2.2 3 2.8.3.2.5.1.7-.1l.8-1c.2-.3.5-.3.8-.2l1.8.9c.3.1.5.3.5.5 0 .5-.2 1.6-1 2.2-.7.6-1.6.9-2.7.6-1.3-.3-3.1-1-5-2.7-1.6-1.5-2.7-3.3-3-4.7-.3-1.1 0-2 .3-2.5Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.8 9 3.2l2 4.7-1.6 1.5a14.4 14.4 0 0 0 5.2 5.2l1.5-1.6 4.7 2-.6 2.4c-.3 1.4-1.7 2.4-3.1 2.2C10.3 18.7 5.3 13.7 4.4 6.9c-.2-1.4.8-2.8 2.2-3.1Z"/></svg>',
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>'
};

document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] || ''; });

const menu = document.querySelector('.menu');
const links = document.querySelector('.links');
if (menu && links) {
  menu.type = 'button';
  menu.setAttribute('aria-expanded', 'false');
  links.setAttribute('aria-label', 'Main navigation');
  menu.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? '×' : '☰';
  });
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    links.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = '☰';
  }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { links.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.textContent = '☰'; } });
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }), { threshold: .08 }) : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('visible'));
document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const f = btn.dataset.filter;
  document.querySelectorAll('[data-category]').forEach(card => card.style.display = f === 'all' || card.dataset.category.includes(f) ? 'block' : 'none');
}));

// ─── Toast notification ──────────────────────────────────────────────────────
function showToast(message) {
  let toast = document.querySelector('.site-toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'site-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

// ─── Lead submission via API ─────────────────────────────────────────────────
async function submitLead(endpoint, data) {
  try {
    const r = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify(data)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Submission failed');
    return d;
  } catch (err) {
    showToast('Network error. Please try WhatsApp for a faster response.');
    throw err;
  }
}

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}

// ─── Contact form ────────────────────────────────────────────────────────────
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const notes = [data.get('message'), `Preferred contact: ${data.get('contactMethod')}`, `Start: ${data.get('timeframe')}`].filter(Boolean).join(' · ');
    const button = contactForm.querySelector('button');
    button.textContent = 'Sending...';
    button.disabled = true;
    try {
      await submitLead('/leads/contact', {
        name: data.get('name'),
        phone: data.get('contact'),
        org: data.get('org'),
        type: data.get('type'),
        contactMethod: data.get('contactMethod'),
        timeframe: data.get('timeframe'),
        message: notes,
        consent: data.get('consent') ? 'yes' : 'no'
      });
      button.textContent = 'Thank you — enquiry received ✓';
      contactForm.reset();
      showToast('Enquiry sent successfully. We will contact you shortly.');
    } catch {
      button.textContent = 'Send enquiry →';
      button.disabled = false;
    }
  });
}

// ─── Chat widget ─────────────────────────────────────────────────────────────
if (!document.body.classList.contains('dashboard-page')) {
  document.body.insertAdjacentHTML('beforeend', `<div class="social-dock" aria-label="Direct contact options"><a class="whatsapp" href="https://wa.me/917012623969?text=Hello%20Arivayya%20AI%2C%20I%20would%20like%20to%20know%20more." target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Arivayya AI">${ICONS.whatsapp}</a><a class="call" href="tel:+917306387174" aria-label="Call Arivayya AI">${ICONS.phone}</a><a class="instagram" href="https://www.instagram.com/_arivayya_ai_/" target="_blank" rel="noopener noreferrer" aria-label="Open Arivayya AI on Instagram">${ICONS.instagram}</a><a class="email" href="mailto:arivayyaai@gmail.com" aria-label="Email Arivayya AI">${ICONS.email}</a></div><button class="chat-launch" type="button" aria-label="Open enquiry chat" aria-expanded="false"><img src="assets/arivayya-ai-chat-logo.png" alt="">Chat with us <span class="lead-badge" hidden></span></button><aside class="chatbox" aria-label="Arivayya AI enquiry assistant" aria-hidden="true"><div class="chat-head"><div class="chat-brand"><img src="assets/arivayya-ai-chat-logo.png" alt="Arivayya AI logo"><div><b>Arivayya AI</b><small>Project enquiry assistant</small></div></div><button class="chat-close" type="button" aria-label="Close chat">×</button></div><div class="chat-messages"><div class="bot-msg">Hello! What would you like to improve? Share a few details and our team can follow up.</div></div><form class="chat-form" novalidate><input name="name" placeholder="Your name" aria-label="Your name" autocomplete="name" required><input name="phone" type="tel" placeholder="Phone or WhatsApp number" aria-label="Phone or WhatsApp number" autocomplete="tel" required><input name="business" placeholder="Business / organisation" aria-label="Business or organisation" autocomplete="organization"><select name="interest" aria-label="Area of interest"><option>Gym AI Assistant</option><option>Local business website and chatbot</option><option>Healthcare AI</option><option>Computer vision</option><option>Document automation</option><option>Academic project or training</option><option>Custom AI product</option></select><select name="contactMethod" aria-label="Preferred contact method"><option>Contact me on WhatsApp</option><option>Call me</option><option>Email me</option></select><textarea name="message" placeholder="Briefly describe your requirement" aria-label="Briefly describe your requirement" required></textarea><label class="consent"><input type="checkbox" name="consent" required> I agree to be contacted about this enquiry.</label><button type="submit">Send enquiry →</button><small>Your details are used only to respond to this enquiry.</small></form></aside>`);

  const launch = document.querySelector('.chat-launch');
  const box = document.querySelector('.chatbox');
  const close = document.querySelector('.chat-close');
  const setChat = open => {
    box.classList.toggle('open', open);
    box.setAttribute('aria-hidden', String(!open));
    launch.setAttribute('aria-expanded', String(open));
    if (open) box.querySelector('input')?.focus();
  };
  launch.addEventListener('click', () => setChat(!box.classList.contains('open')));
  close.addEventListener('click', () => setChat(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setChat(false); });

  document.querySelector('.chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.target);
    if (!data.get('consent')) { showToast('Please agree to be contacted.'); return; }
    const btn = event.target.querySelector('button');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
      await submitLead('/leads/chat', {
        name: data.get('name'),
        phone: data.get('phone'),
        business: data.get('business'),
        interest: data.get('interest'),
        message: data.get('message'),
        contactMethod: data.get('contactMethod')
      });
      event.target.innerHTML = '<div class="chat-success"><b>Thank you!</b><p>Your enquiry has been sent. Continue on WhatsApp for a faster response.</p><a href="https://wa.me/917012623969" target="_blank" rel="noopener noreferrer">Continue on WhatsApp →</a></div>';
    } catch {
      btn.textContent = 'Send enquiry →';
      btn.disabled = false;
    }
  });
}

// ─── Gym demo form ───────────────────────────────────────────────────────────
const gymForm = document.querySelector('#gym-lead-form');
if (gymForm) {
  gymForm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(gymForm);
    const btn = gymForm.querySelector('button');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
      await submitLead('/leads/gym', {
        name: d.get('name'),
        phone: d.get('phone'),
        gym: d.get('gym'),
        interest: d.get('interest'),
        message: d.get('message')
      });
      btn.textContent = 'Enquiry received ✓';
      gymForm.reset();
      showToast('Gym enquiry sent. We will reach out shortly.');
    } catch {
      btn.textContent = 'Request gym demo →';
      btn.disabled = false;
    }
  });
}

// ─── Lazy-load video ─────────────────────────────────────────────────────────
const videoShell = document.getElementById('video-shell');
if (videoShell) {
  const poster = document.getElementById('video-poster');
  const playBtn = document.getElementById('video-play-btn');
  const video = document.getElementById('gym-video');

  if (playBtn && video) {
    playBtn.addEventListener('click', () => {
      poster.style.display = 'none';
      video.style.display = 'block';
      video.load();
      video.play().catch(() => {});
    });
  }
}
