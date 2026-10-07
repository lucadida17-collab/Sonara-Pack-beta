(() => {
  "use strict";

  const ENTRY_SELECTOR = "[data-sonara-montage-entry]";
  const MONTAGE_URL = "/app/pages/catalog/montage.html";
  const V2_DIRECT_PATHS = new Set([
    "/app/pages/catalog/montage.html",
    "/app/pages/catalog/sync-saves.html"
  ]);

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function getStoredProfile() {
    try {
      return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
    } catch (error) {
      console.warn("Montage : profil local illisible.", error);
      return null;
    }
  }

  function getEntries() {
    return Array.from(document.querySelectorAll(ENTRY_SELECTOR));
  }

  function setEntriesVisible(visible) {
    getEntries().forEach((entry) => {
      entry.hidden = !visible;
      entry.setAttribute("aria-hidden", visible ? "false" : "true");
    });
  }

  function bindEntries() {
    getEntries().forEach((entry) => {
      if (entry.dataset.sonaraMontageBound === "true") return;
      entry.dataset.sonaraMontageBound = "true";
      entry.addEventListener("click", () => {
        if (!window.SonaraV2?.isSyncEnabled?.()) return;
        window.location.assign(MONTAGE_URL);
      });
    });
  }

  function isDirectV2Page() {
    return V2_DIRECT_PATHS.has(window.location.pathname);
  }

  async function resolveV2State() {
    try {
      if (window.SonaraV2?.ready) {
        return await window.SonaraV2.ready();
      }
    } catch (error) {
      console.warn("V2 : état indisponible.", error);
    }
    return { enabled: false, syncEnabled: false };
  }

  async function refresh() {
    bindEntries();
    setEntriesVisible(false);

    const v2State = await resolveV2State();
    const syncEnabled = v2State?.enabled === true && v2State?.syncEnabled === true;

    // Sonara Sync est désormais une fonctionnalité V2 :
    // invisible et inaccessible tant que SONARA_V2_ENABLED n'est pas activé.
    if (!syncEnabled) {
      if (isDirectV2Page()) {
        window.location.replace("/home.html");
      }

      const result = { allowed: false, profile: null, v2Enabled: false };
      window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
      return result;
    }

    let profile = getStoredProfile();

    try {
      const authResult = await window.SonaraAuth?.ready;
      if (authResult?.profile) profile = authResult.profile;
    } catch (error) {
      console.warn("Montage : session non resynchronisée.", error);
    }

    const allowed = Boolean(profile);
    setEntriesVisible(allowed);

    const result = { allowed, profile, v2Enabled: true };
    window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
    return result;
  }

  function hasDownloadedContent() {
    return true;
  }

  window.SonaraMontageAccess = Object.freeze({
    ready,
    refresh,
    hasDownloadedContent,
    url: MONTAGE_URL
  });

  async function initialize() {
    const result = await refresh();
    resolveReady(result);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
