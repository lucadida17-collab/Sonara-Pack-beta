const IS_LOCAL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.");

const IS_BETA = window.location.hostname.includes("sonara-pack-beta");

const API_URL = IS_LOCAL
  ? "http://192.168.1.18:3001"
  : IS_BETA
    ? "https://sonara-pack-beta-1.onrender.com"
    : "https://sonara-pack.onrender.com";
