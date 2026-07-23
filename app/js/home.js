

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

async function loadHome() {
  const response = await fetch(`${API_URL}/api/packs`);

  packs = await response.json();

  console.log("PACKS RECUS :", packs);

  renderHome();
}
loadHome();



function resetAccount() {
  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");

  window.location.href = "app/pages/inscription.html";
}

const content = document.querySelector(".main-content");
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

renderHome();

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



document.querySelector(".nav-mobile-home").classList.add("active");

lucide.createIcons();

