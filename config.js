/* Sonara API globale : local, bêta Render et main Render. */
(() => {
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  const forcedEnv = params.get("api") || localStorage.getItem("sonaraApiEnvironment") || "auto";

  const endpoints = Object.freeze({
    local: "http://127.0.0.1:3001",
    test: "https://sonara-pack-beta.onrender.com",
    main: "https://sonara-pack.onrender.com"
  });

  const detectedEnv =
    host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.")
      ? "local"
      : host.includes("beta") || host.includes("test")
        ? "test"
        : "main";

  const activeEnv = forcedEnv === "auto" ? detectedEnv : forcedEnv;
  const apiUrl = endpoints[activeEnv] || endpoints[detectedEnv];

  window.SONARA_API = {
    environment: activeEnv,
    endpoints,
    url: apiUrl,
    setEnvironment(environment) {
      if (!["auto", "local", "test", "main"].includes(environment)) {
        throw new Error("Environnement Sonara invalide.");
      }
      localStorage.setItem("sonaraApiEnvironment", environment);
      window.location.reload();
    }
  };

  window.API_URL = apiUrl;
  console.info(`[Sonara API] ${activeEnv} -> ${apiUrl}`);
})();
