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
        error: 'FILEBASE_KEY or FILEBASE_SECRET not found in Netlify environment variables.'
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

    // 1. Fetch all objects from Filebase bucket
    const listCmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const listRes = await s3.send(listCmd);
    const objects = listRes.Contents || [];

    console.log(`Found ${objects.length} objects in Filebase bucket ${bucket}`);

    // 2. Query HeadObject for each to retrieve IPFS CID
    const results = [];
    const batchSize = 10;
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
    const { data: dbSongs, error: dbError } = await sb
      .from('cloud_songs')
      .select('id, title, url');

    if (dbError) throw dbError;

    let updatedCount = 0;
    let insertedCount = 0;
    const updates = [];

    for (const item of results) {
      const keyName = item.key.split('/').pop();
      const decodedKey = decodeURIComponent(keyName).toLowerCase();
      const rawTitleFromKey = decodedKey.replace(/\.(mp3|wav|m4a|aac|flac|ogg)$/i, '').trim();

      // Match against Supabase records
      const match = dbSongs?.find((s) => {
        const dbUrlFile = decodeURIComponent(s.url?.split('/').pop() || '').toLowerCase();
        const dbTitle = (s.title || '').trim().toLowerCase();
        return (
          dbUrlFile === decodedKey ||
          dbUrlFile === keyName.toLowerCase() ||
          dbTitle === rawTitleFromKey
        );
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
        const newSongId = 'cloud-' + Math.random().toString(36).substring(2, 11);
        const cleanTitle = keyName.replace(/\.(mp3|wav|m4a|aac|flac|ogg)$/i, '').trim();
        const { error: insertErr } = await sb.from('cloud_songs').insert([{
          id: newSongId,
          title: cleanTitle,
          artist: 'Vault Artist',
          album: 'Filebase Vault',
          genre: 'Soundtrack',
          url: item.ipfsUrl,
          cover_url: null,
          likes: 0,
          uploader: 'deathgod'
        }]);

        if (!insertErr) {
          insertedCount++;
          updates.push({ id: newSongId, title: cleanTitle, ipfsUrl: item.ipfsUrl, isNew: true });
        }
      }
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
