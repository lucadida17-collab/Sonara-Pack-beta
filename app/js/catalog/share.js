const SHARE_REDIRECT_KEY = "sonaraRedirectAfterAuth";
const SHARE_MIN_LOADING_TIME = 6000;
const SHARE_REQUEST_TIMEOUT = 60000;
const SHARE_NAVIGATION_FALLBACK_DELAY = 1400;

const shareParams =
  new URLSearchParams(window.location.search);

const sharedPackId =
  String(shareParams.get("id") || "").trim();

let shareInitializationStarted = false;
let shareNavigationStarted = false;

function normalizeShareProfile(profile) {
  return profile && typeof profile === "object"
    ? profile
    : null;
}

function getStoredShareProfile() {
  const rawProfile =
    localStorage.getItem("sonaraProfile");

  if (!rawProfile) return null;

  try {
    return normalizeShareProfile(
      JSON.parse(rawProfile)
    );
  } catch (error) {
    console.error(
      "Profil Sonara local invalide :",
      error
    );

    return null;
  }
}

function getShareProfileId(profile) {
  const normalizedProfile =
    normalizeShareProfile(profile);

  if (!normalizedProfile) {
    return null;
  }

  return (
    normalizedProfile.accountId ||
    normalizedProfile.id ||
    null
  );
}

function getSharedPackDestination() {
  if (!sharedPackId) return null;

  return (
    "/app/pages/catalog/pack.html?id=" +
    encodeURIComponent(sharedPackId)
  );
}

function updateShareLoading(
  progress,
  message
) {
  const loader =
    document.querySelector(
      ".my-pack-page-loader"
    );

  const fill =
    loader?.querySelector(
      ".my-pack-loader-progress-fill"
    );

  const label =
    loader?.querySelector(
      ".my-pack-loader-message"
    );

  const value =
    Math.min(
      100,
      Math.max(0, Number(progress) || 0)
    );

  if (fill) {
    fill.style.width = `${value}%`;
  }

  if (label && message) {
    label.textContent = message;
  }

  loader?.setAttribute(
    "aria-valuenow",
    String(value)
  );
}

function waitForShareMinimum(startedAt) {
  const elapsed =
    Date.now() - startedAt;

  const remaining =
    Math.max(
      0,
      SHARE_MIN_LOADING_TIME - elapsed
    );

  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

function waitShareDelay(duration = 280) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

async function readShareJson(response) {
  const text = await response.text();

  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Réponse serveur invalide (${response.status}).`
    );
  }
}

async function shareFetch(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(() => {
      controller.abort();
    }, SHARE_REQUEST_TIMEOUT);

  try {
    return await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function navigateShare(
  destination,
  {
    replace = true
  } = {}
) {
  if (
    shareNavigationStarted ||
    !destination
  ) {
    return;
  }

  shareNavigationStarted = true;

  const target =
    new URL(
      destination,
      window.location.origin
    );

  const targetValue =
    target.origin ===
      window.location.origin
      ? (
          target.pathname +
          target.search +
          target.hash
        )
      : target.href;

  try {
    if (replace) {
      window.location.replace(
        targetValue
      );
    } else {
      window.location.assign(
        targetValue
      );
    }
  } catch (error) {
    console.warn(
      "Navigation principale impossible, utilisation du fallback :",
      error
    );

    window.location.href =
      targetValue;
  }

  /*
    Certains navigateurs intégrés peuvent retarder une navigation.
    Ce fallback ne crée pas une deuxième destination :
    il répète uniquement la même URL si la page est toujours active.
  */
  window.setTimeout(() => {
    try {
      if (
        window.location.href !==
        target.href
      ) {
        window.location.href =
          targetValue;
      }
    } catch {
      window.location.href =
        targetValue;
    }
  }, SHARE_NAVIGATION_FALLBACK_DELAY);
}

function persistShareProfile(profile) {
  const normalizedProfile =
    normalizeShareProfile(profile);

  if (
    !normalizedProfile ||
    !getShareProfileId(
      normalizedProfile
    )
  ) {
    return null;
  }

  const token =
    window.SonaraSession
      ?.getToken?.() || "";

  if (
    window.SonaraSession?.persist
  ) {
    window.SonaraSession.persist(
      token,
      normalizedProfile
    );
  } else {
    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(
        normalizedProfile
      )
    );

    localStorage.setItem(
      "sonaraProfileCreated",
      "true"
    );
  }

  return normalizedProfile;
}

function isShareProfileAllowed(profile) {
  const normalizedProfile =
    normalizeShareProfile(profile);

  if (
    !getShareProfileId(
      normalizedProfile
    )
  ) {
    return false;
  }

  const forbiddenStatuses = [
    "banned",
    "deleted",
    "disabled",
    "suspended"
  ];

  return !forbiddenStatuses.includes(
    String(
      normalizedProfile.status || ""
    ).toLowerCase()
  );
}

async function fetchActiveShareSession() {
  const sessionToken =
    window.SonaraSession
      ?.getToken?.() || "";

  if (!sessionToken) {
    return {
      state: "missing",
      profile: null
    };
  }

  const response =
    await shareFetch(
      `${API_URL}/api/auth/session`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

  if (
    [401, 403, 404].includes(
      response.status
    )
  ) {
    return {
      state: "invalid",
      profile: null
    };
  }

  if (!response.ok) {
    throw new Error(
      "Vérification de session impossible " +
      `(${response.status}).`
    );
  }

  const data =
    await readShareJson(response);

  const profile =
    normalizeShareProfile(
      data.profile || data
    );

  return {
    state:
      profile &&
      isShareProfileAllowed(profile)
        ? "valid"
        : "invalid",
    profile
  };
}

async function restoreShareSession(
  localProfile
) {
  const normalizedProfile =
    normalizeShareProfile(
      localProfile
    );

  if (
    !isShareProfileAllowed(
      normalizedProfile
    ) ||
    !window.SonaraSession?.restore
  ) {
    return null;
  }

  const restoredProfile =
    await window.SonaraSession.restore(
      normalizedProfile
    );

  if (
    !isShareProfileAllowed(
      restoredProfile
    )
  ) {
    return null;
  }

  /*
    La restauration a déjà créé un nouveau token.
    Une lecture distante confirme immédiatement
    que ce token est utilisable avant la redirection.
  */
  const activeSession =
    await fetchActiveShareSession();

  if (
    activeSession.state === "valid" &&
    isShareProfileAllowed(
      activeSession.profile
    )
  ) {
    return persistShareProfile(
      activeSession.profile
    );
  }

  return persistShareProfile(
    restoredProfile
  );
}

async function verifySharedAccount() {
  const localProfile =
    getStoredShareProfile();

  updateShareLoading(
    24,
    "Vérification de votre compte Sonara…"
  );

  try {
    const activeSession =
      await fetchActiveShareSession();

    if (
      activeSession.state === "valid" &&
      isShareProfileAllowed(
        activeSession.profile
      )
    ) {
      return Boolean(
        persistShareProfile(
          activeSession.profile
        )
      );
    }

    if (
      isShareProfileAllowed(
        localProfile
      )
    ) {
      const restoredProfile =
        await restoreShareSession(
          localProfile
        );

      if (
        isShareProfileAllowed(
          restoredProfile
        )
      ) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn(
      "Vérification distante impossible :",
      error
    );

    /*
      Si le serveur est momentanément indisponible,
      un profil local complet peut encore ouvrir
      la page publique du pack. Sans profil local,
      aucune identité n'est supposée.
    */
    return isShareProfileAllowed(
      localProfile
    );
  }
}

function rememberShareRedirect(
  destination
) {
  if (!destination) return;

  try {
    sessionStorage.setItem(
      SHARE_REDIRECT_KEY,
      destination
    );
  } catch (error) {
    console.warn(
      "Mémorisation temporaire du partage impossible :",
      error
    );
  }
}

function getShareAuthenticationUrl(
  destination
) {
  const authUrl =
    new URL(
      "/app/pages/auth/inscription.html",
      window.location.origin
    );

  authUrl.searchParams.set(
    "mode",
    "login"
  );

  if (destination) {
    authUrl.searchParams.set(
      "redirect",
      destination
    );
  }

  return (
    authUrl.pathname +
    authUrl.search
  );
}

function goToShareAuthentication(
  destination
) {
  rememberShareRedirect(
    destination
  );

  navigateShare(
    getShareAuthenticationUrl(
      destination
    )
  );
}

async function finishShareNavigation(
  startedAt,
  message,
  destination
) {
  await waitForShareMinimum(
    startedAt
  );

  updateShareLoading(
    100,
    message
  );

  await waitShareDelay();

  navigateShare(destination);
}

async function recoverShareFailure(
  error,
  destination,
  startedAt
) {
  console.error(
    "Erreur ouverture du partage :",
    error
  );

  if (!destination) {
    updateShareLoading(
      100,
      "Lien de pack partagé invalide."
    );

    return;
  }

  const localProfile =
    getStoredShareProfile();

  if (
    isShareProfileAllowed(
      localProfile
    )
  ) {
    updateShareLoading(
      84,
      "Session locale retrouvée…"
    );

    await finishShareNavigation(
      startedAt,
      "Ouverture du pack…",
      destination
    );

    return;
  }

  updateShareLoading(
    84,
    error?.name === "AbortError"
      ? "Le serveur met trop de temps. Connexion requise…"
      : "Connexion Sonara requise…"
  );

  await waitForShareMinimum(
    startedAt
  );

  updateShareLoading(
    100,
    "Ouverture de la connexion…"
  );

  await waitShareDelay();

  goToShareAuthentication(
    destination
  );
}

async function initializeSharedPackLoading() {
  if (
    shareInitializationStarted
  ) {
    return;
  }

  shareInitializationStarted = true;

  const startedAt = Date.now();

  const destination =
    getSharedPackDestination();

  try {
    updateShareLoading(
      10,
      "Vérification du lien partagé…"
    );

    if (!destination) {
      throw new Error(
        "Lien de pack partagé invalide."
      );
    }

    const hasValidAccount =
      await verifySharedAccount();

    if (!hasValidAccount) {
      updateShareLoading(
        62,
        "Connexion Sonara requise pour ouvrir ce pack…"
      );

      await waitForShareMinimum(
        startedAt
      );

      updateShareLoading(
        100,
        "Ouverture de la connexion…"
      );

      await waitShareDelay();

      goToShareAuthentication(
        destination
      );

      return;
    }

    updateShareLoading(
      62,
      "Compte Sonara vérifié…"
    );

    updateShareLoading(
      86,
      "Préparation du pack partagé…"
    );

    await finishShareNavigation(
      startedAt,
      "Ouverture du pack…",
      destination
    );
  } catch (error) {
    await recoverShareFailure(
      error,
      destination,
      startedAt
    );
  }
}

initializeSharedPackLoading();
