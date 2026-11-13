import test from 'node:test';
import assert from 'node:assert/strict';

const sampleSongs = [
  { id: '1', title: 'Manjha', artist: 'Vishal Mishra', album: 'Single', genre: 'Acoustic', addedAt: 100 },
  { id: '2', title: 'Patola (From "Blackmail")', artist: 'Guru Randhawa', album: 'Blackmail', genre: 'Punjabi', addedAt: 200 },
  { id: '3', title: 'Main Dhoondne Ko Zamaane Mein', artist: 'Arijit Singh', album: 'Heartless', genre: 'Soundtrack', addedAt: 300 },
  { id: '4', title: 'Loser', artist: 'Tame Impala', album: 'Currents', genre: 'Psychedelic Rock', addedAt: 400 },
  { id: '5', title: 'NUMBER NOTE', artist: 'Fazilpuria', album: 'Single', genre: 'Haryanvi', addedAt: 500 }
];

function filterSongs(songs, query, _mood = 'All', genre = 'All') {
  const rawQuery = query.trim().toLowerCase();
  const queryTokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

  return songs.filter((s) => {
    if (queryTokens.length > 0) {
      const textCorpus = `${s.title || ''} ${s.artist || ''} ${s.album || ''} ${s.genre || ''}`.toLowerCase();
      const matchesAllTokens = queryTokens.every(token => textCorpus.includes(token));
      if (!matchesAllTokens) return false;
    }
    if (genre !== 'All') {
      const g = (s.genre || '').toLowerCase();
      if (!g.includes(genre.toLowerCase())) return false;
    }
    return true;
  });
}

function sortSongs(songs, sortType) {
  const listCopy = [...songs];
  if (sortType === 'Date Added' || sortType === 'Recently Added') {
    return listCopy.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  if (sortType === 'Title') {
    return listCopy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }
  if (sortType === 'Artists') {
    return listCopy.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
  }
  if (sortType === 'Albums') {
    return listCopy.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
  }
  return listCopy;
}

test('Search: Single token matches title or artist', () => {
  const res = filterSongs(sampleSongs, 'Guru');
  assert.equal(res.length, 1);
  assert.equal(res[0].id, '2');
});

test('Search: Multi-token search matches across title and artist simultaneously', () => {
  const res = filterSongs(sampleSongs, 'Arijit Dhoondne');
  assert.equal(res.length, 1);
  assert.equal(res[0].id, '3');
});

test('Search: Case-insensitive search works reliably', () => {
  const res1 = filterSongs(sampleSongs, 'manjha');
  const res2 = filterSongs(sampleSongs, 'MANJHA');
  assert.equal(res1.length, 1);
  assert.equal(res2.length, 1);
  assert.equal(res1[0].id, res2[0].id);
});

test('Search: Empty query returns all songs', () => {
  const res = filterSongs(sampleSongs, '   ');
  assert.equal(res.length, sampleSongs.length);
});

test('Sort: Recently Added sorts in descending order of addedAt', () => {
  const res = sortSongs(sampleSongs, 'Recently Added');
  assert.equal(res[0].id, '5');
  assert.equal(res[res.length - 1].id, '1');
});

test('Sort: Title sorts alphabetically A-Z', () => {
  const res = sortSongs(sampleSongs, 'Title');
  assert.equal(res[0].title, 'Loser');
  assert.equal(res[res.length - 1].title, 'Patola (From "Blackmail")');
});
