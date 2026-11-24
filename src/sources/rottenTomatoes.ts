import axios from 'axios';
import { CONFIG } from '../config';

export interface ReleaseCandidate {
  title: string;
  year?: number;
  type: 'movie' | 'series';
  digital_date: string; // YYYY-MM-DD
  source: string;
  quality: string;
  service?: string; // e.g. "netflix", "apple-tv-plus", etc.
}

export class RottenTomatoesSource {
  private baseHeaders = {
    'User-Agent': CONFIG.USER_AGENT,
    Referer: 'https://www.rottentomatoes.com/browse/movies_at_home',
    Accept: 'application/json, text/plain, */*',
  };

  /**
   * Parse dates like "Streaming Nov 18, 2026", "Nov 18", "Latest Episode: Nov 19" into YYYY-MM-DD
   */
  private parseReleaseDate(dateText: string | undefined, currentYear: number): string | null {
    if (!dateText) return null;

    const cleaned = dateText
      .replace(/^Streaming\s+/i, '')
      .replace(/^Latest Episode:\s+/i, '')
      .replace(/^Released\s+/i, '')
      .trim();

    // Match e.g. "Nov 18, 2026" or "Nov 18"
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const matchWithYear = cleaned.match(/([a-zA-Z]{3})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (matchWithYear) {
      const month = monthMap[matchWithYear[1].toLowerCase().slice(0, 3)];
      const day = matchWithYear[2].padStart(2, '0');
      const year = matchWithYear[3];
      if (month) return `${year}-${month}-${day}`;
    }

    const matchNoYear = cleaned.match(/([a-zA-Z]{3})\s+(\d{1,2})/i);
    if (matchNoYear) {
      const month = monthMap[matchNoYear[1].toLowerCase().slice(0, 3)];
      const day = matchNoYear[2].padStart(2, '0');
      if (month) return `${currentYear}-${month}-${day}`;
    }

    return null;
  }

  public async fetchMoviesAtHome(maxPages: number = 2): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    let cursor: string | null = null;

    for (let page = 1; page <= maxPages; page++) {
      try {
        let url = 'https://www.rottentomatoes.com/cnapi/browse/movies_at_home/sort:popular';
        if (cursor) {
          url += `?after=${encodeURIComponent(cursor)}`;
        }

        const res = await axios.get(url, {
          headers: this.baseHeaders,
          timeout: 10000,
        });

        const list = res.data?.grid?.list || [];
        const pageInfo = res.data?.pageInfo;

        for (const item of list) {
          const title = item.title;
          if (!title) continue;

          const digitalDate = this.parseReleaseDate(item.releaseDateText, currentYear) || todayStr;

          // Enforce: only released titles (digital date <= today)
          if (digitalDate > todayStr) {
            continue;
          }

          // Extract year from release date or title
          let year = currentYear;
          if (digitalDate) {
            year = parseInt(digitalDate.split('-')[0], 10);
          }

          // Enforce: New movies only
          if (year < minYear) {
            continue;
          }

          candidates.push({
            title,
            year,
            type: 'movie',
            digital_date: digitalDate,
            source: 'rottentomatoes',
            quality: 'WEB-DL',
          });
        }

        if (pageInfo?.hasNextPage && pageInfo.endCursor) {
          cursor = pageInfo.endCursor;
        } else {
          break;
        }
      } catch (err: any) {
        console.error(`[RottenTomatoes] Error fetching movies page ${page}:`, err.message);
        break;
      }
    }

    return candidates;
  }

  public async fetchTvSeries(): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    try {
      const url = 'https://www.rottentomatoes.com/cnapi/browse/tv_series_browse/sort:popular';
      const res = await axios.get(url, {
        headers: {
          ...this.baseHeaders,
          Referer: 'https://www.rottentomatoes.com/browse/tv_series_browse',
        },
        timeout: 10000,
      });

      const list = res.data?.grid?.list || [];

      for (const item of list) {
        const title = item.title;
        if (!title) continue;

        const digitalDate = this.parseReleaseDate(item.releaseDateText, currentYear) || todayStr;

        // Digital release date on or before today
        if (digitalDate > todayStr) {
          continue;
        }

        let year = currentYear;
        if (digitalDate) {
          year = parseInt(digitalDate.split('-')[0], 10);
        }

        if (year < minYear) {
          continue;
        }

        candidates.push({
          title,
          year,
          type: 'series',
          digital_date: digitalDate,
          source: 'rottentomatoes',
          quality: 'WEB-DL',
        });
      }
    } catch (err: any) {
      console.error('[RottenTomatoes] Error fetching TV series:', err.message);
    }

    return candidates;
  }

  public async fetchPlatformReleases(service: string, affiliateParam: string): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    const endpoints = [
      { type: 'movie' as const, path: `movies_at_home/${affiliateParam}` },
      { type: 'series' as const, path: `tv_series_browse/${affiliateParam}` },
    ];

    for (const ep of endpoints) {
      try {
        const url = `https://www.rottentomatoes.com/cnapi/browse/${ep.path}`;
        const res = await axios.get(url, {
          headers: this.baseHeaders,
          timeout: 10000,
        });

        const list = res.data?.grid?.list || [];
        for (const item of list) {
          const title = item.title;
          if (!title) continue;

          const digitalDate = this.parseReleaseDate(item.releaseDateText, currentYear) || todayStr;
          if (digitalDate > todayStr) continue;

          let year = currentYear;
          if (digitalDate) year = parseInt(digitalDate.split('-')[0], 10);
          if (year < minYear) continue;

          candidates.push({
            title,
            year,
            type: ep.type,
            digital_date: digitalDate,
            source: `rt-${service}`,
            quality: 'WEB-DL',
            service,
          });
        }
      } catch (err: any) {
        // Silently skip if a platform endpoint fails
      }
    }

    return candidates;
  }

  public async fetchAllPlatforms(): Promise<ReleaseCandidate[]> {
    const platforms: { service: string; param: string }[] = [
      { service: 'netflix', param: 'affiliates:netflix' },
      { service: 'apple-tv-plus', param: 'affiliates:apple-tv-plus' },
      { service: 'prime-video', param: 'affiliates:prime-video' },
      { service: 'max', param: 'affiliates:max' },
      { service: 'disney-plus', param: 'affiliates:disney-plus' },
      { service: 'paramount-plus', param: 'affiliates:paramount-plus' },
      { service: 'peacock', param: 'affiliates:peacock' },
    ];

    const results: ReleaseCandidate[] = [];
    for (const p of platforms) {
      const items = await this.fetchPlatformReleases(p.service, p.param);
      results.push(...items);
    }
    return results;
  }
}

export const rottenTomatoesSource = new RottenTomatoesSource();
