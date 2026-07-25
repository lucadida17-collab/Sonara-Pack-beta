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

console.info(`[Sonara API] ${SONARA_ENV} -> ${API_URL}`);

const SonaraSession = (() => {
  const TOKEN_KEY = "sonaraSessionToken";
  const nativeFetch = window.fetch.bind(window);

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function persist(sessionToken, profile) {
    if (sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, sessionToken);
    }

    if (profile) {
      localStorage.setItem("sonaraProfile", JSON.stringify(profile));
      localStorage.setItem("sonaraProfileCreated", "true");
    }
  }

  function clear() {
    sessionStorage.removeItem(TOKEN_KEY);
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

  return Object.freeze({
    clear,
    getToken,
    logout,
    persist
  });
})();

window.SonaraSession = SonaraSession;
