

const R2_PUBLIC_URL = "https://pub-17f0bc248a3549bea1cec66ac9f6abe1.r2.dev";

function getFilePath(file) {
  if (!file) return "";

  if (file.startsWith("http")) return file;

  if (file.startsWith("/uploads/")) {
    return `${API_URL}${file}`;
  }

  if (file.startsWith("uploads/")) {
    return `${API_URL}/${file}`;
  }

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

let packs = [];

const content = document.querySelector(".library-content");



    function formatDuration(seconds) {
        if (!seconds) return "--:--";

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${secs}`;
    }

async function loadLibrary() {
    try {

        const response = await fetch(`${API_URL}/api/packs`);

        packs = await response.json();

        console.log("PACKS :", packs);

        renderLibrary();

    } catch (error) {

        console.error(error);

    }
}

loadLibrary();


function renderLibrary() {
    content.innerHTML =
        `

<section class="library-accueil">
  <section class="library-page">
  <h1 class="library-title">Bibliothèque</h1>

  <button class="library-downloads-btn">
  Mes téléchargements
  </button>
  </section>
  </section>
  `;

    const libraryChoiceDownload = document.querySelector(".library-downloads-btn")

    libraryChoiceDownload.addEventListener("click", () => {
        renderChoiceTelechargement();
    });


}




function renderChoiceTelechargement() {
    content.innerHTML = `


 <button class="choice-back-button">
  Retour
  </button>

  <section class="choice-accueil">
  <section class="choice-page">
 
  <button class="choice-btn pack-telecharger">
  Pack Télécharger
  </button>

  <button class="choice-btn track-telecharger">
  Track Télécharger
  </button>
  `

    const choiceBackBtn = document.querySelector(".choice-back-button");
    const packTelecharger = document.querySelector(".pack-telecharger");
    const trackTelecharger = document.querySelector(".track-telecharger");


    choiceBackBtn.addEventListener("click", () => {
        renderLibrary();
    });

    packTelecharger.addEventListener("click", () => {
        renderPack();
    });

    trackTelecharger.addEventListener("click", () => {
        renderTrack();
    });
};




async function renderPack() {

    const currentUser = JSON.parse(
        localStorage.getItem("sonaraProfile")
    );

    const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`);
    const freshUserData = await userResponse.json();
    const freshUser = freshUserData.user;

    const downloadedIds = freshUser?.downloadedPacks || [];

    const response = await fetch(`${API_URL}/api/packs`);
    const allPacks = await response.json();

    const packsTelecharges = allPacks.filter(pack =>
        downloadedIds.includes(pack.id)
    );

    console.log("USER =", currentUser);
    console.log("DOWNLOADED IDS =", downloadedIds);
    console.log("ALL PACKS =", allPacks);
    console.log("PACKS TELECHARGES =", packsTelecharges);


    content.innerHTML = `

     <button class="choice-back-button">
  Retour
  </button>


    <section class="pack-accueil">
    <section class="pack-page">


    <div class="pack-grid">
           ${packsTelecharges.map((pack) => `
  <div class="pack-card" data-pack-id="${pack.id}">

    <img 
  class="pack-cover" 
  src="${getFilePath(pack.coverPack)}"
  alt="${pack.title}"
>
    <h3>${pack.title}</h3>
    <p>${pack.artist}</p>
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


    const packData = packs.find(pack => pack.id === packId);


    content.innerHTML = `
  
   <button class="choice-back-button">
  Retour
  </button>

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
          <img src="${getFilePath(packData.imageArtist)}" class="artist-image">
          <p class="artist">${packData.artist}</p>

        <button class="js-download-pack"
        data-download="${packData.downloadPage || `download.html?id=${packData.id}`}">Télécharger</button>
        </div>
         <button class="js-download-pack-desktop"
         data-download="${packData.downloadPage || `download.html?id=${packData.id}`}">Télécharger</button>    
      </div>
    </div>
   <div class="track-row-separator"></div>
    <div class="track">

    <div class="track-list-center">
      <div class="track-list">
      <span class="track-number">#</span>
      <span class="track-title track-cover">Titre</span>
      <span class="track-artist-placement">Artiste</span>
      <span class="track-duration-placement">Durée</span>
      <span class="track-price-placement">Retéléchargement</span>
      </div>
    </div> 

    ${packData.tracks.map((track, index) => `
    
 

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
        data-download="${track.downloadPage}"
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
        data-download="${track.downloadPage}"
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

        window.location.href = downloadPage;
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

        window.location.href = downloadPage;
    });
});


}




async function renderTrack() {
    const currentUser = JSON.parse(
        localStorage.getItem("sonaraProfile")
    );

    const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`);
    const freshUserData = await userResponse.json();
    const freshUser = freshUserData.user;

    const downloadedTrackIds = freshUser?.downloadedTracks || [];

    const response = await fetch(`${API_URL}/api/packs`);
    const allPacks = await response.json();

    const downloadedTracks = [];

    allPacks.forEach(pack => {
        pack.tracks.forEach(track => {
            if (downloadedTrackIds.includes(track.id)) {
                downloadedTracks.push({
                    ...track,
                    packId: pack.id
                });
            }
        });
    });

console.log("TRACK IDS =", downloadedTrackIds);
console.log("TRACKS TELECHARGEES =", downloadedTracks);

    content.innerHTML = `

 <button class="choice-back-button">
  Retour
  </button>

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
        data-download="${track.downloadPage}"
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
        data-download="${track.downloadPage}"
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

        window.location.href = downloadPage;
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

        window.location.href = downloadPage;
    });
});

};



lucide.createIcons();

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
    window.location.href = "../../home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
    window.location.href = "creator.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {
    setActiveNav(document.querySelector(".nav-mobile-library"))

    renderLibrary();
});

document.querySelector(".nav-mobile-search").addEventListener("click", () => {
      setActiveNav(document.querySelector(".nav-mobile-search"))

    window.location.href = "recherche.html"
});


