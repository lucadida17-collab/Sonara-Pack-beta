

let packs = [];
let homeSections = [];

const desktopBrandVersion =
  document.querySelector(
    ".desktop-brand-version"
  );

if (desktopBrandVersion) {
  desktopBrandVersion.textContent =
    `Version ${
      window.SONARA_VERSION ||
      "V5.3.8.56"
    }`;
}

function getFilePath(file) {
  if (!file) return "";

  const rawValue =
    typeof file === "object"
      ? (
          file.url ||
          file.path ||
          file.key ||
          file.location ||
          file.src ||
          ""
        )
      : file;

  const value =
    String(rawValue || "")
      .trim()
      .replace(/\\/g, "/");

  if (!value) return "";

  if (value.startsWith("/app/")) return encodeURI(value);
  if (value.startsWith("app/")) return encodeURI(`/${value}`);

  if (
    /^(https?:|blob:|data:)/i.test(value)
  ) {
    return encodeURI(value);
  }

  if (value.startsWith("/downloads/")) {
    return encodeURI(`${API_URL}${value}`);
  }

  if (value.startsWith("downloads/")) {
    return encodeURI(`${API_URL}/${value}`);
  }

  if (value.startsWith("/uploads/")) {
    return encodeURI(`${API_URL}${value}`);
  }

  if (value.startsWith("uploads/")) {
    return encodeURI(`${API_URL}/${value}`);
  }

  return encodeURI(
    `${API_URL}/uploads/${
      value.replace(/^\/+/, "")
    }`
  );
}

function getPackCategories(pack = {}) {
  if (Array.isArray(pack.categorie)) {
    return pack.categorie
      .map((category) =>
        String(category || "").trim()
      )
      .filter(Boolean);
  }

  const singleCategory =
    String(
      pack.categorie ||
      pack.category ||
      ""
    ).trim();

  return singleCategory
    ? [singleCategory]
    : [];
}

function getPackCoverValue(pack = {}) {
  return (
    pack.coverPack ||
    pack.cover ||
    pack.coverUrl ||
    pack.imagePack ||
    pack.image ||
    ""
  );
}

function getPackDestination(pack = {}) {
  if (pack.packLink) {
    return String(pack.packLink);
  }

  if (pack.id) {
    return (
      "/app/pages/catalog/pack.html?id=" +
      encodeURIComponent(pack.id)
    );
  }

  return "";
}

function createHomeCoverFallback() {
  const fallback =
    document.createElement("div");

  fallback.className =
    "home-cover-fallback";

  fallback.setAttribute(
    "aria-hidden",
    "true"
  );

  fallback.innerHTML = `
    <svg
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4"
      ></rect>
      <path d="M8 14.5 11 11l2.4 2.6L16 11l2 2.3"></path>
      <circle cx="9" cy="9" r="1.2"></circle>
    </svg>

    <span>Cover indisponible</span>
  `;

  return fallback;
}

const content =
  document.querySelector(
    ".home-content"
  ) ||
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

function getStoredHomeProfile() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "sonaraProfile"
      ) || "null"
    );
  } catch (error) {
    console.warn(
      "Profil Home invalide pour la distribution :",
      error
    );

    return null;
  }
}

function createHomeDistribution(rawPacks = []) {
  const userContext =
    getStoredHomeProfile();

  if (
    window.SonaraDistribution &&
    typeof window.SonaraDistribution
      .createHomeDistribution === "function"
  ) {
    return window.SonaraDistribution
      .createHomeDistribution(
        rawPacks,
        {
          userContext
        }
      );
  }

  /*
    Fallback défensif : la Home ne doit jamais devenir vide
    si le module de distribution ne charge pas.
    Aucun score de secours n'est inventé ici : on garde les
    contenus approuvés et on les trie uniquement par récence.
  */
  const fallbackItems =
    (Array.isArray(rawPacks)
      ? rawPacks
      : [])
      .filter((pack) =>
        String(pack?.status || "")
          .toLowerCase() === "approved" &&
        pack?.moderationHidden !== true
      )
      .sort((a, b) => {
        const aDate = Date.parse(
          a?.publishedAt ||
          a?.moderatedAt ||
          a?.updatedAt ||
          a?.createdAt ||
          ""
        ) || 0;

        const bDate = Date.parse(
          b?.publishedAt ||
          b?.moderatedAt ||
          b?.updatedAt ||
          b?.createdAt ||
          ""
        ) || 0;

        return bDate - aDate;
      });

  return {
    version: "fallback",
    mode: "global-fallback",
    items: fallbackItems
  };
}

async function loadHome() {
  const response = await fetch(
    `${API_URL}/api/packs`,
    {
      cache: "no-store"
    }
  );

  const data = await response.json();

  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Catalogue Sonara indisponible."
    );
  }

  const distribution =
    createHomeDistribution(data);

  packs = Array.isArray(
    distribution?.items
  )
    ? distribution.items
    : [];

  homeSections = Array.isArray(
    distribution?.sections
  )
    ? distribution.sections.filter(
        (section) =>
          section &&
          Array.isArray(section.items) &&
          section.items.length > 0
      )
    : [];

  if (!homeSections.length && packs.length) {
    homeSections = [{
      id: "fallback:discovery",
      kind: "discovery",
      title: "À découvrir",
      items: packs
    }];
  }

  console.log(
    "DISTRIBUTION HOME :",
    {
      version: distribution?.version,
      mode: distribution?.mode,
      catalogue: distribution?.catalogue,
      sections: homeSections.map((section) => ({
        id: section.id,
        title: section.title,
        kind: section.kind,
        count: section.items.length
      }))
    }
  );

  renderHome();
}

loadHome().catch((error) => {
  console.error(
    "Erreur chargement Home :",
    error
  );

  if (content) {
    content.innerHTML = `
      <section class="home-state-card" role="status">
        <div class="home-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3v10"></path>
            <path d="M12 17.5v.5"></path>
            <path d="M5 21h14a2 2 0 0 0 1.75-2.96L13.75 5a2 2 0 0 0-3.5 0l-7 13.04A2 2 0 0 0 5 21Z"></path>
          </svg>
        </div>

        <h2>Accueil momentanément indisponible</h2>
        <p>Impossible de charger les packs pour le moment.</p>
      </section>
    `;
  }
});


function resetAccount() {
  /*
    La déconnexion volontaire se fait uniquement
    depuis Paramètres > Compte.
  */
  window.location.href = "/app/pages/account/settings/account.html";
}

function getPackArtistProfile(pack = {}) {
  const publicProfile =
    pack.artistProfile &&
    typeof pack.artistProfile === "object"
      ? pack.artistProfile
      : {};

  return {
    accountId: String(
      publicProfile.accountId ||
      pack.accountId ||
      pack.artistAccountId ||
      pack.artistId ||
      ""
    ).trim(),

    name: String(
      publicProfile.name ||
      publicProfile.pseudo ||
      pack.artist ||
      pack.pseudo ||
      "Artiste Sonara"
    ).trim(),

    avatar:
      publicProfile.avatar ||
      publicProfile.imageArtist ||
      publicProfile.imageProfile ||
      pack.imageArtist ||
      pack.imageProfile ||
      "",

    artistRewards: Array.isArray(publicProfile.artistRewards)
      ? publicProfile.artistRewards
      : []
  };
}


function getPrimaryArtistBadge(artistProfile = {}) {
  const rewards = Array.isArray(artistProfile.artistRewards) ? artistProfile.artistRewards : [];
  return rewards.find((reward) => reward?.type === "BADGE_AND_TITLE" && reward?.badgeImage) || null;
}

function createArtistBadge(artistProfile = {}) {
  const reward = getPrimaryArtistBadge(artistProfile);
  if (!reward) return null;
  const badge = document.createElement("img");
  badge.className = "home-artist-reward-badge";
  badge.src = getFilePath(reward.badgeImage);
  badge.alt = reward.badgeLabel || reward.title || "Badge artiste";
  badge.title = reward.title || reward.badgeLabel || "";
  return badge;
}

function getArtistDestination(artistProfile = {}) {
  const accountId = String(artistProfile.accountId || "").trim();

  return accountId
    ? `/app/pages/catalog/artist.html?id=${encodeURIComponent(accountId)}`
    : "";
}

function createArtistAvatar(
  artistProfile = {}
) {
  const wrapper =
    document.createElement("span");

  wrapper.className =
    "home-artist-avatar";

  wrapper.setAttribute(
    "aria-hidden",
    "true"
  );

  const artistName =
    String(
      artistProfile.name ||
      "Artiste Sonara"
    ).trim();

  const fallback =
    document.createElement("span");

  fallback.className =
    "home-artist-avatar-fallback";

  fallback.textContent =
    artistName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) =>
        part.charAt(0).toUpperCase()
      )
      .join("") || "S";

  wrapper.appendChild(fallback);

  const imageUrl = getFilePath(
    artistProfile.avatar
  );

  if (imageUrl) {
    const image =
      document.createElement("img");

    image.className =
      "home-artist-avatar-image";

    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.src = imageUrl;

    image.addEventListener(
      "load",
      () => {
        wrapper.classList.add(
          "has-image"
        );
      },
      { once: true }
    );

    image.addEventListener(
      "error",
      () => {
        image.remove();
      },
      { once: true }
    );

    wrapper.appendChild(image);
  }

  return wrapper;
}

function createPackCard(pack = {}) {
  const destination =
    getPackDestination(pack);

  const artistProfile =
    getPackArtistProfile(pack);

  const artistDestination =
    getArtistDestination(
      artistProfile
    );

  /*
    La carte n'est plus un <button> afin que le profil artiste puisse
    être un vrai lien indépendant sans créer d'élément interactif imbriqué.
  */
  const card =
    document.createElement("article");

  card.className = "card";

  if (artistProfile.accountId) {
    card.dataset.artistId =
      artistProfile.accountId;
  }

  if (pack.distribution?.sectionId) {
    card.dataset.distributionSection =
      String(pack.distribution.sectionId);
  }

  if (destination) {
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute(
      "aria-label",
      `Ouvrir le pack ${
        pack.title || "sans titre"
      } de ${artistProfile.name}`
    );
  } else {
    card.classList.add(
      "is-unavailable"
    );
    card.setAttribute(
      "aria-disabled",
      "true"
    );
  }

  const cover =
    document.createElement("div");

  cover.className = "cover";

  const fallback =
    createHomeCoverFallback();

  cover.appendChild(fallback);

  const imageUrl =
    getFilePath(
      getPackCoverValue(pack)
    );

  if (imageUrl) {
    const image =
      document.createElement("img");

    image.className =
      "image-cover";

    image.alt =
      `Cover du pack ${
        pack.title || ""
      }`.trim();

    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.src = imageUrl;

    image.addEventListener(
      "load",
      () => {
        cover.classList.add(
          "has-image"
        );
      },
      { once: true }
    );

    image.addEventListener(
      "error",
      () => {
        cover.classList.add(
          "has-fallback"
        );

        image.remove();
      },
      { once: true }
    );

    cover.appendChild(image);
  } else {
    cover.classList.add(
      "has-fallback"
    );
  }

  const info =
    document.createElement("div");

  info.className = "info";

  const title =
    document.createElement("p");

  title.className = "title";
  title.textContent =
    pack.title ||
    "Pack sans titre";

  let artistMeta = null;

  if (artistDestination) {
    artistMeta =
      document.createElement("a");

    artistMeta.href =
      artistDestination;
    artistMeta.className =
      "home-artist-meta home-artist-link";
    artistMeta.setAttribute(
      "aria-label",
      `Voir le profil de ${artistProfile.name}`
    );
  } else {
    artistMeta =
      document.createElement("div");

    artistMeta.className =
      "home-artist-meta";
  }

  const artist =
    document.createElement("p");

  artist.className = "artist";
  artist.setAttribute("data-user-content", "true");
  artist.textContent =
    artistProfile.name;

  /*
    Le petit avatar n'est plus collé au nom sur les cartes :
    l'identité visuelle artiste a maintenant son propre rail dédié.
    Le nom reste un accès direct au profil.
  */
  artistMeta.append(artist);
  const artistRewardBadge = createArtistBadge(artistProfile);
  if (artistRewardBadge) artistMeta.append(artistRewardBadge);

  info.append(
    title,
    artistMeta
  );

  card.append(
    cover,
    info
  );

  card.addEventListener(
    "click",
    (event) => {
      if (!destination) return;

      if (
        event.target.closest(
          ".home-artist-link"
        )
      ) {
        return;
      }

      window.location.href =
        destination;
    }
  );

  card.addEventListener(
    "keydown",
    (event) => {
      if (!destination) return;

      if (
        event.target.closest(
          ".home-artist-link"
        )
      ) {
        return;
      }

      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        window.location.href =
          destination;
      }
    }
  );

  return card;
}


function createArtistSpotlightCard(artistProfile = {}) {
  const accountId =
    String(artistProfile.accountId || "").trim();

  const destination = accountId
    ? `/app/pages/catalog/artist.html?id=${encodeURIComponent(accountId)}`
    : "";

  const name =
    String(artistProfile.name || "Artiste Sonara").trim();

  const avatarValue =
    artistProfile.avatar ||
    artistProfile.imageArtist ||
    artistProfile.imageProfile ||
    "";

  const avatarUrl = getFilePath(avatarValue);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "S";

  const card = document.createElement(
    destination ? "a" : "article"
  );

  card.className = "home-artist-spotlight-card";

  if (destination) {
    card.href = destination;
    card.setAttribute(
      "aria-label",
      `Voir le profil de ${name}`
    );
  } else {
    card.classList.add("is-unavailable");
  }

  const avatar = document.createElement("span");
  avatar.className = "home-artist-spotlight-avatar";

  const fallback = document.createElement("span");
  fallback.className = "home-artist-spotlight-fallback";
  fallback.textContent = initials;
  avatar.appendChild(fallback);

  if (avatarUrl) {
    const image = document.createElement("img");
    image.className = "home-artist-spotlight-image";
    image.src = avatarUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("load", () => {
      avatar.classList.add("has-image");
    }, { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    avatar.appendChild(image);
  }

  const copy = document.createElement("span");
  copy.className = "home-artist-spotlight-copy";

  const title = document.createElement("strong");
  title.setAttribute("data-user-content", "true");
  title.textContent = name;

  copy.append(title);
  const spotlightRewardBadge = createArtistBadge(artistProfile);
  if (spotlightRewardBadge) copy.append(spotlightRewardBadge);
  card.append(avatar, copy);

  return card;
}

function renderSectionCards(
  row,
  section = {}
) {
  if (!row) return;

  const items = Array.isArray(section?.items)
    ? section.items
    : [];

  if (section?.kind === "artists") {
    items.forEach((artistProfile) => {
      row.appendChild(
        createArtistSpotlightCard(artistProfile)
      );
    });
    return;
  }

  items.forEach((pack) => {
    row.appendChild(
      createPackCard(pack)
    );
  });
}

function escapeHomeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createDistributionSectionMarkup(
  section,
  index
) {
  const sectionId =
    String(
      section?.id ||
      `section-${index}`
    );

  const title =
    String(
      section?.title ||
      "À découvrir"
    );

  const kind =
    String(
      section?.kind ||
      "dynamic"
    )
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

  const isArtistSection =
    kind === "artists";

  const rowClass =
    isArtistSection
      ? "pack-row home-artist-spotlight-row"
      : "pack-row";

  return `
    <section
      class="pack-categorie home-distribution-section home-distribution-${kind}"
      data-distribution-section="${escapeHomeHtml(sectionId)}"
    >
      <div class="categorie-header">
        <div class="category-heading-copy">
          <div class="home-section-heading">
            <h2>${escapeHomeHtml(title)}</h2>
          </div>
        </div>

        <div
          class="scroll-controls"
          aria-label="Navigation horizontale ${escapeHomeHtml(title)}"
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
            <span class="scroll-btn-label">Tout voir</span>
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
        class="${rowClass}"
        tabindex="0"
        role="region"
        aria-label="${escapeHomeHtml(title)}"
      ></div>
    </section>
  `;
}


function renderHome() {
  destroyHomeScrollControls();

  const distributedSections =
    homeSections.length
      ? homeSections
          .map((section, index) =>
            createDistributionSectionMarkup(
              section,
              index
            )
          )
          .join("")
      : `
        <section class="home-empty-catalogue">
          <span class="home-empty-icon" aria-hidden="true">
            <i data-lucide="package-open"></i>
          </span>

          <h2>Le catalogue arrive</h2>

          <p>
            Les prochains contenus Sonara apparaîtront ici.
          </p>
        </section>
      `;

  content.innerHTML = `
    <div class="home-distribution-list">
      ${distributedSections}
    </div>
  `;

  homeSections.forEach((section, index) => {
    const sectionId = String(
      section?.id ||
      `section-${index}`
    );

    const sectionElement =
      [...document.querySelectorAll(
        ".home-distribution-section"
      )].find(
        (element) =>
          element.dataset.distributionSection === sectionId
      );

    const row =
      sectionElement?.querySelector(
        ".pack-row"
      );

    renderSectionCards(
      row,
      section
    );
  });

  initializeHomeScrollControls();

  if (window.lucide) {
    lucide.createIcons();
  }
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
    row.querySelector(
      ".card, .home-artist-spotlight-card"
    );

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

function escapeHomeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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





let profile = null;

try {
  profile = JSON.parse(
    localStorage.getItem(
      "sonaraProfile"
    ) || "null"
  );
} catch (error) {
  console.warn(
    "Profil Home invalide :",
    error
  );
}

const homeNavigationButtons =
  document.querySelectorAll(
    "[data-home-nav]"
  );

const homeCreateButtons =
  document.querySelectorAll(
    '[data-home-nav="create"]'
  );

if (profile?.role !== "both") {
  homeCreateButtons.forEach(
    (button) => {
      button.style.display = "none";
    }
  );
}

function setActiveHomeNavigation(
  navigationName
) {
  homeNavigationButtons.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.homeNav ===
          navigationName
      );
    }
  );
}

document
  .querySelectorAll(
    '[data-home-nav="home"]'
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        setActiveHomeNavigation(
          "home"
        );

        window.location.href =
          "/home.html";
      }
    );
  });

homeCreateButtons.forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        setActiveHomeNavigation(
          "create"
        );

        window.location.href =
          "/app/pages/creator/dashboard.html";
      }
    );
  }
);

document
  .querySelectorAll(
    '[data-home-nav="library"]'
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        setActiveHomeNavigation(
          "library"
        );

        window.location.href =
          "/app/pages/catalog/library.html";
      }
    );
  });

setActiveHomeNavigation("home");

if (window.lucide) {
  lucide.createIcons();
}



window.SonaraPreV1Notice?.show({
  audience: "user",
  profile,
  delay: 750
});
