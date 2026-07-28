const HOME_CREATOR_CACHE_KEY =
  "sonaraHomeCreatorPayload";

const HOME_CREATOR_MIN_LOADING_TIME = 6000;
const HOME_CREATOR_CACHE_TTL = 120000;
const HOME_CREATOR_REQUEST_TIMEOUT = 25000;

let homeCreatorLoadingStarted = false;

function readHomeCreatorProfile() {
  const rawProfile =
    localStorage.getItem("sonaraProfile");

  if (!rawProfile) return null;

  try {
    return JSON.parse(rawProfile);
  } catch (error) {
    console.error(
      "Profil Sonara local invalide :",
      error
    );

    return null;
  }
}

function getHomeCreatorAccountId(profile = {}) {
  return (
    profile.accountId ||
    profile.id ||
    null
  );
}

function updateHomeCreatorLoading(
  progress,
  message
) {
  const loader =
    document.querySelector(".my-pack-page-loader");

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

function waitForHomeCreatorMinimum(startedAt) {
  const elapsed = Date.now() - startedAt;

  const remaining =
    Math.max(
      0,
      HOME_CREATOR_MIN_LOADING_TIME - elapsed
    );

  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

async function homeCreatorFetch(
  url,
  options = {}
) {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(
    () => controller.abort(),
    HOME_CREATOR_REQUEST_TIMEOUT
  );

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

async function readHomeCreatorJson(response) {
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

async function preloadCreatorStaticFiles() {
  /*
    Ces requêtes réchauffent le cache du navigateur.
    Elles n'exécutent pas creator.js dans la page de chargement.
  */
  const files = [
    "/app/pages/creator.html",
    "/app/css/creator.css",
    "/app/js/creator.js?v=5.3.8.44-home-creator-loader"
  ];

  await Promise.allSettled(
    files.map((file) =>
      fetch(file, {
        cache: "force-cache"
      })
    )
  );
}

async function fetchCreatorDashboardData(
  accountId
) {
  const response =
    await homeCreatorFetch(
      `${API_URL}/api/creator/packs/${
        encodeURIComponent(accountId)
      }`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

  const data =
    await readHomeCreatorJson(response);

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.message ||
      data.error ||
      "Dashboard Creator indisponible."
    );
  }

  return data;
}

async function fetchCreatorStripeData(
  accountId
) {
  try {
    const response =
      await homeCreatorFetch(
        `${API_URL}/api/stripe/account-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            artistId: accountId
          })
        }
      );

    const data =
      await readHomeCreatorJson(response);

    /*
      404 signifie simplement qu'aucun compte Stripe
      n'est encore relié. C'est un état valide du Dashboard.
    */
    if (response.status === 404) {
      return {
        checked: true,
        connected: false,
        verified: false,
        data: null
      };
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "État Stripe indisponible."
      );
    }

    const verified =
      data.canCreatePack === true ||
      data.stripeVerified === true ||
      String(
        data.stripeStatus || ""
      ).toLowerCase() === "verified" ||
      (
        data.chargesEnabled === true &&
        data.payoutsEnabled === true
      );

    return {
      checked: true,
      connected: true,
      verified,
      data
    };
  } catch (error) {
    console.warn(
      "État Stripe non bloquant :",
      error
    );

    return {
      checked: false,
      connected: null,
      verified: false,
      data: null
    };
  }
}

function storeHomeCreatorPayload(payload) {
  const now = Date.now();

  sessionStorage.setItem(
    HOME_CREATOR_CACHE_KEY,
    JSON.stringify({
      ...payload,
      cachedAt: now,
      expiresAt:
        now + HOME_CREATOR_CACHE_TTL
    })
  );
}

async function initializeHomeCreatorLoading() {
  if (homeCreatorLoadingStarted) return;

  homeCreatorLoadingStarted = true;

  const startedAt = Date.now();

  try {
    updateHomeCreatorLoading(
      8,
      "Préparation de votre espace Creator…"
    );

    const profile =
      readHomeCreatorProfile();

    const accountId =
      getHomeCreatorAccountId(profile);

    const role =
      String(profile?.role || "")
        .trim()
        .toLowerCase();

    if (
      !profile ||
      !accountId ||
      !["artist", "both"].includes(role)
    ) {
      window.location.replace(
        "/app/pages/inscription.html"
      );

      return;
    }

    updateHomeCreatorLoading(
      24,
      "Connexion au Dashboard Artistique…"
    );

    const staticFilesPromise =
      preloadCreatorStaticFiles();

    updateHomeCreatorLoading(
      42,
      "Chargement de vos packs et revenus…"
    );

    const [
      creatorData,
      stripeState
    ] = await Promise.all([
      fetchCreatorDashboardData(accountId),
      fetchCreatorStripeData(accountId)
    ]);

    updateHomeCreatorLoading(
      78,
      "Préparation des éléments du Dashboard…"
    );

    await staticFilesPromise;

    storeHomeCreatorPayload({
      accountId,
      stats: creatorData.stats || {},
      packs: creatorData.packs || [],
      stripeChecked:
        stripeState.checked === true,
      stripeConnected:
        stripeState.connected,
      stripeVerified:
        stripeState.verified === true,
      stripe:
        stripeState.data || null
    });

    await waitForHomeCreatorMinimum(
      startedAt
    );

    updateHomeCreatorLoading(
      100,
      "Dashboard Artistique prêt"
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 280);
    });

    window.location.replace(
      "/app/pages/creator.html"
    );
  } catch (error) {
    console.error(
      "Erreur chargement Home vers Creator :",
      error
    );

    const message =
      error?.name === "AbortError"
        ? "Le serveur Sonara met trop de temps à répondre."
        : error?.message ||
          "Impossible de charger le Dashboard Artistique.";

    await waitForHomeCreatorMinimum(
      startedAt
    );

    updateHomeCreatorLoading(
      100,
      message
    );
  }
}

initializeHomeCreatorLoading();
