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

test("génère les playlists de catégorie et découverte, même avec un seul single", () => {
  const result = buildAutoPlaylists([
    pack("a", "Cinematic", 10, "artist-a"),
    pack("b", "Cinematic", 20, "artist-b"),
    pack("c", "Piano", 7, "artist-c")
  ], { editionKey: "2026-08" });

  assert.equal(result.quickTracks.length, 3);
  assert.equal(result.playlists.length, 3);

  const cinematic = result.playlists.find((playlist) => playlist.category.key === "cinematic");
  const piano = result.playlists.find((playlist) => playlist.category.key === "piano");
  const discovery = result.playlists.find((playlist) => playlist.scope === "discovery");

  assert.equal(cinematic.trackCount, 2);
  assert.equal(cinematic.pricing.totalPriceCents, 3000);
  assert.equal(cinematic.pricing.sonaraCommissionCents, 600);
  assert.equal(cinematic.pricing.artistPoolCents, 2400);
  assert.equal(piano.trackCount, 1);
  assert.equal(discovery.trackCount, 3);
});

test("une édition mensuelle est déterministe et change de clé le mois suivant", () => {
  const packs = Array.from({ length: 15 }, (_, index) =>
    pack(String(index), "Piano", 1 + index, `artist-${index}`)
  );
  const augustA = buildAutoPlaylists(packs, { editionKey: "2026-08" });
  const augustB = buildAutoPlaylists(packs, { editionKey: "2026-08" });
  const september = buildAutoPlaylists(packs, { editionKey: "2026-09" });
  assert.deepEqual(
    augustA.playlists.find((item) => item.category.key === "piano").tracks.map((item) => item.trackId),
    augustB.playlists.find((item) => item.category.key === "piano").tracks.map((item) => item.trackId)
  );
  assert.notEqual(
    augustA.playlists.find((item) => item.category.key === "piano").id,
    september.playlists.find((item) => item.category.key === "piano").id
  );
  assert.equal(augustA.playlists.find((item) => item.category.key === "piano").trackCount, 12);
  assert.equal(augustA.playlists.filter((item) => item.category.key === "piano").length, 2);
});


test("nomme plusieurs playlists d'une même catégorie sans doublon simple", () => {
  const packs = Array.from({ length: 61 }, (_, index) =>
    pack(`name-${index}`, "Cinematic", 1, `artist-name-${index}`)
  );
  const result = buildAutoPlaylists(packs, { editionKey: "2026-08" });
  const cinematic = result.playlists.filter((item) =>
    item.scope === "category" && item.category.key === "cinematic"
  );

  assert.equal(cinematic.length, 6);
  assert.deepEqual(
    cinematic.map((item) => item.title),
    [
      "Sélection Cinematic",
      "Top Cinematic",
      "Découverte Cinematic",
      "Cinematic du moment",
      "Essentiels Cinematic",
      "Sélection Cinematic · Vol. 2"
    ]
  );
});
