"use strict";



    const R2_PUBLIC_URL = "https://pub-17f0bc248a3549bea1cec66ac9f6abe1.r2.dev";

function getFilePath(file) {
  if (!file) return "";

  if (file.startsWith("http")) return file;

  if (file.startsWith("/downloads/")) return `${API_URL}${file}`;
    if (file.startsWith("downloads/")) return `${API_URL}/${file}`;

  if (file.startsWith("/uploads/")) return `${API_URL}${file}`;
  if (file.startsWith("uploads/")) return `${API_URL}/${file}`;

  if (
    file.startsWith("packs/") ||
    file.startsWith("tracks/") ||
    file.startsWith("artists/") ||
    file.startsWith("zips/")
  ) {
    return `${R2_PUBLIC_URL}/${file}`;
  }

  return `${API_URL}/uploads/${file}`;
}

const downloadPage = document.querySelector(".download-page");

const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const trackId = params.get("trackId");

const currentUser = JSON.parse(
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
      window.location.href = "../../home.html";
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
    window.location.href = "../../home.html";
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
      window.location.href = "../../home.html";
    });
  }
}

async function loadDownloadData() {
  renderLayout();

  try {
    const response = await fetch(`${API_URL}/api/packs`);
    const packs = await response.json();

    const selectedPack = packs.find((pack) => pack.id === packId);


    if (currentUser && selectedPack && !trackId) {
  console.log("ENVOI ADD PACK =", {
    userId: currentUser.id,
    packId: selectedPack.id
  });

  const addResponse = await fetch(`${API_URL}/api/add-downloaded-pack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userId: currentUser.id,
      packId: selectedPack.id
    })
  });

  const addData = await addResponse.json();

  console.log("REPONSE ADD PACK =", addData);
}

if (currentUser && selectedPack && trackId) {

    const addResponse = await fetch(`${API_URL}/api/add-downloaded-track`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            userId: currentUser.id,
            trackId: trackId
        })
    });

    const addData = await addResponse.json();

    console.log("REPONSE ADD TRACK =", addData);
}

    console.log("PACK ID URL =", packId);
    console.log("TRACK ID URL =", trackId);
    console.log("SELECTED PACK =", selectedPack);

    if (!selectedPack) {
      renderError("Pack introuvable.");
      return;
    }

    if (trackId) {
      selectedDownload = selectedPack.tracks.find(
        (track) => String(track.id) === String(trackId)
      );
    } else {
      selectedDownload = selectedPack;
    }

    console.log("DOWNLOAD DATA =", selectedDownload);

    if (!selectedDownload) {
      renderError("Fichier introuvable.");
      return;
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
    renderError("Erreur de connexion au serveur.");
  }
}

loadDownloadData();