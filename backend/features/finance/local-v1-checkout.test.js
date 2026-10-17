"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCommercialPolicy } = require("../../config/commercial-mode");
const { checkLocalV1SaleEligibility, updateLocalV1PaymentReadyOnModeration } = require("./local-v1-checkout");

function policy(mode = "COMMERCIAL", environment = "local") {
  const previous = process.env.SONARA_COMMERCIAL_MODE;
  process.env.SONARA_COMMERCIAL_MODE = mode;
  try { return createCommercialPolicy({ environment }); }
  finally {
    if (previous === undefined) delete process.env.SONARA_COMMERCIAL_MODE;
    else process.env.SONARA_COMMERCIAL_MODE = previous;
  }
}

const local = policy();
const main = policy("PRE_V1", "main");
const testEnvironment = policy("PRE_V1", "test");

for (const environment of [main, testEnvironment, policy("PRE_V1", "local")]) {
  test(`${environment.environment} ${environment.mode} bloque la vente`, () => {
    assert.equal(checkLocalV1SaleEligibility({ status: "approved", paymentReady: true }, environment).ok, false);
  });
}

test("Un pack historique déjà approuvé avec paymentReady false peut accéder au contrôle Stripe TEST", () => {
  assert.deepEqual(checkLocalV1SaleEligibility({ status: "approved", paymentReady: false }, local), {
    ok: true,
    legacyPaymentReady: true
  });
});

test("Un pack approuvé moderne est éligible en V1 LOCAL", () => {
  assert.equal(checkLocalV1SaleEligibility({ status: "approved", paymentReady: true }, local).ok, true);
});

test("La modération et la suspension bloquent toujours la vente", () => {
  const cases = [
    [{ status: "pending" }, "PACK_NOT_APPROVED"],
    [{ status: "rejected" }, "PACK_NOT_APPROVED"],
    [{ status: "approved", moderationHidden: true }, "PACK_NOT_AVAILABLE"],
    [{ status: "approved", deleted: true }, "PACK_NOT_AVAILABLE"],
    [{ status: "approved", salePaused: true }, "PACK_SALE_PAUSED"],
    [{ status: "approved", paymentBlocked: true }, "PACK_SALE_PAUSED"]
  ];
  for (const [pack, code] of cases) {
    assert.equal(checkLocalV1SaleEligibility(pack, local).code, code);
  }
});

test("Founder active le paiement LOCAL V1 sur approbation et le coupe sur refus", () => {
  const pack = { status: "pending", paymentReady: false };
  updateLocalV1PaymentReadyOnModeration(pack, "approved", local);
  assert.equal(pack.paymentReady, true);
  updateLocalV1PaymentReadyOnModeration(pack, "pending", local);
  assert.equal(pack.paymentReady, false);
  updateLocalV1PaymentReadyOnModeration(pack, "approved", local);
  updateLocalV1PaymentReadyOnModeration(pack, "rejected", local);
  assert.equal(pack.paymentReady, false);
});

test("La Pre-V1 LOCAL ne peut activer paymentReady", () => {
  const pack = { status: "approved", paymentReady: true };
  updateLocalV1PaymentReadyOnModeration(pack, "approved", policy("PRE_V1", "local"));
  assert.equal(pack.paymentReady, false);
});

test("Le checkout local appelle bien la politique avant Stripe et vérifie le compte artiste", () => {
  const root = path.resolve(__dirname, "../../..");
  const server = fs.readFileSync(path.join(root, "server-local.js"), "utf8");
  const checkout = server.slice(server.indexOf('app.post("/api/stripe/create-checkout-session"'), server.indexOf('app.patch("/api/packs/:id/status"'));
  assert.match(checkout, /checkLocalV1SaleEligibility\(pack, commercialPolicy\)/);
  assert.match(checkout, /isCreatorAccountActive\(artist\)/);
  assert.match(checkout, /stripe\.accounts\.retrieve\(artist\.stripeAccountId\)/);
  assert.match(checkout, /stripeArtistAccount\.charges_enabled\s*&&\s*stripeArtistAccount\.payouts_enabled/);
  assert.match(checkout, /stripe\.checkout\.sessions\.create\(/);
  assert.ok(checkout.indexOf("checkLocalV1SaleEligibility") < checkout.indexOf("stripe.checkout.sessions.create"));
  assert.ok(checkout.indexOf("stripe.accounts.retrieve") < checkout.indexOf("stripe.checkout.sessions.create"));
  assert.doesNotMatch(checkout, /if \(pack\.paymentReady !== true\)\s*\{\s*return res\.status\(409\)/);
  const front = fs.readFileSync(path.join(root, "app/js/catalog/pack.js"), "utf8");
  assert.match(front, /if \(commercialState\.freeAcquisitionEnabled === true\)/);
  assert.doesNotMatch(front, /if \(commercialState\.freeAcquisitionEnabled \|\| isFreeCatalogItem/);
});
