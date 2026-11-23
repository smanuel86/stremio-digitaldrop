import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { syncService } from '../services/syncService';

export function getConfigureHandler(req: Request, res: Response) {
  const possiblePaths = [
    path.join(__dirname, '..', 'views', 'configure.html'),
    path.join(__dirname, '..', '..', 'src', 'views', 'configure.html'),
    path.join(process.cwd(), 'src', 'views', 'configure.html'),
    path.join(process.cwd(), 'dist', 'views', 'configure.html'),
  ];

  let htmlPath = possiblePaths[0];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      htmlPath = p;
      break;
    }
  }
  try {
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const stats = db.getStats();

    html = html
      .replace('{{STATS_MOVIES}}', stats.movieCount.toString())
      .replace('{{STATS_SERIES}}', stats.seriesCount.toString())
      .replace(
        '{{STATS_SYNC}}',
        stats.lastSyncTime ? 'Every 30m' : 'Initial sync'
      );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(500).send(`Error loading configuration page: ${err.message}`);
  }
}

export async function postSyncHandler(req: Request, res: Response) {
  try {
    const result = await syncService.runSync();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
