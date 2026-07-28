const CREATOR_HOME_CACHE_KEY =
  "sonaraCreatorHomePayload";

const CREATOR_HOME_MIN_LOADING_TIME = 6000;
const CREATOR_HOME_REQUEST_TIMEOUT = 12000;

let creatorHomeLoadingStarted = false;

function createCreatorHomeLoader() {
  const loader =
    document.createElement("section");

  loader.className =
    "my-pack-page-loader";

  loader.setAttribute(
    "role",
    "progressbar"
  );

  loader.setAttribute(
    "aria-label",
    "Ouverture de l’accueil"
  );

  loader.setAttribute(
    "aria-valuemin",
    "0"
  );

  loader.setAttribute(
    "aria-valuemax",
    "100"
  );

  loader.setAttribute(
    "aria-valuenow",
    "5"
  );

  loader.innerHTML = `
    <div class="my-pack-loader-scene" aria-hidden="true">
      <span
        class="my-pack-loader-orbit my-pack-loader-orbit-one"
      ></span>

      <span
        class="my-pack-loader-orbit my-pack-loader-orbit-two"
      ></span>

      <span class="my-pack-loader-core">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </div>

    <p class="my-pack-loader-label">SONARA PACK</p>

    <h1>Ouverture de l’accueil</h1>

    <p class="my-pack-loader-message">
      Chargement du catalogue Sonara…
    </p>

    <div class="my-pack-loader-progress" aria-hidden="true">
      <span class="my-pack-loader-progress-fill"></span>
    </div>
  `;

  document.documentElement.classList.add(
    "home-creator-loading-active"
  );

  document.body.classList.add(
    "home-creator-loading-active"
  );

  document.body.appendChild(loader);

  return loader;
}

function updateCreatorHomeLoader(
  loader,
  progress,
  message
) {
  const value =
    Math.min(
      100,
      Math.max(
        0,
        Number(progress) || 0
      )
    );

  const fill =
    loader.querySelector(
      ".my-pack-loader-progress-fill"
    );

  const label =
    loader.querySelector(
      ".my-pack-loader-message"
    );

  if (fill) {
    fill.style.width = `${value}%`;
  }

  if (label && message) {
    label.textContent = message;
  }

  loader.setAttribute(
    "aria-valuenow",
    String(value)
  );
}

function waitForCreatorHomeMinimum(
  startedAt
) {
  const elapsed =
    Date.now() - startedAt;

  const remaining =
    Math.max(
      0,
      CREATOR_HOME_MIN_LOADING_TIME -
        elapsed
    );

  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      remaining
    );
  });
}

async function fetchCreatorHomePacks() {
  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(
      () => controller.abort(),
      CREATOR_HOME_REQUEST_TIMEOUT
    );

  try {
    const response =
      await fetch(
        `${API_URL}/api/packs`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json"
          },
          signal: controller.signal
        }
      );

    const text =
      await response.text();

    let data = [];

    try {
      data = text.trim()
        ? JSON.parse(text)
        : [];
    } catch {
      throw new Error(
        `Réponse serveur invalide (${response.status}).`
      );
    }

    if (
      !response.ok ||
      !Array.isArray(data)
    ) {
      throw new Error(
        data?.message ||
        data?.error ||
        "Catalogue Sonara indisponible."
      );
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function preloadHomeFiles() {
  const files = [
    "/home.html",
    "/app/css/home.css",
    "/app/js/home.js?v=5.3.8.46-creator-home-loader"
  ];

  await Promise.allSettled(
    files.map((file) =>
      fetch(
        file,
        {
          cache: "force-cache"
        }
      )
    )
  );
}

function storeCreatorHomePayload(
  packs
) {
  const now = Date.now();

  sessionStorage.setItem(
    CREATOR_HOME_CACHE_KEY,
    JSON.stringify({
      packs,
      cachedAt: now,
      expiresAt: now + 120000
    })
  );
}

async function openHomeFromCreator() {
  if (creatorHomeLoadingStarted) {
    return;
  }

  creatorHomeLoadingStarted = true;

  const homeButton =
    document.querySelector(
      ".creator-home-return"
    );

  homeButton?.setAttribute(
    "aria-disabled",
    "true"
  );

  if (homeButton) {
    homeButton.disabled = true;
  }

  const startedAt = Date.now();

  const loader =
    createCreatorHomeLoader();

  try {
    updateCreatorHomeLoader(
      loader,
      16,
      "Connexion au catalogue Sonara…"
    );

    const [
      packs
    ] = await Promise.all([
      fetchCreatorHomePacks(),
      preloadHomeFiles()
    ]);

    storeCreatorHomePayload(packs);

    updateCreatorHomeLoader(
      loader,
      86,
      "Catalogue Sonara prêt…"
    );

    await waitForCreatorHomeMinimum(
      startedAt
    );

    updateCreatorHomeLoader(
      loader,
      100,
      "Ouverture de l’accueil"
    );

    await new Promise((resolve) => {
      window.setTimeout(
        resolve,
        220
      );
    });

    window.location.assign(
      "/home.html"
    );
  } catch (error) {
    console.error(
      "Erreur chargement Creator vers Home :",
      error
    );

    updateCreatorHomeLoader(
      loader,
      100,
      error?.name === "AbortError"
        ? "Le serveur met trop de temps. Ouverture directe…"
        : "Ouverture directe de l’accueil…"
    );

    /*
      Le loader ne reste jamais bloqué.
      Home reprendra son chargement normal
      si le préchargement échoue.
    */
    await new Promise((resolve) => {
      window.setTimeout(
        resolve,
        900
      );
    });

    window.location.assign(
      "/home.html"
    );
  }
}

document
  .querySelector(
    ".creator-home-return"
  )
  ?.addEventListener(
    "click",
    openHomeFromCreator
  );
