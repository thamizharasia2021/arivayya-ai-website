# Arivayya AI Website — Deployment Guide

## Quick start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and configure
cp .env.example .env
# Edit .env with your SMTP credentials and owner password

# 3. Start the server
npm start
# Opens on http://localhost:3000

# 4. Visit the site
# Main website: http://localhost:3000/
# Owner dashboard: http://localhost:3000/dashboard.html
# Gym dashboard: http://localhost:3000/gym-dashboard.html
```

## Default owner credentials

On first run, the server creates a default owner account:
- **Username:** `owner`
- **Password:** Set via `OWNER_PASSWORD` in `.env` (default: `arivayya2026`)

**Important:** Change this password immediately after first login.

## Environment variables

See `.env.example` for all available settings. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` for deployment |
| `PORT` | No | Server port (default: 3000) |
| `SESSION_SECRET` | Yes | Long random string for session security |
| `OWNER_PASSWORD` | Yes | Dashboard login password |
| `OWNER_EMAIL` | Yes | Email for lead notifications |
| `SMTP_HOST` | Yes | SMTP server (e.g., smtp.gmail.com) |
| `SMTP_PORT` | Yes | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password/app password |
| `WHATSAPP_NUMBER` | No | Owner WhatsApp number for notifications |
| `SITE_URL` | Yes | Full site URL for email links |

## Deployment to production

### Option 1: VPS (DigitalOcean, AWS EC2, etc.)

```bash
# Install Node.js 18+ and PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Deploy
git clone <your-repo> /var/www/arivayya-ai
cd /var/www/arivayya-ai
npm install --production
cp .env.example .env
# Edit .env with production values
pm2 start server.js --name arivayya-ai
pm2 save
pm2 startup
```

### Option 2: GitHub Pages + separate backend

1. Deploy static files to GitHub Pages (or any static host)
2. Deploy `server.js` to a VPS or Node.js host (Render, Railway, Fly.io)
3. Update the `API_BASE` in `site.js` to point to your backend URL

### Option 3: Render.com

```bash
# Create a new Web Service on render.com
# Connect your GitHub repo
# Build command: npm install
# Start command: node server.js
# Add all environment variables from .env.example
```

## Security checklist before launch

- [ ] Change `OWNER_PASSWORD` in `.env`
- [ ] Set a strong `SESSION_SECRET` (50+ random characters)
- [ ] Configure SMTP with app password (not account password)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS on your domain
- [ ] Set `SITE_URL` to your actual domain
- [ ] Review `ALLOWED_ORIGIN` in `.env`
- [ ] Ensure `.env` is in `.gitignore` (never commit it)
- [ ] Set up SSL certificate (Let's Encrypt / Cloudflare)
- [ ] Configure hosting platform security headers (CSP, HSTS, etc.)

## Image optimization

Compressed images are in `assets/compressed/`. To use them:

```bash
# Replace original files with compressed versions
cp assets/compressed/*.webp assets/
cp assets/compressed/arivayya-gym-demo-poster.jpeg assets/

# For the video, install ffmpeg and compress:
sudo apt install ffmpeg
ffmpeg -i assets/arivayya-gym-demo-anonymised.mp4 \
  -vcodec libx264 -crf 28 -preset slow \
  -movflags +faststart \
  assets/arivayya-gym-demo-anonymised.mp4
```

## Data management

Leads are stored in `data/leads.json`. For production:

1. Replace file-based storage with PostgreSQL or MongoDB
2. Set up automated backups
3. Configure data retention (24 months default)
4. Enable audit logging (already implemented)

## Lead notifications

The server sends email notifications for every new lead. To also enable WhatsApp notifications:

1. Apply for WhatsApp Business API at developers.facebook.com
2. Or use a service like Twilio
3. Update the `sendWhatsAppNotification` function in `server.js`

## What changed

### Launch blockers fixed
- Real backend lead collection via `/api/leads/*` endpoints
- Secure owner authentication with bcrypt-hashed passwords
- Email notifications to owner for every new lead
- Privacy Policy, Terms of Use, and Cookie Policy pages
- Dashboard pages now require authentication
- Rate limiting, input validation, and honeypot protection

### Performance
- Logo compressed: 480KB → 12KB (98% reduction)
- Product images compressed: ~2.6-2.8MB each → ~200KB each (92% reduction)
- Poster compressed: 151KB → 63KB
- Total savings: ~7MB on images alone

### SEO & content
- Fixed Instagram handle from `@arivayya_ai` to `@_arivayya_ai_` across all pages
- Fixed contact form field naming (was using `email` field for phone)
- Added Open Graph image to gym page
- Removed public dashboard from navigation
- Added legal pages to sitemap

### Brand consistency
- Logo now uses `<picture>` element with WebP fallback across all pages
- Consistent `rel="noopener noreferrer"` on external links
- Skip-to-content link added to styles

## Support

For questions about deployment or configuration: arivayyaai@gmail.com
