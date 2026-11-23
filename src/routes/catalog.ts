import { Request, Response } from 'express';
import { db } from '../db/database';
import { parseConfig } from './manifest';

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

  const releases = db.getCatalog(type, genre, config.minYear, skip, 50);

  const metas = releases.map((r) => ({
    id: r.imdb_id,
    type: r.type,
    name: r.title,
    poster: r.poster,
    background: r.background,
    description: r.description
      ? `${r.description}\n\n[Digital Release: ${r.digital_date} • ${r.quality}]`
      : `Digital Release: ${r.digital_date} • Quality: ${r.quality}`,
    releaseInfo: r.year ? r.year.toString() : undefined,
    genres: r.genres,
    imdbRating: r.imdb_rating ? r.imdb_rating.toString() : undefined,
  }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'max-age=1800, stale-while-revalidate=3600');
  res.json({ metas });
}
