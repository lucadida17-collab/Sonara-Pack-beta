const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);

const packList = document.querySelector(".pack-list");

const content = document.querySelector(".scroll-zone");
const btnAccueil = document.querySelector('.accueil-btn');
const pageName = document.querySelector('.page');


 if (selectedId && packList) {
    packList.innerHTML = `
    <div class="pack-hero">
    <div class="left-side">

    <div class="card">
      <img 
      src="../../${selectedId.coverPack}"
      class="cover">
      <alt="${selectedId.title} cover image"
      >
     
          <button class="playerBtnMob play"></button>
            <audio src="../../${selectedId.audio}">
            </audio>
    </div>
    

    <div class="cover-actions">
        <button class="playerBtn play"></button>
            <audio src="../../${selectedId.audio}">
            </audio>
    </div>
    </div>
    

      <div class="pack-info">
        <h1 class="title">${selectedId.title}</h1>
        <div class="artist-info">
          <img src="../../${selectedId.imageArtist}" alt="${selectedId.artist}" class="artist-image">
          <p class="artist">${selectedId.artist}</p>

        <button class="btn-acheter">${selectedId.price}</button>
        </div>
         <button class="btn-acheter-desktop">${selectedId.price}</button>
          
       
            
      </div>
    </div>
    
    `;

 };



const desktopBtn = document.querySelector('.playerBtn');
const desktopAudio = desktopBtn ? desktopBtn.nextElementSibling : null;

const mobilePlayer = document.querySelector('.playerBtnMob');
const audioMob = mobilePlayer ? mobilePlayer.nextElementSibling : null;

if (desktopBtn && desktopAudio) {
    desktopBtn.addEventListener("click", () => {
        if (desktopAudio.paused) {
            desktopAudio.play();
            desktopBtn.classList.remove("play");
            desktopBtn.classList.add("pause");
        } else {
            desktopAudio.pause();
            desktopBtn.classList.remove("pause");
            desktopBtn.classList.add("play");
        }
    });
}

if (mobilePlayer && audioMob) {
    mobilePlayer.addEventListener("click", () => {
        if (audioMob.paused) {
            audioMob.play();
            mobilePlayer.classList.remove("play");
            mobilePlayer.classList.add("pause");
        } else {
            audioMob.pause();
            mobilePlayer.classList.remove("pause");
            mobilePlayer.classList.add("play");
        }
    });
}   

if (pageName) {
    pageName.textContent = "V0.9.21 - Sonara " ;
};

const loaderText = document.querySelector('.loader-text')

if (loaderText) {
    loaderText.textContent = 'Chargement...'
};


if (btnAccueil) {
    btnAccueil.addEventListener("click", () => {
        console.log("click accueil")
        
        window.location.href = "../../index.html";
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
    const noticeOverlay = document.querySelector('.notice-overlay');
    const noticeClose = document.querySelector('.notice-close');
    const noticeRefuse = document.querySelector('.notice-refuse');
    const noticeAccept = document.querySelector('.notice-accept');

    console.log(btnAcheter);
    console.log(noticeOverlay);
    console.log(noticeClose);
    console.log(noticeRefuse);
    console.log(noticeAccept);      

    btnAcheter.forEach(btn => {
    btn.addEventListener("click", () => {
        
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
        window.location.href = selectedId.downloadUrl;
    });


renderHome();





const brandLogo = document.querySelector('.brand-logo');

 const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            brandLogo.currentTime = 0;
            brandLogo.play();
        } else {
            brandLogo.pause();
            brandLogo.currentTime = 0;
        }
    });
}, {
    threshold: 0.6
});

observer.observe(brandLogo);
