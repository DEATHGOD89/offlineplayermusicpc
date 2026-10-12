const SUPABASE_URL = 'https://ywbcvnmtkaynxhnbtaum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_C5uyyq2OFHcd7hqZ2t9IHw_1lULN8fZ';

/**
 * Netlify Scheduled Function that automatically pings Supabase daily.
 * Prevents Supabase's free tier from auto-pausing due to 7 days of inactivity.
 */
export const handler = async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cloud_songs?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    console.log(`[Keep-Alive] Pinged Supabase successfully. HTTP Status: ${res.status}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Keep-alive ping sent to Supabase. Inactivity timer reset.',
        status: res.status
      })
    };
  } catch (err) {
    console.warn('[Keep-Alive] Ping encountered an issue:', err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
