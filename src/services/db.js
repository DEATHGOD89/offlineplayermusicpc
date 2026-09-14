const DB_NAME = 'SpotyDB';
const DB_VERSION = 2;

let dbPromise = null;

/**
 * Initializes the IndexedDB database using a singleton connection pool.
 * Creates 'songs', 'playlists', and 'backgrounds' object stores.
 */
export function initDB() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database failed to open:', event.target.error);
      dbPromise = null;
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Object store for MP3 tracks
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id' });
      }

      // Object store for Playlists
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }

      // Object store for Custom Background Videos
      if (!db.objectStoreNames.contains('backgrounds')) {
        db.createObjectStore('backgrounds', { keyPath: 'id' });
      }
    };
  });

  return dbPromise;
}

/**
 * Retrieves all songs from the local database.
 */
export async function getAllSongs() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('songs', 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves a song to IndexedDB. Handles files (audioBlob/coverBlob) and metadata.
 */
export async function saveSong(song) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('songs', 'readwrite');
    const store = transaction.objectStore('songs');
    
    // Ensure standard keys
    const songData = {
      id: song.id || Date.now().toString(),
      title: song.title || 'Untitled',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Single',
      genre: song.genre || 'Unknown',
      duration: song.duration || 0,
      audioBlob: song.audioBlob || null,
      coverBlob: song.coverBlob || null,
      url: song.url || null,
      coverUrl: song.coverUrl || null,
      isCloud: song.isCloud !== undefined ? song.isCloud : false,
      coverGradient: song.coverGradient || null,
      isFavorite: song.isFavorite !== undefined ? song.isFavorite : false,
      isUserUpload: song.isUserUpload !== undefined ? song.isUserUpload : true,
      addedAt: song.addedAt || Date.now(),
    };

    const request = store.put(songData);

    request.onsuccess = () => {
      resolve(songData);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves multiple songs to IndexedDB in a single batch transaction.
 */
export async function saveSongs(songs) {
  if (!songs || songs.length === 0) return true;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('songs', 'readwrite');
    const store = transaction.objectStore('songs');

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };

    const now = Date.now();
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const songData = {
        id: song.id || `${now}-${i}`,
        title: song.title || 'Untitled',
        artist: song.artist || 'Unknown Artist',
        album: song.album || 'Single',
        genre: song.genre || 'Unknown',
        duration: song.duration || 0,
        audioBlob: song.audioBlob || null,
        coverBlob: song.coverBlob || null,
        url: song.url || null,
        coverUrl: song.coverUrl || null,
        isCloud: song.isCloud !== undefined ? song.isCloud : false,
        coverGradient: song.coverGradient || null,
        isFavorite: song.isFavorite !== undefined ? song.isFavorite : false,
        isUserUpload: song.isUserUpload !== undefined ? song.isUserUpload : true,
        addedAt: song.addedAt || now,
      };
      store.put(songData);
    }
  });
}

/**
 * Removes a song from IndexedDB.
 */
export async function deleteSong(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('songs', 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Clears all songs from IndexedDB object store in one atomic operation.
 */
export async function clearAllSongs() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('songs', 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.clear();

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Retrieves all playlists.
 */
export async function getAllPlaylists() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readonly');
    const store = transaction.objectStore('playlists');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves or updates a playlist.
 */
export async function savePlaylist(playlist) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readwrite');
    const store = transaction.objectStore('playlists');

    const playlistData = {
      id: playlist.id || Date.now().toString(),
      name: playlist.name || 'New Playlist',
      songIds: playlist.songIds || [],
      addedAt: playlist.addedAt || Date.now(),
    };

    const request = store.put(playlistData);

    request.onsuccess = () => {
      resolve(playlistData);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Deletes a playlist.
 */
export async function deletePlaylist(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readwrite');
    const store = transaction.objectStore('playlists');
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Retrieves all custom background videos.
 */
export async function getAllBackgrounds() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('backgrounds')) {
      resolve([]);
      return;
    }
    const transaction = db.transaction('backgrounds', 'readonly');
    const store = transaction.objectStore('backgrounds');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves a custom background video file to IndexedDB.
 */
export async function saveBackground(bg) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('backgrounds', 'readwrite');
    const store = transaction.objectStore('backgrounds');
    
    const bgData = {
      id: bg.id || 'bg-custom-' + Date.now(),
      name: bg.name || 'Custom Video',
      blob: bg.blob,
      addedAt: bg.addedAt || Date.now(),
    };

    const request = store.put(bgData);

    request.onsuccess = () => {
      resolve(bgData);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Deletes a custom background video from IndexedDB.
 */
export async function deleteBackground(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('backgrounds', 'readwrite');
    const store = transaction.objectStore('backgrounds');
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Completely purges all songs, playlists, and custom backgrounds from IndexedDB.
 */
export async function clearAllLocalData() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['songs', 'playlists', 'backgrounds'], 'readwrite');
      transaction.objectStore('songs').clear();
      transaction.objectStore('playlists').clear();
      transaction.objectStore('backgrounds').clear();

      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    } catch (e) {
      console.error('Error in clearAllLocalData:', e);
      reject(e);
    }
  });
}

