"use strict";

/*
  SONARA PACK — ACTIVITÉ ARTISTE PRE-V1
  Source interne réutilisable pour mesurer une contribution réelle.

  Vérité utilisée :
  - pack réellement publié = status "approved" ;
  - date canonique = publishedAt ;
  - les anciens packs approved sans publishedAt peuvent être backfillés
    une seule fois depuis moderatedAt, car la validation est le moment où
    le pack est devenu publiquement accessible dans l'architecture actuelle.

  Aucun badge visuel n'est créé ici. Aucun score de distribution n'est modifié.
*/

const DEFAULT_PRE_V1_START_DATE = "2026-08-01T00:00:00.000Z";
const DEFAULT_PRE_V1_END_DATE = "2027-04-01T00:00:00.000Z"; // borne exclusive
const DEFAULT_REQUIRED_ACTIVE_MONTHS = 4;

function parseDateOrFallback(value, fallback) {
  const raw = String(value || "").trim();
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function createPreV1ActivityConfig() {
  const startDate = parseDateOrFallback(
    process.env.SONARA_PRE_V1_START_DATE,
    DEFAULT_PRE_V1_START_DATE
  );
  const endDate = parseDateOrFallback(
    process.env.SONARA_PRE_V1_END_DATE,
    DEFAULT_PRE_V1_END_DATE
  );

  const startTimestamp = Date.parse(startDate);
  const endTimestamp = Date.parse(endDate);

  if (!(endTimestamp > startTimestamp)) {
    throw new Error("SONARA_PRE_V1_END_DATE doit être postérieure à SONARA_PRE_V1_START_DATE.");
  }

  return Object.freeze({
    startDate,
    endDate,
    startTimestamp,
    endTimestamp,
    endExclusive: true,
    requiredActiveMonths: DEFAULT_REQUIRED_ACTIVE_MONTHS
  });
}

const PRE_V1_ACTIVITY_CONFIG = createPreV1ActivityConfig();

function normalizeText(value) {
  return String(value ?? "").trim();
}

function resolveArtistId(pack = {}) {
  return normalizeText(
    pack.accountId ||
    pack.artistAccountId ||
    pack.artistId ||
    pack.artistProfile?.accountId ||
    ""
  );
}

function isActuallyPublishedPack(pack = {}) {
  return Boolean(
    pack &&
    normalizeText(pack.id) &&
    normalizeText(pack.status).toLowerCase() === "approved" &&
    pack.moderationHidden !== true
  );
}

function canonicalPublishedAt(pack = {}) {
  const value = normalizeText(pack.publishedAt);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function legacyPublishedAtCandidate(pack = {}) {
  if (!isActuallyPublishedPack(pack)) return "";
  if (canonicalPublishedAt(pack)) return "";

  const value = normalizeText(pack.moderatedAt);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function isInsidePreV1(isoDate, config = PRE_V1_ACTIVITY_CONFIG) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= config.startTimestamp && timestamp < config.endTimestamp;
}

function monthKeyFromIso(isoDate) {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildPreV1ArtistActivity(packs = [], options = {}) {
  const config = options.config || PRE_V1_ACTIVITY_CONFIG;
  const artists = new Map();

  for (const pack of Array.isArray(packs) ? packs : []) {
    if (!isActuallyPublishedPack(pack)) continue;

    const publishedAt = canonicalPublishedAt(pack);
    if (!publishedAt || !isInsidePreV1(publishedAt, config)) continue;

    const artistId = resolveArtistId(pack);
    if (!artistId) continue;

    const monthKey = monthKeyFromIso(publishedAt);
    if (!monthKey) continue;

    if (!artists.has(artistId)) {
      artists.set(artistId, {
        artistId,
        accountId: normalizeText(pack.accountId || pack.artistProfile?.accountId || artistId),
        artistName: normalizeText(pack.artistProfile?.name || pack.artist || pack.pseudo || ""),
        preV1PublishedPacks: 0,
        activeMonths: new Set(),
        lastPublishedAt: ""
      });
    }

    const entry = artists.get(artistId);
    entry.preV1PublishedPacks += 1;
    entry.activeMonths.add(monthKey); // anti-spam : 1 seule occurrence par mois calendaire

    if (!entry.lastPublishedAt || Date.parse(publishedAt) > Date.parse(entry.lastPublishedAt)) {
      entry.lastPublishedAt = publishedAt;
    }
  }

  const result = [...artists.values()].map((entry) => {
    const activeMonths = [...entry.activeMonths].sort();
    const activeMonthsCount = activeMonths.length;
    const requiredMonths = config.requiredActiveMonths;
    const remainingMonths = Math.max(0, requiredMonths - activeMonthsCount);

    return {
      artistId: entry.artistId,
      accountId: entry.accountId,
      artistName: entry.artistName,
      preV1PublishedPacks: entry.preV1PublishedPacks,
      activeMonths,
      activeMonthsCount,
      requiredMonths,
      lastPublishedAt: entry.lastPublishedAt || null,
      progress: {
        currentMonths: activeMonthsCount,
        requiredMonths,
        remainingMonths,
        percent: Math.min(100, Math.round((activeMonthsCount / requiredMonths) * 100))
      },
      preV1BadgeEligible: activeMonthsCount >= requiredMonths
    };
  });

  result.sort((a, b) => {
    if (b.activeMonthsCount !== a.activeMonthsCount) {
      return b.activeMonthsCount - a.activeMonthsCount;
    }
    if (b.preV1PublishedPacks !== a.preV1PublishedPacks) {
      return b.preV1PublishedPacks - a.preV1PublishedPacks;
    }
    return String(a.artistId).localeCompare(String(b.artistId));
  });

  return result;
}

function buildPreV1ActivityReport(packs = [], options = {}) {
  const config = options.config || PRE_V1_ACTIVITY_CONFIG;
  const artists = buildPreV1ArtistActivity(packs, { config });

  return {
    period: {
      startDate: config.startDate,
      endDate: config.endDate,
      endExclusive: config.endExclusive
    },
    requiredActiveMonths: config.requiredActiveMonths,
    artistsCount: artists.length,
    eligibleArtistsCount: artists.filter((artist) => artist.preV1BadgeEligible).length,
    artists
  };
}

function backfillLocalPublishedAt(packs = []) {
  let changed = false;
  let updatedCount = 0;

  for (const pack of Array.isArray(packs) ? packs : []) {
    const candidate = legacyPublishedAtCandidate(pack);
    if (!candidate) continue;
    pack.publishedAt = candidate;
    pack.wasPublished = true;
    changed = true;
    updatedCount += 1;
  }

  return { changed, updatedCount, packs };
}

async function backfillMongoPublishedAt(packsCollection) {
  if (!packsCollection) return { updatedCount: 0 };

  const legacyPacks = await packsCollection.find({
    status: "approved",
    moderationHidden: { $ne: true },
    $or: [
      { publishedAt: { $exists: false } },
      { publishedAt: null },
      { publishedAt: "" }
    ],
    moderatedAt: { $exists: true, $nin: [null, ""] }
  }).project({ id: 1, moderatedAt: 1 }).toArray();

  const operations = legacyPacks
    .map((pack) => {
      const candidate = legacyPublishedAtCandidate({
        id: pack.id,
        status: "approved",
        moderatedAt: pack.moderatedAt
      });
      if (!candidate) return null;
      return {
        updateOne: {
          filter: { _id: pack._id },
          update: { $set: { publishedAt: candidate, wasPublished: true } }
        }
      };
    })
    .filter(Boolean);

  if (!operations.length) return { updatedCount: 0 };

  const result = await packsCollection.bulkWrite(operations, { ordered: false });
  return { updatedCount: Number(result.modifiedCount || 0) };
}

module.exports = {
  DEFAULT_PRE_V1_START_DATE,
  DEFAULT_PRE_V1_END_DATE,
  DEFAULT_REQUIRED_ACTIVE_MONTHS,
  PRE_V1_ACTIVITY_CONFIG,
  createPreV1ActivityConfig,
  resolveArtistId,
  isActuallyPublishedPack,
  canonicalPublishedAt,
  isInsidePreV1,
  monthKeyFromIso,
  buildPreV1ArtistActivity,
  buildPreV1ActivityReport,
  backfillLocalPublishedAt,
  backfillMongoPublishedAt
};
