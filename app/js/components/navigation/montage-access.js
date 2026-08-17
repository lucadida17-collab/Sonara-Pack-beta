(() => {
  "use strict";

  const ENTRY_SELECTOR = "[data-sonara-montage-entry]";
  const MONTAGE_URL = "/app/pages/catalog/montage.html";

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

  function getAccountId(profile) {
    return profile?.accountId || profile?.id || "";
  }

  function hasDownloadedContent(profile) {
    return Boolean(
      (Array.isArray(profile?.downloadedPacks) && profile.downloadedPacks.length > 0) ||
      (Array.isArray(profile?.downloadedTracks) && profile.downloadedTracks.length > 0)
    );
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
        window.location.assign(MONTAGE_URL);
      });
    });
  }

  function mergeAndStoreProfile(baseProfile, freshProfile) {
    const merged = {
      ...(baseProfile || {}),
      ...(freshProfile || {})
    };

    try {
      localStorage.setItem("sonaraProfile", JSON.stringify(merged));
    } catch (error) {
      console.warn("Montage : profil actualisé non sauvegardé.", error);
    }

    return merged;
  }

  async function fetchFreshProfile(profile) {
    const accountId = getAccountId(profile);

    if (!accountId || typeof API_URL !== "string" || !API_URL) {
      return profile;
    }

    const response = await fetch(
      `${API_URL}/api/users/${encodeURIComponent(accountId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" }
      }
    );

    if (!response.ok) {
      throw new Error(`Profil Montage indisponible (${response.status}).`);
    }

    const payload = await response.json().catch(() => ({}));
    const freshProfile = payload?.account || payload;
    return mergeAndStoreProfile(profile, freshProfile);
  }

  async function refresh() {
    bindEntries();

    let profile = getStoredProfile();
    let allowed = hasDownloadedContent(profile);

    // Affichage instantané depuis le cache local, puis confirmation serveur.
    setEntriesVisible(allowed);

    try {
      profile = await fetchFreshProfile(profile);
      allowed = hasDownloadedContent(profile);
      setEntriesVisible(allowed);
    } catch (error) {
      // En cas de serveur momentanément indisponible, on garde l'état local connu.
      console.warn("Montage : vérification serveur indisponible.", error);
    }

    const result = { allowed, profile };
    window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
    return result;
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
