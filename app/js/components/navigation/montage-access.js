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
      (Array.isArray(profile?.downloadedTracks) && profile.downloadedTracks.length > 0) ||
      (Array.isArray(profile?.downloadHistory) && profile.downloadHistory.some((entry) =>
        entry && (entry.packId || entry.trackId)
      ))
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

  function normalizeFreshProfile(payload) {
    return payload?.account || payload?.profile || payload || null;
  }

  async function fetchFreshProfile(profile) {
    const profileIds = [...new Set([
      profile?.accountId,
      profile?.id,
      profile?.userId
    ].map((value) => String(value || "").trim()).filter(Boolean))];

    if (!profileIds.length || typeof API_URL !== "string" || !API_URL) {
      return profile;
    }

    let lastResponse = null;

    for (const profileId of profileIds) {
      // Même source que la Bibliothèque : elle contient les acquisitions du compte.
      const libraryResponse = await fetch(
        `${API_URL}/api/users/${encodeURIComponent(profileId)}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" }
        }
      );

      lastResponse = libraryResponse;
      if (libraryResponse.ok) {
        const payload = await libraryResponse.json().catch(() => null);
        const freshProfile = normalizeFreshProfile(payload);
        if (freshProfile) return mergeAndStoreProfile(profile, freshProfile);
      }

      if (libraryResponse.status !== 404) break;

      // Compatibilité anciennes sessions : /api/profile sait aussi résoudre
      // l'ancien id racine lorsqu'il n'y a qu'un compte possible.
      const profileResponse = await fetch(
        `${API_URL}/api/profile/${encodeURIComponent(profileId)}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" }
        }
      );

      lastResponse = profileResponse;
      if (profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => null);
        const freshProfile = normalizeFreshProfile(payload);
        if (freshProfile) return mergeAndStoreProfile(profile, freshProfile);
      }

      if (profileResponse.status !== 404) break;
    }

    if (lastResponse && !lastResponse.ok) {
      throw new Error(`Profil Montage indisponible (${lastResponse.status}).`);
    }

    return profile;
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
    // Le garde de session est la première source de vérité. Sans cette attente,
    // Sync pouvait lire un vieux profil local avant la restauration du compte
    // et rediriger à tort vers le Home.
    try {
      const authResult = await window.SonaraAuth?.ready;
      if (authResult?.profile) {
        mergeAndStoreProfile(getStoredProfile(), authResult.profile);
      }
    } catch (error) {
      console.warn("Montage : session non resynchronisée avant le contrôle d'accès.", error);
    }

    const result = await refresh();
    resolveReady(result);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
