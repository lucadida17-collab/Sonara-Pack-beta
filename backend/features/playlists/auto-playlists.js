"use strict";

const crypto = require("crypto");

const AUTO_PLAYLIST_MAX_TRACKS = 12;
const AUTO_PLAYLIST_COMMISSION_RATE = 0.20;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeTag(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeTag(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "selection";
}

function monthKey(input = Date.now()) {
  const date = input instanceof Date ? input : new Date(input);
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  return `${valid.getUTCFullYear()}-${String(valid.getUTCMonth() + 1).padStart(2, "0")}`;
}

function deterministicScore(seed, value) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}|${clean(value)}`)
    .digest();
  return digest.readUInt32BE(0);
}

function getTrackCount(pack = {}) {
  if (Array.isArray(pack.tracks)) return pack.tracks.length;
  for (const candidate of [pack.trackCount, pack.tracksCount, pack.numberOfTracks]) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return 0;
}

function getPrimaryCategory(pack = {}) {
  const candidates = [];
  if (Array.isArray(pack.categorie)) candidates.push(...pack.categorie);
  else if (pack.categorie) candidates.push(pack.categorie);
  if (Array.isArray(pack.categories)) candidates.push(...pack.categories);
  if (pack.category) candidates.push(pack.category);
  const display = candidates.map(clean).find(Boolean) || "Découverte";
  return { key: normalizeTag(display) || "decouverte", display };
}

function parsePriceCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = clean(value).toLowerCase();
  if (!text || ["gratuit", "free"].includes(text)) return 0;
  const numeric = Number(text.replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function getArtist(pack = {}) {
  const profile = pack.artistProfile && typeof pack.artistProfile === "object"
    ? pack.artistProfile
    : {};
  return {
    accountId: clean(
      profile.accountId || pack.accountId || pack.artistAccountId || pack.artistId
    ),
    name: clean(
      profile.name || profile.pseudo || pack.artist || pack.pseudo || "Artiste Sonara"
    ) || "Artiste Sonara"
  };
}

function isEligibleSingle(pack = {}) {
  return Boolean(
    pack &&
    clean(pack.id) &&
    clean(pack.status).toLowerCase() === "approved" &&
    pack.moderationHidden !== true &&
    ["", "audio"].includes(clean(pack.contentType).toLowerCase()) &&
    getTrackCount(pack) === 1 &&
    Array.isArray(pack.tracks) &&
    pack.tracks[0] &&
    clean(pack.tracks[0].id)
  );
}

function publicTrack(pack = {}) {
  const track = Array.isArray(pack.tracks) ? pack.tracks[0] || {} : {};
  const artist = getArtist(pack);
  const priceCents = parsePriceCents(
    track.price || track.trackPrice || track.unitPrice || pack.price || pack.packPrice
  );
  const category = getPrimaryCategory(pack);

  return {
    packId: clean(pack.id),
    trackId: clean(track.id),
    title: clean(track.title || pack.title || "Track Sonara") || "Track Sonara",
    packTitle: clean(pack.title || track.title || "Single Sonara") || "Single Sonara",
    artist,
    category,
    coverPack: pack.coverPack || pack.cover || track.coverPack || "",
    audioName: track.audioName || track.audio || "",
    previewStart: Number.isFinite(Number(track.previewStart)) ? Number(track.previewStart) : 0,
    previewDuration: Math.min(30, Math.max(1, Number(track.previewDuration || 30))),
    priceCents,
    price: (priceCents / 100).toFixed(2),
    license: {
      id: clean(pack?.license?.id || `${pack.id}:license:v${Number(pack?.license?.version || 1)}`),
      version: Number(pack?.license?.version || 1),
      name: clean(pack?.license?.name || "Licence standard Sonara") || "Licence standard Sonara"
    }
  };
}

function buildAutoPlaylists(rawPacks = [], options = {}) {
  const editionKey = clean(options.editionKey) || monthKey(options.now || Date.now());
  const maxTracks = Math.max(2, Math.min(12, Number(options.maxTracks || AUTO_PLAYLIST_MAX_TRACKS)));
  const singles = (Array.isArray(rawPacks) ? rawPacks : [])
    .filter(isEligibleSingle)
    .map(publicTrack);

  const byCategory = new Map();
  singles.forEach((track) => {
    const key = track.category.key || "decouverte";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(track);
  });

  const playlists = [];
  for (const [categoryKey, tracks] of byCategory.entries()) {
    if (tracks.length < 2) continue;
    const categoryDisplay = tracks[0]?.category?.display || categoryKey;
    const seed = `${editionKey}:${categoryKey}`;
    const selected = [...tracks]
      .sort((a, b) =>
        deterministicScore(seed, a.trackId) - deterministicScore(seed, b.trackId)
      )
      .slice(0, maxTracks);

    const totalPriceCents = selected.reduce((sum, item) => sum + item.priceCents, 0);
    const sonaraCommissionCents = Math.round(totalPriceCents * AUTO_PLAYLIST_COMMISSION_RATE);
    const artistPoolCents = Math.max(0, totalPriceCents - sonaraCommissionCents);
    const artistsMap = new Map();
    selected.forEach((item) => {
      const key = item.artist.accountId || item.artist.name.toLowerCase();
      const current = artistsMap.get(key) || {
        accountId: item.artist.accountId,
        name: item.artist.name,
        grossCents: 0,
        sonaraCommissionCents: 0,
        artistShareCents: 0,
        trackCount: 0
      };
      current.grossCents += item.priceCents;
      current.trackCount += 1;
      artistsMap.set(key, current);
    });

    const artistEntries = [...artistsMap.values()];
    let allocatedArtistCents = 0;
    artistEntries.forEach((entry, index) => {
      const isLast = index === artistEntries.length - 1;
      const proportionalShare = totalPriceCents > 0
        ? Math.round((entry.grossCents / totalPriceCents) * artistPoolCents)
        : 0;
      entry.artistShareCents = isLast
        ? Math.max(0, artistPoolCents - allocatedArtistCents)
        : Math.max(0, Math.min(proportionalShare, artistPoolCents - allocatedArtistCents));
      allocatedArtistCents += entry.artistShareCents;
      entry.sonaraCommissionCents = Math.max(0, entry.grossCents - entry.artistShareCents);
    });

    playlists.push({
      id: `auto:${editionKey}:${slugify(categoryKey)}`,
      generatedBy: "sonara",
      editionKey,
      category: { key: categoryKey, display: categoryDisplay },
      title: `Sélection ${categoryDisplay}`,
      trackCount: selected.length,
      coverPack: selected[0]?.coverPack || "",
      tracks: selected,
      pricing: {
        currency: "EUR",
        totalPriceCents,
        totalPrice: (totalPriceCents / 100).toFixed(2),
        sonaraCommissionRate: AUTO_PLAYLIST_COMMISSION_RATE,
        sonaraCommissionCents,
        sonaraCommission: (sonaraCommissionCents / 100).toFixed(2),
        artistPoolCents,
        artistPool: (artistPoolCents / 100).toFixed(2),
        artists: artistEntries.map((entry) => ({
          ...entry,
          gross: (entry.grossCents / 100).toFixed(2),
          sonaraCommission: (entry.sonaraCommissionCents / 100).toFixed(2),
          artistShare: (entry.artistShareCents / 100).toFixed(2)
        }))
      }
    });
  }

  playlists.sort((a, b) => a.category.display.localeCompare(b.category.display, "fr"));

  const quickTracks = [...singles]
    .sort((a, b) =>
      deterministicScore(`${editionKey}:quick-tracks`, a.trackId) -
      deterministicScore(`${editionKey}:quick-tracks`, b.trackId)
    )
    .slice(0, AUTO_PLAYLIST_MAX_TRACKS);

  return {
    editionKey,
    generatedAt: new Date().toISOString(),
    resetPolicy: "monthly",
    commissionRate: AUTO_PLAYLIST_COMMISSION_RATE,
    quickTracks,
    playlists
  };
}

function findAutoPlaylist(rawPacks, playlistId, options = {}) {
  const id = clean(playlistId);
  if (!id) return null;
  const editionMatch = /^auto:(\d{4}-\d{2}):/.exec(id);
  const editionKey = editionMatch?.[1] || clean(options.editionKey) || monthKey(options.now || Date.now());
  return buildAutoPlaylists(rawPacks, { ...options, editionKey }).playlists.find((playlist) => playlist.id === id) || null;
}

module.exports = {
  AUTO_PLAYLIST_MAX_TRACKS,
  AUTO_PLAYLIST_COMMISSION_RATE,
  monthKey,
  getTrackCount,
  isEligibleSingle,
  parsePriceCents,
  buildAutoPlaylists,
  findAutoPlaylist
};
