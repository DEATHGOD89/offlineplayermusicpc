import { S3Client, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const accessKeyId = process.env.FILEBASE_KEY;
  const secretAccessKey = process.env.FILEBASE_SECRET;
  const bucket = process.env.FILEBASE_BUCKET || 'spoty-music-vault';

  if (!accessKeyId || !secretAccessKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Filebase credentials not configured in Netlify environment variables.'
      })
    };
  }

  try {
    const { key, cid, url } = JSON.parse(event.body || '{}');
    const targetCid = cid || url?.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1];

    if (!key && !targetCid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Either key or cid/url is required.' })
      };
    }

    const s3 = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false
    });

    let keysToDelete = [];
    if (key) {
      keysToDelete.push(key);
    }

    if (targetCid) {
      const listCmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
      const listRes = await s3.send(listCmd);
      const objects = listRes.Contents || [];

      // Check objects in parallel chunks of 25
      const batchSize = 25;
      for (let i = 0; i < objects.length; i += batchSize) {
        const chunk = objects.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (obj) => {
            try {
              const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: obj.Key }));
              const objCid = head.Metadata?.cid || head.$metadata?.httpHeaders?.['x-amz-meta-cid'];
              if (objCid === targetCid) {
                keysToDelete.push(obj.Key);
              }
            } catch (e) {
              console.warn(`Could not inspect object ${obj.Key}:`, e.message);
            }
          })
        );
      }
    }

    keysToDelete = [...new Set(keysToDelete)];

    for (const k of keysToDelete) {
      console.log(`Deleting ${k} from Filebase bucket ${bucket}`);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deletedKeys: keysToDelete
      })
    };
  } catch (err) {
    console.error('Error deleting from Filebase:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
