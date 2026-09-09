const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDownloadStatistics } = require('./platform-growth');

test('Morceaux téléchargés compte tous les morceaux obtenus dans les packs, sans doublons par compte', () => {
  const packs = [
    { id: 'pack_a', tracks: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] },
    { id: 'pack_b', tracks: [{ id: 'b1' }, { id: 'b2' }] }
  ];
  const accounts = [
    { accountId: 'u1', downloadedPacks: ['pack_a'], downloadedTracks: ['a1', 'solo_1'] },
    { accountId: 'u2', downloadedPacks: ['pack_b'], downloadedTracks: [] }
  ];

  const stats = buildDownloadStatistics(accounts, packs);
  assert.equal(stats.packs, 2);
  assert.equal(stats.tracks, 6); // u1: a1,a2,a3,solo_1 = 4 ; u2: b1,b2 = 2
  assert.equal(stats.uniqueAccounts, 2);
  assert.equal(stats.total, 8);
});

test('Un morceau téléchargé à l’unité après son pack n’est pas compté deux fois', () => {
  const packs = [{ id: 'pack_a', tracks: [{ id: 'a1' }, { id: 'a2' }] }];
  const accounts = [{ accountId: 'u1', downloadedPacks: ['pack_a'], downloadedTracks: ['a1'] }];
  const stats = buildDownloadStatistics(accounts, packs);
  assert.equal(stats.tracks, 2);
});
