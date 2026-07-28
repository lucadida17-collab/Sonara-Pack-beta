

let packs = [];

const CREATOR_HOME_CACHE_KEY =
  "sonaraCreatorHomePayload";

function consumeCreatorHomePayload() {
  const rawPayload =
    sessionStorage.getItem(
      CREATOR_HOME_CACHE_KEY
    );

  if (!rawPayload) return null;

  try {
    const payload =
      JSON.parse(rawPayload);

    const valid =
      payload &&
      Number(payload.expiresAt || 0) >= Date.now() &&
      Array.isArray(payload.packs);

    sessionStorage.removeItem(
      CREATOR_HOME_CACHE_KEY
    );

    return valid ? payload : null;
  } catch (error) {
    sessionStorage.removeItem(
      CREATOR_HOME_CACHE_KEY
    );

    console.warn(
      "Catalogue Home préchargé invalide :",
      error
    );

    return null;
  }
}

function getFilePath(file) {
  if (!file) return "";

  const value = String(file).trim();

  if (/^(https?:|blob:|data:)/i.test(value)) return value;

  if (value.startsWith("/downloads/")) return `${API_URL}${value}`;
  if (value.startsWith("downloads/")) return `${API_URL}/${value}`;

  if (value.startsWith("/uploads/")) return `${API_URL}${value}`;
  if (value.startsWith("uploads/")) return `${API_URL}/${value}`;

  return `${API_URL}/uploads/${value.replace(/^\/+/, "")}`;
}

const content =
  document.querySelector(
    ".main-content"
  );

const btnAccueil =
  document.querySelector(
    ".accueil-btn"
  );

const pageName =
  document.querySelector(
    ".page"
  );

async function loadHome() {
  const preloaded =
    consumeCreatorHomePayload();

  if (preloaded) {
    /*
      Le catalogue reçu du serveur est utilisé tel quel.
      Le loader Creator ne remplace jamais le contenu Home.
    */
    packs = preloaded.packs;

    console.log(
      "PACKS HOME PRÉCHARGÉS :",
      packs
    );

    renderHome();
    return;
  }

  const response =
    await fetch(
      `${API_URL}/api/packs`,
      {
        cache: "no-store"
      }
    );

  const data =
    await response.json();

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

  packs = data;

  console.log(
    "PACKS RECUS :",
    packs
  );

  renderHome();
}

loadHome().catch((error) => {
  console.error(
    "Erreur chargement Home :",
    error
  );
});



function resetAccount() {
  /*
    La déconnexion volontaire se fait uniquement
    depuis Paramètres > Compte.
  */
  window.location.href = "/app/pages/settings/account.html";
}

function renderCards() {
  const container = document.querySelectorAll(".pack-row");
  if (!container) return;

  container.forEach(row => {
    const cat = row.dataset.cat;

    packs.forEach(pack => {
      if (pack.categorie.includes(cat)) {
        const card = document.createElement("button");
        card.className = 'card';



        console.log("PACK DATA :", pack);
        const imageUrl = `${getFilePath(pack.coverPack || pack.cover)}`;

        card.innerHTML = `
  <div class="cover">
    <img src="${imageUrl}" class="image-cover">
  </div>

  <div class="info">
    <p class="title">${pack.title}</p>
    <p class="artist">${pack.artist}</p>
  </div>
`;


        card.addEventListener("click", () => {
          window.location.href = pack.packLink;
        });

        row.appendChild(card);
      }
    });
  });
}


function renderHome() {
  destroyHomeScrollControls();

  const allCategories = [...new Set(
    packs.flatMap(pack => pack.categorie || [])
  )];

  content.innerHTML = allCategories.map(cat => {
    const categoryName = formatCategoryName(cat);

    return `
      <section class="pack-categorie">
        <div class="categorie-header">
          <h2>${categoryName}</h2>

          <div
            class="scroll-controls"
            aria-label="Navigation horizontale ${categoryName}"
          >
            <button
              class="scroll-btn left"
              type="button"
              aria-label="Voir les packs précédents"
              title="Packs précédents"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M15 18 9 12l6-6"></path>
              </svg>
            </button>

            <button
              class="scroll-btn right"
              type="button"
              aria-label="Voir les packs suivants"
              title="Packs suivants"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m9 18 6-6-6-6"></path>
              </svg>
            </button>
          </div>
        </div>

        <div
          class="pack-row"
          data-cat="${cat}"
          tabindex="0"
          role="region"
          aria-label="Packs ${categoryName}"
        ></div>
      </section>
    `;
  }).join("");

  renderCards();
  initializeHomeScrollControls();
}

let homeScrollControlCleanups = [];

function destroyHomeScrollControls() {
  homeScrollControlCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.warn(
        "Nettoyage scroll Home incomplet :",
        error
      );
    }
  });

  homeScrollControlCleanups = [];
}

function getHomeScrollStep(row) {
  const firstCard =
    row.querySelector(".card");

  if (!firstCard) {
    return Math.max(
      320,
      row.clientWidth * 0.78
    );
  }

  const rowStyle =
    window.getComputedStyle(row);

  const gap =
    Number.parseFloat(
      rowStyle.columnGap ||
      rowStyle.gap ||
      "0"
    ) || 0;

  const cardWidth =
    firstCard.getBoundingClientRect().width;

  return Math.max(
    cardWidth + gap,
    row.clientWidth * 0.72
  );
}

function initializeHomeScrollControls() {
  const desktopQuery =
    window.matchMedia("(min-width: 900px)");

  document
    .querySelectorAll(".pack-categorie")
    .forEach((section) => {
      const leftButton =
        section.querySelector(
          ".scroll-btn.left"
        );

      const rightButton =
        section.querySelector(
          ".scroll-btn.right"
        );

      const row =
        section.querySelector(".pack-row");

      if (
        !leftButton ||
        !rightButton ||
        !row
      ) {
        return;
      }

      const getMaximumScroll = () =>
        Math.max(
          0,
          row.scrollWidth -
            row.clientWidth
        );

      const updateButtons = () => {
        const maximumScroll =
          getMaximumScroll();

        const hasOverflow =
          maximumScroll > 4;

        const atStart =
          row.scrollLeft <= 4;

        const atEnd =
          row.scrollLeft >=
          maximumScroll - 4;

        section.classList.toggle(
          "has-horizontal-overflow",
          hasOverflow
        );

        leftButton.disabled =
          !hasOverflow || atStart;

        rightButton.disabled =
          !hasOverflow || atEnd;

        leftButton.setAttribute(
          "aria-disabled",
          String(leftButton.disabled)
        );

        rightButton.setAttribute(
          "aria-disabled",
          String(rightButton.disabled)
        );

        leftButton.title =
          leftButton.disabled
            ? "Aucun pack précédent"
            : "Voir les packs précédents";

        rightButton.title =
          rightButton.disabled
            ? "Aucun pack suivant"
            : "Voir les packs suivants";
      };

      const scrollRow = (direction) => {
        if (!desktopQuery.matches) {
          return;
        }

        row.scrollBy({
          left:
            direction *
            getHomeScrollStep(row),
          behavior: "smooth"
        });
      };

      const onLeftClick = () => {
        scrollRow(-1);
      };

      const onRightClick = () => {
        scrollRow(1);
      };

      const onRowScroll = () => {
        window.requestAnimationFrame(
          updateButtons
        );
      };

      const onRowWheel = (event) => {
        if (!desktopQuery.matches) {
          return;
        }

        const maximumScroll =
          getMaximumScroll();

        if (maximumScroll <= 4) {
          return;
        }

        const delta =
          Math.abs(event.deltaX) >
          Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;

        const canMoveLeft =
          delta < 0 &&
          row.scrollLeft > 0;

        const canMoveRight =
          delta > 0 &&
          row.scrollLeft <
            maximumScroll;

        if (
          !canMoveLeft &&
          !canMoveRight
        ) {
          return;
        }

        event.preventDefault();

        row.scrollBy({
          left: delta,
          behavior: "auto"
        });
      };

      const onRowKeyDown = (event) => {
        if (!desktopQuery.matches) {
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          scrollRow(-1);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          scrollRow(1);
        }
      };

      const onDesktopChange = () => {
        updateButtons();
      };

      leftButton.addEventListener(
        "click",
        onLeftClick
      );

      rightButton.addEventListener(
        "click",
        onRightClick
      );

      row.addEventListener(
        "scroll",
        onRowScroll,
        {
          passive: true
        }
      );

      row.addEventListener(
        "wheel",
        onRowWheel,
        {
          passive: false
        }
      );

      row.addEventListener(
        "keydown",
        onRowKeyDown
      );

      desktopQuery.addEventListener?.(
        "change",
        onDesktopChange
      );

      let resizeObserver = null;

      if (
        typeof ResizeObserver !==
        "undefined"
      ) {
        resizeObserver =
          new ResizeObserver(
            updateButtons
          );

        resizeObserver.observe(row);
      }

      homeScrollControlCleanups.push(
        () => {
          leftButton.removeEventListener(
            "click",
            onLeftClick
          );

          rightButton.removeEventListener(
            "click",
            onRightClick
          );

          row.removeEventListener(
            "scroll",
            onRowScroll
          );

          row.removeEventListener(
            "wheel",
            onRowWheel
          );

          row.removeEventListener(
            "keydown",
            onRowKeyDown
          );

          desktopQuery.removeEventListener?.(
            "change",
            onDesktopChange
          );

          resizeObserver?.disconnect();
        }
      );

      window.requestAnimationFrame(
        updateButtons
      );
    });
}

function formatCategoryName(cat) {
  const names = {
    piano: "Piano",
    cinematic: "Cinématique",
    espace: "Espace",
    tiktok: "Tiktok",
    film: "Film",
    youtube: "YouTube",
  };

  return names[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}


const loaderText = document.querySelector('.loader-text')

if (loaderText) {
  loaderText.textContent = 'Chargement...'
};


if (btnAccueil) {
  btnAccueil.addEventListener("click", () => {
    console.log("click accueil")
    renderHome();
    btnAccueil.classList.add("active");
  });
}





const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

const mobileCreateBtn = document.querySelector(".nav-mobile-create");

if (profile?.role !== "both") {
  mobileCreateBtn.style.display = "none";
}

function setActiveNav(activeBtn) {
  document.querySelectorAll(".nav-mobile-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  activeBtn.classList.add("active");
}

document.querySelector(".nav-mobile-home").addEventListener("click", () => {
  window.location.href = "/home.html";
});

const HOME_CREATOR_CACHE_KEY =
  "sonaraHomeCreatorPayload";

const HOME_CREATOR_MIN_LOADING_TIME = 6000;
const HOME_CREATOR_REQUEST_TIMEOUT = 12000;

let homeCreatorLoadingStarted = false;

function createHomeCreatorLoader() {
  const loader = document.createElement("section");

  loader.className = "my-pack-page-loader";
  loader.setAttribute("role", "progressbar");
  loader.setAttribute(
    "aria-label",
    "Ouverture du Dashboard Artistique"
  );
  loader.setAttribute("aria-valuemin", "0");
  loader.setAttribute("aria-valuemax", "100");
  loader.setAttribute("aria-valuenow", "5");

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

    <h1>Ouverture du Dashboard Artistique</h1>

    <p class="my-pack-loader-message">
      Préparation de votre espace Creator…
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

function updateHomeCreatorLoader(
  loader,
  progress,
  message
) {
  const value =
    Math.min(
      100,
      Math.max(0, Number(progress) || 0)
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

async function fetchHomeCreatorData(
  accountId
) {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(
    () => controller.abort(),
    HOME_CREATOR_REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(
      `${API_URL}/api/creator/packs/${
        encodeURIComponent(accountId)
      }`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    const text = await response.text();

    let data = {};

    try {
      data = text.trim()
        ? JSON.parse(text)
        : {};
    } catch {
      throw new Error(
        `Réponse serveur invalide (${response.status}).`
      );
    }

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
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function preloadCreatorFiles() {
  const files = [
    "/app/pages/creator.html",
    "/app/css/creator.css",
    "/app/js/creator.js?v=5.3.8.45-home-loader"
  ];

  await Promise.allSettled(
    files.map((file) =>
      fetch(file, {
        cache: "force-cache"
      })
    )
  );
}

function storeHomeCreatorPayload(
  accountId,
  creatorData
) {
  const now = Date.now();

  sessionStorage.setItem(
    HOME_CREATOR_CACHE_KEY,
    JSON.stringify({
      accountId,
      stats: creatorData.stats || {},
      packs: creatorData.packs || [],
      cachedAt: now,
      expiresAt: now + 120000
    })
  );
}

async function openCreatorFromHome() {
  if (homeCreatorLoadingStarted) return;

  homeCreatorLoadingStarted = true;

  const createButton =
    document.querySelector(
      ".nav-mobile-create"
    );

  createButton?.setAttribute(
    "aria-disabled",
    "true"
  );

  if (createButton) {
    createButton.disabled = true;
  }

  const startedAt = Date.now();
  const loader = createHomeCreatorLoader();

  try {
    updateHomeCreatorLoader(
      loader,
      12,
      "Connexion à votre espace artiste…"
    );

    const currentProfile =
      JSON.parse(
        localStorage.getItem(
          "sonaraProfile"
        ) || "null"
      );

    const accountId =
      currentProfile?.accountId ||
      currentProfile?.id ||
      null;

    if (!accountId) {
      throw new Error(
        "Compte artiste introuvable."
      );
    }

    updateHomeCreatorLoader(
      loader,
      34,
      "Chargement de vos packs et revenus…"
    );

    const [
      creatorData
    ] = await Promise.all([
      fetchHomeCreatorData(accountId),
      preloadCreatorFiles()
    ]);

    storeHomeCreatorPayload(
      accountId,
      creatorData
    );

    updateHomeCreatorLoader(
      loader,
      86,
      "Dashboard Artistique prêt…"
    );

    await waitForHomeCreatorMinimum(
      startedAt
    );

    updateHomeCreatorLoader(
      loader,
      100,
      "Ouverture du Dashboard Artistique"
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 220);
    });

    window.location.assign(
      "/app/pages/creator.html"
    );
  } catch (error) {
    console.error(
      "Erreur chargement Home vers Creator :",
      error
    );

    updateHomeCreatorLoader(
      loader,
      100,
      error?.name === "AbortError"
        ? "Le serveur met trop de temps. Ouverture directe…"
        : "Ouverture directe du Dashboard…"
    );

    /*
      Le chargement ne reste jamais bloqué.
      Creator reprendra son chargement serveur normal
      uniquement si le préchargement a échoué.
    */
    await new Promise((resolve) => {
      window.setTimeout(resolve, 900);
    });

    window.location.assign(
      "/app/pages/creator.html"
    );
  }
}

document
  .querySelector(".nav-mobile-create")
  ?.addEventListener(
    "click",
    openCreatorFromHome
  );

document.querySelector(".nav-mobile-library").addEventListener("click", () => {
  setActiveNav(document.querySelector(".nav-mobile-library"))

  window.location.href = "app/pages/library.html" 
});



document.querySelector(".nav-mobile-home").classList.add("active");

lucide.createIcons();

