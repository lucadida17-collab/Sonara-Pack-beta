

 const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);

const home = window.packs?.[0]

const heroDesktopTitle = document.querySelector('.hero-desktop-title');
const heroDesktopsubTitle = document.querySelector('.hero-desktop-subtitle');
const heroDesktopText = document.querySelector('.hero-desktop-text');
const heroDesktopPackTitle = document.querySelector('.hero-desktop-pack-title');
const heroDesktopPackText = document.querySelector('.hero-desktop-pack-text');
const heroPackButtonText = document.querySelector('.hero-pack-button-text');


if (home && heroDesktopTitle) {
    heroDesktopTitle.textContent = `Sonara Pack Bêta Privé Version `
};

if (home && heroDesktopsubTitle) {
    heroDesktopsubTitle.textContent = `Ton projet mérite un son qui marque`
};

if (home && heroDesktopText) {
    heroDesktopText.textContent = `Un Projet. 
    Du Contenue. 
    Un Film. 
    Un Tiktok.
    Un pack réutilisable fait pour.
    (Gratuit pour la bêta privé)`
}; 


if (home && heroDesktopPackTitle) {
    heroDesktopPackTitle.textContent = home.title
};

if (home && heroDesktopPackText) {
    heroDesktopPackText.textContent = `${home.title} est le premier pack exlusive de Sonara ! 
    soyez le premier à le télécharger Gratuitement`
};

if ( home && heroPackButtonText) {
    heroPackButtonText.textContent = `voir ${home.title}`
};


const heroTitle = document.querySelector('.hero-title');
const heroSubTitle = document.querySelector('.hero-subtitle');
const heroText = document.querySelector('.hero-text');
const heroPackTitle = document.querySelector('.hero-pack-title');
const heroPackText = document.querySelector('.pack-text');
const PackButtonText = document.querySelector('.pack-button-text');
const packCarteAccueil = document.querySelector('.pack-carte-accueil');

if (home && packCarteAccueil) {
    packCarteAccueil.src = `../${home.coverPack}`;
    packCarteAccueil.alt = `Cover ${home.title}`
};


if (home && heroTitle) {
    heroTitle.textContent = `Sonara Pack - Version bêta privé`
};

if (home && heroSubTitle) {
    heroSubTitle.textContent = `Ton projet mérite un 
    son qui marque `
};

if (home && heroText) {
    heroText.textContent = `Un Projet.
     Du Contenue. Un Film.
     un pack unique fait pour. 
     et en plus la bêta privé est 100% gratuite
     (profite bien de cette occasion.)`
};


if (home && heroPackTitle) {
    heroPackTitle.textContent = home.title
};

if (home && heroPackText) {
    heroPackText.textContent = `${home.title} est le premier pack exlusive de sonara ! 
    soyez le premier à le télécharger gratuitement.`
};

if ( home && PackButtonText) {
    PackButtonText.textContent = `voir ${home.title}`
};





const introScreen = document.querySelector('.intro-screen');
const textMarque = document.querySelector('.intro-title');




setTimeout(() => {
    textMarque.classList.add('hide');
}, 3000);

setTimeout(() => {
    introScreen.style.display = 'none';
}, 5500);

const btn = document.querySelector('.pack-button');
const desktopBtn = document.querySelector('.hero-pack-button');




if (btn){
 window.addEventListener('pageshow', () => {
    btn.classList.remove('flash');
 });

btn.addEventListener('click', () => {
    const packId = btn.dataset.id;


    btn.classList.add('flash');
    
    setTimeout(() => {
       window.location.href = `app/pages/pack-detail.html?id=${packId}`;
    }, 900);
    

});    
}

if (desktopBtn) {
 window.addEventListener('pageshow', () => {
    desktopBtn.classList.remove('flash');
 });

desktopBtn.addEventListener('click', () => {
   const packId = desktopBtn.dataset.id;

    desktopBtn.classList.add('flash');
    
    setTimeout(() => {   
       window.location.href = `app/pages/pack-detail.html?id=${packId}`;
    },900);
    
}); 
}

const btnHeroRoadmap = document.querySelector('.hero-roadmap-button');

if (btnHeroRoadmap) {
 window.addEventListener('pageshow', () => {
    btnHeroRoadmap.classList.remove('flash');
 });

btnHeroRoadmap.addEventListener('click', () => {
   

    btnHeroRoadmap.classList.add('flash');
    
    setTimeout(() => {
       window.location.href = `app/roadmap.html`;
    },900);
    
}); 
}


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
