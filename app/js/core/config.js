const SONARA_VERSION = "Pre V1.01";

window.SONARA_VERSION =
  SONARA_VERSION;

function syncSonaraVersionLabels() {
  document.querySelectorAll(".desktop-brand-version").forEach((element) => {
    element.textContent = `Version ${SONARA_VERSION}`;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncSonaraVersionLabels, { once: true });
} else {
  syncSonaraVersionLabels();
}

const HOSTNAME = window.location.hostname.toLowerCase();

const IS_LOCAL =
  HOSTNAME === "localhost" ||
  HOSTNAME === "127.0.0.1" ||
  HOSTNAME.startsWith("192.168.") ||
  HOSTNAME.startsWith("10.");

const IS_TEST =
  HOSTNAME === "sonarapack-test.netlify.app" ||
  HOSTNAME.includes("sonarapack-test") ||
  HOSTNAME.includes("sonara-pack-beta");

const IS_MAIN = !IS_LOCAL && !IS_TEST;

const API_URLS = Object.freeze({
  local: `${window.location.protocol}//${window.location.hostname}:3001`,
  test: "https://sonara-pack-beta-1.onrender.com",
  main: "https://sonara-pack-beta.onrender.com"
});

let API_URL = IS_LOCAL
  ? API_URLS.local
  : IS_TEST
    ? API_URLS.test
    : API_URLS.main;

const SONARA_ENV = IS_LOCAL ? "local" : IS_TEST ? "test" : "main";

/* =========================================================
   SONARA API ROUTER — RENDER ONLY
   ---------------------------------------------------------
   - Local reste sur le serveur local :3001.
   - Test reste sur son service Render Test.
   - Main utilise uniquement Render Main.
   - Aucun failover externe n'est utilisé.
   - L'interface publique du routeur est conservée pour ne pas
     casser les pages qui utilisent getState(), ready() ou fetch().
========================================================= */
const SonaraApiRouter = (() => {
  const nativeFetch = window.fetch.bind(window);
  const ACTIVE_API = String(API_URL || "").replace(/\/+$/, "");

  // Nettoyage de l'ancien choix de route conservé dans les sessions
  // créées avant le passage à Render uniquement.
  try {
    sessionStorage.removeItem("sonaraMainApiRoute");
  } catch {
    // Le routage reste fonctionnel même si sessionStorage est indisponible.
  }

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.href;
    return input?.url || "";
  }

  function isKnownApiUrl(input) {
    try {
      const raw = requestUrl(input);
      if (!raw || !ACTIVE_API) return false;
      return new URL(raw, window.location.href).origin === new URL(ACTIVE_API).origin;
    } catch {
      return false;
    }
  }

  async function probe(base = ACTIVE_API, timeoutMs = 3500) {
    const normalized = normalizeBase(base || ACTIVE_API);
    if (!normalized) return { ok: false, status: 0, base: normalized };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await nativeFetch(`${normalized}/api/health`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      return {
        ok: response.ok && payload?.ok === true,
        status: response.status,
        base: normalized,
        payload
      };
    } catch (error) {
      return { ok: false, status: 0, base: normalized, error };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function ready() {
    API_URL = ACTIVE_API;
    return Promise.resolve(ACTIVE_API);
  }

  async function routedFetch(input, init = {}) {
    // Plus de bascule de serveur : une requête destinée à l'API de
    // l'environnement courant reste toujours sur cette API.
    return nativeFetch(input, init);
  }

  function getState() {
    return Object.freeze({
      environment: SONARA_ENV,
      active: ACTIVE_API,
      primary: ACTIVE_API,
      backup: null,
      usingBackup: false,
      reason: IS_MAIN ? "render_only" : "single_environment"
    });
  }

  return Object.freeze({
    fetch: routedFetch,
    getState,
    isKnownApiUrl,
    probe,
    ready
  });
})();

window.SonaraApiRouter = SonaraApiRouter;
window.fetch = SonaraApiRouter.fetch;

const SonaraCommercial = (() => {
  const fallbackState = Object.freeze({
    environment: SONARA_ENV,
    mode: "PRE_V1",
    paymentsActive: false,
    bankAccessible: false,
    stripeEnabled: false,
    checkoutEnabled: false,
    freeAcquisitionEnabled: true,
    bankRequiredForPackCreation: false,
    paymentRequired: false
  });

  let state = fallbackState;
  let loadingPromise = null;

  function getState() {
    return state;
  }

  function isPreV1() {
    return state.mode === "PRE_V1";
  }

  function isCommercial() {
    return state.mode === "COMMERCIAL";
  }

  async function refresh() {
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/commercial-mode`, {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.mode) {
          throw new Error("Mode commercial indisponible.");
        }

        state = Object.freeze({
          ...fallbackState,
          ...data,
          environment: data.environment || SONARA_ENV
        });
      } catch (error) {
        console.warn("Mode commercial indisponible, sécurité PRE_V1 conservée :", error);
        state = fallbackState;
      } finally {
        loadingPromise = null;
      }

      return state;
    })();

    return loadingPromise;
  }

  function ready() {
    return refresh();
  }

  return Object.freeze({
    getState,
    isPreV1,
    isCommercial,
    ready,
    refresh
  });
})();

window.SonaraCommercial = SonaraCommercial;

// L'écran d'entrée vérifie déjà /api/health. Il ne lance pas en parallèle
// /api/commercial-mode afin d'éviter plusieurs requêtes au réveil du serveur.
const IS_ENTRY_PAGE = /^\/(?:index\.html)?$/.test(window.location.pathname);
if (!IS_ENTRY_PAGE) {
  SonaraCommercial.refresh();
}

console.info(`[Sonara API] ${SONARA_ENV} -> ${API_URL}`);

const SonaraSession = (() => {
  const TOKEN_KEY = "sonaraSessionToken";
  // À ce stade window.fetch utilise uniquement l'API de l'environnement courant.
  const routedFetch = window.fetch.bind(window);

  function getToken() {
    const persistentToken = localStorage.getItem(TOKEN_KEY);
    if (persistentToken) {
      return persistentToken;
    }

    // Migre sans déconnexion les sessions créées avant le retour
    // de la reconnexion persistante.
    const temporaryToken = sessionStorage.getItem(TOKEN_KEY);
    if (temporaryToken) {
      localStorage.setItem(TOKEN_KEY, temporaryToken);
      sessionStorage.removeItem(TOKEN_KEY);
    }

    return temporaryToken || "";
  }

  function persist(sessionToken, profile) {
    if (sessionToken) {
      localStorage.setItem(TOKEN_KEY, sessionToken);
      sessionStorage.removeItem(TOKEN_KEY);
    }

    if (profile) {
      localStorage.setItem("sonaraProfile", JSON.stringify(profile));
      localStorage.setItem("sonaraProfileCreated", "true");
    }
  }

  function clear() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("sonaraKnownAccounts");
    localStorage.removeItem("sonaraProfile");
    localStorage.removeItem("sonaraProfileCreated");
    localStorage.removeItem("sonaraKnownAccounts");
  }

  function targetsSonaraApi(input) {
    if (window.SonaraApiRouter?.isKnownApiUrl) {
      return window.SonaraApiRouter.isKnownApiUrl(input);
    }

    try {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input?.url;

      return Boolean(
        requestUrl &&
        new URL(requestUrl, window.location.href).origin ===
          new URL(API_URL).origin
      );
    } catch {
      return false;
    }
  }

  window.fetch = (input, init = {}) => {
    const token = getToken();

    if (!token || !targetsSonaraApi(input)) {
      return routedFetch(input, init);
    }

    const headers = new Headers(
      init.headers ||
      (
        typeof Request !== "undefined" &&
        input instanceof Request
          ? input.headers
          : undefined
      )
    );

    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return routedFetch(input, {
      ...init,
      headers
    });
  };

  async function logout() {
    const token = getToken();

    try {
      if (token) {
        await routedFetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.warn("Fermeture de session distante impossible :", error);
    } finally {
      clear();
    }
  }

  async function restore(profile) {
    const userId = String(profile?.userId || "");
    const accountId = String(
      profile?.accountId ||
      profile?.id ||
      ""
    );
    const mail = String(profile?.mail || "");

    if (!userId || !accountId || !mail) {
      return null;
    }

    const response = await routedFetch(
      `${API_URL}/api/auth/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          accountId,
          mail
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.sessionToken || !data.profile) {
      return null;
    }

    persist(data.sessionToken, data.profile);
    return data.profile;
  }

  return Object.freeze({
    clear,
    getToken,
    logout,
    persist,
    restore
  });
})();

window.SonaraSession = SonaraSession;

/* =========================================================
   ORGANIC JOURNEY LOADER
   Additif uniquement : charge le tracker sur toutes les pages
   qui utilisent déjà config.js, sans modifier leur logique.
========================================================= */
(() => {
  if (window.__SONARA_ORGANIC_ATTRIBUTION_ACTIVE__ === true) return;
  if (document.querySelector('script[data-sonara-organic-attribution="true"]')) return;

  const script = document.createElement("script");
  script.src = "/app/js/growth/organic-attribution.js?v=organic-acquisition-internal-v2";
  script.async = true;
  script.dataset.sonaraOrganicAttribution = "true";
  (document.head || document.documentElement).appendChild(script);
})();
