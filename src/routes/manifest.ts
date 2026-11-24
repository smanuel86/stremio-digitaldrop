import { Request, Response } from 'express';
import { db } from '../db/database';

export const PLATFORMS: Record<string, { name: string; emoji: string }> = {
  netflix: { name: 'Netflix', emoji: '🔴' },
  'apple-tv-plus': { name: 'Apple TV+', emoji: '🍏' },
  'prime-video': { name: 'Amazon Prime', emoji: '📦' },
  max: { name: 'Max (HBO)', emoji: '🟣' },
  'disney-plus': { name: 'Disney+', emoji: '✨' },
  'paramount-plus': { name: 'Paramount+', emoji: '🔵' },
  peacock: { name: 'Peacock', emoji: '🦚' },
};

export interface UserConfig {
  includeMovies?: boolean;
  includeSeries?: boolean;
  minYear?: number;
  platforms?: string[];
}

export function parseConfig(configStr?: string): UserConfig {
  if (!configStr) {
    return { includeMovies: true, includeSeries: true, platforms: [] };
  }

  try {
    const decoded = Buffer.from(configStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      includeMovies: parsed.includeMovies !== false,
      includeSeries: parsed.includeSeries !== false,
      minYear: parsed.minYear ? parseInt(parsed.minYear, 10) : undefined,
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms : [],
    };
  } catch {
    const parts = configStr.split(',');
    const cfg: UserConfig = { includeMovies: true, includeSeries: true, platforms: [] };
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 'movies') cfg.includeMovies = v !== '0';
      if (k === 'series') cfg.includeSeries = v !== '0';
      if (k === 'minYear') cfg.minYear = parseInt(v, 10);
      if (k === 'platforms' && v) cfg.platforms = v.split(':');
    }
    return cfg;
  }
}

export function getManifestHandler(req: Request, res: Response) {
  const configParam = Array.isArray(req.params.config) ? req.params.config[0] : req.params.config;
  const config = parseConfig(configParam);

  const platformGenreOptions = Object.values(PLATFORMS).map((p) => `[${p.name}]`);
  const baseMovieGenres = db.getAvailableGenres('movie');
  const baseSeriesGenres = db.getAvailableGenres('series');

  const movieGenres = ['All', ...platformGenreOptions, ...baseMovieGenres];
  const seriesGenres = ['All', ...platformGenreOptions, ...baseSeriesGenres];

  const catalogs: any[] = [];

  // 1. Primary Carousels
  if (config.includeMovies !== false) {
    catalogs.push({
      type: 'movie',
      id: 'latest_digital_movies',
      name: '🎬 Latest Digital Movies',
      extra: [
        {
          name: 'genre',
          options: movieGenres,
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
          options: seriesGenres,
          isRequired: false,
        },
        {
          name: 'skip',
          isRequired: false,
        },
      ],
    });
  }

  // 2. Dedicated Platform Carousels (if enabled in user config)
  if (Array.isArray(config.platforms)) {
    for (const platKey of config.platforms) {
      const plat = PLATFORMS[platKey];
      if (!plat) continue;

      if (config.includeMovies !== false) {
        catalogs.push({
          type: 'movie',
          id: `latest_digital_movies_${platKey}`,
          name: `${plat.emoji} New on ${plat.name} (Movies)`,
          extra: [
            {
              name: 'genre',
              options: ['All', ...baseMovieGenres],
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
          id: `latest_digital_series_${platKey}`,
          name: `${plat.emoji} New on ${plat.name} (Series)`,
          extra: [
            {
              name: 'genre',
              options: ['All', ...baseSeriesGenres],
              isRequired: false,
            },
            {
              name: 'skip',
              isRequired: false,
            },
          ],
        });
      }
    }
  }

  const manifest = {
    id: 'community.digitaldrop.catalog',
    version: '1.1.0',
    name: 'DigitalDrop',
    description: 'Dynamic carousel of latest Movies & Series dropped on digital (WEB-DL / BluRay) with Streaming Service filters. Strict no-CAM guarantee.',
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
