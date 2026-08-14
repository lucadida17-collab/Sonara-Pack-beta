"use strict";

const REWARD_TIERS = Object.freeze(["NONE", "SMALL", "MEDIUM", "LARGE", "EXCEPTIONAL"]);
const REWARD_TYPES = Object.freeze(["NONE", "VISIBILITY_BOOST", "FUTURE_REWARD"]);
const REWARD_CONFIG = Object.freeze({
  NONE: Object.freeze({ type: "NONE", visibilityBonus: 0, durationDays: 0 }),
  SMALL: Object.freeze({ type: "NONE", visibilityBonus: 0, durationDays: 0 }),
  MEDIUM: Object.freeze({ type: "VISIBILITY_BOOST", visibilityBonus: 7, durationDays: 14 }),
  LARGE: Object.freeze({ type: "VISIBILITY_BOOST", visibilityBonus: 12, durationDays: 21 }),
  EXCEPTIONAL: Object.freeze({ type: "FUTURE_REWARD", visibilityBonus: 0, durationDays: 0 })
});

function safeDate(value) { const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null; }
function nowIso(now = new Date()) { return new Date(now).toISOString(); }
function ensureRewardStore(account = {}) {
  if (!account.missionRewards || typeof account.missionRewards !== "object" || Array.isArray(account.missionRewards)) {
    account.missionRewards = {};
  }
  return account.missionRewards;
}
function getRewardRecord(account = {}, missionId) {
  return ensureRewardStore(account)[String(missionId || "")] || null;
}
function isBoostActive(record, now = new Date()) {
  if (!record || record.rewardType !== "VISIBILITY_BOOST" || !record.expiresAt) return false;
  const expires = safeDate(record.expiresAt); return Boolean(expires && expires.getTime() > new Date(now).getTime());
}
function getActiveVisibilityBoost(account = {}, now = new Date()) {
  const records = Object.values(ensureRewardStore(account));
  const active = records.filter((record) => isBoostActive(record, now));
  if (!active.length) return null;
  return active.reduce((best, record) => Number(record.visibilityBonus || 0) > Number(best.visibilityBonus || 0) ? record : best, active[0]);
}
function grantMissionRewardOnce(account = {}, mission = {}, now = new Date()) {
  const missionId = String(mission.id || "");
  if (!missionId || mission.state === "IN_PROGRESS" || String(mission.rewardType || "NONE") !== "VISIBILITY_BOOST") {
    return { changed: false, record: getRewardRecord(account, missionId) };
  }
  const store = ensureRewardStore(account);
  if (store[missionId]?.rewardGranted) return { changed: false, record: store[missionId] };

  const rewardTier = String(mission.rewardTier || "NONE");
  const rewardType = String(mission.rewardType || "NONE");
  const configured = REWARD_CONFIG[rewardTier] || REWARD_CONFIG.NONE;
  const startedAt = nowIso(now);
  const durationDays = rewardType === "VISIBILITY_BOOST" ? Number(configured.durationDays || 0) : 0;
  const expiresAt = durationDays > 0 ? new Date(new Date(now).getTime() + durationDays * 86400000).toISOString() : null;
  const record = {
    missionId,
    rewardGranted: true,
    rewardTier,
    rewardType,
    grantedAt: startedAt,
    startedAt: rewardType === "VISIBILITY_BOOST" ? startedAt : null,
    expiresAt,
    visibilityBonus: rewardType === "VISIBILITY_BOOST" ? Number(configured.visibilityBonus || 0) : 0
  };
  store[missionId] = record;
  return { changed: true, record };
}
function attachRewardState(mission = {}, account = {}, now = new Date()) {
  const record = getRewardRecord(account, mission.id);
  const boostActive = isBoostActive(record, now);
  return {
    ...mission,
    rewardGranted: Boolean(record?.rewardGranted),
    rewardState: record ? { ...record, active: boostActive } : null,
    state: record?.rewardGranted ? "REWARDED" : mission.state
  };
}
module.exports = { REWARD_TIERS, REWARD_TYPES, REWARD_CONFIG, grantMissionRewardOnce, attachRewardState, getActiveVisibilityBoost, isBoostActive };
