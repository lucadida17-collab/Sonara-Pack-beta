"use strict";
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

const downloadPage = document.querySelector(".download-page");

const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const trackId = params.get("trackId");

let currentUser = JSON.parse(
  localStorage.getItem("sonaraProfile")
);

if (!currentUser) {
  console.log("Aucun Utilisateur connecter")
}


let selectedDownload = null;

const isMobile =
  window.innerWidth <= 768 ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function renderLayout() {
  if (isMobile) {
    downloadPage.innerHTML = `
      <section class="download-mobile">
        <div class="download-mobile-card">
          <p class="download-kicker">SONARA PACK</p>

          <h1 class="download-mobile-title">Téléchargement prêt</h1>

          <p class="download-mobile-text">
            Votre fichier est prêt. Sur mobile, appuyez sur le bouton ci-dessous pour lancer le téléchargement.
          </p>

          <button class="download-button">Télécharger le fichier</button>
          <button class="download-home-button">Retour à l’accueil</button>
        </div>
      </section>
    `;
  } else {
    downloadPage.innerHTML = `
      <section class="download-desktop">
        <div class="download-desktop-card">
          <p class="download-kicker">SONARA PACK</p>

          <h1 class="download-title">Préparation du téléchargement</h1>

          <div class="download-loader"></div>

          <p class="download-text">
            Votre fichier est en cours de préparation...
          </p>
        </div>
      </section>
    `;
  }
}

function renderError(message) {
  downloadPage.innerHTML = `
    <section class="download-desktop">
      <div class="download-desktop-card">
        <p class="download-kicker">SONARA PACK</p>
        <h1 class="download-title">Téléchargement impossible</h1>
        <p class="download-text">${message}</p>
        <button class="download-home-button">Retour à l’accueil</button>
      </div>
    </section>
  `;

  const homeButton = document.querySelector(".download-home-button");
  if (homeButton) {
    homeButton.addEventListener("click", () => {
      window.location.href = "/home.html";
    });
  }
}

function getFinalDownloadUrl() {
  if (!selectedDownload || !selectedDownload.downloadZip) {
    return null;
  }

  return `${getFilePath(selectedDownload.downloadZip)}`;
}

function downloadFile() {
  const finalUrl = getFinalDownloadUrl();

  if (!finalUrl) {
    console.log("Aucun ZIP trouvé :", selectedDownload);
    renderError("Aucun fichier ZIP disponible pour ce téléchargement.");
    return;
  }

  console.log("ZIP FINAL =", finalUrl);

  const link = document.createElement("a");
  link.href = finalUrl;
  link.download = `${selectedDownload.title || "sonara-pack"}.zip`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function finishDesktopDownload() {
  const title = document.querySelector(".download-title");
  const text = document.querySelector(".download-text");

  if (title) title.textContent = "Téléchargement terminé";
  if (text) text.textContent = "Merci pour votre achat. Retour automatique à l’accueil...";

  setTimeout(() => {
    window.location.href = "/home.html";
  }, 6000);
}

function connectMobileButtons() {
  const downloadButton = document.querySelector(".download-button");
  const homeButton = document.querySelector(".download-home-button");

  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      downloadFile();
      downloadButton.textContent = "Téléchargement lancé";
    });
  }

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      window.location.href = "/home.html";
    });
  }
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Accès au téléchargement refusé.");
  }

  return data;
}

function getCurrentUserId() {
  return currentUser?.id || currentUser?.accountId || "";
}

async function refreshCurrentUser() {
  const userId = getCurrentUserId();

  if (!userId) {
    throw new Error("Reconnecte-toi pour accéder à ce téléchargement.");
  }

  const response = await fetch(`${API_URL}/api/profile/${encodeURIComponent(userId)}`);
  const profile = await readJsonResponse(response);

  currentUser = {
    ...currentUser,
    ...profile
  };

  localStorage.setItem("sonaraProfile", JSON.stringify(currentUser));
  return currentUser;
}

function hasDownloadAccess(profile) {
  const ownedIds = trackId
    ? profile.downloadedTracks
    : profile.downloadedPacks;
  const expectedId = trackId || packId;

  return (
    Array.isArray(ownedIds) &&
    ownedIds.some((id) => String(id) === String(expectedId))
  );
}

async function confirmStripePurchase() {
  const sessionId = params.get("session_id");

  if (!sessionId) return;

  const response = await fetch(`${API_URL}/api/stripe/confirm-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId,
      userId: getCurrentUserId()
    })
  });

  await readJsonResponse(response);
}

async function loadDownloadData() {
  renderLayout();

  try {
    if (!currentUser) {
      throw new Error("Reconnecte-toi pour accéder à ce téléchargement.");
    }

    const response = await fetch(`${API_URL}/api/packs`);
    const packs = await readJsonResponse(response);
    const selectedPack = packs.find((pack) => String(pack.id) === String(packId));

    if (!selectedPack) {
      throw new Error("Pack introuvable.");
    }

    await confirmStripePurchase();
    const freshProfile = await refreshCurrentUser();

    if (!hasDownloadAccess(freshProfile)) {
      throw new Error("Achat ou accès gratuit non vérifié pour ce compte.");
    }

    selectedDownload = trackId
      ? selectedPack.tracks?.find((track) => String(track.id) === String(trackId))
      : selectedPack;

    if (!selectedDownload) {
      throw new Error("Fichier introuvable.");
    }

    if (isMobile) {
      connectMobileButtons();
    } else {
      setTimeout(() => {
        downloadFile();
        finishDesktopDownload();
      }, 2000);
    }
  } catch (error) {
    console.error("Erreur download :", error);
    renderError(error.message || "Erreur de connexion au serveur.");
  }
}

loadDownloadData();
