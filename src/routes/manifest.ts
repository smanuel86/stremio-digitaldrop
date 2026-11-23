import { Request, Response } from 'express';
import { db } from '../db/database';
import { CONFIG } from '../config';

export interface UserConfig {
  includeMovies?: boolean;
  includeSeries?: boolean;
  minYear?: number;
}

export function parseConfig(configStr?: string): UserConfig {
  if (!configStr) {
    return { includeMovies: true, includeSeries: true };
  }

  try {
    // Check if JSON base64 encoded
    const decoded = Buffer.from(configStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      includeMovies: parsed.includeMovies !== false,
      includeSeries: parsed.includeSeries !== false,
      minYear: parsed.minYear ? parseInt(parsed.minYear, 10) : undefined,
    };
  } catch {
    // If not base64 JSON, try key=value pairs (e.g., "movies=1,series=1")
    const parts = configStr.split(',');
    const cfg: UserConfig = { includeMovies: true, includeSeries: true };
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 'movies') cfg.includeMovies = v !== '0';
      if (k === 'series') cfg.includeSeries = v !== '0';
      if (k === 'minYear') cfg.minYear = parseInt(v, 10);
    }
    return cfg;
  }
}

export function getManifestHandler(req: Request, res: Response) {
  const configParam = Array.isArray(req.params.config) ? req.params.config[0] : req.params.config;
  const config = parseConfig(configParam);

  const movieGenres = ['All', ...db.getAvailableGenres('movie')];
  const seriesGenres = ['All', ...db.getAvailableGenres('series')];

  const catalogs: any[] = [];

  if (config.includeMovies !== false) {
    catalogs.push({
      type: 'movie',
      id: 'latest_digital_movies',
      name: '🎬 Latest Digital Movies',
      extra: [
        {
          name: 'genre',
          options: movieGenres.length > 1 ? movieGenres : ['All', 'Action', 'Drama', 'Comedy', 'Sci-Fi', 'Thriller', 'Horror', 'Romance', 'Animation'],
          isRequired: false,
        },
        {
          name: 'skip',
          isRequired: false,
        },
      ],
    });
  }

  if (config.includeSeries !== false) {
    catalogs.push({
      type: 'series',
      id: 'latest_digital_series',
      name: '📺 Latest Digital Series',
      extra: [
        {
          name: 'genre',
          options: seriesGenres.length > 1 ? seriesGenres : ['All', 'Action', 'Drama', 'Comedy', 'Sci-Fi', 'Thriller', 'Horror', 'Animation'],
          isRequired: false,
        },
        {
          name: 'skip',
          isRequired: false,
        },
      ],
    });
  }

  const manifest = {
    id: 'community.digitaldrop.catalog',
    version: '1.0.0',
    name: 'DigitalDrop',
    description: 'Dynamic carousel of latest Movies & Series dropped on digital (WEB-DL / BluRay). Strict no-CAM guarantee.',
    logo: 'https://cdn-icons-png.flaticon.com/512/3845/3845868.png',
    background: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
    resources: ['catalog'],
    types: ['movie', 'series'],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  res.json(manifest);
}
