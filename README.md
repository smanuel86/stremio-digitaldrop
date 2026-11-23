---
title: Stremio DigitalDrop
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7000
pinned: false
---

# 🎬 DigitalDrop - Stremio Digital Releases Addon

**DigitalDrop** is a dynamic catalog addon for [Stremio](https://stremio.com) that updates your front-page carousel with the latest **Movies** and **Series**, **strictly once they are digitally available** (WEB-DL, WEBRip, BluRay).

Never open Stremio to see a theatrical poster with only CAM or TeleSync streams again.

---

## ✨ Features

- **Strict "Digital Only" Guarantee**: Filters out theatrical-only releases and low-grade recordings (CAM, TS, HDCAM, TELESYNC).
- **Multi-Source Ingestion**:
  - **Rotten Tomatoes**: Scrapes *Movies at Home* (pages 1 & 2) and *TV Series* popular drops.
  - **Blu-ray.com**: Scrapes the official *Digital Release Dates Calendar* across all major VOD platforms.
  - **Scene & Torrent Trackers**: Captures real-time digital drops (EZTV, PreDB WEB-DL feeds).
- **Zero-Config Metadata Resolution**: Automatically matches releases to official IMDb IDs, high-resolution posters, genres, and synopsis via Stremio's native Cinemeta. **No API keys or signup required.**
- **Instant Stremio Loading**: Catalog data is cached locally in an embedded **SQLite database**, ensuring carousels load immediately without lag.
- **Automated 30-Minute Sync**: A background worker continuously checks feeds and updates your catalogs.
- **Genre Filters**: Easily filter digital movies and series by genre (Action, Comedy, Sci-Fi, Horror, Drama, Animation, etc.) directly inside Stremio.
- **Modular & Stream-Agnostic**: DigitalDrop strictly manages the catalog. When you click a title, your existing streaming addons (Torrentio, MediaFusion, Comet, Debrid, etc.) handle playback seamlessly.
- **Local & Shareable**: Run it locally for yourself or deploy via Docker to share with family and friends.

---

## 🚀 Quick Start (Local Run)

### Prerequisites
- Node.js 18+ and npm

### 1. Installation
```bash
# Clone or navigate into the project directory
cd "Stremio"

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### 2. Run the Addon
```bash
npm start
```

Open your browser to:
👉 **`http://localhost:7000/configure`**

Click **"Install to Stremio"** or copy the manifest link into Stremio's search bar!

---

## 🐳 Docker Deployment (Recommended for Sharing)

Run DigitalDrop in the background with Docker Compose:

```bash
docker compose up -d
```

The server will be available at `http://localhost:7000`. Catalog data is persisted in `./data/digitaldrop.db`.

To check sync logs:
```bash
docker compose logs -f
```

---

## ⚙️ Configuration & Environment Variables

You can customize runtime settings via environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7000` | HTTP port the addon server listens on |
| `HOST` | `0.0.0.0` | Network binding interface |
| `SYNC_INTERVAL_MINUTES` | `30` | Interval between digital feed updates |
| `MAX_YEAR_LOOKBACK` | `1` | Cutoff for "New" releases (e.g. 1 = 2025–2026) to prevent old catalog re-releases |
| `DATA_DIR` | `./data` | Directory for SQLite database |

---

## 📱 How to Install in Stremio

1. Visit the configuration page: `http://localhost:7000/configure` (or your public URL).
2. Choose which carousels you want (Movies, TV Series, Year Cutoff).
3. **On PC / Mac**: Click **"Install to Stremio"** (opens Stremio automatically).
4. **On Android TV / Fire TV / Web**: Click **"Copy Manifest URL"**, open Stremio, go to **Addons**, paste the URL into the search box, and click **Install**.

---

## 🌐 Sharing With Friends

Because DigitalDrop encodes user configurations in the manifest URL (e.g. `/:config/manifest.json`), **a single instance can be shared with anyone**:

- **Cloudflare Tunnel (Free & Secure)**:
  ```bash
  cloudflared tunnel --url http://localhost:7000
  ```
  Share the generated `https://xyz.trycloudflare.com/configure` link with friends.
- **VPS / Home Server**:
  Deploy using `docker compose up -d` on any VPS (Oracle Free Tier, Hetzner, DigitalOcean) and point your domain to port 7000.

---

## 🛠️ CLI Commands

- `npm run dev`: Run locally with hot reload (`ts-node-dev`)
- `npm run build`: Compile TypeScript and copy templates to `dist/`
- `npm run sync`: Run a one-off feed sync without starting the web server
- `npm start`: Start the production server
