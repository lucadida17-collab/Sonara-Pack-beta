"use strict";

const { PRE_V1_ACTIVITY_CONFIG } = require("./pre-v1-activity");

const ARTIST_REWARD_IDS = Object.freeze({
  PRE_V1_SENIORITY: "PRE_V1_SENIORITY"
});

/*
  Image volontairement vide pour l'instant.
  Quand le visuel final est prêt, modifier UNIQUEMENT badgeImage ici.
  Exemple futur : "/app/assets/badges/pre-v1-seniority.png"
*/
const ARTIST_REWARD_DEFINITIONS = Object.freeze({
  [ARTIST_REWARD_IDS.PRE_V1_SENIORITY]: Object.freeze({
    id: ARTIST_REWARD_IDS.PRE_V1_SENIORITY,
    type: "BADGE_AND_TITLE",
    title: "Ancienneté Pre-V1",
    badgeLabel: "Ancienneté Pre-V1",
    badgeImage: "/app/assets/badges/pre-v1-seniority.jpeg",
    permanent: true
  })
});

function ensureArtistRewards(account = {}) {
  if (!account.artistRewards || typeof account.artistRewards !== "object" || Array.isArray(account.artistRewards)) {
    account.artistRewards = {};
  }
  return account.artistRewards;
}

function grantArtistRewardOnce(account = {}, rewardId, metadata = {}, now = new Date()) {
  const id = String(rewardId || "").trim();
  const definition = ARTIST_REWARD_DEFINITIONS[id];
  if (!definition) return { changed: false, record: null };
  const store = ensureArtistRewards(account);
  if (store[id]?.granted) return { changed: false, record: store[id] };

  const record = {
    id,
    granted: true,
    grantedAt: new Date(now).toISOString(),
    source: String(metadata.source || "MISSION"),
    sourceMissionId: metadata.sourceMissionId || null,
    title: definition.title,
    type: definition.type,
    badgeLabel: definition.badgeLabel,
    badgeImage: definition.badgeImage,
    permanent: Boolean(definition.permanent)
  };
  store[id] = record;
  return { changed: true, record };
}

function maybeGrantPreV1SeniorityReward(account = {}, activity = {}, now = new Date()) {
  const ended = new Date(now).getTime() >= PRE_V1_ACTIVITY_CONFIG.endTimestamp;
  const eligible = Boolean(activity?.preV1BadgeEligible);
  if (!ended || !eligible) return { changed: false, record: null, waitingForPeriodEnd: eligible && !ended };
  return grantArtistRewardOnce(account, ARTIST_REWARD_IDS.PRE_V1_SENIORITY, {
    source: "PRE_V1_MISSION",
    sourceMissionId: "pre_v1_seniority"
  }, now);
}

function hasArtistReward(account = {}, rewardId) {
  const record = ensureArtistRewards(account)[String(rewardId || "")];
  return Boolean(record?.granted);
}

function getPublicArtistRewards(account = {}) {
  const store = ensureArtistRewards(account);
  return Object.values(store)
    .filter((record) => record && record.granted)
    .map((record) => {
      const definition = ARTIST_REWARD_DEFINITIONS[record.id] || {};
      return {
        id: record.id,
        type: record.type || definition.type || null,
        title: record.title || definition.title || null,
        badgeLabel: record.badgeLabel || definition.badgeLabel || null,
        badgeImage: record.badgeImage || definition.badgeImage || null,
        permanent: record.permanent ?? Boolean(definition.permanent),
        grantedAt: record.grantedAt || null
      };
    });
}

module.exports = {
  ARTIST_REWARD_IDS,
  ARTIST_REWARD_DEFINITIONS,
  ensureArtistRewards,
  grantArtistRewardOnce,
  maybeGrantPreV1SeniorityReward,
  hasArtistReward,
  getPublicArtistRewards
};
