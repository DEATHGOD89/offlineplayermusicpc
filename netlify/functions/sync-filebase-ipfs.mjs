import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ywbcvnmtkaynxhnbtaum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_C5uyyq2OFHcd7hqZ2t9IHw_1lULN8fZ';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const accessKeyId = process.env.FILEBASE_KEY;
  const secretAccessKey = process.env.FILEBASE_SECRET;
  const bucket = process.env.FILEBASE_BUCKET || 'spoty-music-vault';

  if (!accessKeyId || !secretAccessKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Filebase credentials (FILEBASE_KEY / FILEBASE_SECRET) missing in Netlify environment variables.'
      })
    };
  }

  try {
    const s3 = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false
    });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 1. Fetch all objects from Filebase bucket (Fast single query)
    const listCmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const listRes = await s3.send(listCmd);
    const objects = listRes.Contents || [];

    console.log(`Found ${objects.length} objects in Filebase bucket ${bucket}`);

    if (objects.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No files found in Filebase bucket.',
          totalFilebaseObjects: 0,
          supabaseSongsUpdated: 0
        })
      };
    }

    // 2. Query HeadObject in parallel chunks of 25 for maximum speed
    const results = [];
    const batchSize = 25;
    for (let i = 0; i < objects.length; i += batchSize) {
      const chunk = objects.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (obj) => {
          try {
            const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: obj.Key }));
            const cid = head.Metadata?.cid || head.$metadata?.httpHeaders?.['x-amz-meta-cid'];
            if (cid) {
              results.push({
                key: obj.Key,
                cid,
                ipfsUrl: `https://ipfs.filebase.io/ipfs/${cid}`
              });
            }
          } catch (e) {
            console.warn(`Could not fetch CID for ${obj.Key}:`, e.message);
          }
        })
      );
    }

    // 3. Fetch all songs currently in Supabase cloud_songs
    let dbSongs = [];
    try {
      const { data, error: dbError } = await sb
        .from('cloud_songs')
        .select('id, title, url');

      if (dbError) throw dbError;
      dbSongs = data || [];
    } catch (sbErr) {
      const errMsg = sbErr?.message || String(sbErr);
      if (errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed') || errMsg.includes('getaddrinfo')) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: 'Supabase project is paused due to inactivity. Please go to https://supabase.com/dashboard and click "Restore project" to resume your database.'
          })
        };
      }
      throw sbErr;
    }

    let updatedCount = 0;
    let insertedCount = 0;
    const updates = [];

    // 4. Update Supabase in parallel batches of 15 for fast completion
    const updateTasks = results.map((item) => async () => {
      const keyName = item.key.split('/').pop();
      const decodedKey = decodeURIComponent(keyName).toLowerCase();
      const rawTitleFromKey = decodedKey.replace(/\.(mp3|wav|m4a|aac|flac|ogg)$/i, '').trim();

      const match = dbSongs.find((s) => {
        const dbUrlFile = decodeURIComponent(s.url?.split('/').pop() || '').toLowerCase();
        const dbTitle = (s.title || '').trim().toLowerCase();
        const sCid = s.url?.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1];
        if (sCid && item.cid && sCid === item.cid) return true;
        if (s.url && item.ipfsUrl && s.url === item.ipfsUrl) return true;
        if (dbUrlFile === decodedKey || dbUrlFile === keyName.toLowerCase() || dbTitle === rawTitleFromKey) return true;

        const normDb = dbTitle.replace(/[^a-z0-9]/g, '');
        const normKey = rawTitleFromKey.replace(/^spotidownloader\.com/i, '').replace(/[^a-z0-9]/g, '');
        if (normDb.length > 3 && normKey.length > 3 && (normDb.includes(normKey) || normKey.includes(normDb))) return true;

        return false;
      });

      if (match) {
        const { error: updateErr } = await sb
          .from('cloud_songs')
          .update({ url: item.ipfsUrl })
          .eq('id', match.id);

        if (!updateErr) {
          updatedCount++;
          updates.push({ id: match.id, title: match.title, ipfsUrl: item.ipfsUrl });
        }
      } else {
        // Skip only internal duplicate temporary audio dumps
        if (rawTitleFromKey.includes('_audio')) {
          console.log(`Skipping duplicate download artifact: ${keyName}`);
          return;
        }

        const newSongId = 'cloud-' + Math.random().toString(36).substring(2, 11);
        let rawClean = keyName
          .replace(/^spotidownloader\.com\s*-\s*/i, '')
          .replace(/\.(mp3|wav|m4a|aac|flac|ogg)$/i, '')
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        let parsedArtist = 'Unknown Artist';
        let parsedTitle = rawClean;
        const outerDashMatch = rawClean.match(/^([^(]+?)\s+-\s+(.+)$/);
        if (outerDashMatch) {
          parsedArtist = outerDashMatch[1].trim();
          parsedTitle = outerDashMatch[2].trim();
        } else if (rawClean.includes(' - ') && !rawClean.includes('(')) {
          const parts = rawClean.split(' - ');
          if (parts.length >= 2) {
            parsedArtist = parts[0].trim();
            parsedTitle = parts.slice(1).join(' - ').trim();
          }
        }

        const { error: insertErr } = await sb.from('cloud_songs').insert([{
          id: newSongId,
          title: parsedTitle,
          artist: parsedArtist,
          album: 'Single',
          genre: 'Soundtrack',
          url: item.ipfsUrl,
          cover_url: null,
          likes: 0,
          uploader: 'deathgod'
        }]);

        if (!insertErr) {
          insertedCount++;
          updates.push({ id: newSongId, title: parsedTitle, ipfsUrl: item.ipfsUrl, isNew: true });
        }
      }
    });

    const dbBatchSize = 15;
    for (let i = 0; i < updateTasks.length; i += dbBatchSize) {
      await Promise.all(updateTasks.slice(i, i + dbBatchSize).map(fn => fn()));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Successfully synced Filebase IPFS CIDs to Supabase!',
        totalFilebaseObjects: objects.length,
        cidsRetrieved: results.length,
        supabaseSongsUpdated: updatedCount,
        supabaseSongsInserted: insertedCount,
        sample: updates.slice(0, 5)
      })
    };
  } catch (err) {
    console.error('Error in sync-filebase-ipfs:', err);
    const msg = err.message || 'Internal server error';
    const isDnsError = msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('getaddrinfo');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: isDnsError
          ? 'Supabase database is paused. Log into https://supabase.com/dashboard and click "Restore project".'
          : msg
      })
    };
  }
};
