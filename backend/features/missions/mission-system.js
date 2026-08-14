"use strict";

const MISSION_MODES = Object.freeze({
  PRE_V1_MANUAL: "PRE_V1_MANUAL",
  V1_DYNAMIC: "V1_DYNAMIC"
});

const MISSION_STATES = Object.freeze({
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED_WAITING_REWARD: "COMPLETED_WAITING_REWARD",
  REWARDED: "REWARDED"
});

const PRE_V1_MISSIONS = Object.freeze({
  seniority: Object.freeze({
    id: "pre_v1_seniority",
    category: "SPECIAL",
    target: 4,
    unit: "active_months",
    difficultyScore: 55,
    difficultyTier: "MEDIUM",
    rewardTier: "EXCEPTIONAL",
    rewardType: "FUTURE_REWARD"
  }),
  publishedPacks: Object.freeze({
    id: "pre_v1_catalog",
    category: "CREATION",
    target: 8,
    unit: "published_packs",
    difficultyScore: 62,
    difficultyTier: "MEDIUM",
    rewardTier: "MEDIUM",
    rewardType: "VISIBILITY_BOOST"
  })
});

const V1_DYNAMIC_CONFIG = Object.freeze({
  maxActiveMissions: 3,
  newArtistStartsWithIntroMission: true,
  families: Object.freeze([
    "CREATION",
    "AUDIENCE",
    "SALES",
    "REVENUE",
    "DOWNLOADS",
    "FANS",
    "GROWTH",
    "SPECIAL"
  ]),
  difficulties: Object.freeze(["EASY", "MEDIUM", "HARD", "EXCEPTIONAL"]),
  rewardTiers: Object.freeze(["NONE", "SMALL", "MEDIUM", "LARGE", "EXCEPTIONAL"]),
  rewardTypes: Object.freeze([
    "NONE",
    "VISIBILITY_BOOST",
    "FUTURE_REWARD"
  ])
});

function resolveMissionMode(value = process.env.SONARA_MISSION_MODE) {
  return String(value || "").trim().toUpperCase() === MISSION_MODES.V1_DYNAMIC
    ? MISSION_MODES.V1_DYNAMIC
    : MISSION_MODES.PRE_V1_MANUAL;
}

function clampProgress(currentValue, targetValue) {
  const current = Math.max(0, Number(currentValue || 0));
  const target = Math.max(1, Number(targetValue || 1));
  return Math.min(100, Math.round((current / target) * 100));
}

function missionState(currentValue, targetValue, rewarded = false) {
  if (rewarded) return MISSION_STATES.REWARDED;
  return Number(currentValue || 0) >= Number(targetValue || 0)
    ? MISSION_STATES.COMPLETED_WAITING_REWARD
    : MISSION_STATES.IN_PROGRESS;
}

function createMissionProgress(currentValue, targetValue) {
  const current = Math.max(0, Number(currentValue || 0));
  const target = Math.max(1, Number(targetValue || 1));
  return {
    currentValue: current,
    targetValue: target,
    progressPercent: clampProgress(current, target)
  };
}

function createPreV1ManualMissions(activity = {}) {
  const activeMonths = Number(activity.activeMonthsCount || 0);
  const publishedPacks = Number(activity.preV1PublishedPacks || 0);

  const seniority = createMissionProgress(activeMonths, PRE_V1_MISSIONS.seniority.target);
  const catalog = createMissionProgress(publishedPacks, PRE_V1_MISSIONS.publishedPacks.target);

  return [
    {
      id: PRE_V1_MISSIONS.seniority.id,
      category: PRE_V1_MISSIONS.seniority.category,
      title: "Ancienneté Pre-V1",
      description: "Soyez actif pendant 4 mois différents de la Pre-V1.",
      unit: PRE_V1_MISSIONS.seniority.unit,
      difficultyScore: PRE_V1_MISSIONS.seniority.difficultyScore,
      difficultyTier: PRE_V1_MISSIONS.seniority.difficultyTier,
      rewardTier: PRE_V1_MISSIONS.seniority.rewardTier,
      rewardType: PRE_V1_MISSIONS.seniority.rewardType,
      ...seniority,
      state: missionState(seniority.currentValue, seniority.targetValue),
      reward: {
        defined: true,
        type: "BADGE_AND_TITLE",
        label: "Badge + titre Ancienneté Pre-V1",
        value: null,
        duration: null
      }
    },
    {
      id: PRE_V1_MISSIONS.publishedPacks.id,
      category: PRE_V1_MISSIONS.publishedPacks.category,
      title: "Construire votre catalogue",
      description: "Publiez 8 packs sur Sonara Pack pendant la Pre-V1.",
      unit: PRE_V1_MISSIONS.publishedPacks.unit,
      difficultyScore: PRE_V1_MISSIONS.publishedPacks.difficultyScore,
      difficultyTier: PRE_V1_MISSIONS.publishedPacks.difficultyTier,
      rewardTier: PRE_V1_MISSIONS.publishedPacks.rewardTier,
      rewardType: PRE_V1_MISSIONS.publishedPacks.rewardType,
      ...catalog,
      state: missionState(catalog.currentValue, catalog.targetValue),
      reward: {
        defined: true,
        type: "VISIBILITY_BOOST",
        label: "Boost de visibilité",
        value: null,
        duration: null
      }
    }
  ];
}

function resolveArtistDifficultyTier(metrics = {}) {
  const publishedPacks = Math.max(0, Number(metrics.publishedPacks || 0));
  const downloads = Math.max(0, Number(metrics.downloads || 0));
  const reputation = Math.max(0, Number(metrics.reputation || 0));

  if (reputation >= 85 || downloads >= 5000 || publishedPacks >= 40) return "EXCEPTIONAL";
  if (reputation >= 65 || downloads >= 1000 || publishedPacks >= 20) return "HARD";
  if (reputation >= 35 || downloads >= 100 || publishedPacks >= 8) return "MEDIUM";
  return "EASY";
}

function createRewardTemplate({ type = null, value = null, duration = null, tier = null } = {}) {
  return { type, value, duration, tier };
}

function createV1DynamicArchitecture(metrics = {}) {
  const newArtist = Number(metrics.publishedPacks || 0) === 0;
  return {
    enabled: true,
    generatedMissions: [],
    maxActiveMissions: V1_DYNAMIC_CONFIG.maxActiveMissions,
    introductionOnly: newArtist && V1_DYNAMIC_CONFIG.newArtistStartsWithIntroMission,
    difficulty: resolveArtistDifficultyTier(metrics),
    families: V1_DYNAMIC_CONFIG.families,
    rewardModel: {
      tiers: V1_DYNAMIC_CONFIG.rewardTiers,
      types: V1_DYNAMIC_CONFIG.rewardTypes,
      template: createRewardTemplate()
    }
  };
}

function buildMissionPayload({ activity = {}, mode } = {}) {
  const missionMode = resolveMissionMode(mode);

  if (missionMode === MISSION_MODES.PRE_V1_MANUAL) {
    return {
      mode: missionMode,
      dynamicEngineEnabled: false,
      maxActiveMissions: 2,
      missions: createPreV1ManualMissions(activity),
      dynamic: null
    };
  }

  return {
    mode: missionMode,
    dynamicEngineEnabled: true,
    maxActiveMissions: V1_DYNAMIC_CONFIG.maxActiveMissions,
    missions: [],
    dynamic: createV1DynamicArchitecture({
      publishedPacks: activity.preV1PublishedPacks || 0
    })
  };
}

module.exports = {
  MISSION_MODES,
  MISSION_STATES,
  PRE_V1_MISSIONS,
  V1_DYNAMIC_CONFIG,
  resolveMissionMode,
  createMissionProgress,
  createPreV1ManualMissions,
  resolveArtistDifficultyTier,
  createRewardTemplate,
  createV1DynamicArchitecture,
  buildMissionPayload
};
