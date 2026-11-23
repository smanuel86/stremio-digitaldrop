import express from 'express';
import cors from 'cors';
import { CONFIG } from './config';
import { getManifestHandler } from './routes/manifest';
import { getCatalogHandler } from './routes/catalog';
import { getConfigureHandler, postSyncHandler } from './routes/configure';
import { syncService } from './services/syncService';
import { db } from './db/database';

const app = express();

app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/catalog') || req.path.includes('/manifest.json')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Configure and root redirect
app.get('/', (req, res) => res.redirect('/configure'));
app.get('/configure', getConfigureHandler);
app.get('/:config/configure', getConfigureHandler);

// API routes
app.post('/api/sync', postSyncHandler);
app.get('/health', (req, res) => {
  const stats = db.getStats();
  res.json({ status: 'ok', ...stats });
});

// Stremio Addon Protocol routes (Standard & Configured)
// Manifest
app.get('/manifest.json', getManifestHandler);
app.get('/:config/manifest.json', getManifestHandler);

// Catalog without extra
app.get('/catalog/:type/:id.json', getCatalogHandler);
app.get('/:config/catalog/:type/:id.json', getCatalogHandler);

// Catalog with extra params in path (e.g. /catalog/movie/latest_digital_movies/genre=Action.json)
app.get('/catalog/:type/:id/:extra.json', getCatalogHandler);
app.get('/:config/catalog/:type/:id/:extra.json', getCatalogHandler);

// Handle sync-only CLI flag
if (process.argv.includes('--sync-only')) {
  console.log('[DigitalDrop] Running sync-only mode...');
  syncService.runSync().then(() => {
    console.log('[DigitalDrop] Sync finished. Exiting.');
    process.exit(0);
  });
} else {
  // Start server
  app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log('======================================================');
    console.log(`  🎬 DigitalDrop Stremio Addon Server running!`);
    console.log(`  🌐 Web Config: http://localhost:${CONFIG.PORT}/configure`);
    console.log(`  📦 Manifest:   http://localhost:${CONFIG.PORT}/manifest.json`);
    console.log('======================================================');

    // Launch background worker
    syncService.startPeriodicSync();
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[DigitalDrop] Shutting down gracefully...');
  syncService.stop();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[DigitalDrop] Terminating gracefully...');
  syncService.stop();
  db.close();
  process.exit(0);
});
