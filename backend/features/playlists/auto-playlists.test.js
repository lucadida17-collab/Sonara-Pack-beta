"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAutoPlaylists } = require("./auto-playlists");

function pack(id, category, price, artistId) {
  return {
    id,
    status: "approved",
    contentType: "audio",
    categorie: [category],
    title: `Pack ${id}`,
    artistProfile: { accountId: artistId, name: `Artist ${artistId}` },
    tracks: [{ id: `track-${id}`, title: `Track ${id}`, price: `${price}€` }]
  };
}

test("génère une playlist mensuelle par catégorie avec prix et commission 20%", () => {
  const result = buildAutoPlaylists([
    pack("a", "Cinematic", 10, "artist-a"),
    pack("b", "Cinematic", 20, "artist-b"),
    pack("c", "Piano", 7, "artist-c")
  ], { editionKey: "2026-08" });

  assert.equal(result.quickTracks.length, 3);
  assert.equal(result.playlists.length, 1);
  const playlist = result.playlists[0];
  assert.equal(playlist.trackCount, 2);
  assert.equal(playlist.pricing.totalPriceCents, 3000);
  assert.equal(playlist.pricing.sonaraCommissionCents, 600);
  assert.equal(playlist.pricing.artistPoolCents, 2400);
});

test("une édition mensuelle est déterministe et change de clé le mois suivant", () => {
  const packs = Array.from({ length: 15 }, (_, index) =>
    pack(String(index), "Piano", 1 + index, `artist-${index}`)
  );
  const augustA = buildAutoPlaylists(packs, { editionKey: "2026-08" });
  const augustB = buildAutoPlaylists(packs, { editionKey: "2026-08" });
  const september = buildAutoPlaylists(packs, { editionKey: "2026-09" });
  assert.deepEqual(
    augustA.playlists[0].tracks.map((item) => item.trackId),
    augustB.playlists[0].tracks.map((item) => item.trackId)
  );
  assert.notEqual(augustA.playlists[0].id, september.playlists[0].id);
  assert.equal(augustA.playlists[0].trackCount, 12);
});
