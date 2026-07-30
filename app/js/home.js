

let packs = [];

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
      "/app/pages/pack.html?id=" +
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

  packs = data;

  console.log("PACKS RECUS :", packs);

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
  window.location.href = "/app/pages/settings/account.html";
}

function renderCards() {
  const rows =
    document.querySelectorAll(
      ".pack-row"
    );

  if (!rows.length) return;

  rows.forEach((row) => {
    const category =
      String(
        row.dataset.cat || ""
      );

    packs.forEach((pack) => {
      if (
        !getPackCategories(pack)
          .includes(category)
      ) {
        return;
      }

      const destination =
        getPackDestination(pack);

      const card =
        document.createElement("button");

      card.className = "card";
      card.type = "button";

      card.setAttribute(
        "aria-label",
        `Ouvrir le pack ${
          pack.title || "sans titre"
        }`
      );

      if (!destination) {
        card.disabled = true;
        card.classList.add(
          "is-unavailable"
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
          {
            once: true
          }
        );

        image.addEventListener(
          "error",
          () => {
            cover.classList.add(
              "has-fallback"
            );

            image.remove();
          },
          {
            once: true
          }
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

      const artist =
        document.createElement("p");

      artist.className = "artist";
      artist.textContent =
        pack.artist ||
        pack.pseudo ||
        "Artiste Sonara";

      info.append(
        title,
        artist
      );

      card.append(
        cover,
        info
      );

      card.addEventListener(
        "click",
        () => {
          if (!destination) return;

          window.location.href =
            destination;
        }
      );

      row.appendChild(card);
    });
  });
}


function renderHome() {
  destroyHomeScrollControls();

  const allCategories = [
    ...new Set(
      packs.flatMap(
        (pack) =>
          getPackCategories(pack)
      )
    )
  ];

  const categorySections =
    allCategories.length
      ? allCategories.map((cat) => {
          const categoryName =
            formatCategoryName(cat);

          const safeCategory =
            escapeHomeHtml(cat);

          const safeCategoryName =
            escapeHomeHtml(
              categoryName
            );

          const categoryPackCount =
            packs.filter(
              (pack) =>
                getPackCategories(pack)
                  .includes(cat)
            ).length;

          return `
            <section class="pack-categorie">
              <div class="categorie-header">
                <div class="category-heading-copy">
                  <h2>${safeCategoryName}</h2>

                  <span class="category-count">
                    ${categoryPackCount}
                    ${categoryPackCount > 1 ? "packs" : "pack"}
                  </span>
                </div>

                <div
                  class="scroll-controls"
                  aria-label="Navigation horizontale ${safeCategoryName}"
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
                data-cat="${safeCategory}"
                tabindex="0"
                role="region"
                aria-label="Packs ${safeCategoryName}"
              ></div>
            </section>
          `;
        }).join("")
      : `
        <section class="home-empty-catalogue">
          <span class="home-empty-icon" aria-hidden="true">
            <i data-lucide="package-open"></i>
          </span>

          <h2>Le catalogue arrive</h2>

          <p>
            Les prochains univers Sonara apparaîtront ici.
          </p>
        </section>
      `;

  content.innerHTML = `
    <div class="home-category-list">
      ${categorySections}
    </div>
  `;

  renderCards();
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
          "/app/pages/creator.html";
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
          "/app/pages/library.html";
      }
    );
  });

setActiveHomeNavigation("home");

if (window.lucide) {
  lucide.createIcons();
}

