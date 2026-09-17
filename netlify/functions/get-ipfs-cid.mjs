import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

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
      body: JSON.stringify({ error: 'Filebase credentials not configured in Netlify' })
    };
  }

  try {
    let key = '';
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      key = body.key;
    } else {
      key = event.queryStringParameters?.key;
    }

    if (!key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Object key is required' })
      };
    }

    const s3 = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false
    });

    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const cid = head.Metadata?.cid || head.$metadata?.httpHeaders?.['x-amz-meta-cid'];

    if (!cid) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'CID not found yet for this object' })
      };
    }

    const ipfsUrl = `https://ipfs.filebase.io/ipfs/${cid}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        key,
        cid,
        ipfsUrl
      })
    };
  } catch (err) {
    console.error('Error fetching CID:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
