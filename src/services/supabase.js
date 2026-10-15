import { createClient } from '@supabase/supabase-js';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import songDurations from './songDurations.json';

/**
 * Retrieves the user's custom Supabase configuration from localStorage.
 */
export function getSupabaseConfig() {
  const url = localStorage.getItem('spoty_supabase_url');
  const anonKey = localStorage.getItem('spoty_supabase_anon_key');

  if (url && anonKey) {
    return { url, anonKey };
  }

  // If the user has explicitly disconnected, don't fallback to the default keys
  if (localStorage.getItem('spoty_supabase_disconnected') === 'true') {
    return null;
  }

  // Default shared cloud fallback so any user who installs this setup connects to the same cloud out-of-the-box!
  return {
    url: 'https://ywbcvnmtkaynxhnbtaum.supabase.co',
    anonKey: 'sb_publishable_C5uyyq2OFHcd7hqZ2t9IHw_1lULN8fZ'
  };
}

/**
 * Helper to determine if the Supabase cloud connection is configured.
 */
export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}

let supabase = null;

/**
 * Initializes and caches the Supabase client dynamically.
 */
export function initSupabase() {
  const config = getSupabaseConfig();
  if (!config) return null;

  try {
    if (!supabase) {
      supabase = createClient(config.url, config.anonKey);
    }
    return supabase;
  } catch (error) {
    console.error("Supabase initialization failed:", error);
    return null;
  }
}

/**
 * Fetches all globally shared songs from Supabase table 'cloud_songs'.
 */
export async function getCloudSongs() {
  const sb = initSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('cloud_songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 1. Detect only true duplicate rows (sharing the same audio CID with an already-covered track)
    const tracksWithCoverCid = new Set(
      data
        .filter(item => item.cover_url && item.url)
        .map(item => item.url.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1] || item.url)
    );

    const duplicateGhostItems = data.filter(item => {
      if (item.cover_url) return false;
      const cid = item.url?.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1] || item.url;
      return tracksWithCoverCid.has(cid);
    });

    if (duplicateGhostItems.length > 0) {
      const ghostIds = duplicateGhostItems.map(g => g.id);
      sb.from('cloud_songs').delete().in('id', ghostIds).then(() => {
        console.log(`Auto-purged ${ghostIds.length} duplicate sync tracks.`);
      }).catch(() => {});
    }

    const cleanData = data.filter(item => {
      const cid = item.url?.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1] || item.url;
      if (!item.cover_url && tracksWithCoverCid.has(cid)) return false;
      return true;
    });

    const dynamicDurations = (() => {
      try {
        return JSON.parse(localStorage.getItem('spoty_dynamic_durations') || '{}');
      } catch {
        return {};
      }
    })();

    const formatted = cleanData.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      genre: item.genre,
      duration: item.duration || songDurations[item.id] || dynamicDurations[item.id] || 0,
      url: item.url,
      coverUrl: item.cover_url,
      likes: item.likes || 0,
      uploader: item.uploader || 'Anonymous',
      addedAt: new Date(item.created_at).getTime(),
      isCloud: true
    }));

    // 2. Automatically enrich any newly added track missing its cover artwork
    const needsEnrichment = formatted.filter(s => !s.coverUrl && s.url);
    if (needsEnrichment.length > 0) {
      setTimeout(() => {
        needsEnrichment.forEach(s => enrichSongMetadata(s));
      }, 1000);
    }

    try {
      localStorage.setItem('spoty_cached_cloud_songs', JSON.stringify(formatted));
    } catch {}

    return formatted;
  } catch (e) {
    console.warn("Supabase unreachable or paused, loading cached cloud songs:", e.message);
    try {
      const cached = localStorage.getItem('spoty_cached_cloud_songs');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  }
}

/**
 * Helper to resolve Netlify function URLs across local dev, Electron, and production.
 */
function getNetlifyFunctionUrl(path) {
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.protocol === 'file:';
    if (isLocal) {
      return `https://freemusicplay.netlify.app${path}`;
    }
  }
  return path;
}

/**
 * Uploads a file to Filebase S3 bucket via Netlify serverless function presigned URL.
 * Returns public URL if successful, or null if Filebase is unavailable.
 */
async function uploadToFilebase(file, fileName, folder = 'songs') {
  try {
    const res = await fetch(getNetlifyFunctionUrl('/.netlify/functions/get-upload-url'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        contentType: file.type || (folder === 'covers' ? 'image/jpeg' : 'audio/mpeg'),
        folder
      })
    });

    if (!res.ok) {
      console.warn("Filebase presigned URL endpoint returned status:", res.status);
      return null;
    }

    const { uploadUrl, publicUrl, key } = await res.json();
    if (!uploadUrl || !publicUrl) return null;

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || (folder === 'covers' ? 'image/jpeg' : 'audio/mpeg')
      }
    });

    if (!uploadRes.ok) {
      console.warn("Direct upload to Filebase failed with status:", uploadRes.status);
      return null;
    }

    // Retrieve IPFS CID (Filebase 100% free permanent public gateway)
    try {
      if (key) {
        const cidRes = await fetch(getNetlifyFunctionUrl('/.netlify/functions/get-ipfs-cid'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        if (cidRes.ok) {
          const cidData = await cidRes.json();
          if (cidData.ipfsUrl) {
            return cidData.ipfsUrl;
          }
        }
      }
    } catch (cidErr) {
      console.warn("Could not retrieve IPFS CID, falling back to publicUrl:", cidErr);
    }

    return publicUrl;
  } catch (err) {
    console.warn("Filebase upload skipped/failed, falling back to Supabase:", err);
    return null;
  }
}

/**
 * Triggers serverless synchronization to map all Filebase IPFS CIDs to Supabase cloud_songs.
 */
export async function syncFilebaseVault() {
  try {
    const res = await fetch(getNetlifyFunctionUrl('/.netlify/functions/sync-filebase-ipfs'), {
      method: 'POST'
    });
    if (!res.ok) {
      let errorMsg = `Server error (Status ${res.status})`;
      try {
        const errData = await res.json();
        if (errData && errData.error) errorMsg = errData.error;
      } catch {
        if (res.status === 504) {
          errorMsg = 'Sync timed out. Please try again.';
        } else if (res.status === 503 || res.status === 500) {
          errorMsg = 'Supabase database is paused. Restore it in Supabase dashboard.';
        }
      }
      throw new Error(errorMsg);
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to sync Filebase vault:", err);
    throw err;
  }
}

export async function cleanupGhostTracks() {
  const sb = initSupabase();
  if (!sb) return;
  try {
    const { data } = await sb
      .from('cloud_songs')
      .select('id, title, artist, cover_url');
    if (!data) return;
    const ghostIds = data
      .filter(item => {
        const t = (item.title || '').toLowerCase();
        return (item.artist === 'Vault Artist' && !item.cover_url) ||
               t.startsWith('spotidownloader.com') ||
               t.includes('_audio');
      })
      .map(item => item.id);
    if (ghostIds.length > 0) {
      await sb.from('cloud_songs').delete().in('id', ghostIds);
      console.log(`cleanupGhostTracks: auto-deleted ${ghostIds.length} ghost rows.`);
    }
  } catch (e) {
    console.warn("cleanupGhostTracks error:", e);
  }
}


/**
 * Uploads a track and artwork to Filebase (or Supabase Storage fallback) & inserts record in table 'cloud_songs'.
 */
export async function uploadSongToCloud(title, artist, album, genre, audioFile, coverFile, uploaderName) {
  const sb = initSupabase();
  if (!sb) throw new Error("Supabase is not configured!");

  // File size validation to prevent client freeze or storage blowup
  const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_COVER_SIZE = 5 * 1024 * 1024;   // 5MB

  if (audioFile && audioFile.size > MAX_AUDIO_SIZE) {
    throw new Error("Audio file exceeds maximum size limit of 50MB.");
  }
  if (coverFile && coverFile.size > MAX_COVER_SIZE) {
    throw new Error("Cover image exceeds maximum size limit of 5MB.");
  }

  try {
    // Check total cloud songs count to prevent exceeding 5GB storage limits
    const { count, error: countError } = await sb
      .from('cloud_songs')
      .select('*', { count: 'exact', head: true });

    const CLOUD_STORAGE_LIMIT = 1000; // 4 GB safety cap (~1,000 songs @ ~4MB each)
    if (!countError && count !== null && count >= CLOUD_STORAGE_LIMIT) {
      throw new Error(`Cloud Storage 4 GB Limit Reached (Max ${CLOUD_STORAGE_LIMIT} songs). Uploads blocked to protect your free storage tier. Please delete an existing track to free up space!`);
    }

    const songId = 'cloud-' + Math.random().toString(36).substring(2, 11);
    
    // 1. Dynamic MIME & extension detection for audio
    const rawAudioExt = audioFile.name ? audioFile.name.split('.').pop().toLowerCase() : 'mp3';
    const audioExt = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'].includes(rawAudioExt) ? rawAudioExt : 'mp3';
    const audioContentType = audioFile.type || 'audio/mpeg';
    const audioFileName = `${songId}_audio.${audioExt}`;
    const audioPath = `songs/${audioFileName}`;

    // Try Filebase 5GB storage first
    let audioUrl = await uploadToFilebase(audioFile, audioFileName, 'songs');

    // Graceful fallback to Supabase storage if Filebase is unavailable
    if (!audioUrl) {
      const { error: audioError } = await sb.storage
        .from('spoty-media')
        .upload(audioPath, audioFile, { contentType: audioContentType, upsert: true });

      if (audioError) throw audioError;

      const { data: audioUrlData } = sb.storage
        .from('spoty-media')
        .getPublicUrl(audioPath);

      audioUrl = audioUrlData.publicUrl;
    }

    // 2. Upload cover artwork if present with dynamic extension
    let coverUrl = '';
    if (coverFile) {
      const rawCoverExt = coverFile.name ? coverFile.name.split('.').pop().toLowerCase() : 'jpg';
      const coverExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(rawCoverExt) ? rawCoverExt : 'jpg';
      const coverContentType = coverFile.type || 'image/jpeg';
      const coverFileName = `${songId}_cover.${coverExt}`;
      const coverPath = `covers/${coverFileName}`;

      coverUrl = await uploadToFilebase(coverFile, coverFileName, 'covers');

      if (!coverUrl) {
        const { error: coverError } = await sb.storage
          .from('spoty-media')
          .upload(coverPath, coverFile, { contentType: coverContentType, upsert: true });

        if (coverError) throw coverError;

        const { data: coverUrlData } = sb.storage
          .from('spoty-media')
          .getPublicUrl(coverPath);

        coverUrl = coverUrlData.publicUrl;
      }
    }

    // 3. Save details to 'cloud_songs' table
    const songMeta = {
      id: songId,
      title: title || 'Untitled Cloud Track',
      artist: artist || 'Unknown Artist',
      album: album || 'Cloud Single',
      genre: genre || 'Pop',
      url: audioUrl,
      cover_url: coverUrl,
      likes: 0,
      uploader: uploaderName || 'Anonymous'
    };

    const { error } = await sb
      .from('cloud_songs')
      .insert([songMeta])
      .select();

    if (error) throw error;

    return {
      id: songId,
      title: songMeta.title,
      artist: songMeta.artist,
      album: songMeta.album,
      genre: songMeta.genre,
      url: songMeta.url,
      coverUrl: songMeta.cover_url,
      likes: 0,
      uploader: songMeta.uploader,
      isCloud: true,
      addedAt: Date.now()
    };
  } catch (e) {
    console.error("Error uploading track to Supabase cloud:", e);
    throw e;
  }
}

/**
 * Increments the global like counter for a shared Supabase song.
 * Uses local tracking to debounce and avoid duplicate spam.
 */
export async function likeCloudSong(songId) {
  const sb = initSupabase();
  if (!sb) return false;

  const likedStorageKey = 'spoty_liked_cloud_ids';
  let likedIds;
  try {
    likedIds = JSON.parse(localStorage.getItem(likedStorageKey) || '[]');
  } catch {
    likedIds = [];
  }

  if (likedIds.includes(songId)) {
    return false; // Already liked by this device
  }

  try {
    // 1. Fetch current likes
    const { data, error } = await sb
      .from('cloud_songs')
      .select('likes')
      .eq('id', songId)
      .single();

    if (error) throw error;

    const currentLikes = data.likes || 0;

    // 2. Increment and update
    const { error: updateError } = await sb
      .from('cloud_songs')
      .update({ likes: currentLikes + 1 })
      .eq('id', songId);

    if (updateError) throw updateError;

    likedIds.push(songId);
    localStorage.setItem(likedStorageKey, JSON.stringify(likedIds));
    return true;
  } catch (e) {
    console.error("Error incrementing Supabase likes:", e);
    return false;
  }
}

/**
 * Deletes a song from the database and cleans up its assets from the storage bucket.
 */
export async function deleteCloudSong(songId) {
  const sb = initSupabase();
  if (!sb) return;

  try {
    // 1. Fetch song record to determine exact storage asset paths
    const { data: songRecord } = await sb
      .from('cloud_songs')
      .select('url, cover_url')
      .eq('id', songId)
      .maybeSingle();

    // 2. Delete from database
    const { error: dbError } = await sb
      .from('cloud_songs')
      .delete()
      .eq('id', songId);

    if (dbError) throw dbError;
 
    // 3. Clean up exact files from storage bucket
    const filesToRemove = [];
    if (songRecord?.url) {
      const match = songRecord.url.match(/spoty-media\/(.+)$/);
      if (match) filesToRemove.push(decodeURIComponent(match[1]));
    }
    if (songRecord?.cover_url) {
      const match = songRecord.cover_url.match(/spoty-media\/(.+)$/);
      if (match) filesToRemove.push(decodeURIComponent(match[1]));
    }

    // Fallback standard paths if URL extraction didn't find specific paths
    if (filesToRemove.length === 0) {
      filesToRemove.push(`songs/${songId}_audio.mp3`, `covers/${songId}_cover.jpg`);
    }

    await sb.storage.from('spoty-media').remove(filesToRemove);

    // 4. Clean up file from Filebase S3 bucket so sync never resurrects it
    if (songRecord?.url) {
      const cid = songRecord.url.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1];
      fetch(getNetlifyFunctionUrl('/.netlify/functions/delete-filebase-file'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, url: songRecord.url })
      }).catch(err => console.warn('Could not delete from Filebase:', err));
    }

    // 5. Clean up localStorage caches
    try {
      const cached = localStorage.getItem('spoty_cached_cloud_songs');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter(s => s.id !== songId);
          localStorage.setItem('spoty_cached_cloud_songs', JSON.stringify(updated));
        }
      }
      const dyn = JSON.parse(localStorage.getItem('spoty_dynamic_durations') || '{}');
      if (dyn[songId]) {
        delete dyn[songId];
        localStorage.setItem('spoty_dynamic_durations', JSON.stringify(dyn));
      }
    } catch {}
  } catch (e) {
    console.error("Error deleting Supabase cloud song:", e);
    throw e;
  }
}

/**
 * Reads embedded ID3 tags & artwork directly from an audio stream and saves them to Supabase.
 */
export async function enrichSongMetadata(song) {
  if (!song || !song.url || song.coverUrl) return song;
  try {
    const res = await fetch(song.url, { headers: { Range: 'bytes=0-400000' } });
    if (!res.ok && res.status !== 206) return song;
    const blob = await res.blob();

    return await new Promise((resolve) => {
      jsmediatags.read(blob, {
        onSuccess: async (tag) => {
          try {
            let updatedCoverUrl = null;
            const updatedArtist = tag.tags?.artist;
            const updatedTitle = tag.tags?.title;
            const updatedAlbum = tag.tags?.album;

            if (tag.tags?.picture) {
              const { data, format } = tag.tags.picture;
              const picBlob = new Blob([new Uint8Array(data)], { type: format || 'image/jpeg' });
              const coverPath = `covers/${song.id}_cover.jpg`;
              const sb = initSupabase();
              if (sb) {
                const { error: upErr } = await sb.storage
                  .from('spoty-media')
                  .upload(coverPath, picBlob, { contentType: format || 'image/jpeg', upsert: true });
                if (!upErr) {
                  const { data: pubData } = sb.storage.from('spoty-media').getPublicUrl(coverPath);
                  updatedCoverUrl = pubData.publicUrl;
                }
              }
            }

            const patchBody = {};
            if (updatedCoverUrl) patchBody.cover_url = updatedCoverUrl;
            if (updatedTitle && updatedTitle !== song.title) patchBody.title = updatedTitle;
            if (updatedArtist && updatedArtist !== song.artist && updatedArtist !== 'Unknown Artist') patchBody.artist = updatedArtist;
            if (updatedAlbum && updatedAlbum !== song.album) patchBody.album = updatedAlbum;

            if (Object.keys(patchBody).length > 0) {
              const sb = initSupabase();
              if (sb) {
                await sb.from('cloud_songs').update(patchBody).eq('id', song.id);
              }
              resolve({
                ...song,
                title: patchBody.title || song.title,
                artist: patchBody.artist || song.artist,
                album: patchBody.album || song.album,
                coverUrl: patchBody.cover_url || song.coverUrl
              });
              return;
            }
          } catch (e) {
            console.warn("Auto-enrich patch error:", e);
          }
          resolve(song);
        },
        onError: () => resolve(song)
      });
    });
  } catch (err) {
    return song;
  }
}

