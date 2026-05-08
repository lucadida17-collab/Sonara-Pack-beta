

 const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);

const home = window.packs?.[0]

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

card.innerHTML = `
<div class="cover">
  <img src="${pack.coverPack}"
  class="image-cover">
</div>

<div class="info">
<p class="title">${pack.title}</p>
<p class="artist">${pack.artist}</p>
</div>
`;

card.addEventListener("click", () => {
    window.location.href = pack.packUrl;
})

row.appendChild(card);
      }
    });
   });
  }


function renderHome() {

    content.innerHTML = `

<section class="pack-categorie">
<div class="categorie-header">
<h2>Piano</h2>
<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>
</div>
 <div class="pack-row" data-cat="piano"></div>
</section>

<section class="pack-categorie">
<div class="categorie-header">
<h2>Cinématique</h2>
<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>
</div>
 <div class="pack-row" data-cat="cinematic"></div>
</section>

<section class="pack-categorie">
<div class="categorie-header">
<h2>Espace</h2>
<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>
</div>
 <div class="pack-row" data-cat="espace"></div>
</section>


<section class="pack-categorie">
<div class="categorie-header">
<h2>Tiktok</h2>


<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>


</div>
 <div class="pack-row" data-cat="tiktok"></div>
</section>





<section class="pack-categorie">
<div class="categorie-header">
<h2>Youtube</h2>
<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>
</div>
 <div class="pack-row" data-cat="youtube"></div>
</section>

<section class="pack-categorie">
<div class="categorie-header">
<h2>Film</h2>
<button class="scroll-btn left">‹</button>
<button class="scroll-btn right">›</button>
</div>
 <div class="pack-row" data-cat="film"></div>
</section>
 `

    renderCards();
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
        renderHome();
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

renderHome();



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
