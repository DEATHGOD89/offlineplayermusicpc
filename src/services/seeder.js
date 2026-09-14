import { deleteSong } from './db';

/**
 * Ensures previously seeded dummy tracks are cleaned up on first boot.
 */
export async function seedInitialSongsIfEmpty() {
  try {
    // Proactively remove any previously seeded default loop tracks to keep the library 100% clean
    await deleteSong('seed-1');
    await deleteSong('seed-2');
  } catch (error) {
    console.error('Error cleaning up seeded songs:', error);
  }
}
