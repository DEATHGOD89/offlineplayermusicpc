import test from 'node:test';
import assert from 'node:assert/strict';

function sanitizePromptInput(input, fallback = 'Music Lover') {
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  // Strip control characters or script injection delimiters
  const clean = trimmed.replace(/[<>]/g, '').trim();
  return clean || fallback;
}

function validateFilebasePresignedRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid body' };
  }
  const { fileName, contentType, folder } = body;
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    return { valid: false, error: 'fileName is required' };
  }
  if (!contentType || typeof contentType !== 'string' || !contentType.trim()) {
    return { valid: false, error: 'contentType is required' };
  }

  // Prevent path traversal
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { valid: false, error: 'Invalid filename' };
  }

  const cleanFolder = folder === 'covers' ? 'covers' : 'songs';
  return { valid: true, key: `${cleanFolder}/${fileName}` };
}

test('Security: sanitizePromptInput strips malicious XSS tags <script>', () => {
  const attack = '<script>alert("hacked")</script>John';
  const clean = sanitizePromptInput(attack);
  assert.ok(!clean.includes('<script>'), 'Must strip opening tags');
  assert.ok(!clean.includes('</script>'), 'Must strip closing tags');
  assert.equal(clean, 'scriptalert("hacked")/scriptJohn');
});

test('Security: sanitizePromptInput defaults safely on empty/null input', () => {
  assert.equal(sanitizePromptInput(''), 'Music Lover');
  assert.equal(sanitizePromptInput(null), 'Music Lover');
  assert.equal(sanitizePromptInput('   '), 'Music Lover');
});

test('Security: Path traversal attempts in S3 file uploads are blocked', () => {
  const attack1 = validateFilebasePresignedRequest({
    fileName: '../../etc/passwd',
    contentType: 'audio/mpeg',
    folder: 'songs'
  });
  assert.equal(attack1.valid, false);
  assert.equal(attack1.error, 'Invalid filename');

  const attack2 = validateFilebasePresignedRequest({
    fileName: '..\\Windows\\System32\\cmd.exe',
    contentType: 'audio/mpeg',
    folder: 'songs'
  });
  assert.equal(attack2.valid, false);
  assert.equal(attack2.error, 'Invalid filename');
});

test('Security: Valid upload request formats correctly', () => {
  const valid = validateFilebasePresignedRequest({
    fileName: 'song-123.mp3',
    contentType: 'audio/mpeg',
    folder: 'songs'
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.key, 'songs/song-123.mp3');
});

function validateFilebaseDeleteRequest(body) {
  const { key, cid } = body || {};
  if (!key && !cid) return { valid: false, error: 'Required key or cid' };
  if (key && (key.includes('..') || (!key.startsWith('songs/') && !key.startsWith('covers/')))) {
    return { valid: false, error: 'Path restricted to songs/ and covers/' };
  }
  if (cid && !/^[a-zA-Z0-9]{40,65}$/.test(cid)) {
    return { valid: false, error: 'Invalid CID format' };
  }
  return { valid: true };
}

test('Security: S3 deletion blocks arbitrary key deletion outside vault folders', () => {
  const res1 = validateFilebaseDeleteRequest({ key: '../root.txt' });
  assert.equal(res1.valid, false);

  const res2 = validateFilebaseDeleteRequest({ key: 'admin/secret.json' });
  assert.equal(res2.valid, false);

  const res3 = validateFilebaseDeleteRequest({ key: 'songs/track-123.mp3' });
  assert.equal(res3.valid, true);

  const res4 = validateFilebaseDeleteRequest({ cid: 'QmTYYThzZDPC75EmVt7Agmy4tTKUxHgKCSzHxHeUXeAHcs' });
  assert.equal(res4.valid, true);

  const res5 = validateFilebaseDeleteRequest({ cid: 'invalid*cid$$' });
  assert.equal(res5.valid, false);
});

