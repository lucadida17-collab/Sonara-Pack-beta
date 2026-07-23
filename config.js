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
  local: "http://192.168.1.18:3001",
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
