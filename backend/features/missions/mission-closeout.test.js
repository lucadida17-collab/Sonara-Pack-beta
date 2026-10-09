"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMissionPayload } = require("./mission-system");
const { grantArtistRewardOnce, ARTIST_REWARD_IDS } = require("../pre-v1/artist-rewards");
const { grantMissionRewardOnce, attachRewardState } = require("./mission-rewards");

test("Clôture exceptionnelle Pre-V1 : 2 missions à 100% sans falsifier l'activité", () => {
  const activity = { activeMonthsCount: 2, preV1PublishedPacks: 9 };
  const payload = buildMissionPayload({ mode: "PRE_V1_MANUAL", activity });
  assert.equal(payload.missions.length, 2);
  assert.deepEqual(payload.missions.map((m) => m.progressPercent), [100, 100]);
  assert.deepEqual(payload.missions.map((m) => m.closeout), [true, true]);
  assert.deepEqual(payload.missions.map((m) => m.currentValue), [2, 9]);
  assert.deepEqual(payload.missions.map((m) => m.actualProgressPercent), [50, 100]);
  assert.deepEqual(payload.missions.map((m) => m.state), ["COMPLETED_WAITING_REWARD", "COMPLETED_WAITING_REWARD"]);
});

test("Badge et boost attribués une seule fois; boost existant non réinitialisé", () => {
  const payload = buildMissionPayload({ mode: "PRE_V1_MANUAL", activity: { activeMonthsCount: 0, preV1PublishedPacks: 0 } });
  const account = {};
  const now = new Date("2026-10-09T00:00:00Z");
  const seniority = grantArtistRewardOnce(account, ARTIST_REWARD_IDS.PRE_V1_SENIORITY, { source: "PRE_V1_MISSION_CLOSEOUT" }, now);
  const boost = grantMissionRewardOnce(account, payload.missions[1], now);
  assert.equal(seniority.changed, true);
  assert.equal(boost.changed, true);
  assert.equal(boost.record.visibilityBonus, 7);
  assert.equal(boost.record.expiresAt, "2026-10-23T00:00:00.000Z");
  assert.equal(grantArtistRewardOnce(account, ARTIST_REWARD_IDS.PRE_V1_SENIORITY, {}, now).changed, false);
  assert.equal(grantMissionRewardOnce(account, payload.missions[1], new Date("2026-10-10T00:00:00Z")).changed, false);
  assert.equal(attachRewardState(payload.missions[1], account).state, "REWARDED");
  assert.equal(account.missionRewards.pre_v1_catalog.expiresAt, "2026-10-23T00:00:00.000Z");
});

test("Le mode V1 dynamique reste indépendant de la clôture Pre-V1", () => {
  const payload = buildMissionPayload({ mode: "V1_DYNAMIC", activity: {} });
  assert.deepEqual(payload.missions, []);
  assert.equal(payload.dynamicEngineEnabled, true);
});
