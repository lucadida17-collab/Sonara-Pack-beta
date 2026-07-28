const SHARE_REDIRECT_KEY = "sonaraRedirectAfterAuth";
const SHARE_MIN_LOADING_TIME = 6000;
const SHARE_REQUEST_TIMEOUT = 20000;

const shareParams = new URLSearchParams(window.location.search);
const sharedPackId = shareParams.get("id");

function getStoredShareProfile() {
  const rawProfile = localStorage.getItem("sonaraProfile");

  if (!rawProfile) return null;

  try {
    return JSON.parse(rawProfile);
  } catch (error) {
    console.error("Profil Sonara local invalide :", error);
    return null;
  }
}

function getShareProfileId(profile = {}) {
  return profile.accountId || profile.id || null;
}

function getSharedPackDestination() {
  if (!sharedPackId) return null;

  return `/app/pages/pack.html?id=${encodeURIComponent(sharedPackId)}`;
}

function updateShareLoading(progress, message) {
  const loader = document.querySelector(".my-pack-page-loader");
  const fill = loader?.querySelector(".my-pack-loader-progress-fill");
  const label = loader?.querySelector(".my-pack-loader-message");
  const value = Math.min(100, Math.max(0, Number(progress) || 0));

  if (fill) {
    fill.style.width = `${value}%`;
  }

  if (label && message) {
    label.textContent = message;
  }

  loader?.setAttribute("aria-valuenow", String(value));
}

function waitForShareMinimum(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, SHARE_MIN_LOADING_TIME - elapsed);

  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

async function fetchSharedAccount(profileId) {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, SHARE_REQUEST_TIMEOUT);

  try {
    const response = await fetch(
      `${API_URL}/api/profile/${encodeURIComponent(profileId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    if ([401, 403, 404].includes(response.status)) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Vérification du compte impossible (${response.status}).`
      );
    }

    const data = await response.json();

    return data.profile || data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isShareProfileAllowed(profile = {}) {
  if (!getShareProfileId(profile)) return false;

  const forbiddenStatuses = [
    "banned",
    "deleted",
    "disabled",
    "suspended"
  ];

  return !forbiddenStatuses.includes(
    String(profile.status || "").toLowerCase()
  );
}

async function verifySharedAccount() {
  const localProfile = getStoredShareProfile();
  const profileId = getShareProfileId(localProfile);

  if (!profileId) {
    return false;
  }

  updateShareLoading(
    24,
    "Vérification de votre compte Sonara…"
  );

  try {
    let sessionToken =
      window.SonaraSession?.getToken?.() ||
      "";

    if (!sessionToken && window.SonaraSession?.restore) {
      const restoredProfile =
        await window.SonaraSession.restore(localProfile);

      if (restoredProfile) {
        localStorage.setItem(
          "sonaraProfile",
          JSON.stringify(restoredProfile)
        );

        localStorage.setItem(
          "sonaraProfileCreated",
          "true"
        );
      }

      sessionToken =
        window.SonaraSession.getToken();
    }

    if (!sessionToken) {
      return false;
    }

    const serverProfile =
      await fetchSharedAccount(profileId);

    if (
      serverProfile &&
      isShareProfileAllowed(serverProfile)
    ) {
      localStorage.setItem(
        "sonaraProfile",
        JSON.stringify(serverProfile)
      );

      localStorage.setItem(
        "sonaraProfileCreated",
        "true"
      );

      return true;
    }

    /*
      Une réponse distante temporairement indisponible
      ne déconnecte jamais un compte local déjà valide.
    */
    return isShareProfileAllowed(localProfile);
  } catch (error) {
    console.warn(
      "Vérification distante impossible, compte local conservé :",
      error
    );

    return isShareProfileAllowed(localProfile);
  }
}

function goToShareAuthentication(destination) {
  if (destination) {
    sessionStorage.setItem(
      SHARE_REDIRECT_KEY,
      destination
    );
  }

  const authUrl = new URL(
    "/app/pages/inscription.html",
    window.location.origin
  );

  if (destination) {
    authUrl.searchParams.set(
      "redirect",
      destination
    );
  }

  window.location.replace(
    `${authUrl.pathname}${authUrl.search}`
  );
}

async function initializeSharedPackLoading() {
  const startedAt = Date.now();
  const destination = getSharedPackDestination();

  try {
    updateShareLoading(
      10,
      "Vérification du lien partagé…"
    );

    if (!destination) {
      throw new Error("Lien de pack partagé invalide.");
    }

    const hasValidAccount =
      await verifySharedAccount();

    if (!hasValidAccount) {
      updateShareLoading(
        58,
        "Compte Sonara requis pour ouvrir ce pack…"
      );

      await waitForShareMinimum(startedAt);

      updateShareLoading(
        100,
        "Ouverture de l’inscription…"
      );

      await new Promise((resolve) => {
        window.setTimeout(resolve, 280);
      });

      goToShareAuthentication(destination);
      return;
    }

    updateShareLoading(
      55,
      "Compte Sonara vérifié…"
    );

    updateShareLoading(
      82,
      "Préparation du pack partagé…"
    );

    await waitForShareMinimum(startedAt);

    updateShareLoading(
      100,
      "Ouverture du pack…"
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 280);
    });

    window.location.replace(destination);
  } catch (error) {
    console.error(
      "Erreur ouverture du partage :",
      error
    );

    const message =
      error?.name === "AbortError"
        ? "Le serveur Sonara met trop de temps à répondre."
        : error?.message ||
          "Impossible d’ouvrir ce partage.";

    updateShareLoading(100, message);
  }
}

initializeSharedPackLoading();
