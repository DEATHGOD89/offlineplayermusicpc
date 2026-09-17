import { createClient } from '@supabase/supabase-js';

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
    return data.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      genre: item.genre,
      url: item.url,
      coverUrl: item.cover_url,
      likes: item.likes || 0,
      uploader: item.uploader || 'Anonymous',
      addedAt: new Date(item.created_at).getTime(),
      isCloud: true
    }));
  } catch (e) {
    console.error("Error fetching Supabase cloud songs:", e);
    return [];
  }
}

/**
 * Uploads a file to Filebase S3 bucket via Netlify serverless function presigned URL.
 * Returns public URL if successful, or null if Filebase is unavailable.
 */
async function uploadToFilebase(file, fileName, folder = 'songs') {
  try {
    const res = await fetch('/.netlify/functions/get-upload-url', {
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

    const { uploadUrl, publicUrl } = await res.json();
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

    return publicUrl;
  } catch (err) {
    console.warn("Filebase upload skipped/failed, falling back to Supabase:", err);
    return null;
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

    const CLOUD_STORAGE_LIMIT = 1250; // 5 GB vault (~1,250 songs)
    if (!countError && count !== null && count >= CLOUD_STORAGE_LIMIT) {
      throw new Error(`Cloud Storage Limit Reached (Max ${CLOUD_STORAGE_LIMIT} songs). Please delete an existing track to free up space!`);
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
  } catch (e) {
    console.error("Error deleting Supabase cloud song:", e);
    throw e;
  }
}
