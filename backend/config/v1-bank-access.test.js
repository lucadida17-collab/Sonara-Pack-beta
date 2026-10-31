"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createCommercialPolicy } = require("./commercial-mode");

const dashboardSource = fs.readFileSync(
  path.join(__dirname, "../../app/js/creator/dashboard/creator.js"),
  "utf8",
);
const managementSource = dashboardSource.slice(
  dashboardSource.indexOf("function isCreatorBankAvailable("),
);

function policy(mode, environment) {
  const prior = process.env.SONARA_COMMERCIAL_MODE;
  process.env.SONARA_COMMERCIAL_MODE = mode;
  try {
    return createCommercialPolicy({ environment });
  } finally {
    if (prior === undefined) delete process.env.SONARA_COMMERCIAL_MODE;
    else process.env.SONARA_COMMERCIAL_MODE = prior;
  }
}

function mountManagement({ state, delayed = false }) {
  const creatorPage = { innerHTML: "" };
  const listeners = {};
  let resolveReady;
  const readyPromise = delayed
    ? new Promise((resolve) => {
        resolveReady = resolve;
      })
    : Promise.resolve(state);
  const context = vm.createContext({
    creatorPage,
    creatorParams: {
      get(name) {
        return name === "mode" ? "management" : null;
      },
    },
    document: {
      querySelector(selector) {
        return {
          addEventListener(event, fn) {
            listeners[`${selector}:${event}`] = fn;
          },
        };
      },
    },
    window: {
      location: { href: "/app/pages/creator/dashboard.html?mode=management" },
      SonaraCommercial: {
        getState: () => ({ confirmedByApi: false, mode: "PRE_V1" }),
        ready: () => readyPromise,
      },
    },
    console,
  });
  vm.runInContext(managementSource, context);
  return { creatorPage, listeners, context, resolveReady };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("V1 LOCAL autorise la banque, mais impose une banque vérifiée pour créer un pack", () => {
  const state = policy("COMMERCIAL", "local");
  assert.equal(state.mode, "COMMERCIAL");
  assert.equal(state.bankAccessible, true);
  assert.equal(state.bankRequiredForPackCreation, true);
  assert.equal(state.paymentsActive, true);
});

test("PRE-V1 MAIN et TEST conservent leur banque désactivée", () => {
  for (const environment of ["main", "test"]) {
    const state = policy("PRE_V1", environment);
    assert.equal(state.mode, "PRE_V1");
    assert.equal(state.bankAccessible, false);
    assert.equal(state.bankRequiredForPackCreation, false);
    assert.equal(state.paymentsActive, false);
  }
});

test("Le dashboard attend la réponse API avant d'afficher la banque V1", async () => {
  const state = {
    ...policy("COMMERCIAL", "local").publicState(),
    confirmedByApi: true,
  };
  const mounted = mountManagement({ state, delayed: true });
  assert.match(
    mounted.creatorPage.innerHTML,
    /Vérification du mode commercial/,
  );
  assert.doesNotMatch(
    mounted.creatorPage.innerHTML,
    /disponible au lancement de la V1/,
  );
  mounted.resolveReady(state);
  await flushMicrotasks();
  assert.match(mounted.creatorPage.innerHTML, /Ajoute ton compte bancaire/);
  assert.doesNotMatch(mounted.creatorPage.innerHTML, /pre-v1-bank-lock/);
  assert.match(mounted.creatorPage.innerHTML, /aria-disabled="false"/);
  await mounted.listeners[".stripe-connect-btn:click"]();
  assert.equal(
    mounted.context.window.location.href,
    "/app/pages/creator/management/bank.html",
  );
});

test("PRE-V1 et échec API ne permettent pas d'ouvrir la banque", async () => {
  const preV1 = {
    ...policy("PRE_V1", "main").publicState(),
    confirmedByApi: true,
  };
  const mounted = mountManagement({ state: preV1 });
  await flushMicrotasks();
  assert.match(
    mounted.creatorPage.innerHTML,
    /disponible au lancement de la V1/,
  );
  assert.match(mounted.creatorPage.innerHTML, /aria-disabled="true"/);
  await mounted.listeners[".stripe-connect-btn:click"]();
  assert.equal(
    mounted.context.window.location.href,
    "/app/pages/creator/dashboard.html?mode=management",
  );

  const fallback = { ...preV1, confirmedByApi: false };
  const unavailable = mountManagement({ state: fallback });
  await flushMicrotasks();
  assert.match(
    unavailable.creatorPage.innerHTML,
    /Connexion au serveur indisponible/,
  );
  assert.doesNotMatch(
    unavailable.creatorPage.innerHTML,
    /Ajoute ton compte bancaire/,
  );
});
