import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

export interface ReleaseRecord {
  imdb_id: string;
  type: 'movie' | 'series';
  title: string;
  year: number;
  digital_date: string; // YYYY-MM-DD
  poster: string | null;
  background: string | null;
  description: string | null;
  genres: string[]; // parsed from JSON
  source: string; // e.g. "rottentomatoes", "bluray", "feed"
  quality: string; // e.g. "WEB-DL", "BluRay"
  service?: string | null; // e.g. "netflix", "apple-tv-plus", "prime-video", "max", "disney-plus"
  imdb_rating?: number | null;
  created_at: number;
  updated_at: number;
}

class ReleaseDatabase {
  private db: Database.Database;

  constructor() {
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
      fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }

    this.db = new Database(CONFIG.DB_FILE);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS releases (
        imdb_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        digital_date TEXT NOT NULL,
        poster TEXT,
        background TEXT,
        description TEXT,
        genres TEXT,
        source TEXT,
        quality TEXT,
        service TEXT,
        imdb_rating REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_releases_type_date ON releases(type, digital_date DESC);
      CREATE INDEX IF NOT EXISTS idx_releases_year ON releases(year DESC);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Migration: add service column if table already existed without it
    try {
      this.db.exec(`ALTER TABLE releases ADD COLUMN service TEXT;`);
    } catch {}

    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_releases_service ON releases(service, digital_date DESC);`);
    } catch {}
  }

  public upsertRelease(item: Omit<ReleaseRecord, 'created_at' | 'updated_at'>): boolean {
    const now = Date.now();
    const existing = this.db.prepare('SELECT imdb_id, digital_date, service FROM releases WHERE imdb_id = ?').get(item.imdb_id) as
      | { imdb_id: string; digital_date: string; service?: string }
      | undefined;

    const genresJson = JSON.stringify(item.genres || []);

    if (existing) {
      // Keep earlier digital_date if current one is earlier
      const effectiveDate =
        item.digital_date && (!existing.digital_date || item.digital_date < existing.digital_date)
          ? item.digital_date
          : existing.digital_date;

      const effectiveService = item.service || existing.service || null;

      this.db
        .prepare(
          `
        UPDATE releases SET
          title = ?,
          year = ?,
          digital_date = ?,
          poster = COALESCE(?, poster),
          background = COALESCE(?, background),
          description = COALESCE(?, description),
          genres = ?,
          source = ?,
          quality = ?,
          service = ?,
          imdb_rating = COALESCE(?, imdb_rating),
          updated_at = ?
        WHERE imdb_id = ?
      `
        )
        .run(
          item.title,
          item.year,
          effectiveDate,
          item.poster,
          item.background,
          item.description,
          genresJson,
          item.source,
          item.quality,
          effectiveService,
          item.imdb_rating ?? null,
          now,
          item.imdb_id
        );
      return false; // was update
    } else {
      this.db
        .prepare(
          `
        INSERT INTO releases (
          imdb_id, type, title, year, digital_date, poster, background, description,
          genres, source, quality, service, imdb_rating, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          item.imdb_id,
          item.type,
          item.title,
          item.year,
          item.digital_date,
          item.poster,
          item.background,
          item.description,
          genresJson,
          item.source,
          item.quality,
          item.service || null,
          item.imdb_rating ?? null,
          now,
          now
        );
      return true; // was insert
    }
  }

  public getCatalog(
    type: 'movie' | 'series',
    genre?: string,
    service?: string,
    minYear?: number,
    skip: number = 0,
    limit: number = 50
  ): ReleaseRecord[] {
    let query = 'SELECT * FROM releases WHERE type = ?';
    const params: (string | number)[] = [type];

    if (minYear) {
      query += ' AND year >= ?';
      params.push(minYear);
    }

    if (service && service !== 'all') {
      query += ' AND service = ?';
      params.push(service);
    }

    if (genre && genre !== 'All' && !genre.startsWith('[')) {
      query += ' AND genres LIKE ?';
      params.push(`%"${genre}"%`);
    }

    query += ' ORDER BY digital_date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, skip);

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      ...r,
      genres: r.genres ? JSON.parse(r.genres) : [],
    }));
  }

  public getAvailableGenres(type: 'movie' | 'series'): string[] {
    const rows = this.db.prepare('SELECT genres FROM releases WHERE type = ?').all(type) as { genres: string }[];
    const set = new Set<string>();

    for (const row of rows) {
      if (row.genres) {
        try {
          const list = JSON.parse(row.genres);
          for (const g of list) {
            if (g && typeof g === 'string') set.add(g);
          }
        } catch {}
      }
    }

    return Array.from(set).sort();
  }

  public getStats() {
    const movieCount = (this.db.prepare("SELECT COUNT(*) as count FROM releases WHERE type = 'movie'").get() as any)
      .count;
    const seriesCount = (this.db.prepare("SELECT COUNT(*) as count FROM releases WHERE type = 'series'").get() as any)
      .count;
    const lastSync = (this.db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'").get() as any)?.value;

    return {
      movieCount,
      seriesCount,
      totalCount: movieCount + seriesCount,
      lastSyncTime: lastSync ? new Date(parseInt(lastSync, 10)).toISOString() : null,
    };
  }

  public recordLastSync() {
    const now = Date.now().toString();
    this.db
      .prepare(
        `
      INSERT INTO sync_meta (key, value, updated_at) VALUES ('last_sync_time', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
      )
      .run(now, Date.now());
  }

  public close() {
    this.db.close();
  }
}

export const db = new ReleaseDatabase();
