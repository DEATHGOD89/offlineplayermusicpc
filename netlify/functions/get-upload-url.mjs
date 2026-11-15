import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const accessKeyId = process.env.FILEBASE_KEY;
  const secretAccessKey = process.env.FILEBASE_SECRET;
  const bucket = process.env.FILEBASE_BUCKET || 'spoty-music-vault';

  if (!accessKeyId || !secretAccessKey) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Filebase credentials not configured in Netlify environment variables.'
      })
    };
  }

  try {
    const { fileName, contentType, folder } = JSON.parse(event.body || '{}');

    if (!fileName || !contentType) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'fileName and contentType are required' })
      };
    }

    // Security: Block path traversal and restrict extensions
    const cleanFileName = fileName.trim().replace(/^.*[\\/]/, '');
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid fileName: path traversal characters detected.' })
      };
    }

    const cleanFolder = folder === 'covers' ? 'covers' : 'songs';

    // Security: Validate allowed MIME types and file extensions
    const isAllowedAudio = cleanFolder === 'songs' && 
      (contentType.startsWith('audio/') || contentType === 'application/octet-stream') &&
      /\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i.test(cleanFileName);

    const isAllowedImage = cleanFolder === 'covers' && 
      contentType.startsWith('image/') &&
      /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(cleanFileName);

    if (!isAllowedAudio && !isAllowedImage) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Disallowed file type or extension. Only standard audio and image files are permitted.' })
      };
    }

    const s3 = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      forcePathStyle: false
    });

    const key = `${cleanFolder}/${cleanFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read'
    });

    // Security: Restrict presigned URL validity to 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    const publicUrl = `https://${bucket}.s3.filebase.io/${key}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        uploadUrl,
        publicUrl,
        key,
        bucket
      })
    };
  } catch (err) {
    console.error('Error generating Filebase upload URL:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
