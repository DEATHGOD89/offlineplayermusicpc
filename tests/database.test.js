import test from 'node:test';
import assert from 'node:assert/strict';

function sanitizeSongRecord(song) {
  const now = Date.now();
  return {
    id: song.id || now.toString(),
    title: (song.title && song.title.trim()) || 'Untitled',
    artist: (song.artist && song.artist.trim()) || 'Unknown Artist',
    album: (song.album && song.album.trim()) || 'Single',
    genre: (song.genre && song.genre.trim()) || 'Unknown',
    duration: typeof song.duration === 'number' && !isNaN(song.duration) ? Math.max(0, song.duration) : 0,
    audioBlob: song.audioBlob || null,
    coverBlob: song.coverBlob || null,
    url: song.url || null,
    coverUrl: song.coverUrl || null,
    isCloud: !!song.isCloud,
    isFavorite: !!song.isFavorite,
    isUserUpload: song.isUserUpload !== undefined ? !!song.isUserUpload : true,
    addedAt: song.addedAt || now,
  };
}

function sanitizeBackgroundRecord(bg) {
  const now = Date.now();
  const isImageDetected = bg.isImage !== undefined 
    ? !!bg.isImage 
    : (bg.blob && bg.blob.type ? bg.blob.type.startsWith('image/') : false);

  return {
    id: bg.id || 'bg-custom-' + now,
    name: bg.name || 'Custom Background',
    blob: bg.blob || null,
    isImage: isImageDetected,
    addedAt: bg.addedAt || now,
  };
}

test('Database: Song record sanitization fills default metadata', () => {
  const raw = { id: 'test-1' };
  const sanitized = sanitizeSongRecord(raw);
  assert.equal(sanitized.id, 'test-1');
  assert.equal(sanitized.title, 'Untitled');
  assert.equal(sanitized.artist, 'Unknown Artist');
  assert.equal(sanitized.duration, 0);
  assert.equal(sanitized.isFavorite, false);
});

test('Database: Background record preserves explicit isImage boolean', () => {
  const imgBg = { id: 'bg-1', name: 'My Art', isImage: true };
  const sanitized = sanitizeBackgroundRecord(imgBg);
  assert.equal(sanitized.isImage, true, 'isImage must be preserved as true');

  const videoBg = { id: 'bg-2', name: 'My Video', isImage: false };
  const sanitizedVid = sanitizeBackgroundRecord(videoBg);
  assert.equal(sanitizedVid.isImage, false, 'isImage must be preserved as false');
});

test('Database: Background record auto-detects isImage from blob.type', () => {
  const imgWithBlob = { id: 'bg-3', name: 'Auto Detect Image', blob: { type: 'image/jpeg' } };
  const sanitized = sanitizeBackgroundRecord(imgWithBlob);
  assert.equal(sanitized.isImage, true, 'Auto-detected image must be true');

  const videoWithBlob = { id: 'bg-4', name: 'Auto Detect Video', blob: { type: 'video/mp4' } };
  const sanitizedVid = sanitizeBackgroundRecord(videoWithBlob);
  assert.equal(sanitizedVid.isImage, false, 'Auto-detected video must be false');
});
