const SONARA_VERSION = "Bêta - Pré sorti V1";

window.SONARA_VERSION =
  SONARA_VERSION;

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
  main: "https://sonara-pack.onrender.com"
});

const API_URL = IS_LOCAL
  ? API_URLS.local
  : IS_TEST
    ? API_URLS.test
    : API_URLS.main;

const SONARA_ENV = IS_LOCAL ? "local" : IS_TEST ? "test" : "main";

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
SonaraCommercial.refresh();

console.info(`[Sonara API] ${SONARA_ENV} -> ${API_URL}`);

const SonaraSession = (() => {
  const TOKEN_KEY = "sonaraSessionToken";
  const nativeFetch = window.fetch.bind(window);

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
      return nativeFetch(input, init);
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

    return nativeFetch(input, {
      ...init,
      headers
    });
  };

  async function logout() {
    const token = getToken();

    try {
      if (token) {
        await nativeFetch(`${API_URL}/api/auth/logout`, {
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

    const response = await nativeFetch(
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
