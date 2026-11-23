import axios from 'axios';
import { ReleaseRecord } from '../db/database';

export interface CinemetaResult {
  imdb_id: string;
  type: 'movie' | 'series';
  title: string;
  year: number;
  poster: string | null;
  background: string | null;
  description: string | null;
  genres: string[];
  imdb_rating: number | null;
}

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

export class CinemetaService {
  private memoryCache: Map<string, CinemetaResult | null> = new Map();

  private cleanTitleForSearch(rawTitle: string): string {
    return rawTitle
      .replace(/:\s*Season\s*\d+/i, '')
      .replace(/:\s*The\s*Complete\s*Series/i, '')
      .replace(/Season\s*\d+/i, '')
      .replace(/\b(4K|UHD|1080p|720p|WEB-?DL|WEBRip|BluRay|HDR|DV)\b/gi, '')
      .replace(/[._\-]/g, ' ')
      .trim();
  }

  public async searchAndResolve(
    rawTitle: string,
    targetType: 'movie' | 'series',
    expectedYear?: number
  ): Promise<CinemetaResult | null> {
    const cleanTitle = this.cleanTitleForSearch(rawTitle);
    const cacheKey = `${targetType}:${cleanTitle.toLowerCase()}:${expectedYear || 'any'}`;

    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey) || null;
    }

    try {
      const searchUrl = `${CINEMETA_BASE}/catalog/${targetType}/top/search=${encodeURIComponent(cleanTitle)}.json`;
      const res = await axios.get(searchUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'DigitalDrop-Stremio/1.0' },
      });

      const metas = res.data?.metas || [];
      if (!Array.isArray(metas) || metas.length === 0) {
        this.memoryCache.set(cacheKey, null);
        return null;
      }

      // Find best match by year or closest title
      let bestMatch = metas[0];
      if (expectedYear && metas.length > 1) {
        const exactYear = metas.find((m: any) => {
          const y = parseInt(m.releaseInfo || m.year || '0', 10);
          return y === expectedYear || Math.abs(y - expectedYear) <= 1;
        });
        if (exactYear) bestMatch = exactYear;
      }

      const imdbId = bestMatch.imdb_id || bestMatch.id;
      if (!imdbId || !imdbId.startsWith('tt')) {
        this.memoryCache.set(cacheKey, null);
        return null;
      }

      // Fetch full meta for genres and rich synopsis
      let genres: string[] = [];
      let description: string | null = null;
      let imdbRating: number | null = null;
      let poster: string | null = bestMatch.poster || null;
      let background: string | null = bestMatch.background || null;

      try {
        const metaUrl = `${CINEMETA_BASE}/meta/${targetType}/${imdbId}.json`;
        const metaRes = await axios.get(metaUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'DigitalDrop-Stremio/1.0' },
        });
        const meta = metaRes.data?.meta;
        if (meta) {
          genres = Array.isArray(meta.genre) ? meta.genre : Array.isArray(meta.genres) ? meta.genres : [];
          description = meta.description || null;
          poster = meta.poster || poster;
          background = meta.background || background;
          if (meta.imdbRating) {
            const parsed = parseFloat(meta.imdbRating);
            if (!isNaN(parsed)) imdbRating = parsed;
          }
        }
      } catch {
        // Fall back to catalog meta if detail endpoint fails
        genres = Array.isArray(bestMatch.genre) ? bestMatch.genre : [];
        description = bestMatch.description || null;
      }

      const parsedYear = parseInt(bestMatch.releaseInfo || bestMatch.year || `${expectedYear || new Date().getFullYear()}`, 10);

      const result: CinemetaResult = {
        imdb_id: imdbId,
        type: targetType,
        title: bestMatch.name || cleanTitle,
        year: isNaN(parsedYear) ? (expectedYear || new Date().getFullYear()) : parsedYear,
        poster,
        background,
        description,
        genres,
        imdb_rating: imdbRating,
      };

      this.memoryCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      // Cinemeta search failed or timed out
      this.memoryCache.set(cacheKey, null);
      return null;
    }
  }
}

export const cinemeta = new CinemetaService();
