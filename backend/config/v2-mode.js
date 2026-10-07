"use strict";

function normalizeBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function createV2Policy({ environment } = {}) {
  const env = String(environment || "local").trim().toLowerCase();
  const enabled = normalizeBoolean(process.env.SONARA_V2_ENABLED);

  const state = Object.freeze({
    environment: env,
    enabled,
    version: enabled ? "V2" : "V1",
    syncEnabled: enabled
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
