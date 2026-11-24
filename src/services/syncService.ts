import { rottenTomatoesSource, ReleaseCandidate } from '../sources/rottenTomatoes';
import { bluraySource } from '../sources/bluray';
import { releaseFeedsSource } from '../sources/releaseFeeds';
import { cinemeta } from './cinemeta';
import { db } from '../db/database';
import { CONFIG } from '../config';

export class SyncService {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  public async runSync(): Promise<{ added: number; updated: number; totalCandidates: number }> {
    if (this.isRunning) {
      console.log('[SyncService] Sync already in progress, skipping...');
      return { added: 0, updated: 0, totalCandidates: 0 };
    }

    this.isRunning = true;
    console.log('[SyncService] Starting digital releases sync...');

    let totalAdded = 0;
    let totalUpdated = 0;

    try {
      // 1. Fetch from all sources in parallel
      const [rtMovies, rtSeries, rtPlatforms, blurayItems, predbItems, eztvItems] = await Promise.all([
        rottenTomatoesSource.fetchMoviesAtHome(2),
        rottenTomatoesSource.fetchTvSeries(),
        rottenTomatoesSource.fetchAllPlatforms(),
        bluraySource.fetchDigitalReleases(),
        releaseFeedsSource.fetchPreDbFeeds(),
        releaseFeedsSource.fetchEztvReleases(),
      ]);

      console.log(
        `[SyncService] Fetched candidates: RT Movies=${rtMovies.length}, Series=${rtSeries.length}, Platforms=${rtPlatforms.length} | Blu-ray.com=${blurayItems.length} | PreDB=${predbItems.length} | EZTV=${eztvItems.length}`
      );

      const allCandidates: ReleaseCandidate[] = [
        ...rtPlatforms, // Platform-specific candidates first to ensure primary service tag
        ...rtMovies,
        ...rtSeries,
        ...blurayItems,
        ...predbItems,
        ...eztvItems,
      ];

      // 2. Deduplicate candidates by key
      const uniqueMap = new Map<string, ReleaseCandidate>();
      for (const item of allCandidates) {
        const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = `${item.type}:${cleanTitle}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else {
          // If already exists, prefer the one with earlier digital date or better quality info
          const existing = uniqueMap.get(key)!;
          if (item.digital_date < existing.digital_date) {
            uniqueMap.set(key, item);
          }
        }
      }

      const deduplicated = Array.from(uniqueMap.values());
      console.log(`[SyncService] Processing ${deduplicated.length} unique candidates...`);

      // 3. Resolve metadata and store in SQLite
      for (const candidate of deduplicated) {
        try {
          const meta = await cinemeta.searchAndResolve(candidate.title, candidate.type, candidate.year);
          if (!meta || !meta.imdb_id) {
            continue;
          }

          const wasInserted = db.upsertRelease({
            imdb_id: meta.imdb_id,
            type: meta.type,
            title: meta.title,
            year: meta.year,
            digital_date: candidate.digital_date,
            poster: meta.poster,
            background: meta.background,
            description: meta.description,
            genres: meta.genres,
            source: candidate.source,
            quality: candidate.quality,
            service: candidate.service,
            imdb_rating: meta.imdb_rating,
          });

          if (wasInserted) {
            totalAdded++;
          } else {
            totalUpdated++;
          }

          // Small delay to be polite to Cinemeta
          await new Promise((r) => setTimeout(r, 150));
        } catch (err: any) {
          // Log and continue
          console.error(`[SyncService] Failed resolving '${candidate.title}':`, err.message);
        }
      }

      db.recordLastSync();
      const stats = db.getStats();
      console.log(
        `[SyncService] Sync finished! Added: ${totalAdded}, Updated: ${totalUpdated}. Total DB: ${stats.totalCount} (Movies: ${stats.movieCount}, Series: ${stats.seriesCount})`
      );
    } catch (err: any) {
      console.error('[SyncService] Fatal error during sync:', err);
    } finally {
      this.isRunning = false;
    }

    return { added: totalAdded, updated: totalUpdated, totalCandidates: totalAdded + totalUpdated };
  }

  public startPeriodicSync() {
    // Initial sync immediately in background
    setTimeout(() => {
      this.runSync().catch(console.error);
    }, 1500);

    // Periodic sync
    const intervalMs = CONFIG.SYNC_INTERVAL_MINUTES * 60 * 1000;
    this.timer = setInterval(() => {
      this.runSync().catch(console.error);
    }, intervalMs);

    console.log(`[SyncService] Periodic sync scheduled every ${CONFIG.SYNC_INTERVAL_MINUTES} minutes.`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const syncService = new SyncService();
