function showPopup({ type = "info", title = "", message = "" }) {
  const oldPopup = document.querySelector(".sonara-popup-overlay");
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement("div");
  popup.className = "sonara-popup-overlay";

  popup.innerHTML = `
    <div class="sonara-popup ${type}">
      <h3>${title}</h3>
      <p>${message}</p>
      <button class="sonara-popup-btn">OK</button>
    </div>
  `;

  document.body.appendChild(popup);
  window.SonaraI18n?.refresh?.();

  popup.querySelector(".sonara-popup-btn").addEventListener("click", () => {
    popup.remove();
  });
}

let selectedPackId = null;
let selectedTrackId = null;
let selectedPurchaseType = null;

const PACK_LICENSE_PERMISSION_LABELS = {
  personalProjects: "Projets personnels",
  commercialProjects: "Projets commerciaux",
  monetization: "Monétisation",
  socialMedia: "Réseaux sociaux",
  videoFilm: "Vidéos et films",
  advertising: "Publicités",
  gamesApps: "Jeux et applications",
  podcasts: "Podcasts",
  liveStreaming: "Live et streaming",
  clientWork: "Travail client",
  soundEditing: "Modification dans un DAW",
  unlimitedProjects: "Projets illimités"
};

const PACK_LICENSE_RESTRICTION_LABELS = {
  standaloneResale: "Revente isolée",
  redistribution: "Partage ou redistribution",
  musicPlatformUpload: "Upload musical autonome",
  contentIdRegistration: "Enregistrement Content ID",
  sublicensing: "Sous-licence",
  misleadingOwnership: "Fausse propriété"
};

const PACK_DEFAULT_LICENSE = {
  version: 1,
  name: "Licence standard Sonara",
  creditRequired: false,
  permissions: Object.fromEntries(
    Object.keys(PACK_LICENSE_PERMISSION_LABELS).map((key) => [key, true])
  ),
  restrictions: Object.fromEntries(
    Object.keys(PACK_LICENSE_RESTRICTION_LABELS).map((key) => [key, true])
  ),
  customPermissions: [],
  customRestrictions: [],
  customTerms: ""
};

function escapePackLicenseHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePackLicense(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...PACK_DEFAULT_LICENSE,
    ...source,
    permissions: {
      ...PACK_DEFAULT_LICENSE.permissions,
      ...(source.permissions || {})
    },
    restrictions: {
      ...PACK_DEFAULT_LICENSE.restrictions,
      ...(source.restrictions || {})
    },
    customPermissions: Array.isArray(source.customPermissions)
      ? source.customPermissions.filter(Boolean)
      : [],
    customRestrictions: Array.isArray(source.customRestrictions)
      ? source.customRestrictions.filter(Boolean)
      : []
  };
}

function packLicenseList(labels, states, customItems) {
  return [
    ...Object.entries(labels)
      .filter(([key]) => Boolean(states?.[key]))
      .map(([, label]) => label),
    ...(Array.isArray(customItems) ? customItems : [])
  ];
}

function renderPackLicenseNotice(pack, selectedItem = null) {
  const license = normalizePackLicense(pack?.license);
  const permissions = packLicenseList(
    PACK_LICENSE_PERMISSION_LABELS,
    license.permissions,
    license.customPermissions
  );
  const restrictions = packLicenseList(
    PACK_LICENSE_RESTRICTION_LABELS,
    license.restrictions,
    license.customRestrictions
  );
  const itemTitle = selectedItem && selectedItem !== pack
    ? `${selectedItem.title || "Track"} — ${pack?.title || pack?.name || "Pack Sonara"}`
    : (pack?.title || pack?.name || "Pack Sonara");

  const packLabel = document.querySelector(".notice-license-pack");
  const version = document.querySelector(".notice-license-version");
  const title = document.getElementById("licenseNoticeTitle");
  const permissionList = document.querySelector(".notice-license-permissions");
  const restrictionList = document.querySelector(".notice-license-restrictions");
  const details = document.querySelector(".notice-license-details");
  const customTerms = document.querySelector(".notice-license-custom");
  const credit = document.querySelector(".notice-license-credit");
  const price = document.querySelector(".notice-license-price");

  if (title) title.textContent = license.name || "Licence d’utilisation";
  if (packLabel) packLabel.textContent = itemTitle;
  if (version) version.textContent = `Version ${Number(license.version || 1)}`;
  if (price) {
    price.textContent = displayPriceWithEuro(
      selectedItem?.price ??
      selectedItem?.trackPrice ??
      selectedItem?.unitPrice ??
      pack?.price ??
      pack?.packPrice ??
      pack?.totalPrice
    ) || "Prix indisponible";
  }
  if (permissionList) {
    permissionList.innerHTML = permissions.length
      ? permissions.map((item) => `<li>${escapePackLicenseHtml(item)}</li>`).join("")
      : "<li>Aucune utilisation supplémentaire n’est accordée.</li>";
  }
  if (restrictionList) {
    restrictionList.innerHTML = restrictions.length
      ? restrictions.map((item) => `<li>${escapePackLicenseHtml(item)}</li>`).join("")
      : "<li>Aucune restriction personnalisée supplémentaire.</li>";
  }
  if (details && customTerms) {
    const hasTerms = Boolean(String(license.customTerms || "").trim());
    details.hidden = !hasTerms;
    customTerms.textContent = hasTerms ? license.customTerms : "";
  }
  if (credit) credit.hidden = !license.creditRequired;

  if (window.lucide) lucide.createIcons();
  window.SonaraI18n?.refresh?.();
}

function openPackLicenseNotice(selectedItem = null) {
  renderPackLicenseNotice(packData, selectedItem);
  const overlay = document.querySelector(".notice-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  document.body.classList.add("license-modal-open");
  overlay.querySelector(".notice-close")?.focus();
}

function closePackLicenseNotice() {
  const overlay = document.querySelector(".notice-overlay");
  if (overlay) overlay.style.display = "none";
  document.body.classList.remove("license-modal-open");
}

function getStoredPackProfile() {
  const rawProfile = localStorage.getItem("sonaraProfile");

  if (!rawProfile) {
    return null;
  }

  try {
    return JSON.parse(rawProfile);
  } catch (error) {
    console.error("Profil Sonara local invalide :", error);
    return null;
  }
}


const PACK_MIN_LOADING_TIME = 700;

function updatePackLoading(progress, message) {
  const loader = document.querySelector(".my-pack-page-loader");
  const fill = loader?.querySelector(".my-pack-loader-progress-fill");
  const label = loader?.querySelector(".my-pack-loader-message");
  const value = Math.min(100, Math.max(0, Number(progress) || 0));

  if (fill) fill.style.width = `${value}%`;
  if (label && message) label.textContent = message;
  loader?.setAttribute("aria-valuenow", String(value));
}

function waitForPackMinimum(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, PACK_MIN_LOADING_TIME - elapsed);

  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

async function finishPackLoading(startedAt, message = "Pack prêt") {
  updatePackLoading(92, "Finalisation de l’affichage…");
  await waitForPackMinimum(startedAt);

  updatePackLoading(100, message);

  await new Promise((resolve) => {
    window.setTimeout(resolve, 280);
  });

  const loader = document.querySelector(".my-pack-page-loader");
  const content = document.querySelector(".my-pack-loaded-content");

  loader?.classList.add("is-hidden");
  content?.classList.add("is-ready");

  window.setTimeout(() => loader?.remove(), 500);
}

function isFreeCatalogItem(item = {}) {
  return (
    item.isFree === true ||
    ["gratuit", "free"].includes(String(item.price || "").trim().toLowerCase())
  );
}

async function startStripePayment() {
  console.log("====================================");
  console.log("🟢 [FRONT 1] startStripePayment lancé");

  try {
    const rawProfile = localStorage.getItem("sonaraProfile");

    console.log("🟢 [FRONT 2] rawProfile :", rawProfile);

    if (!rawProfile) {
      console.log("🔴 [STOP FRONT] Aucun profil localStorage");
      showPopup({
        type: "error",
        title: "Profil introuvable",
        message: "Reconnecte-toi puis réessaie."
      });
      return;
    }

    const profile = JSON.parse(rawProfile);

    console.log("🟢 [FRONT 3] Profile parsé :", profile);
    console.log("profile.id :", profile?.id);

    console.log("🟢 [FRONT 4] Sélection actuelle");
    console.log("selectedPackId :", selectedPackId);
    console.log("selectedTrackId :", selectedTrackId);
    console.log("selectedPurchaseType :", selectedPurchaseType);

    if (!selectedPackId) {
      console.log("🔴 [STOP FRONT] selectedPackId manquant");

      showPopup({
        type: "error",
        title: "Pack introuvable",
        message: "Recharge la page puis réessaie."
      });

      return;
    }

    const selectedItem = selectedTrackId
      ? packData?.tracks?.find((track) => String(track.id) === String(selectedTrackId))
      : packData;

    if (!selectedItem) {
      showPopup({
        type: "error",
        title: "Contenu introuvable",
        message: "Recharge la page puis réessaie."
      });
      return;
    }

    const userId = profile.accountId || profile.id;

    if (!userId) {
      showPopup({
        type: "error",
        title: "Compte introuvable",
        message: "Reconnecte-toi puis réessaie."
      });
      return;
    }

    const purchaseType = selectedTrackId ? "track" : "pack";

    if (isFreeCatalogItem(selectedItem)) {
      const freeResponse = await fetch(`${API_URL}/api/free-download-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          packId: selectedPackId,
          trackId: selectedTrackId || null,
          licenseVersion: Number(packData?.license?.version || 1),
          licenseId: String(
            packData?.license?.id ||
            `${selectedPackId}:license:v${Number(packData?.license?.version || 1)}`
          )
        })
      });

      const freeData = await freeResponse.json();

      if (!freeResponse.ok || !freeData.redirectUrl) {
        showPopup({
          type: "error",
          title: "Téléchargement impossible",
          message: freeData.message || freeData.error || "Réessaie dans un instant."
        });
        return;
      }

      window.location.href = freeData.redirectUrl;
      return;
    }

    const payload = {
      userId,
      packId: selectedPackId,
      trackId: selectedTrackId || null,
      purchaseType
    };

    console.log("🟢 [FRONT 5] Préparation du chargement Stripe :", payload);

    sessionStorage.setItem(
      "sonaraStripePurchase",
      JSON.stringify({
        ...payload,
        returnUrl: window.location.href,
        licenseVersion: Number(packData?.license?.version || 1),
        licenseId: String(packData?.license?.id || `${selectedPackId}:license:v${Number(packData?.license?.version || 1)}`),
        createdAt: Date.now()
      })
    );

    const noticeOverlay = document.querySelector(".notice-overlay");
    const acceptButton = document.querySelector(".notice-accept");

    if (noticeOverlay) closePackLicenseNotice();
    if (acceptButton) {
      acceptButton.disabled = true;
      acceptButton.textContent = "Chargement...";
    }

    window.location.href = "/app/pages/stripe-loading.html";

  } catch (err) {
    console.log("🔴 [ERREUR FRONT CATCH]");
    console.error(err);
    console.log("Message :", err.message);
    console.log("====================================");

    showPopup({
      type: "error",
      title: "Erreur paiement",
      message: "Impossible de lancer le paiement pour le moment."
    });
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

function displayPriceWithEuro(value) {
  const price = String(value ?? "").trim();

  if (!price) return "";
  if (["gratuit", "free"].includes(price.toLowerCase())) return "Gratuit";

  const numericPrice = Number(
    price
      .replace(/\s*€\s*$/, "")
      .replace(",", ".")
  );

  if (Number.isFinite(numericPrice)) {
    return `${numericPrice.toFixed(2)}€`;
  }

  return /€\s*$/.test(price) ? price : `${price}€`;
}

const params = new URLSearchParams(window.location.search);

const packId = params.get("id");
const trackId = params.get("trackId");

let packData = null;

async function loadPack() {

  const response = await fetch(`${API_URL}/api/packs`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Chargement du pack impossible (${response.status}).`);
  }

  const packs = await response.json();

  console.log("ID DANS URL :", packId);
  console.log("PACKS REÇUS :", packs);
  console.log("IDS DISPONIBLES :", packs.map(pack => pack.id));

  packData = packs.find(pack => pack.id === packId);

  console.log("PACK :", packData);

  if (!packData) {
    throw new Error("Pack introuvable.");
  }

  renderPack();
  return packData;

}

const packList = document.querySelector(".pack-list");


const btnAccueil = document.querySelector('.accueil-btn');
const pageName = document.querySelector('.page');

function renderPack() {

  if (packData && packList) {
    packList.innerHTML = `
<button class="retour">
    <i data-lucide="ChevronLeft"></i>
   </button>
    

    <section class="body-pack">
    <div class="pack-hero">
    <div class="left-side">

    <div class="card">
      <img 
      src="${getFilePath(packData.coverPack)}"
      class="cover">
      <alt="${packData.title} cover image"
      >
     
          <button class="playerBtnMob play"></button>
          <audio src="${getFilePath(packData.audio || packData.audioName)}">
            </audio>
    </div>
    

   
    </div>
    

      <div class="pack-info">
        <h1 class="title">${packData.title}</h1>
        <div class="artist-info">
          <img src="${getFilePath(packData.imageProfile)}" class="artist-image">
          <p class="artist">${packData.artist}</p>

        <button class="btn-acheter">${displayPriceWithEuro(packData.price || packData.packPrice || packData.totalPrice)}</button>
        </div>
         <button class="btn-acheter-desktop">${displayPriceWithEuro(packData.price || packData.packPrice || packData.totalPrice)}</button>
      </div>
    </div>

    <div class="track">

    <div class="track-list-center">
      <div class="track-list">
      <span class="track-number">#</span>
      <span class="track-title">Titre</span>
      <span class="track-artist-placement">Artiste</span>
      <span class="track-duration-placement">Durée</span>
      <span class="track-price-placement">Prix</span>
      </div>
    </div> 

    ${packData.tracks.map((track, index) => `
    
 

      <div class="track-row" data-track-id="${track.id}">

      <span class="track-number">#${index + 1}</span>

<div class="track-title-column">

    <div class="track-card">
      <img src="${track.coverPack ? `${getFilePath(track.coverPack)}` : ''}"
      alt="${track.title} cover" 
     class="track-cover"
    >
   <button class="track-btn-play">
 <span class="track-preview-time">30</span> 

 </button>
  <audio
class="track-audio"
src="${getFilePath(track.audioName || track.audio)}"
></audio>
    </div>

      <p class="track-title">${track.title}</p>
      </div>
    
          <p class="track-artist">${track.artist}</p>

         

    <div class="track-duration">
          <span class="duration">${Math.floor(track.previewDuration / 60)}:${track.previewDuration % 60 < 10 ? '00' : ''}${track.previewDuration % 60}</span>
        </div>

        <button class="track-price"
        data-telechargement-url="${track.downloadZip}"
        data-download="${track.downloadPage}"
        >${displayPriceWithEuro(track.price || track.trackPrice || track.unitPrice)}</button>
      </div> 

  <div class="track-row-mobile" data-track-id="${track.id}">

      <span class="track-number-mobile">#${index + 1}</span>


    <div class="track-card-mobile">
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover-mobile"
    >   
    <span class="mobile-preview-time">30</span>
    <audio class="mobile-track-audio" src="${getFilePath(track.audioName || track.audio)}"></audio>

    </div>

  
  

      <div class="track-info">
          <p class="track-title-mobile">${track.title}</p>
          <p class="track-artist-mobile">${track.artist}</p>
      </div>
         


        <button class="track-price-mobile"
        data-telechargement-url="${track.downloadZip}"
        data-download="${track.downloadPage}"
        >${displayPriceWithEuro(track.price || track.trackPrice || track.unitPrice)}</button>
      </div> 

  
    `).join('')}
    </div>
    </div>
    </section>
    `;

    const retourBtn = document.querySelector('.retour');

    retourBtn.addEventListener('click', () => {
      window.location.href = "/home.html";
    });

    const trackRow = document.querySelectorAll('.track-row');
    let currentMobileAudio = null;
    let currentMobileRow = null;
    let currentMobileTimer = null;
    let mobilePreviewInterval = null;

    const mobileTrackRows = document.querySelectorAll(".track-row-mobile");

    mobileTrackRows.forEach((row) => {
      const audio = row.querySelector(".mobile-track-audio");
      const timer = row.querySelector(".mobile-preview-time");

      row.addEventListener("click", () => {
        // Si une autre track jouait déjà, on la reset
        if (currentMobileAudio && currentMobileAudio !== audio) {
          currentMobileAudio.pause();
          currentMobileAudio.currentTime = 0;

          if (currentMobileRow) {
            currentMobileRow.classList.remove("mobile-playing");
          }

          if (currentMobileTimer) {
            currentMobileTimer.style.display = "none";
            currentMobileTimer.textContent = "30";
          }

          clearInterval(mobilePreviewInterval);
        }

        // Si on reclique sur la même track active : stop
        if (currentMobileAudio === audio && !audio.paused) {
          audio.pause();
          audio.currentTime = 0;

          row.classList.remove("mobile-playing");
          timer.style.display = "none";
          timer.textContent = "30";

          clearInterval(mobilePreviewInterval);

          currentMobileAudio = null;
          currentMobileRow = null;
          currentMobileTimer = null;

          return;
        }

        // Play propre
        audio.currentTime = 0;
        audio.play();

        currentMobileAudio = audio;
        currentMobileRow = row;
        currentMobileTimer = timer;

        row.classList.add("mobile-playing");

        let timeLeft = 30;
        timer.textContent = timeLeft;
        timer.style.display = "flex";

        clearInterval(mobilePreviewInterval);

        mobilePreviewInterval = setInterval(() => {
          timeLeft--;
          timer.textContent = timeLeft;

          if (timeLeft <= 0) {
            clearInterval(mobilePreviewInterval);

            audio.pause();
            audio.currentTime = 0;

            row.classList.remove("mobile-playing");
            timer.style.display = "none";
            timer.textContent = "30";

            currentMobileAudio = null;
            currentMobileRow = null;
            currentMobileTimer = null;
          }
        }, 1000);
      });
    });

    if (pageName) {
      pageName.textContent = "V0.9.3 - Sonara ";
    };

    if (btnAccueil) {
      btnAccueil.addEventListener("click", () => {
        console.log("click accueil")

        window.location.href = "/home.html";
        btnAccueil.classList.add("active");
      });
    }

    lucide.createIcons();

    const btnAcheter = document.querySelectorAll('.btn-acheter, .btn-acheter-desktop');
    const btnAcheterTrack = document.querySelectorAll('.track-price')
    const noticeOverlay = document.querySelector('.notice-overlay');
    const noticeClose = document.querySelector('.notice-close');
    const noticeRefuse = document.querySelector('.notice-refuse');
    const noticeAccept = document.querySelector('.notice-accept');

    console.log(btnAcheter);
    console.log(noticeOverlay);
    console.log(noticeClose);
    console.log(noticeRefuse);
    console.log(noticeAccept);


    let currentTrackAudio = null;
    let currentTrackBtn = null;
    let trackPreviewTimeout = null;
    let previewInterval = null;

    const trackButtons = document.querySelectorAll(".track-btn-play");

    trackButtons.forEach((trackBtn) => {

      const trackCard = trackBtn.closest(".track-card");
      const trackAudio = trackCard.querySelector(".track-audio");
      const timerElement = trackCard.querySelector(".track-preview-time");


      trackBtn.addEventListener("click", () => {
        playTrackPreview(trackAudio, trackBtn, timerElement);
      });

    });

    function playTrackPreview(audio, trackBtn) {

      const trackCard = trackBtn.closest(".track-card");
      const timerElement = trackCard.querySelector(".track-preview-time");
      const trackRowActive = trackBtn.closest(".track-row");
      // RECILC = STOP
      if (currentTrackAudio === audio && !audio.paused) {

        audio.pause();
        audio.currentTime = 0;

        trackBtn.classList.remove("active");
        trackBtn.classList.remove("pause");
        trackBtn.classList.add("play");


        clearTimeout(trackPreviewTimeout);
        clearInterval(previewInterval);


        trackBtn.style.opacity = "1";
        trackRowActive.style.background = " rgba(90, 71, 71, 0.197)"
        timerElement.style.display = "none";

        timerElement.textContent = "30";




        return;
      }

      // STOP ancien audio
      if (currentTrackAudio && currentTrackAudio !== audio) {
        currentTrackAudio.pause();
        currentTrackAudio.currentTime = 0;

        trackBtn.style.display = "0"
      }

      // RESET ancien bouton
      if (currentTrackBtn && currentTrackBtn !== trackBtn) {
        const oldTrackCard = currentTrackBtn.closest(".track-card");
        const oldTrackRow = currentTrackBtn.closest(".track-row");
        const oldTimerElement = oldTrackCard.querySelector(".track-preview-time");

        currentTrackBtn.classList.remove("active");
        currentTrackBtn.classList.remove("pause");
        currentTrackBtn.classList.add("play");

        currentTrackBtn.style.opacity = "0";

        oldTimerElement.style.display = "none";
        oldTimerElement.textContent = "30";

        oldTrackCard.removeAttribute("style");
        oldTrackRow.removeAttribute("style");
      }

      clearTimeout(trackPreviewTimeout);
      clearInterval(previewInterval);

      currentTrackAudio = audio;
      currentTrackBtn = trackBtn;

      trackBtn.classList.add("active");
      trackBtn.classList.remove("play");
      trackBtn.classList.add("pause");

      audio.currentTime = 0;
      audio.play();


      // TIMER
      let remainingTime = 30;

      timerElement.textContent = "30";

      trackBtn.style.opacity = "1";
      trackRowActive.style.background = " rgba(90, 71, 71, 0.197)";
      timerElement.style.display = "flex";

      previewInterval = setInterval(() => {

        remainingTime--;

        timerElement.textContent = remainingTime;

        if (remainingTime <= 0) {
          clearInterval(previewInterval);
        }
        console.log(timerElement);
      }, 1000);


      trackPreviewTimeout = setTimeout(() => {

        audio.pause();
        audio.currentTime = 0;

        trackBtn.classList.remove("active");
        trackBtn.classList.remove("pause");
        trackBtn.classList.add("play");


        timerElement.textContent = "0";


        trackBtn.style.opacity = "0";
        trackRowActive.style.background = " rgba(90, 71, 71, 0.197)";
        timerElement.style.display = "";

        clearInterval(previewInterval);


        currentTrackAudio = audio;
        currentTrackBtn = trackBtn;

      }, 30000);

    }


    const zipTrackButtons = document.querySelectorAll(".track-price, .track-price-mobile");


    let selectedDownloadUrl = null

    zipTrackButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const trackRow = btn.closest("[data-track-id]");

        selectedPackId = packData.id;
        selectedTrackId = trackRow?.dataset.trackId || null;
        selectedPurchaseType = "track";
        selectedDownloadUrl = btn.dataset.download;

        if (!selectedTrackId) {
          showPopup({
            type: "error",
            title: "Track introuvable",
            message: "Recharge la page puis réessaie."
          });
          return;
        }

        openPackLicenseNotice(
          packData.tracks?.find((track) => String(track.id) === String(selectedTrackId)) || null
        );
      });
    });


    btnAcheter.forEach(btn => {
      btn.addEventListener("click", () => {

        selectedPackId = packData.id;
        selectedTrackId = null;
        selectedPurchaseType = "pack";

        openPackLicenseNotice(packData);
      });
    });


    noticeClose.addEventListener("click", closePackLicenseNotice);

    noticeRefuse.addEventListener("click", closePackLicenseNotice);

    noticeOverlay.addEventListener("click", (event) => {
      if (event.target === noticeOverlay) closePackLicenseNotice();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && noticeOverlay.style.display === "flex") {
        closePackLicenseNotice();
      }
    });

    noticeAccept.addEventListener("click", () => {
      startStripePayment();
    });




  }

};



const profile = getStoredPackProfile();

const mobileCreateBtn = document.querySelector(".nav-mobile-create");

if (mobileCreateBtn && profile?.role !== "both") {
  mobileCreateBtn.style.display = "none";
}

function setActiveNav(activeBtn) {
  document.querySelectorAll(".nav-mobile-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  activeBtn.classList.add("active");
}


document.querySelector(".nav-mobile-home").addEventListener("click", () => {
    setActiveNav(document.querySelector(".nav-mobile-home"))
  window.location.href = "/home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
  window.location.href = "creator.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {


  window.location.href = "library.html"
});

async function initializePackPage() {
  const loadingStartedAt = Date.now();

  try {
    updatePackLoading(10, "Préparation du pack…");

    if (!packId) {
      throw new Error("Lien de pack invalide.");
    }

    updatePackLoading(48, "Connexion au catalogue Sonara…");
    updatePackLoading(66, "Chargement du pack…");

    await loadPack();
    await finishPackLoading(loadingStartedAt, "Pack prêt");
  } catch (error) {
    console.error("Erreur ouverture du pack :", error);

    const message =
      error?.message ||
      "Impossible d’ouvrir ce pack.";

    updatePackLoading(100, message);
    await waitForPackMinimum(loadingStartedAt);

    showPopup({
      type: "error",
      title: "Pack indisponible",
      message
    });
  }
}

initializePackPage();

