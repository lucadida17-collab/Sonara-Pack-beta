

let packs = [];

const API_BASE =
 window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.18:3000"
    : "https://sonara-pack-beta.onrender.com";

    const R2_PUBLIC_URL = "https://pub-17f0bc248a3549bea1cec66ac9f6abe1.r2.dev"

function getFilePath(file) {
  if (!file) return "";

  if (file.startsWith("http")) return file;

  if (file.startsWith("/uploads/")) {
    return `${API_BASE}${file}`;
  }

  if (file.startsWith("uploads/")) {
    return `${API_BASE}/${file}`;
  }

  if (
    file.startsWith("packs/") ||
    file.startsWith("tracks/") ||
    file.startsWith("artists/") ||
    file.startsWith("zips/")
  ) {
    return `${R2_PUBLIC_URL}/${file}`;
  }

  return `${API_BASE}/uploads/${file}`;
}

async function loadHome() {
  const response = await fetch(`${API_BASE}/api/packs`);

  packs = await response.json();

  console.log("PACKS RECUS :", packs);

  renderHome();
}
loadHome();



function resetAccount() {
  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");

  window.location.href = "app/pages/chaos.html";
}

const content = document.querySelector(".scroll-zone");
const btnAccueil = document.querySelector('.accueil-btn');
const pageName = document.querySelector('.page');

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
        const imageUrl = `${API_BASE}/uploads/${pack.coverPack}`;

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
        })

        row.appendChild(card);
      }
    });
  });
}


function renderHome() {
  const allCategories = [...new Set(
    packs.flatMap(pack => pack.categorie || [])
  )];

  content.innerHTML = allCategories.map(cat => `
    <section class="pack-categorie">
      <div class="categorie-header">
        <h2>${formatCategoryName(cat)}</h2>
        <button class="scroll-btn left">‹</button>
        <button class="scroll-btn right">›</button>
      </div>

      <div class="pack-row" data-cat="${cat}"></div>
    </section>
  `).join("");

  renderCards();
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

const updateModal = `
<div class="update-modal-overlay" id="updateModal">
<div class="update-modal-box">
 
 <button class="update-modal-close" id="closeUpdateModal">
 ×
 </button>

 <div class="update-modal-content">

 <h2 class="update-modal-kicker">
   Nouveautés
 </h2>

    <div class="update-modal-title">
      Derniére mise à jour : V0.9.99 - Version VIP test
    </div>

    <div class="update-modal-news">
    <ul>
<li> • Tout les pack ne dépende plus des mises a jour</li>
<li> • Amélioration de l'interface utilisateur</li>
<li> • Correction de bugs mineurs et optimisation des performances globales.</li>
<li> • Track sur les pack</li>
<li> • Appuyer sur les tracks et 30 sec de son se met a jouer</li>
<li> • payement séparé vous payer un son </li>
<li> • payement global vous payer le pack entier </li>
<li> • Coté artiste un systéme d'upload est prévu</li>

</ul>

<p>
Si le test se passe bien, les artistes pourront 
bientôt uploader leurs sons, fixer leurs prix et vendre
leurs packs directemment. 
fixer un prix, </p>
</div>


<p> • compte à rebours pour le lancement de la version 1.0 que pour VIP </p>

    <button class="update-modal-button" id="continueUpdateModal">
      Continuer
    </button>
  </div>
</div>
`;

console.log("Update modal chargé");


const UPDATE_MODAL_VERSION = "v1.0";
const UPDATE_MODAL_KEY = "sonara-update-modal-seen";

const alreadySeenVersion = localStorage.getItem(UPDATE_MODAL_KEY);

console.log("Version actuelle du modal :", updateModal);
console.log("Version stockée dans localStorage :", localStorage.getItem(UPDATE_MODAL_KEY));
console.log("Clé du modal dans localStorage :", UPDATE_MODAL_KEY);
console.log("Version actuelle du modal :", UPDATE_MODAL_VERSION);
console.log("Le modal a-t-il été affiché ?", localStorage.getItem(UPDATE_MODAL_KEY) === UPDATE_MODAL_VERSION);
console.log("alreadySeenVersion :", alreadySeenVersion);

console.log("avant if");


if (alreadySeenVersion !== UPDATE_MODAL_VERSION) {
  console.log("Affichage du modal de mise à jour");

  document.body.insertAdjacentHTML('beforeend', updateModal);
  console.log("Modal inséré dans le DOM");

  const modal = document.getElementById('updateModal');
  const closeBtn = document.getElementById('closeUpdateModal');
  const continueBtn = document.getElementById('continueUpdateModal');

  console.log("Éléments du modal :", { modal, closeBtn, continueBtn });
  console.log("Affichage du modal", modal);
  console.log("Bouton de fermeture :", closeBtn);
  console.log("Bouton de continuer :", continueBtn);

  modal.style.display = 'flex';

  function closeModal() {
    localStorage.setItem(UPDATE_MODAL_KEY, UPDATE_MODAL_VERSION);
    modal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);

  continueBtn.addEventListener('click', closeModal);

  document.body.insertAdjacentHTML('beforeend', updateModal);


}

const updateModalElement = document.getElementById('updateModal');
const closeUpdateModalButton = document.getElementById('closeUpdateModal');
const continueUpdateModalButton = document.getElementById('continueUpdateModal');


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

function renderLibrary() {
  content.innerHTML = 
`
<head> 
  <link rel="stylesheet" href="app/css/library.css">
  </head>

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
   <head> 
  <link rel="stylesheet" href="app/css/library.css">
  </head>

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

const userResponse = await fetch(`${API_BASE}/api/users/${currentUser.id}`);
const freshUserData = await userResponse.json();
const freshUser = freshUserData.user;

const downloadedIds = freshUser?.downloadedPacks || [];

const response = await fetch(`${API_BASE}/api/packs`);
const allPacks = await response.json();

const packsTelecharges = allPacks.filter(pack =>
  downloadedIds.includes(pack.id)
);

  console.log("USER =", currentUser);
  console.log("DOWNLOADED IDS =", downloadedIds);
  console.log("ALL PACKS =", allPacks);
  console.log("PACKS TELECHARGES =", packsTelecharges);


  content.innerHTML = `
  <head> 
  <link rel="stylesheet" href="app/css/library.css">
  </head>

 <button class="choice-back-button">
  Retour
  </button>

    <section class="pack-accueil"
    <section class="pack-page">


    <div class="pack-grid">
           ${packsTelecharges.map((pack) => `
  <div class="pack-card" data-pack-id="${pack.id}">
    <img 
  class="pack-cover" 
  src="${getFilePath(pack.cover || pack.coverPack)}"
  alt="${pack.title}"
>
    <h3>${pack.title}</h3>
    <p>${pack.artist}</p>
  </div>
`).join("")}
       
    </div>
  </section>
  `;

   const choiceBackBtn = document.querySelector(".choice-back-button");

  choiceBackBtn.addEventListener("click", () => {
    renderChoiceTelechargement()
  });
};

function renderTrack() {
  content.innerHTML = `
   <head> 
  <link rel="stylesheet" href="app/css/library.css">
  </head>

 <button class="choice-back-button">
  Retour
  </button>
  `;
   const choiceBackBtn = document.querySelector(".choice-back-button");

    choiceBackBtn.addEventListener("click", () => {
    renderChoiceTelechargement()
  });
};



lucide.createIcons();





document.querySelectorAll(".pack-categorie").forEach(section => {
  const leftBtn = section.querySelector(".scroll-btn.left");
  const rightBtn = section.querySelector(".scroll-btn.right");
  const row = section.querySelector(".pack-row");

  leftBtn.addEventListener('click', () => {
    row.scrollBy({ left: -300, behavior: 'smooth' });
  });

  rightBtn.addEventListener('click', () => {
    row.scrollBy({ left: 300, behavior: 'smooth' });
  });
});



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
  window.location.href = "home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
  window.location.href = "app/pages/creator.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {
  setActiveNav(document.querySelector(".nav-mobile-library"))

  window.location.href = "app/pages/library.html" 
});

document.querySelector(".nav-mobile-search").addEventListener("click", () => {
setActiveNav(document.querySelector(".nav-mobile-search"))

    window.location.href = "app/pages/recherche.html";
});

document.querySelector(".nav-mobile-home").classList.add("active");

lucide.createIcons();
renderHome();
