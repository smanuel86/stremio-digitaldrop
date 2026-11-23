import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '7000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  DATA_DIR: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  DB_FILE: process.env.DB_FILE || path.join(process.cwd(), 'data', 'digitaldrop.db'),
  SYNC_INTERVAL_MINUTES: parseInt(process.env.SYNC_INTERVAL_MINUTES || '30', 10),
  // Release year cutoff: only titles produced within current_year - MAX_YEAR_LOOKBACK (e.g. 2025-2026)
  MAX_YEAR_LOOKBACK: parseInt(process.env.MAX_YEAR_LOOKBACK || '1', 10),
  DEFAULT_ADDON_NAME: 'DigitalDrop - Latest Digital Releases',
  DEFAULT_ADDON_DESC: 'Curated carousel of the latest movies & series only once digitally available (WEB-DL / BluRay).',
  USER_AGENT:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};
