"use strict";

function normalizeBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function createV2Policy({ environment } = {}) {
  const env = String(environment || "local").trim().toLowerCase();
  // IMPORTANT: this is the OFFICIAL V2 launch switch, not a preparation switch.
  // While false, PRE-V1 and V1 must not expose or register Sonara Sync.
  const launched = normalizeBoolean(process.env.SONARA_V2_ENABLED);

  const state = Object.freeze({
    environment: env,
    enabled: launched,
    phase: launched ? "LAUNCHED" : "PREPARATION",
    version: launched ? "V2" : "PRE_V2",
    syncEnabled: launched
  });

  function publicState() {
    return state;
  }

  return Object.freeze({
    ...state,
    publicState
  });
}

module.exports = {
  createV2Policy
};
