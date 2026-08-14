
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

let packs = [];

const LIBRARY_REQUEST_TIMEOUT = 20000;

let libraryViewSequence = 0;

function beginLibraryView() {
    libraryViewSequence += 1;
    return libraryViewSequence;
}

function isCurrentLibraryView(viewSequence) {
    return (
        viewSequence ===
        libraryViewSequence
    );
}

async function readLibraryResponse(response) {
    const text = await response.text();

    if (!text.trim()) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            `Réponse serveur invalide (${response.status}).`
        );
    }
}

async function fetchLibraryJson(
    url,
    options = {}
) {
    const controller =
        new AbortController();

    const timeoutId =
        window.setTimeout(
            () => controller.abort(),
            LIBRARY_REQUEST_TIMEOUT
        );

    try {
        const response = await fetch(
            url,
            {
                cache: "no-store",
                ...options,
                signal: controller.signal
            }
        );

        const data =
            await readLibraryResponse(
                response
            );

        if (!response.ok) {
            throw new Error(
                data?.message ||
                `Erreur serveur (${response.status}).`
            );
        }

        return data;
    } finally {
        window.clearTimeout(
            timeoutId
        );
    }
}

const desktopBrandVersion =
  document.querySelector(
    ".desktop-brand-version"
  );

if (desktopBrandVersion) {
  desktopBrandVersion.textContent =
    `Version ${
      window.SONARA_VERSION ||
      "Bêta"
    }`;
}

const content = document.querySelector(".library-content");

function alignLibraryMiniPlayerToContent() {
    const miniPlayer =
        document.querySelector(
            ".mini-player-mobile"
        );

    if (!miniPlayer) return;

    if (
        !window.matchMedia(
            "(min-width: 900px)"
        ).matches
    ) {
        miniPlayer.style.removeProperty(
            "left"
        );
        miniPlayer.style.removeProperty(
            "right"
        );
        miniPlayer.style.removeProperty(
            "width"
        );
        return;
    }

    const libraryContent =
        document.querySelector(
            ".library-content"
        );

    if (!libraryContent) return;

    const rect =
        libraryContent.getBoundingClientRect();

    miniPlayer.style.left =
        `${Math.round(rect.left)}px`;
    miniPlayer.style.right = "auto";
    miniPlayer.style.width =
        `${Math.round(rect.width)}px`;
}

if (!window.__sonaraLibraryPlayerAlignBound) {
    window.__sonaraLibraryPlayerAlignBound = true;

    window.addEventListener(
        "resize",
        alignLibraryMiniPlayerToContent,
        { passive: true }
    );
}



    function formatDuration(seconds) {
        if (!seconds) return "--:--";

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${secs}`;
    }

function escapeLibraryHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createLibraryBackButton() {
    return `
        <button
            class="choice-back-button"
            type="button"
            aria-label="Retour"
            title="Retour"
        >
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d="M15 18l-6-6 6-6"
                ></path>
            </svg>

            <span class="library-visually-hidden">
                Retour
            </span>
        </button>
    `;
}

function createLibraryDownloadUrl({
    downloadPage = "",
    packId = "",
    trackId = ""
} = {}) {
    /*
      L'ancienne URL sert uniquement à récupérer ses paramètres.
      Le chemin final est toujours reconstruit depuis la racine.
    */
    let sourceUrl = null;

    try {
        sourceUrl = new URL(
            String(downloadPage || ""),
            window.location.href
        );
    } catch {
        sourceUrl = null;
    }

    const resolvedPackId =
        String(
            packId ||
            sourceUrl?.searchParams.get("id") ||
            ""
        ).trim();

    const resolvedTrackId =
        String(
            trackId ||
            sourceUrl?.searchParams.get("trackId") ||
            ""
        ).trim();

    const targetUrl =
        new URL(
            "/app/pages/catalog/download.html",
            window.location.origin
        );

    if (resolvedPackId) {
        targetUrl.searchParams.set(
            "id",
            resolvedPackId
        );
    }

    if (resolvedTrackId) {
        targetUrl.searchParams.set(
            "trackId",
            resolvedTrackId
        );
    }

    return targetUrl.href;
}

function navigateToLibraryDownload(
    downloadPage
) {
    const targetUrl =
        createLibraryDownloadUrl({
            downloadPage
        });

    window.location.assign(
        targetUrl
    );
}

function getCurrentLibraryProfile() {
    try {
        return JSON.parse(
            localStorage.getItem(
                "sonaraProfile"
            ) || "null"
        );
    } catch (error) {
        console.warn(
            "Profil Library illisible :",
            error
        );

        return null;
    }
}

function getLibraryAccountIdentifier(profile) {
    return (
        profile?.accountId ||
        profile?.id ||
        null
    );
}

async function getLibraryAccountDownloads() {
    const profile =
        getCurrentLibraryProfile();

    const accountIdentifier =
        getLibraryAccountIdentifier(
            profile
        );

    if (!accountIdentifier) {
        throw new Error(
            "Compte Sonara introuvable."
        );
    }

    const data =
        await fetchLibraryJson(
            `${API_URL}/api/users/${
                encodeURIComponent(
                    accountIdentifier
                )
            }`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            }
        );

    if (!data?.account) {
        throw new Error(
            "Compte Sonara introuvable."
        );
    }

    return data.account;
}

function getLibraryDownloadedPacks(account) {
    const downloadedPackIds =
        Array.isArray(
            account?.downloadedPacks
        )
            ? account.downloadedPacks.map(
                (id) => String(id)
            )
            : [];

    return (
        Array.isArray(packs)
            ? packs
            : []
    ).filter((pack) =>
        downloadedPackIds.includes(
            String(pack.id)
        )
    );
}

function getLibraryDownloadedTracks(account) {
    const downloadedTrackIds =
        Array.isArray(
            account?.downloadedTracks
        )
            ? account.downloadedTracks.map(
                (id) => String(id)
            )
            : [];

    const downloadedTracks = [];

    (
        Array.isArray(packs)
            ? packs
            : []
    ).forEach((pack) => {
        const packTracks =
            Array.isArray(pack.tracks)
                ? pack.tracks
                : [];

        packTracks.forEach((track) => {
            if (
                downloadedTrackIds.includes(
                    String(track.id)
                )
            ) {
                downloadedTracks.push({
                    ...track,
                    packId: pack.id,
                    artist:
                        track.artist ||
                        pack.artist ||
                        "",
                    coverPack:
                        track.coverPack ||
                        pack.coverPack ||
                        ""
                });
            }
        });
    });

    return downloadedTracks;
}

function createLibraryPackPreview(pack) {
    const packId =
        escapeLibraryHtml(pack.id);

    const title =
        escapeLibraryHtml(
            pack.title ||
            "Pack sans titre"
        );

    const artist =
        escapeLibraryHtml(
            pack.artist ||
            "Artiste Sonara"
        );

    const cover =
        escapeLibraryHtml(
            getFilePath(
                pack.coverPack
            )
        );

    return `
        <button
            class="library-preview-pack"
            type="button"
            data-pack-id="${packId}"
            aria-label="Ouvrir le pack ${title}"
        >
            <span class="library-preview-pack-cover">
                ${
                    cover
                        ? `
                            <img
                                src="${cover}"
                                alt="Cover du pack ${title}"
                                loading="lazy"
                                decoding="async"
                                onerror="this.remove(); this.parentElement.classList.add('is-fallback');"
                            >
                        `
                        : ""
                }

                <span class="library-preview-cover-fallback">
                    <span>SP</span>
                </span>
            </span>

            <span class="library-preview-pack-info">
                <strong>${title}</strong>
                <small>${artist}</small>
            </span>
        </button>
    `;
}

function createLibraryTrackPreview(track, index) {
    const title =
        escapeLibraryHtml(
            track.title ||
            "Track sans titre"
        );

    const artist =
        escapeLibraryHtml(
            track.artist ||
            "Artiste Sonara"
        );

    const cover =
        escapeLibraryHtml(
            getFilePath(
                track.coverPack
            )
        );

    return `
        <button
            class="library-preview-track"
            type="button"
            data-track-id="${
                escapeLibraryHtml(
                    track.id
                )
            }"
            aria-label="Voir les tracks téléchargées"
        >
            <span class="library-preview-track-index">
                ${String(index + 1).padStart(2, "0")}
            </span>

            <span class="library-preview-track-cover">
                ${
                    cover
                        ? `
                            <img
                                src="${cover}"
                                alt="Cover de la track ${title}"
                                loading="lazy"
                                decoding="async"
                                onerror="this.remove(); this.parentElement.classList.add('is-fallback');"
                            >
                        `
                        : ""
                }

                <span class="library-preview-cover-fallback">
                    <span>SP</span>
                </span>
            </span>

            <span class="library-preview-track-info">
                <strong>${title}</strong>
                <small>${artist}</small>
            </span>

            <span class="library-preview-track-duration">
                ${escapeLibraryHtml(
                    formatDuration(
                        track.duration
                    )
                )}
            </span>

            <span class="library-preview-arrow" aria-hidden="true">›</span>
        </button>
    `;
}

function renderLibraryOverviewLoading() {
    content.innerHTML = `
        <section class="library-overview" aria-busy="true">
            <div class="library-overview-heading">
                <div>
                    <span class="library-overview-kicker">VOTRE BIBLIOTHÈQUE</span>
                    <h1>Mes téléchargements</h1>
                </div>
            </div>

            <div class="library-overview-loading">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </section>
    `;
}

function renderLibraryOverviewError(message) {
    content.innerHTML = `
        <section class="library-overview">
            <div class="library-overview-heading">
                <div>
                    <span class="library-overview-kicker">VOTRE BIBLIOTHÈQUE</span>
                    <h1>Mes téléchargements</h1>
                </div>
            </div>

            <div class="library-overview-state" role="status">
                <strong>Chargement impossible</strong>
                <p>${escapeLibraryHtml(message)}</p>
                <button class="library-overview-retry" type="button">Réessayer</button>
            </div>
        </section>
    `;

    document
        .querySelector(".library-overview-retry")
        ?.addEventListener("click", () => {
            renderLibrary();
        });
}

async function loadLibrary() {
    try {
        const loadedPacks =
            await fetchLibraryJson(
                `${API_URL}/api/packs`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

        if (!Array.isArray(loadedPacks)) {
            throw new Error(
                "Le catalogue reçu est invalide."
            );
        }

        packs = loadedPacks;

        await renderLibrary();
    } catch (error) {
        console.error(
            "Erreur chargement Library :",
            error
        );

        renderLibraryOverviewError(
            error?.name === "AbortError"
                ? "Le serveur met trop de temps à répondre."
                : (
                    error?.message ||
                    "Impossible de charger la Librairie."
                )
        );
    }
}

async function startLibraryPage() {
    if (!content) {
        console.error(
            "Library : conteneur .library-content introuvable."
        );
        return;
    }

    const sessionReady =
        window.sonaraPageSessionReady;

    if (sessionReady) {
        const sessionIsValid =
            await sessionReady;

        if (!sessionIsValid) {
            return;
        }
    }

    initializeLibraryNavigation();

    await loadLibrary();
}

startLibraryPage();



async function renderLibrary() {
    const viewSequence =
        beginLibraryView();

    renderLibraryOverviewLoading();

    try {
        const account =
            await getLibraryAccountDownloads();

        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        const downloadedPacks =
            getLibraryDownloadedPacks(
                account
            );

        const previewPacks =
            downloadedPacks.slice(0, 8);

        const packPreviewContent =
            previewPacks.length
                ? previewPacks
                    .map(
                        createLibraryPackPreview
                    )
                    .join("")
                : `
                    <div class="library-overview-empty">
                        <strong>Aucun pack téléchargé</strong>

                        <p>
                            Vos packs achetés apparaîtront ici.
                        </p>
                    </div>
                `;

        content.innerHTML = `
            <section
                class="
                    library-overview
                    library-overview-home
                "
            >
                <header class="library-overview-heading">
                    <button
                        class="library-overview-title-action"
                        type="button"
                    >
                        <span class="library-overview-main-title">
                            Mes téléchargements
                        </span>
                    </button>

                    <button
                        class="library-overview-all"
                        type="button"
                    >
                        <span>Tout voir</span>
                        <span aria-hidden="true">›</span>
                    </button>
                </header>

                <div
                    class="
                        library-preview-pack-grid
                        library-home-pack-grid
                    "
                >
                    ${packPreviewContent}
                </div>
            </section>
        `;

        const openDownloadsOverview = () => {
            renderChoiceTelechargement();
        };

        document
            .querySelector(
                ".library-overview-title-action"
            )
            ?.addEventListener(
                "click",
                openDownloadsOverview
            );

        document
            .querySelector(
                ".library-overview-all"
            )
            ?.addEventListener(
                "click",
                openDownloadsOverview
            );

        document
            .querySelectorAll(
                ".library-preview-pack"
            )
            .forEach((card) => {
                card.addEventListener(
                    "click",
                    () => {
                        const packId =
                            card.dataset.packId;

                        if (!packId) return;

                        renderDownloadedPack(
                            packId
                        );
                    }
                );
            });
    } catch (error) {
        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        console.error(
            "Erreur accueil Librairie :",
            error
        );

        renderLibraryOverviewError(
            error?.message ||
            "Impossible de charger vos téléchargements."
        );
    }
}


async function renderChoiceTelechargement() {
    const viewSequence =
        beginLibraryView();

    content.innerHTML = `
        <section
            class="
                library-overview
                library-downloads-overview
            "
            aria-busy="true"
        >
            ${createLibraryBackButton()}

            <div class="library-overview-loading">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </section>
    `;

    document
        .querySelector(
            ".choice-back-button"
        )
        ?.addEventListener(
            "click",
            () => {
                renderLibrary();
            }
        );

    try {
        const account =
            await getLibraryAccountDownloads();

        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        const downloadedPacks =
            getLibraryDownloadedPacks(
                account
            );

        const downloadedTracks =
            getLibraryDownloadedTracks(
                account
            );

        const previewPacks =
            downloadedPacks.slice(0, 4);

        const previewTracks =
            downloadedTracks.slice(0, 3);

        const packPreviewContent =
            previewPacks.length
                ? previewPacks
                    .map(
                        createLibraryPackPreview
                    )
                    .join("")
                : `
                    <div class="library-overview-empty">
                        <strong>Aucun pack téléchargé</strong>

                        <p>
                            Vos packs achetés apparaîtront ici.
                        </p>
                    </div>
                `;

        const trackPreviewContent =
            previewTracks.length
                ? previewTracks
                    .map(
                        createLibraryTrackPreview
                    )
                    .join("")
                : `
                    <div class="library-overview-empty">
                        <strong>Aucune track téléchargée</strong>

                        <p>
                            Vos tracks achetées apparaîtront ici.
                        </p>
                    </div>
                `;

        content.innerHTML = `
            <section
                class="
                    library-overview
                    library-downloads-overview
                "
            >
                ${createLibraryBackButton()}

                

                <section class="library-overview-section">
                    <header class="library-overview-section-heading">
                        <div>
                            <h2>Packs téléchargés</h2>

                            <span>
                                ${downloadedPacks.length}
                                ${
                                    downloadedPacks.length > 1
                                        ? "packs"
                                        : "pack"
                                }
                            </span>
                        </div>

                        <button
                            class="library-overview-pack-all"
                            type="button"
                        >
                            <span>Tout voir</span>
                            <span aria-hidden="true">›</span>
                        </button>
                    </header>

                    <div
                        class="
                            library-preview-pack-grid
                            library-choice-pack-grid
                        "
                    >
                        ${packPreviewContent}
                    </div>
                </section>

                <section class="library-overview-section">
                    <header class="library-overview-section-heading">
                        <div>
                            <h2>Tracks téléchargées</h2>

                            <span>
                                ${downloadedTracks.length}
                                ${
                                    downloadedTracks.length > 1
                                        ? "tracks"
                                        : "track"
                                }
                            </span>
                        </div>

                        <button
                            class="library-overview-track-all"
                            type="button"
                        >
                            <span>Tout voir</span>
                            <span aria-hidden="true">›</span>
                        </button>
                    </header>

                    <div class="library-preview-track-list">
                        ${trackPreviewContent}
                    </div>
                </section>
            </section>
        `;

        document
            .querySelector(
                ".choice-back-button"
            )
            ?.addEventListener(
                "click",
                () => {
                    renderLibrary();
                }
            );

        document
            .querySelector(
                ".library-overview-pack-all"
            )
            ?.addEventListener(
                "click",
                () => {
                    renderPack();
                }
            );

        document
            .querySelector(
                ".library-overview-track-all"
            )
            ?.addEventListener(
                "click",
                () => {
                    renderTrack();
                }
            );

        document
            .querySelectorAll(
                ".library-preview-pack"
            )
            .forEach((card) => {
                card.addEventListener(
                    "click",
                    () => {
                        const packId =
                            card.dataset.packId;

                        if (!packId) return;

                        renderDownloadedPack(
                            packId
                        );
                    }
                );
            });

        document
            .querySelectorAll(
                ".library-preview-track"
            )
            .forEach((row) => {
                row.addEventListener(
                    "click",
                    () => {
                        renderTrack();
                    }
                );
            });
    } catch (error) {
        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        console.error(
            "Erreur vue Mes téléchargements :",
            error
        );

        content.innerHTML = `
            <section
                class="
                    library-overview
                    library-downloads-overview
                "
            >
                ${createLibraryBackButton()}

                <div
                    class="library-overview-state"
                    role="status"
                >
                    <strong>Chargement impossible</strong>

                    <p>
                        ${
                            escapeLibraryHtml(
                                error?.message ||
                                "Impossible de charger vos téléchargements."
                            )
                        }
                    </p>

                    <button
                        class="library-downloads-retry"
                        type="button"
                    >
                        Réessayer
                    </button>
                </div>
            </section>
        `;

        document
            .querySelector(
                ".choice-back-button"
            )
            ?.addEventListener(
                "click",
                () => {
                    renderLibrary();
                }
            );

        document
            .querySelector(
                ".library-downloads-retry"
            )
            ?.addEventListener(
                "click",
                () => {
                    renderChoiceTelechargement();
                }
            );
    }
}



async function renderPack() {
    const viewSequence =
        beginLibraryView();

    let packsTelecharges = [];

    try {
        const account =
            await getLibraryAccountDownloads();

        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        packsTelecharges =
            getLibraryDownloadedPacks(
                account
            );
    } catch (error) {
        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        console.error(
            "Erreur packs téléchargés :",
            error
        );

        renderLibraryOverviewError(
            error?.message ||
            "Impossible de charger les packs téléchargés."
        );

        return;
    }


    content.innerHTML = `

     ${createLibraryBackButton()}


    <section class="pack-accueil">
    <header class="library-all-packs-heading">
      <h1>Tous vos packs</h1>
      <p>Tous vos packs téléchargés se trouveront ici.</p>
    </header>

    <section class="pack-page">


    <div class="pack-grid">
           ${packsTelecharges.map((pack) => `
  <div class="pack-card" data-pack-id="${pack.id}">

    <img 
  class="pack-cover" 
  src="${getFilePath(pack.coverPack)}"
  alt="${pack.title}"
>
    <h3 data-user-content>${pack.title}</h3>
    <p data-user-content>${pack.artist}</p>
  </div>
`).join("")}
       
    </div>
  </section>
  </section>
  `;

    const choiceBackBtn = document.querySelector(".choice-back-button");


    choiceBackBtn.addEventListener("click", () => {
        renderChoiceTelechargement()
    });


    const packCards = document.querySelectorAll(".pack-card");

    packCards.forEach((card) => {
        card.addEventListener("click", () => {
            const packId = card.dataset.packId;

            renderDownloadedPack(packId);
        });
    });


};

function renderDownloadedPack(packId) {
    beginLibraryView();

    const normalizedPackId =
        String(packId || "");

    const packData =
        packs.find(
            (pack) =>
                String(pack.id) ===
                normalizedPackId
        );

    if (!packData) {
        renderLibraryOverviewError(
            "Ce pack téléchargé est introuvable."
        );
        return;
    }

    const packTracks =
        Array.isArray(packData.tracks)
            ? packData.tracks
            : [];

    content.innerHTML = `
  
   ${createLibraryBackButton()}

  <section class="download-pack-accueil"> 

   

    <section class="download-pack-page">

        <div class="pack-hero">
    <div class="left-side">

    <div class="card">
      <img 
      src="${getFilePath(packData.coverPack)}"
      class="cover">
      <alt="${packData.title} cover image"
      >
     
          <button class="playerBtnMob play"></button>
            <audio src="../../${packData.audio}">
            </audio>
    </div>
    

   
    </div>
    

      <div class="pack-info">
        <h1 class="title">${packData.title}</h1>
        <div class="artist-info">
          <img src="${getFilePath(packData.imageProfile)}" class="artist-image">
          <p class="artist">${packData.artist}</p>

        <button class="js-download-pack"
        data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    packData.downloadPage,
                packId:
                    packData.id
            })
        )}">Télécharger</button>
        </div>
         <button class="js-download-pack-desktop"
         data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    packData.downloadPage,
                packId:
                    packData.id
            })
        )}">Télécharger</button>    
      </div>
    </div>
   <div class="track-row-separator"></div>
    <div class="track">

    <div class="track-list-center">
      <div class="track-list">
      <span class="track-number">#</span>
      <span class="track-title">Titre</span>
      <span class="track-artist-placement">Artiste</span>
      <span class="track-duration-placement">Durée</span>
      <span class="track-price-placement">Retéléchargement</span>
      </div>
    </div> 

    ${packTracks.map((track, index) => `
    
 

      <div class="track-row" data-track-id="${track.id}">

      <span class="track-number">#${index + 1}</span>

<div class="track-title-column">

    <div class="track-card">
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover"
    >
 
       <div class="mobile-equalizer">
    <span></span>
    <span></span>
    <span></span>
  </div>
   <audio class="track-audio" src="${getFilePath(track.audioName || track.audio)}"></audio> 
    </div>

      <p class="track-title">${track.title}</p>
      </div>
    
          <p class="track-artist">${track.artist}</p>

         

    <div class="track-duration">
    <span class="duration">${formatDuration(track.duration)}</span>
        </div>

        <button class="track-price js-download-track"
        data-telechargement-url="${track.downloadZip}"
        data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    track.downloadPage,
                packId:
                    packData.id,
                trackId:
                    track.id
            })
        )}"
        >Télécharger</button>
      </div> 

   

  <div class="track-row-mobile" data-track-id="${track.id}">

      <span class="track-number-mobile">#${index + 1}</span>


    <div class="track-card-mobile">
      
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover-mobile"
    >
    
      <div class="mobile-equalizer">
    <span></span>
    <span></span>
    <span></span>
  </div>
    
    <audio class="mobile-track-audio" src="${getFilePath(track.audioName || track.audio)}"></audio>

    </div>

  
  

      <div class="track-info">
          <p class="track-title-mobile">${track.title}</p>
          <p class="track-artist-mobile">${track.artist}</p>
      </div>
         


        <button class="track-price-mobile js-download-track"
        data-telechargement-url="${track.downloadZip}"
        data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    track.downloadPage,
                packId:
                    packData.id,
                trackId:
                    track.id
            })
        )}"
        >Télécharger</button>
      </div> 

     
  
    `).join('')}
    </div>
    </div>
</section>

<div class="bottom-spacer"></div>


<div class="mini-player-mobile">
  <img class="mini-player-cover" src="" alt="">

  <div class="mini-player-info">
    <h3 class="mini-player-title"></h3>
    <p class="mini-player-artist"></p>

    <div class="mini-player-progress">
      <div class="mini-player-progress-fill"></div>
    </div>
  </div>

  <button class="mini-player-btn">▶</button>

</div>

<div class="grand-player">
 <button class="grand-player-back">⌄</button>
 <div class="grand-player-shell">
    <img class="grand-player-cover" src="" alt="">
<div class="position">
    <div class="player-progress-content">
     <div class="player-time-row">
        <span class="current-time">0:00</span>
        <span class="total-time"></span>
        </div>

        <div class="player-progress-bar">
            <div class="player-progress-fill"></div>
            <div class="player-progress-thumb"></div>
        </div>
    </div>

<div class="grand-player-controls">

  <button class="back">
    <svg class="grand-player-icon" viewBox="0 0 100 100">
      <rect x="24" y="25" width="8" height="50" rx="2"></rect>
      <polygon points="72,25 38,50 72,75"></polygon>
    </svg>
  </button>

  <button class="grand-player-play">
    <svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100">
      <polygon points="38,25 38,75 76,50"></polygon>
    </svg>
  </button>

  <button class="grand-player-next">
    <svg class="grand-player-icon" viewBox="0 0 100 100">
      <polygon points="28,25 62,50 28,75"></polygon>
      <rect x="68" y="25" width="8" height="50" rx="2"></rect>
    </svg>
  </button>

</div>

    <div class="grand-player-info">
      <h3 class="grand-player-title"></h3>
      <p class="grand-player-artist"></p>
 </div>
 </div>
</div>
     
  `;

    const backPack = document.querySelector(".choice-back-button");

    backPack.addEventListener("click", () => {
        renderPack()
    });

    let currentAudioMobile = null;
    let currentRowMobile = null;


    const trackRowsMobile = [...document.querySelectorAll(".track-row-mobile, .track-row")];

    

    const miniPlayerCover = document.querySelector(".mini-player-cover");
    const miniPlayerMobile = document.querySelector(".mini-player-mobile");
    const miniPlayerTitle = document.querySelector(".mini-player-title");
    const miniPlayerArtist = document.querySelector(".mini-player-artist");
    const miniPlayerBtn = document.querySelector(".mini-player-btn");
    const miniPlayerProgressFill = document.querySelector(".mini-player-progress-fill");
    const grandPlayer = document.querySelector(".grand-player");
    const grandPlayerBack = document.querySelector(".grand-player-back");

    window.requestAnimationFrame(
        alignLibraryMiniPlayerToContent
    );


   

    function resetMobileTracks() {
        trackRowsMobile.forEach(row => {
            row.classList.remove("is-playing", "is-paused");
        });
    }

    function updateMiniPlayer(row, audio) {
        const coverSrc = row.querySelector(".track-cover-mobile, .track-cover")?.src || "";
        miniPlayerCover.src = coverSrc;
        const title = row.querySelector(".track-title-mobile, .track-title")?.textContent || "";
        const artist = row.querySelector(".track-artist-mobile, .track-artist")?.textContent || "";

        miniPlayerTitle.textContent = title;
        miniPlayerArtist.textContent = artist;
        miniPlayerBtn.textContent = "❚❚";
        miniPlayerProgressFill.style.width = "0%";

        miniPlayerMobile.classList.add("active");

        audio.ontimeupdate = () => {
            if (!audio.duration) return;

            const progress = (audio.currentTime / audio.duration) * 100;
            miniPlayerProgressFill.style.width = `${progress}%`;
        };
    }

    function playMobileTrack(row) {
        const audio = row.querySelector(".mobile-track-audio, .track-audio");
        if (!audio) return;

        // Si une autre track était active avant
        if (currentAudioMobile && currentAudioMobile !== audio) {
            const oldAudio = currentAudioMobile;
            const oldRow = currentRowMobile;

            // On change d'abord la source actuelle
            currentAudioMobile = audio;
            currentRowMobile = row;
            currentGrandAudio = audio;

            // Puis on stop l'ancienne
            oldAudio.pause();
            oldAudio.currentTime = 0;

            // Puis on la rend inactive visuellement
            oldRow?.classList.remove("is-playing", "is-paused");
        }

        // Nettoyage général : aucune ancienne track ne reste active
        resetMobileTracks();

        // Nouvelle track active
        currentAudioMobile = audio;
        currentRowMobile = row;
        currentGrandAudio = audio;

        startGrandPlayerLiveProgress();

        row.classList.add("is-playing");
        row.classList.remove("is-paused");
        syncGrandPlayButton();

        updateMiniPlayer(row, audio);

        audio.addEventListener("play", () => {
            row.classList.add("is-playing");
            row.classList.remove("is-paused");
            miniPlayerBtn.textContent = "❚❚";

            syncGrandPlayButton()
        });

        audio.addEventListener("pause", () => {
            if (currentAudioMobile !== audio) {
                row.classList.remove("is-playing", "is-paused");
                return;
            }

            row.classList.remove("is-playing");
            row.classList.add("is-paused");
            miniPlayerBtn.textContent = "▶";

            syncGrandPlayButton()
        });

        audio.onended = () => {
            const index = trackRowsMobile.indexOf(row);
            const nextRow = trackRowsMobile[index + 1];

            if (nextRow) {
                row.classList.remove("is-playing", "is-paused");
                playMobileTrack(nextRow);
            } else {
                row.classList.remove("is-playing");
                row.classList.add("is-paused");
                miniPlayerBtn.textContent = "▶";
                miniPlayerProgressFill.style.width = "100%";
            }
        };

        audio.play();
    }

let touchStartY = 0;
let touchMoved = false;

trackRowsMobile.forEach(row => {
    row.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
        touchMoved = false;
    }, { passive: true });

    row.addEventListener("touchmove", (e) => {
        const currentY = e.touches[0].clientY;

        if (Math.abs(currentY - touchStartY) > 15) {
            touchMoved = true;
        }
    }, { passive: true });

    row.addEventListener("click", () => {
        playMobileTrack(row);
    });

    row.addEventListener("touchend", (e) => {
        if (touchMoved) return;

        e.preventDefault();
        playMobileTrack(row);
    });
});

    miniPlayerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();



        if (!currentAudioMobile || !currentRowMobile) return;

        if (currentAudioMobile.paused) {
            currentAudioMobile.play();

            currentRowMobile.classList.add("is-playing");
            currentRowMobile.classList.remove("is-paused");

            miniPlayerBtn.textContent = "❚❚";
        } else {
            currentAudioMobile.pause();

            currentRowMobile.classList.remove("is-playing");
            currentRowMobile.classList.add("is-paused");

            miniPlayerBtn.textContent = "▶";
        }
    });

    miniPlayerMobile.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();

    });

    miniPlayerMobile.addEventListener("click", (e) => {


        updateGrandPlayerInfo(currentRowMobile, currentAudioMobile);

        grandPlayer.classList.add("active");
    });

    grandPlayerBack.addEventListener("click", () => {
        grandPlayer.classList.remove("active");
    });




    const grandPlayerCurrentTime = document.querySelector(".current-time");
    const grandPlayerTotalTime = document.querySelector(".total-time");

    const grandPlayerTitle = document.querySelector(".grand-player-title");
    const grandPlayerArtist = document.querySelector(".grand-player-artist");
    const grandPlayerCover = document.querySelector(".grand-player-cover");
    const grandPlayerProgressBar = document.querySelector(".player-progress-bar");
    const grandPlayerProgressFill = document.querySelector(".player-progress-fill");
    const grandPlayerProgressThumb = document.querySelector(".player-progress-thumb");
    const grandControlPlay = document.querySelector(".grand-player-play");
    const grandControlBack = document.querySelector(".back");
    const grandControlNext = document.querySelector(".grand-player-next");


    function updateGrandPlayerInfo(row, audio) {
        const coverSrc = row.querySelector(".track-cover-mobile, .track-cover")?.src || "";
        const title = row.querySelector(".track-title-mobile, .track-title")?.textContent || "";
        const artist = row.querySelector(".track-artist-mobile, .track-artist")?.textContent || "";

        grandPlayerCover.src = coverSrc;
        grandPlayerTitle.textContent = title;
        grandPlayerArtist.textContent = artist;

        currentGrandAudio = audio;

        updateGrandPlayerProgress();
    }

    let currentGrandAudio = null;
    let grandPlayerAnimationId = null;

    function startGrandPlayerLiveProgress() {
        if (grandPlayerAnimationId) return;


        function loop() {
            if (currentGrandAudio) {
                updateGrandPlayerProgress();
            }
            grandPlayerAnimationId = requestAnimationFrame(loop);
        }
        loop();
    }

    function updateGrandPlayerProgress() {
        if (!currentGrandAudio || !currentGrandAudio.duration) return;

        const progress =
            (currentGrandAudio.currentTime / currentGrandAudio.duration) * 100;

        grandPlayerCurrentTime.textContent = formatDuration(currentGrandAudio.currentTime);
        grandPlayerTotalTime.textContent = formatDuration(currentGrandAudio.duration);

        grandPlayerProgressFill.style.width = `${progress}%`;
        grandPlayerProgressThumb.style.left = `${progress}%`;
    }

    function openGrandPlayer() {
        if (!currentAudioMobile) return;

        currentGrandAudio = currentAudioMobile;

        currentGrandAudio = currentAudioMobile;
        updateGrandPlayerProgress();

        grandPlayer.classList.add("active");
    }



    let isDraggingProgress = false;

    function seekProgressPlayer(e) {
        if (!currentGrandAudio || !currentGrandAudio.duration) return;

        const rect = grandPlayerProgressBar.getBoundingClientRect();

        const clientX = e.touches
            ? e.touches[0].clientX
            : e.clientX;

        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        currentGrandAudio.currentTime = percent * currentGrandAudio.duration;
        updateGrandPlayerProgress();
    }
    grandPlayerProgressBar.addEventListener("click", (e) => {
        seekProgressPlayer(e);
    });

    grandPlayerProgressBar.addEventListener("mousedown", (e) => {
        isDraggingProgress = true;
        seekProgressPlayer(e);
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDraggingProgress) return;
        seekProgressPlayer(e);
    });

    document.addEventListener("mouseup", () => {
        isDraggingProgress = false;
    });

    grandPlayerProgressBar.addEventListener("touchstart", (e) => {
        isDraggingProgress = true;
        seekProgressPlayer(e);
    });

    document.addEventListener("touchmove", (e) => {
        if (!isDraggingProgress) return;
        seekProgressPlayer(e);
    });

    document.addEventListener("touchend", () => {
        isDraggingProgress = false;
    });


    function setGrandPlayIcon(isPlaying) {
        if (!grandControlPlay) return;

        grandControlPlay.innerHTML = isPlaying
            ? `<svg class="grand-player-icon" viewBox="0 0 100 100">
              <rect x="32" y="25" width="12" height="50" rx="2"></rect>
              <rect x="56" y="25" width="12" height="50" rx="2"></rect>
           </svg>`
            : `<svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100">
              <polygon points="38,25 38,75 76,50"></polygon>
           </svg>`;
    }

    function getCurrentTrackRows() {
    if (window.innerWidth >= 900) {
        return Array.from(document.querySelectorAll(".track-row"));
    }

    return Array.from(document.querySelectorAll(".track-row-mobile"));
}

    grandControlPlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentAudioMobile || !currentRowMobile) return;

        if (currentAudioMobile.paused) {
            currentAudioMobile.play();
        } else {
            currentAudioMobile.pause();
        }

        syncGrandPlayButton();

    });

grandControlNext.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rows = getCurrentTrackRows();

    if (rows.length === 1) {
        currentAudioMobile.currentTime =0;
        currentAudioMobile.play();

        syncGrandPlayButton();
        updateGrandPlayerProgress();
        return;
    }

    const activeRow =
        rows.find(row => row.classList.contains("is-playing")) ||
        rows.find(row => row.classList.contains("is-paused"));

    if (!activeRow) return;

    const currentIndex = rows.indexOf(activeRow);

    const nextRow = rows[currentIndex + 1] || rows[0];

    nextRow.click();

    const audio = nextRow.querySelector(".mobile-track-audio, .track-audio");

    updateGrandPlayerInfo(nextRow, audio);
    updateGrandPlayerProgress();
    syncGrandPlayButton();
});

    grandControlBack.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rows = getCurrentTrackRows();    
    
    if (rows.length === 1) {
        currentAudioMobile.currentTime =0;
        currentAudioMobile.play();

        syncGrandPlayButton();
        updateGrandPlayerProgress();
        return;
    }




    const activeRow =
        rows.find(row => row.classList.contains("is-playing")) ||
        rows.find(row => row.classList.contains("is-paused"));

    if (!activeRow) return;

    const currentIndex = rows.indexOf(activeRow);

    const previousRow =
        rows[currentIndex - 1] || rows[rows.length - 1];

    previousRow.click();

    const audio = previousRow.querySelector(".mobile-track-audio, .track-audio");

    updateGrandPlayerInfo(previousRow, audio);
    updateGrandPlayerProgress();
    syncGrandPlayButton();
});


    function syncGrandPlayButton() {
        if (!currentAudioMobile || !currentRowMobile) {
            setGrandPlayIcon(false);
            return;
        }

        const trackIsPlaying = currentRowMobile.classList.contains("is-playing");

        setGrandPlayIcon(trackIsPlaying);


    }

    const packDownloadBtns = document.querySelectorAll(".js-download-pack, .js-download-pack-desktop");

packDownloadBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const downloadPage = btn.dataset.download;

        if (!downloadPage) {
            console.log("Download pack introuvable", btn);
            return;
        }

        navigateToLibraryDownload(
            downloadPage
        );
    });
});


const trackDownloadBtns = document.querySelectorAll(".js-download-track");

trackDownloadBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const downloadPage = btn.dataset.download;

        if (!downloadPage) {
            console.log("Download track introuvable", btn);
            return;
        }

        navigateToLibraryDownload(
            downloadPage
        );
    });
});


}




async function renderTrack() {
    const viewSequence =
        beginLibraryView();

    let downloadedTracks = [];

    try {
        const account =
            await getLibraryAccountDownloads();

        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        downloadedTracks =
            getLibraryDownloadedTracks(
                account
            );
    } catch (error) {
        if (
            !isCurrentLibraryView(
                viewSequence
            )
        ) {
            return;
        }

        console.error(
            "Erreur tracks téléchargées :",
            error
        );

        renderLibraryOverviewError(
            error?.message ||
            "Impossible de charger les tracks téléchargées."
        );

        return;
    }


    content.innerHTML = `

 ${createLibraryBackButton()}

   <div class="track">

  

    ${downloadedTracks.map((track, index) => `
    
 

      <div class="track-row" data-track-id="${track.id}">

      <span class="track-number">#${index + 1}</span>

<div class="track-title-column">

    <div class="track-card">
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover"
    >
 
       <div class="mobile-equalizer">
    <span></span>
    <span></span>
    <span></span>
  </div>
   <audio class="track-audio" src="${getFilePath(track.audioName)}"></audio> 
    </div>

      <p class="track-title">${track.title}</p>
      </div>
    
          <p class="track-artist">${track.artist}</p>

         

    <div class="track-duration">
    <span class="duration">${formatDuration(track.duration)}</span>
        </div>

        <button class="track-price js-download-track"
        data-telechargement-url="${track.downloadZip}"
        data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    track.downloadPage,
                packId:
                    track.packId,
                trackId:
                    track.id
            })
        )}"
        >Télécharger</button>
      </div> 

   

  <div class="track-row-mobile" data-track-id="${track.id}">

      <span class="track-number-mobile">#${index + 1}</span>


    <div class="track-card-mobile">
      
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover-mobile"
    >
    
      <div class="mobile-equalizer">
    <span></span>
    <span></span>
    <span></span>
  </div>
    
    <audio class="mobile-track-audio" src="${getFilePath(track.audioName)}"></audio>

    </div>

  
  

      <div class="track-info">
          <p class="track-title-mobile">${track.title}</p>
          <p class="track-artist-mobile">${track.artist}</p>
      </div>
         


        <button class="track-price-mobile js-download-track"
        data-telechargement-url="${track.downloadZip}"
        data-download="${escapeLibraryHtml(
            createLibraryDownloadUrl({
                downloadPage:
                    track.downloadPage,
                packId:
                    track.packId,
                trackId:
                    track.id
            })
        )}"
        >Télécharger</button>
      </div> 

     
  
    `).join('')}
    </div>
    </div>
</section>

<div class="bottom-spacer"></div>


<div class="mini-player-mobile">
  <img class="mini-player-cover" src="" alt="">

  <div class="mini-player-info">
    <h3 class="mini-player-title"></h3>
    <p class="mini-player-artist"></p>

    <div class="mini-player-progress">
      <div class="mini-player-progress-fill"></div>
    </div>
  </div>

  <button class="mini-player-btn">▶</button>

</div>

<div class="grand-player">
 <button class="grand-player-back">⌄</button>
 <div class="grand-player-shell">
    <img class="grand-player-cover" src="" alt="">
<div class="position">
    <div class="player-progress-content">
     <div class="player-time-row">
        <span class="current-time">0:00</span>
        <span class="total-time"></span>
        </div>

        <div class="player-progress-bar">
            <div class="player-progress-fill"></div>
            <div class="player-progress-thumb"></div>
        </div>
    </div>

<div class="grand-player-controls">

  <button class="back">
    <svg class="grand-player-icon" viewBox="0 0 100 100">
      <rect x="24" y="25" width="8" height="50" rx="2"></rect>
      <polygon points="72,25 38,50 72,75"></polygon>
    </svg>
  </button>

  <button class="grand-player-play">
    <svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100">
      <polygon points="38,25 38,75 76,50"></polygon>
    </svg>
  </button>

  <button class="grand-player-next">
    <svg class="grand-player-icon" viewBox="0 0 100 100">
      <polygon points="28,25 62,50 28,75"></polygon>
      <rect x="68" y="25" width="8" height="50" rx="2"></rect>
    </svg>
  </button>

</div>

    <div class="grand-player-info">
      <h3 class="grand-player-title"></h3>
      <p class="grand-player-artist"></p>
 </div>
 </div>
</div>
  `;
   

    const choiceBackBtn = document.querySelector(".choice-back-button");

    choiceBackBtn.addEventListener("click", () => {
        renderChoiceTelechargement()
    });

 let currentAudioMobile = null;
    let currentRowMobile = null;
 let currentGrandAudio = null;

    const trackRowsMobile = [...document.querySelectorAll(".track-row-mobile, .track-row")];

    

    const miniPlayerCover = document.querySelector(".mini-player-cover");
    const miniPlayerMobile = document.querySelector(".mini-player-mobile");
    const miniPlayerTitle = document.querySelector(".mini-player-title");
    const miniPlayerArtist = document.querySelector(".mini-player-artist");
    const miniPlayerBtn = document.querySelector(".mini-player-btn");
    const miniPlayerProgressFill = document.querySelector(".mini-player-progress-fill");
    const grandPlayer = document.querySelector(".grand-player");
    const grandPlayerBack = document.querySelector(".grand-player-back");

    window.requestAnimationFrame(
        alignLibraryMiniPlayerToContent
    );


   

    function resetMobileTracks() {
        trackRowsMobile.forEach(row => {
            row.classList.remove("is-playing", "is-paused");
        });
    }

    function updateMiniPlayer(row, audio) {
        const coverSrc = row.querySelector(".track-cover-mobile, .track-cover")?.src || "";
        miniPlayerCover.src = coverSrc;
        const title = row.querySelector(".track-title-mobile, .track-title")?.textContent || "";
        const artist = row.querySelector(".track-artist-mobile, .track-artist")?.textContent || "";

        miniPlayerTitle.textContent = title;
        miniPlayerArtist.textContent = artist;
        miniPlayerBtn.textContent = "❚❚";
        miniPlayerProgressFill.style.width = "0%";

        miniPlayerMobile.classList.add("active");

        audio.ontimeupdate = () => {
            if (!audio.duration) return;

            const progress = (audio.currentTime / audio.duration) * 100;
            miniPlayerProgressFill.style.width = `${progress}%`;
        };
    }

    function playMobileTrack(row) {
        const audio = row.querySelector(".mobile-track-audio, .track-audio");
        if (!audio) return;

        // Si une autre track était active avant
        if (currentAudioMobile && currentAudioMobile !== audio) {
            const oldAudio = currentAudioMobile;
            const oldRow = currentRowMobile;

            // On change d'abord la source actuelle
            currentAudioMobile = audio;
            currentRowMobile = row;
            currentGrandAudio = audio;

            // Puis on stop l'ancienne
            oldAudio.pause();
            oldAudio.currentTime = 0;

            // Puis on la rend inactive visuellement
            oldRow?.classList.remove("is-playing", "is-paused");
        }

        // Nettoyage général : aucune ancienne track ne reste active
        resetMobileTracks();

        // Nouvelle track active
        currentAudioMobile = audio;
        currentRowMobile = row;
        currentGrandAudio = audio;

        startGrandPlayerLiveProgress();

        row.classList.add("is-playing");
        row.classList.remove("is-paused");
        syncGrandPlayButton();

        updateMiniPlayer(row, audio);

        audio.addEventListener("play", () => {
            row.classList.add("is-playing");
            row.classList.remove("is-paused");
            miniPlayerBtn.textContent = "❚❚";

            syncGrandPlayButton()
        });

        audio.addEventListener("pause", () => {
            if (currentAudioMobile !== audio) {
                row.classList.remove("is-playing", "is-paused");
                return;
            }

            row.classList.remove("is-playing");
            row.classList.add("is-paused");
            miniPlayerBtn.textContent = "▶";

            syncGrandPlayButton()
        });

        audio.onended = () => {
            const index = trackRowsMobile.indexOf(row);
            const nextRow = trackRowsMobile[index + 1];

            if (nextRow) {
                row.classList.remove("is-playing", "is-paused");
                playMobileTrack(nextRow);
            } else {
                row.classList.remove("is-playing");
                row.classList.add("is-paused");
                miniPlayerBtn.textContent = "▶";
                miniPlayerProgressFill.style.width = "100%";
            }
        };

        audio.play();
    }

let touchStartY = 0;
let touchMoved = false;

trackRowsMobile.forEach(row => {
    row.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
        touchMoved = false;
    }, { passive: true });

    row.addEventListener("touchmove", (e) => {
        const currentY = e.touches[0].clientY;

        if (Math.abs(currentY - touchStartY) > 15) {
            touchMoved = true;
        }
    }, { passive: true });

    row.addEventListener("click", () => {
        playMobileTrack(row);
    });

    row.addEventListener("touchend", (e) => {
        if (touchMoved) return;

        e.preventDefault();
        playMobileTrack(row);
    });
});

    miniPlayerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();



        if (!currentAudioMobile || !currentRowMobile) return;

        if (currentAudioMobile.paused) {
            currentAudioMobile.play();

            currentRowMobile.classList.add("is-playing");
            currentRowMobile.classList.remove("is-paused");

            miniPlayerBtn.textContent = "❚❚";
        } else {
            currentAudioMobile.pause();

            currentRowMobile.classList.remove("is-playing");
            currentRowMobile.classList.add("is-paused");

            miniPlayerBtn.textContent = "▶";
        }
    });

    miniPlayerMobile.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();

    });

    miniPlayerMobile.addEventListener("click", (e) => {


        updateGrandPlayerInfo(currentRowMobile, currentAudioMobile);

        grandPlayer.classList.add("active");
    });

    grandPlayerBack.addEventListener("click", () => {
        grandPlayer.classList.remove("active");
    });




    const grandPlayerCurrentTime = document.querySelector(".current-time");
    const grandPlayerTotalTime = document.querySelector(".total-time");

    const grandPlayerTitle = document.querySelector(".grand-player-title");
    const grandPlayerArtist = document.querySelector(".grand-player-artist");
    const grandPlayerCover = document.querySelector(".grand-player-cover");
    const grandPlayerProgressBar = document.querySelector(".player-progress-bar");
    const grandPlayerProgressFill = document.querySelector(".player-progress-fill");
    const grandPlayerProgressThumb = document.querySelector(".player-progress-thumb");
    const grandControlPlay = document.querySelector(".grand-player-play");
    const grandControlBack = document.querySelector(".back");
    const grandControlNext = document.querySelector(".grand-player-next");


    function updateGrandPlayerInfo(row, audio) {
        const coverSrc = row.querySelector(".track-cover-mobile, .track-cover")?.src || "";
        const title = row.querySelector(".track-title-mobile, .track-title")?.textContent || "";
        const artist = row.querySelector(".track-artist-mobile, .track-artist")?.textContent || "";

        grandPlayerCover.src = coverSrc;
        grandPlayerTitle.textContent = title;
        grandPlayerArtist.textContent = artist;

        currentGrandAudio = audio;

        updateGrandPlayerProgress();
    }

    let grandPlayerAnimationId = null;

    function startGrandPlayerLiveProgress() {
        if (grandPlayerAnimationId) return;


        function loop() {
            if (currentGrandAudio) {
                updateGrandPlayerProgress();
            }
            grandPlayerAnimationId = requestAnimationFrame(loop);
        }
        loop();
    }

    function updateGrandPlayerProgress() {
        if (!currentGrandAudio || !currentGrandAudio.duration) return;

        const progress =
            (currentGrandAudio.currentTime / currentGrandAudio.duration) * 100;

        grandPlayerCurrentTime.textContent = formatDuration(currentGrandAudio.currentTime);
        grandPlayerTotalTime.textContent = formatDuration(currentGrandAudio.duration);

        grandPlayerProgressFill.style.width = `${progress}%`;
        grandPlayerProgressThumb.style.left = `${progress}%`;
    }

    function openGrandPlayer() {
        if (!currentAudioMobile) return;

        currentGrandAudio = currentAudioMobile;

        currentGrandAudio = currentAudioMobile;
        updateGrandPlayerProgress();

        grandPlayer.classList.add("active");
    }



    let isDraggingProgress = false;

    function seekProgressPlayer(e) {
        if (!currentGrandAudio || !currentGrandAudio.duration) return;

        const rect = grandPlayerProgressBar.getBoundingClientRect();

        const clientX = e.touches
            ? e.touches[0].clientX
            : e.clientX;

        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        currentGrandAudio.currentTime = percent * currentGrandAudio.duration;
        updateGrandPlayerProgress();
    }
    grandPlayerProgressBar.addEventListener("click", (e) => {
        seekProgressPlayer(e);
    });

    grandPlayerProgressBar.addEventListener("mousedown", (e) => {
        isDraggingProgress = true;
        seekProgressPlayer(e);
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDraggingProgress) return;
        seekProgressPlayer(e);
    });

    document.addEventListener("mouseup", () => {
        isDraggingProgress = false;
    });

    grandPlayerProgressBar.addEventListener("touchstart", (e) => {
        isDraggingProgress = true;
        seekProgressPlayer(e);
    });

    document.addEventListener("touchmove", (e) => {
        if (!isDraggingProgress) return;
        seekProgressPlayer(e);
    });

    document.addEventListener("touchend", () => {
        isDraggingProgress = false;
    });


    function setGrandPlayIcon(isPlaying) {
        if (!grandControlPlay) return;

        grandControlPlay.innerHTML = isPlaying
            ? `<svg class="grand-player-icon" viewBox="0 0 100 100">
              <rect x="32" y="25" width="12" height="50" rx="2"></rect>
              <rect x="56" y="25" width="12" height="50" rx="2"></rect>
           </svg>`
            : `<svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100">
              <polygon points="38,25 38,75 76,50"></polygon>
           </svg>`;
    }

    function getCurrentTrackRows() {
    if (window.innerWidth >= 900) {
        return Array.from(document.querySelectorAll(".track-row"));
    }

    return Array.from(document.querySelectorAll(".track-row-mobile"));
}

    grandControlPlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentAudioMobile || !currentRowMobile) return;

        if (currentAudioMobile.paused) {
            currentAudioMobile.play();
        } else {
            currentAudioMobile.pause();
        }

        syncGrandPlayButton();

    });

grandControlNext.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rows = getCurrentTrackRows();

    const activeRow =
        rows.find(row => row.classList.contains("is-playing")) ||
        rows.find(row => row.classList.contains("is-paused"));

    if (!activeRow) return;

    const currentIndex = rows.indexOf(activeRow);

    const nextRow = rows[currentIndex + 1] || rows[0];

    nextRow.click();

    const audio = nextRow.querySelector(".mobile-track-audio, .track-audio");

    updateGrandPlayerInfo(nextRow, audio);
    updateGrandPlayerProgress();
    syncGrandPlayButton();
});

    grandControlBack.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rows = getCurrentTrackRows();

    const activeRow =
        rows.find(row => row.classList.contains("is-playing")) ||
        rows.find(row => row.classList.contains("is-paused"));

    if (!activeRow) return;

    const currentIndex = rows.indexOf(activeRow);

    const previousRow =
        rows[currentIndex - 1] || rows[rows.length - 1];

    previousRow.click();

    const audio = previousRow.querySelector(".mobile-track-audio, .track-audio");

    updateGrandPlayerInfo(previousRow, audio);
    updateGrandPlayerProgress();
    syncGrandPlayButton();
});


    function syncGrandPlayButton() {
        if (!currentAudioMobile || !currentRowMobile) {
            setGrandPlayIcon(false);
            return;
        }

        const trackIsPlaying = currentRowMobile.classList.contains("is-playing");

        setGrandPlayIcon(trackIsPlaying);


    }

    const packDownloadBtns = document.querySelectorAll(".js-download-pack, .js-download-pack-desktop");

packDownloadBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const downloadPage = btn.dataset.download;

        if (!downloadPage) {
            console.log("Download pack introuvable", btn);
            return;
        }

        navigateToLibraryDownload(
            downloadPage
        );
    });
});


const trackDownloadBtns = document.querySelectorAll(".js-download-track");

trackDownloadBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const downloadPage = btn.dataset.download;

        if (!downloadPage) {
            console.log("Download track introuvable", btn);
            return;
        }

        navigateToLibraryDownload(
            downloadPage
        );
    });
});

};



function initializeLibraryNavigation() {
  if (window.lucide) {
    lucide.createIcons();
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
      "Profil Library invalide :",
      error
    );
  }

  const libraryNavigationButtons =
    document.querySelectorAll(
      "[data-library-nav]"
    );

  const libraryCreateButtons =
    document.querySelectorAll(
      '[data-library-nav="create"]'
    );

  if (profile?.role !== "both") {
    libraryCreateButtons.forEach(
      (button) => {
        button.style.display = "none";
      }
    );
  }

  function setActiveLibraryNavigation(
    navigationName
  ) {
    libraryNavigationButtons.forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.libraryNav ===
            navigationName
        );
      }
    );
  }

  document
    .querySelectorAll(
      '[data-library-nav="home"]'
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setActiveLibraryNavigation(
            "home"
          );

          window.location.assign(
            new URL(
              "/home.html",
              window.location.origin
            ).href
          );
        }
      );
    });

  libraryCreateButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          setActiveLibraryNavigation(
            "create"
          );

          window.location.assign(
            new URL(
              "/app/pages/creator/dashboard.html",
              window.location.origin
            ).href
          );
        }
      );
    }
  );

  document
    .querySelectorAll(
      '[data-library-nav="library"]'
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setActiveLibraryNavigation(
            "library"
          );

          renderLibrary();
        }
      );
    });

  setActiveLibraryNavigation(
    "library"
  );

  if (window.lucide) {
    lucide.createIcons();
  }
}
