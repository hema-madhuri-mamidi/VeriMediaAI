# VeriMedia AI 🔍

**Detection · Verification · Enforcement**

AI-powered media rights enforcement platform. Upload content, detect unauthorized use across social platforms, and generate DMCA takedown reports — powered by Gemini AI.

---

## Architecture

```
verimedia/
├── backend/          ← Node.js + Express API server
│   ├── routes/
│   │   ├── analyze.js      ← AI analysis pipeline (Gemini)
│   │   ├── fingerprint.js  ← Content DNA registration
│   │   ├── report.js       ← DMCA + analysis export
│   │   └── health.js       ← Health check
│   ├── services/
│   │   ├── detection.js    ← Fingerprinting, similarity, integrity
│   │   ├── decisionEngine.js ← Trust thresholds + decision rules
│   │   └── promptBuilder.js  ← Gemini prompt templates
│   ├── middleware/
│   │   └── validate.js     ← Request validation
│   └── server.js           ← Express app entry
├── frontend/
│   ├── index.html          ← VeriMedia UI (v27)
│   └── api-client.js       ← Backend API client module
├── .github/workflows/
│   └── deploy.yml          ← CI/CD (GitHub Actions)
├── render.yaml             ← Render.com backend deploy config
└── vercel.json             ← Vercel frontend deploy config
```

---

## Quick Start (Local)

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/verimedia-ai.git
cd verimedia-ai
cd backend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your GEMINI_API_KEY
```

### 3. Run the backend

```bash
cd backend
npm run dev    # development (nodemon)
# or
npm start      # production
```

Backend runs at: `http://localhost:3001`

### 4. Open the frontend

```bash
# Option A: Simple file server
cd frontend
npx serve .

# Option B: Just open the file
open frontend/index.html
```

The `api-client.js` is already injected into `index.html`. It defaults to `http://localhost:3001` for local dev.

---

## API Reference

### `GET /api/health`
Returns service status.

### `POST /api/fingerprint/register`
Register a content fingerprint.
```json
{ "fileName": "video.mp4", "fileSize": 2621440, "scenario": "crop" }
```

### `POST /api/analyze`
Full AI analysis pipeline.
```json
{
  "scenario": "crop",
  "contentType": "general",
  "matches": [{ "user": "@user", "platId": "instagram", "similarity": 0.82, "cap": "caption" }],
  "fileName": "video.mp4"
}
```
*Set `GEMINI_API_KEY` server-side in your environment variables.*

### `POST /api/analyze/ml`
ML classifier — returns label + manipulation probability.

### `POST /api/analyze/viral`
Viral score computation.

### `POST /api/report/dmca`
Generate a DMCA takedown report.
```json
{
  "platform": "Instagram",
  "user": "@infringing_account",
  "analysisData": { "match_score": 0.85, "decision": "TAKEDOWN" }
}
```

### `POST /api/report/analysis`
Full analysis export (text bundle).

### `POST /api/report/ai-dmca`
Gemini-enhanced DMCA notice (requires API key).

---

## Deploy to Production

### Backend → Render.com (Free tier available)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Build command: `npm install` | Start command: `npm start`
6. Add environment variables:
   - `GEMINI_API_KEY` → your key
   - `ALLOWED_ORIGINS` → your Vercel frontend URL
   - `NODE_ENV` → `production`

Or use the included `render.yaml` — Render will auto-detect it.

### Frontend → Vercel (Free)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Connect your GitHub repo
3. Set **Root Directory** to `frontend`
4. No build command needed (static)
5. Add environment variable: `VERIMEDIA_API_URL` → your Render backend URL

### CI/CD via GitHub Actions

Add these secrets to your GitHub repo (`Settings → Secrets → Actions`):

| Secret | Description |
|--------|-------------|
| `RENDER_SERVICE_ID` | Your Render service ID (from the service URL) |
| `RENDER_DEPLOY_KEY` | From Render → Service → Settings → Deploy Key |
| `VERCEL_TOKEN` | From vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | From `.vercel/project.json` after first `vercel` deploy |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` after first `vercel` deploy |
| `BACKEND_URL` | Your Render backend URL |

---

## API Key Handling

The app supports two modes:

1. **Server-side key** (recommended for production): Set `GEMINI_API_KEY` in your Render env vars. Users never see the key.
2. **Client-side key**: Users can optionally pass their own Gemini API key in the UI. Passed as `X-Api-Key` header to your backend, which proxies to Gemini. The key is never stored server-side.

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Backend**: Node.js + Express
- **AI**: Google Gemini (`gemini-1.5-flash`)
- **Deploy**: Render (backend) + Vercel (frontend)
- **CI/CD**: GitHub Actions
- **Tests**: Jest + Supertest

---

## License

MIT
