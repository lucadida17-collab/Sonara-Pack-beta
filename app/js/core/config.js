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
  main: "https://sonara-pack-beta.onrender.com",
  mainBackup: "https://api--sonara-pack-main-backup--xm8lv9y66wnw.code.run"
});

let API_URL = IS_LOCAL
  ? API_URLS.local
  : IS_TEST
    ? API_URLS.test
    : API_URLS.main;

const SONARA_ENV = IS_LOCAL ? "local" : IS_TEST ? "test" : "main";

/* =========================================================
   SONARA MAIN API ROUTER
   ---------------------------------------------------------
   MAIN primary : Render
   MAIN backup  : Northflank

   Rules:
   - Local and Test never use the MAIN backup.
   - Render always remains the preferred MAIN server.
   - If Render is unavailable, MAIN switches to Northflank.
   - Safe requests (GET/HEAD/OPTIONS) may be retried once on
     the other MAIN server.
   - Mutating requests are NEVER replayed automatically after
     an uncertain failure, preventing duplicate registrations,
     downloads, Stripe actions, moderation actions, etc.
   - After a MAIN outage, the selected backup is kept briefly
     for the current browser session to avoid ping-pong.
========================================================= */
const SonaraApiRouter = (() => {
  const nativeFetch = window.fetch.bind(window);
  const PRIMARY_MAIN = API_URLS.main.replace(/\/+$/, "");
  const BACKUP_MAIN = API_URLS.mainBackup.replace(/\/+$/, "");
  const SINGLE_ENV_API = API_URL.replace(/\/+$/, "");

  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  const FAILOVER_STATUSES = new Set([
    408,
    425,
    429,
    502,
    503,
    504,
    521,
    522,
    523,
    524
  ]);

  const HEALTH_TIMEOUT_MS = 3500;
  const BACKUP_STICKY_MS = 60000;
  const STORAGE_KEY = "sonaraMainApiRoute";

  let activeBase = SINGLE_ENV_API;
  let resolutionPromise = null;
  let lastReason = "initial";

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.href;
    return input?.url || "";
  }

  function requestMethod(input, init = {}) {
    return String(
      init?.method ||
      (
        typeof Request !== "undefined" &&
        input instanceof Request
          ? input.method
          : "GET"
      ) ||
      "GET"
    ).toUpperCase();
  }

  function knownMainOrigin(origin) {
    if (!IS_MAIN) return false;
    return origin === new URL(PRIMARY_MAIN).origin || origin === new URL(BACKUP_MAIN).origin;
  }

  function isKnownApiUrl(input) {
    try {
      const raw = requestUrl(input);
      if (!raw) return false;
      const origin = new URL(raw, window.location.href).origin;

      if (IS_MAIN) return knownMainOrigin(origin);
      return origin === new URL(SINGLE_ENV_API).origin;
    } catch {
      return false;
    }
  }

  function apiPath(input) {
    try {
      const raw = requestUrl(input);
      if (!raw) return "";
      const parsed = new URL(raw, window.location.href);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "";
    }
  }

  function rewriteInput(input, targetBase) {
    if (!IS_MAIN || !isKnownApiUrl(input)) return input;

    const raw = requestUrl(input);
    const parsed = new URL(raw, window.location.href);
    const rewritten = `${normalizeBase(targetBase)}${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (
      typeof Request !== "undefined" &&
      input instanceof Request
    ) {
      return new Request(rewritten, input);
    }

    if (typeof URL !== "undefined" && input instanceof URL) {
      return new URL(rewritten);
    }

    return rewritten;
  }

  function storedRoute() {
    if (!IS_MAIN) return null;

    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.base !== BACKUP_MAIN || Number(parsed.until) <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function rememberBackup() {
    if (!IS_MAIN) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          base: BACKUP_MAIN,
          until: Date.now() + BACKUP_STICKY_MS
        })
      );
    } catch {
      // Le routage reste fonctionnel même si le stockage navigateur est indisponible.
    }
  }

  function forgetBackup() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Aucun impact sur le routage courant.
    }
  }

  function setActive(base, reason = "manual") {
    const normalized = normalizeBase(base);
    if (!normalized) return activeBase;

    const previous = activeBase;
    activeBase = normalized;
    API_URL = normalized;
    lastReason = reason;

    if (IS_MAIN && normalized === BACKUP_MAIN) rememberBackup();
    if (IS_MAIN && normalized === PRIMARY_MAIN) forgetBackup();

    if (previous !== normalized) {
      console.warn(
        `[Sonara API] bascule MAIN : ${previous} -> ${normalized} (${reason})`
      );

      try {
        window.dispatchEvent(new CustomEvent("sonara:api-change", {
          detail: {
            environment: SONARA_ENV,
            previous,
            current: normalized,
            reason
          }
        }));
      } catch {
        // L'évènement est informatif uniquement.
      }
    }

    return activeBase;
  }

  async function probe(base, timeoutMs = HEALTH_TIMEOUT_MS) {
    const normalized = normalizeBase(base);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await nativeFetch(`${normalized}/api/health`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          base: normalized
        };
      }

      const payload = await response.json().catch(() => null);
      return {
        ok: payload?.ok === true,
        status: response.status,
        base: normalized,
        payload
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        base: normalized,
        error
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function resolveInitialRoute() {
    if (!IS_MAIN) {
      setActive(SINGLE_ENV_API, "single_environment");
      return activeBase;
    }

    const sticky = storedRoute();
    if (sticky) {
      const backupStatus = await probe(BACKUP_MAIN, 2500);
      if (backupStatus.ok) {
        setActive(BACKUP_MAIN, "backup_session_sticky");
        return activeBase;
      }
      forgetBackup();
    }

    const primaryStatus = await probe(PRIMARY_MAIN);
    if (primaryStatus.ok) {
      setActive(PRIMARY_MAIN, "primary_ready");
      return activeBase;
    }

    const backupStatus = await probe(BACKUP_MAIN);
    if (backupStatus.ok) {
      setActive(BACKUP_MAIN, `primary_unavailable_${primaryStatus.status || "network"}`);
      return activeBase;
    }

    // Les deux sont indisponibles : on conserve Render comme référence MAIN.
    // L'écran d'entrée affichera alors son erreur normale, sans inventer un serveur valide.
    setActive(PRIMARY_MAIN, "both_unavailable");
    return activeBase;
  }

  function ready() {
    if (!resolutionPromise) {
      resolutionPromise = resolveInitialRoute().catch((error) => {
        console.warn("Résolution du serveur MAIN impossible :", error);
        return activeBase;
      });
    }
    return resolutionPromise;
  }

  function alternateBase(base) {
    if (!IS_MAIN) return "";
    return normalizeBase(base) === PRIMARY_MAIN ? BACKUP_MAIN : PRIMARY_MAIN;
  }

  async function activateAlternate(base, reason) {
    if (!IS_MAIN) return false;
    const alternate = alternateBase(base);
    if (!alternate) return false;

    const status = await probe(alternate);
    if (!status.ok) return false;

    setActive(alternate, reason);
    return true;
  }

  async function routedFetch(input, init = {}) {
    if (!isKnownApiUrl(input)) {
      return nativeFetch(input, init);
    }

    await ready();

    const method = requestMethod(input, init);
    const safeToReplay = SAFE_METHODS.has(method);
    const requestBase = activeBase;
    const routedInput = rewriteInput(input, requestBase);

    try {
      const response = await nativeFetch(routedInput, init);

      if (!IS_MAIN || !FAILOVER_STATUSES.has(response.status)) {
        return response;
      }

      const switched = await activateAlternate(
        requestBase,
        `http_${response.status}`
      );

      if (!switched || !safeToReplay) {
        // Pour POST/PUT/PATCH/DELETE on ne rejoue jamais automatiquement la requête :
        // le serveur initial pourrait l'avoir exécutée avant que sa réponse échoue.
        return response;
      }

      return nativeFetch(rewriteInput(input, activeBase), init);
    } catch (error) {
      if (!IS_MAIN) throw error;

      const switched = await activateAlternate(requestBase, "network_error");

      if (!switched || !safeToReplay) {
        // Même règle anti-duplication pour une erreur réseau sur une mutation.
        throw error;
      }

      return nativeFetch(rewriteInput(input, activeBase), init);
    }
  }

  function getState() {
    return Object.freeze({
      environment: SONARA_ENV,
      active: activeBase,
      primary: IS_MAIN ? PRIMARY_MAIN : SINGLE_ENV_API,
      backup: IS_MAIN ? BACKUP_MAIN : null,
      usingBackup: IS_MAIN && activeBase === BACKUP_MAIN,
      reason: lastReason
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
  // À ce stade window.fetch contient déjà le routeur MAIN Render -> Northflank.
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
  script.src = "/app/js/growth/organic-attribution.js?v=organic-visibility-v4-client-context";
  script.async = true;
  script.dataset.sonaraOrganicAttribution = "true";
  (document.head || document.documentElement).appendChild(script);
})();
