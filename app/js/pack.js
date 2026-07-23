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

  popup.querySelector(".sonara-popup-btn").addEventListener("click", () => {
    popup.remove();
  });
}

let selectedPackId = null;
let selectedTrackId = null;
let selectedPurchaseType = null;


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

    const purchaseType = selectedTrackId ? "track" : "pack";

    const payload = {
      userId: profile.id,
      packId: selectedPackId,
      trackId: selectedTrackId || null,
      purchaseType
    };

    console.log("🟢 [FRONT 5] Payload envoyé au backend :", payload);

    const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log("🟢 [FRONT 6] Réponse HTTP reçue");
    console.log("res.ok :", res.ok);
    console.log("status :", res.status);
    console.log("statusText :", res.statusText);

    let data;

    try {
      data = await res.json();
      console.log("🟢 [FRONT 7] JSON backend :", data);
    } catch (jsonError) {
      console.log("🔴 [STOP FRONT] Impossible de lire le JSON");
      console.error(jsonError);

      showPopup({
        type: "error",
        title: "Erreur serveur",
        message: "Le serveur n'a pas renvoyé de JSON valide."
      });

      return;
    }

    if (!res.ok) {
      console.log("🔴 [STOP FRONT] Backend a refusé la requête");
      console.log("Erreur backend :", data);

      showPopup({
        type: "error",
        title: "Paiement pas trouvé",
        message: data?.error || data?.message || "Recharge la page puis réessaie."
      });

      return;
    }

    if (!data.url) {
      console.log("🔴 [STOP FRONT] data.url manquant");
      console.log("Data reçue :", data);

      showPopup({
        type: "error",
        title: "Lien Stripe introuvable",
        message: "Le serveur n'a pas renvoyé de lien de paiement."
      });

      return;
    }

    console.log("🟢 [FRONT 8] Redirection Stripe OK");
    console.log("URL Stripe :", data.url);
    console.log("====================================");

    window.location.href = data.url;

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

const params = new URLSearchParams(window.location.search);

const packId = params.get("id");
const trackId = params.get("trackId");

let packData = null;

async function loadPack() {

  const response = await fetch(`${API_URL}/api/packs`);

  const packs = await response.json();

  console.log("ID DANS URL :", packId);
  console.log("PACKS REÇUS :", packs);
  console.log("IDS DISPONIBLES :", packs.map(pack => pack.id));

  packData = packs.find(pack => pack.id === packId);

  console.log("PACK :", packData);

  console.log("PACK :", packData);

  if (!packData) return;

  renderPack();

}

loadPack();

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

        <button class="btn-acheter">${packData.price}</button>
        </div>
         <button class="btn-acheter-desktop">${packData.price}</button>    
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
        >${track.price}</button>
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
        >${track.price}</button>
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

    const loaderText = document.querySelector('.loader-text')

    if (loaderText) {
      loaderText.textContent = 'Chargement...'
    };


    if (btnAccueil) {
      btnAccueil.addEventListener("click", () => {
        console.log("click accueil")

        window.location.href = "/home.html";
        btnAccueil.classList.add("active");
      });
    }

    lucide.createIcons();

    setTimeout(() => {
      const loader = document.querySelector('.loader');

      if (loader) {
        loader.classList.add("hide");

        setTimeout(() => {
          loader.remove();
        }, 300);
      }
    });

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

        console.log("BTN DATASET =", btn.dataset);
        console.log("BTN DOWNLOAD =", btn.dataset.download);

        selectedDownloadUrl = btn.dataset.download;

        console.log("ZIP TRACK CLICK :", selectedDownloadUrl);

        noticeOverlay.style.display = "flex";
      });
    });


    btnAcheter.forEach(btn => {
      btn.addEventListener("click", () => {

        selectedPackId = packData.id;
        selectedTrackId = null;
        selctedPurchaseType = "pack";

        noticeOverlay.style.display = "flex";
      });
    });


    noticeClose.addEventListener("click", () => {
      noticeOverlay.style.display = "none";
    });

    noticeRefuse.addEventListener("click", () => {
      noticeOverlay.style.display = "none";
    });

    noticeAccept.addEventListener("click", () => {
      startStripePayment();
    });




  }

};



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
    setActiveNav(document.querySelector(".nav-mobile-home"))
  window.location.href = "/home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
  window.location.href = "creator.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {


  window.location.href = "library.html"
});





