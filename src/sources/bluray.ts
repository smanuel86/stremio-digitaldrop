import axios from 'axios';
import { CONFIG } from '../config';
import { ReleaseCandidate } from './rottenTomatoes';

export class BluraySource {
  private headers = {
    'User-Agent': CONFIG.USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.google.com/',
  };

  private parseDateString(dateStr: string): string | null {
    if (!dateStr) return null;
    const monthMap: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    const match = dateStr.match(/([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (!match) return null;

    const month = monthMap[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    const year = match[3];

    if (!month) return null;
    return `${year}-${month}-${day}`;
  }

  public async fetchDigitalReleases(): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const minYear = currentYear - CONFIG.MAX_YEAR_LOOKBACK;

    try {
      const res = await axios.get('https://www.blu-ray.com/digital/releasedates.php', {
        headers: this.headers,
        timeout: 12000,
      });

      const html = res.data;
      if (typeof html !== 'string') return candidates;

      // Extract all movies[...] = { ... }; entries
      const movieRegex = /movies\[\d+\]\s*=\s*\{([^}]+)\};/g;
      let match: RegExpExecArray | null;

      while ((match = movieRegex.exec(html)) !== null) {
        const body = match[1];

        // Parse key-value pairs
        const titleMatch = body.match(/title:\s*['"]([^'"]+)['"]/);
        const yearMatch = body.match(/year:\s*['"]([^'"]+)['"]/);
        const yearendMatch = body.match(/yearend:\s*['"]([^'"]+)['"]/);
        const dateMatch = body.match(/releasedate:\s*['"]([^'"]+)['"]/);

        if (!titleMatch) continue;

        let title = titleMatch[1].replace(/\\'/g, "'").trim();
        const rawYear = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;
        const yearend = yearendMatch ? yearendMatch[1].trim() : '';
        const rawDate = dateMatch ? dateMatch[1] : '';

        const digitalDate = this.parseDateString(rawDate);
        if (!digitalDate) continue;

        // Enforce: only released titles (digital date <= today)
        if (digitalDate > todayStr) {
          continue;
        }

        // Enforce: New movies and series only (filter out older catalog re-releases)
        if (rawYear < minYear) {
          continue;
        }

        // Determine if TV series or movie
        const isSeries =
          Boolean(yearend) ||
          /Season\s*\d+/i.test(title) ||
          /The\s*Complete\s*Series/i.test(title) ||
          /Mini-?Series/i.test(title);

        candidates.push({
          title,
          year: rawYear,
          type: isSeries ? 'series' : 'movie',
          digital_date: digitalDate,
          source: 'bluray',
          quality: 'BluRay / Digital',
        });
      }
    } catch (err: any) {
      console.error('[Blu-ray.com] Error fetching digital release dates:', err.message);
    }

    return candidates;
  }
}

export const bluraySource = new BluraySource();
