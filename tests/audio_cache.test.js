import test from 'node:test';
import assert from 'node:assert/strict';

class MockUrlCache {
  constructor() {
    this.cache = new Map();
    this.revoked = [];
    this.createdCount = 0;
  }

  getOrCreateUrl(track, mockCreateObjectUrl) {
    if (!track) return null;
    if (track.coverUrl) return track.coverUrl;
    if (!track.coverBlob) return null;

    if (!this.cache.has(track.id)) {
      const url = mockCreateObjectUrl(track.coverBlob);
      this.createdCount++;
      this.cache.set(track.id, url);
    }
    return this.cache.get(track.id);
  }

  revokeTrackUrl(trackId, mockRevokeObjectUrl) {
    if (this.cache.has(trackId)) {
      const url = this.cache.get(trackId);
      if (url && url.startsWith('blob:')) {
        mockRevokeObjectUrl(url);
        this.revoked.push(url);
      }
      this.cache.delete(trackId);
    }
  }

  clear(mockRevokeObjectUrl) {
    for (const url of this.cache.values()) {
      if (url && url.startsWith('blob:')) {
        mockRevokeObjectUrl(url);
        this.revoked.push(url);
      }
    }
    this.cache.clear();
  }
}

test('Audio Cache: Reuses existing object URLs to prevent duplicate memory leaks', () => {
  const manager = new MockUrlCache();
  const track = { id: 'track-1', coverBlob: { size: 1024 } };

  let urlCounter = 0;
  const mockCreate = () => `blob:http://localhost/blob-${++urlCounter}`;

  const url1 = manager.getOrCreateUrl(track, mockCreate);
  const url2 = manager.getOrCreateUrl(track, mockCreate);

  assert.equal(url1, url2, 'Subsequent requests must return cached URL');
  assert.equal(manager.createdCount, 1, 'Only 1 Object URL should be allocated');
});

test('Audio Cache: Correctly revokes and frees memory when song is deleted', () => {
  const manager = new MockUrlCache();
  const track = { id: 'track-2', coverBlob: { size: 2048 } };

  const mockCreate = () => 'blob:http://localhost/blob-delete-me';
  const mockRevoke = (u) => { assert.equal(u, 'blob:http://localhost/blob-delete-me'); };

  const url = manager.getOrCreateUrl(track, mockCreate);
  assert.equal(url, 'blob:http://localhost/blob-delete-me');

  manager.revokeTrackUrl('track-2', mockRevoke);
  assert.equal(manager.cache.size, 0);
  assert.equal(manager.revoked.length, 1);
});
