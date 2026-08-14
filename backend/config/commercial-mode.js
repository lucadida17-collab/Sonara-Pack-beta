"use strict";

const COMMERCIAL_MODES = Object.freeze({
  PRE_V1: "PRE_V1",
  COMMERCIAL: "COMMERCIAL"
});

function normalizeCommercialMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === COMMERCIAL_MODES.COMMERCIAL
    ? COMMERCIAL_MODES.COMMERCIAL
    : COMMERCIAL_MODES.PRE_V1;
}

function createCommercialPolicy({ environment, paymentSwitch = true } = {}) {
  const env = String(environment || "local").trim().toLowerCase();
  const mode = normalizeCommercialMode(process.env.SONARA_COMMERCIAL_MODE);
  const commercialRequested = mode === COMMERCIAL_MODES.COMMERCIAL;
  const paymentsActive = Boolean(commercialRequested && paymentSwitch);

  const state = Object.freeze({
    environment: env,
    mode,
    paymentsActive,
    bankAccessible: paymentsActive,
    stripeEnabled: paymentsActive,
    checkoutEnabled: paymentsActive,
    freeAcquisitionEnabled: mode === COMMERCIAL_MODES.PRE_V1,
    bankRequiredForPackCreation: paymentsActive
  });

  function publicState() {
    return {
      ...state,
      paymentRequired: paymentsActive
    };
  }

  function blockStripeApi(_req, res, next) {
    if (state.stripeEnabled) return next();

    return res.status(503).json({
      success: false,
      code: "COMMERCIAL_MODE_BLOCKED",
      message: "Les paiements seront disponibles lors du lancement commercial."
    });
  }

  return Object.freeze({
    ...state,
    publicState,
    blockStripeApi
  });
}

module.exports = {
  COMMERCIAL_MODES,
  normalizeCommercialMode,
  createCommercialPolicy
};
