import axios from 'axios';
import { CONFIG } from '../config';
import { ReleaseCandidate } from './rottenTomatoes';

export class ReleaseFeedsSource {
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://predb.me/',
  };

  /**
   * Strictly filters for WEB-DL / WEBRip / BluRay and rejects CAM/TS/TELESYNC/etc.
   */
  private isValidDigitalQuality(title: string): boolean {
    const badRegex = /\b(CAM|HDCAM|CAMRip|TS|HDTS|TELESYNC|TeleSync|WORKPRINT|WP)\b/i;
    if (badRegex.test(title)) return false;

    const goodRegex = /\b(WEB-?DL|WEBRip|WEB|BluRay|BDRip|BRRip|UHD|2160p|1080p)\b/i;
    return goodRegex.test(title);
  }

  /**
   * Detect streaming service code in release title
   */
  private detectService(raw: string): string | undefined {
    if (/\b(NF|NFLX|NETFLIX)\b/i.test(raw)) return 'netflix';
    if (/\b(ATVP|APPLE|APPLETV)\b/i.test(raw)) return 'apple-tv-plus';
    if (/\b(AMZN|PRIME)\b/i.test(raw)) return 'prime-video';
    if (/\b(HMAX|MAX)\b/i.test(raw)) return 'max';
    if (/\b(DSNP|DISNEY)\b/i.test(raw)) return 'disney-plus';
    if (/\b(PMTP|PARAMOUNT)\b/i.test(raw)) return 'paramount-plus';
    if (/\b(PCOK|PEACOCK)\b/i.test(raw)) return 'peacock';
    return undefined;
  }

  /**
   * Extract clean title, year, and type from a scene/torrent release title
   * e.g. "Insidious.Out.Of.The.Further.2026.1080p.BluRay.H264-RiSEHD"
   * e.g. "The.Gilded.Age.S04E04.MULTI.1080p.WEB.H264-BAWLS"
   */
  private parseReleaseTitle(raw: string): { title: string; year: number; type: 'movie' | 'series' } | null {
    if (!this.isValidDigitalQuality(raw)) return null;

    const currentYear = new Date().getFullYear();

    // Check TV series pattern first (e.g. S01E02 or S01)
    const tvMatch = raw.match(/^(.*?)[._\s]+S(\d{1,2})(?:E(\d{1,2}))?/i);
    if (tvMatch) {
      let seriesTitle = tvMatch[1].replace(/[._]/g, ' ').trim();
      // If series title has year at end e.g. "Tracker 2024"
      let year = currentYear;
      const trailingYear = seriesTitle.match(/\b(19\d{2}|20\d{2})$/);
      if (trailingYear) {
        year = parseInt(trailingYear[1], 10);
        seriesTitle = seriesTitle.replace(/\b(19\d{2}|20\d{2})$/, '').trim();
      }
      return {
        title: seriesTitle,
        year,
        type: 'series',
      };
    }

    // Movie pattern: Title.Year.Quality
    const movieMatch = raw.match(/^(.*?)[._\s]+(19\d{2}|20\d{2})[._\s]+(.*)$/i);
    if (movieMatch) {
      const movieTitle = movieMatch[1].replace(/[._]/g, ' ').trim();
      const year = parseInt(movieMatch[2], 10);
      return {
        title: movieTitle,
        year,
        type: 'movie',
      };
    }

    return null;
  }

  public async fetchPreDbFeeds(): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    const urls = [
      'https://predb.me/?cats=movies-hd&rss=1',
      'https://predb.me/?cats=tv-hd&rss=1',
    ];

    for (const url of urls) {
      try {
        const res = await axios.get(url, {
          headers: this.headers,
          timeout: 10000,
        });

        const xml = res.data;
        if (typeof xml !== 'string') continue;

        // Simple XML item matching
        const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

        for (const item of items) {
          const titleMatch = item.match(/<title>([^<]+)<\/title>/i);
          if (!titleMatch) continue;

          const rawTitle = titleMatch[1];
          const parsed = this.parseReleaseTitle(rawTitle);
          if (!parsed) continue;

          if (parsed.year < minYear) continue;

          candidates.push({
            title: parsed.title,
            year: parsed.year,
            type: parsed.type,
            digital_date: todayStr,
            source: 'scene-feed',
            quality: rawTitle.includes('BluRay') ? 'BluRay' : 'WEB-DL',
            service: this.detectService(rawTitle),
          });
        }
      } catch (err: any) {
        console.error(`[PreDB] Error fetching ${url}:`, err.message);
      }
    }

    return candidates;
  }

  public async fetchEztvReleases(): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    try {
      const res = await axios.get('https://eztv.re/api/get-torrents?limit=40', {
        headers: this.headers,
        timeout: 10000,
      });

      const torrents = res.data?.torrents || [];
      for (const t of torrents) {
        const title = t.filename || t.title;
        if (!title || !this.isValidDigitalQuality(title)) continue;

        const parsed = this.parseReleaseTitle(title);
        if (!parsed) continue;

        if (parsed.year < minYear) continue;

        let digitalDate = todayStr;
        if (t.date_released_unix) {
          const d = new Date(t.date_released_unix * 1000);
          digitalDate = d.toISOString().split('T')[0];
        }

        candidates.push({
          title: parsed.title,
          year: parsed.year,
          type: 'series',
          digital_date: digitalDate,
          source: 'eztv',
          quality: title.includes('2160p') ? '4K WEB-DL' : 'WEB-DL',
          service: this.detectService(title),
        });
      }
    } catch (err: any) {
      console.error('[EZTV] Error fetching releases:', err.message);
    }

    return candidates;
  }
}

export const releaseFeedsSource = new ReleaseFeedsSource();
