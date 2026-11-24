import { Request, Response } from 'express';
import { db } from '../db/database';
import { parseConfig, PLATFORMS } from './manifest';

function parseExtraParams(extraStr?: string, query?: Record<string, any>): { genre?: string; skip: number } {
  let genre: string | undefined = undefined;
  let skip: number = 0;

  // 1. From path segment e.g. "genre=Action&skip=20.json" or "genre=Action"
  if (extraStr) {
    const cleaned = extraStr.replace(/\.json$/, '');
    const parts = cleaned.split('&');
    for (const part of parts) {
      const [key, val] = part.split('=');
      if (key === 'genre' && val) {
        genre = decodeURIComponent(val);
      }
      if (key === 'skip' && val) {
        const parsedSkip = parseInt(val, 10);
        if (!isNaN(parsedSkip)) skip = parsedSkip;
      }
    }
  }

  // 2. From query parameters e.g. ?genre=Action&skip=20
  if (query) {
    if (query.genre && typeof query.genre === 'string') {
      genre = query.genre;
    }
    if (query.skip) {
      const parsedSkip = parseInt(query.skip as string, 10);
      if (!isNaN(parsedSkip)) skip = parsedSkip;
    }
  }

  return { genre, skip };
}

export function getCatalogHandler(req: Request, res: Response) {
  const type = (Array.isArray(req.params.type) ? req.params.type[0] : req.params.type) as 'movie' | 'series';
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId ? rawId.replace(/\.json$/, '') : '';
  const rawExtra = Array.isArray(req.params.extra) ? req.params.extra[0] : req.params.extra;
  const extra = rawExtra || '';
  const rawConfig = Array.isArray(req.params.config) ? req.params.config[0] : req.params.config;
  const config = parseConfig(rawConfig);

  if (type !== 'movie' && type !== 'series') {
    return res.json({ metas: [] });
  }

  const { genre, skip } = parseExtraParams(extra, req.query);

  // Check if this catalog ID is for a dedicated platform (e.g. latest_digital_movies_netflix)
  let targetService: string | undefined = undefined;
  for (const platKey of Object.keys(PLATFORMS)) {
    if (id.endsWith(`_${platKey}`)) {
      targetService = platKey;
      break;
    }
  }

  // Check if genre is selected as a platform filter (e.g. "[Netflix]" or "Netflix")
  let cleanGenre = genre;
  if (genre) {
    for (const [platKey, platInfo] of Object.entries(PLATFORMS)) {
      if (genre === `[${platInfo.name}]` || genre.toLowerCase() === platInfo.name.toLowerCase() || genre === platKey) {
        targetService = platKey;
        cleanGenre = undefined; // Filter by service, not text genre
        break;
      }
    }
  }

  const releases = db.getCatalog(type, cleanGenre, targetService, config.minYear, skip, 50);

  const metas = releases.map((r) => {
    const serviceName = r.service && PLATFORMS[r.service] ? PLATFORMS[r.service].name : r.service;
    const badge = serviceName ? `[${serviceName}]` : `[Digital]`;
    const detailsLine = `${badge} • Released: ${r.digital_date} • Quality: ${r.quality}`;

    return {
      id: r.imdb_id,
      type: r.type,
      name: r.title,
      poster: r.poster,
      background: r.background,
      description: r.description ? `${r.description}\n\n${detailsLine}` : detailsLine,
      releaseInfo: r.year ? r.year.toString() : undefined,
      genres: r.genres,
      imdbRating: r.imdb_rating ? r.imdb_rating.toString() : undefined,
    };
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'max-age=1800, stale-while-revalidate=3600');
  res.json({ metas });
}
