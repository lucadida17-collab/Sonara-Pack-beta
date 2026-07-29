

let packs = [];

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

document
  .querySelector(".nav-mobile-create")
  ?.addEventListener("click", () => {
    window.location.href = "/app/pages/creator.html";
  });

document.querySelector(".nav-mobile-library").addEventListener("click", () => {
  setActiveNav(document.querySelector(".nav-mobile-library"))

  window.location.href = "app/pages/library.html" 
});



document.querySelector(".nav-mobile-home").classList.add("active");

lucide.createIcons();

