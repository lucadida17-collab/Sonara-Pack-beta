
const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.22:3000"
    : "https://sonara-pack-beta.onrender.com";



const CreatePack = document.querySelector(".create-pack")

CreatePack.innerHTML = `
 <a href="../creator.html" class="back-btn">← Dashboard</a>

    <section class="hero">
      <p>MISSION CRÉATEUR</p>
      <h1>Forge ton pack</h1>
      <span>Construis un pack clair, légal et prêt à être validé.</span>
    </section>

    <section class="progress">
      <div class="step active">Identité</div>
      <div class="step">track</div>
      <div class="step">Prix Global</div>
      <div class="step">Droit</div>
    </section>

    <section class="mission-card" id="missionCard"></section>

  </main>

  <script src="../../js/create-pack.js"></script>
`;

const missionCard = document.querySelector("#missionCard");
const steps = document.querySelectorAll(".step");

let currentStep = 0;

const packData = {
  identity: {
    title: "",
    categorie: "",
    description: "",
    cover: null,
    coverUrl: "",
    coverName: ""
  },

  tracks: [],

  globalPrice: "",

  rights: {
    accepted: false,
    acceptedAt: null
  },

  finalPack: null
};

function savePackDraft() {
  localStorage.setItem("sonaraPackDraft", JSON.stringify(packData));
  console.log("BROUILLON PACK SAUVEGARDÉ :", packData);
}


function buildFinalPack() {
  const artistProfile =
    JSON.parse(localStorage.getItem("sonaraProfile")) || {};

  const packId = `pack_${Date.now()}`;

  packData.finalPack = {
 id: packId,

   title: packData.identity.title,

artist: artistProfile.artistname || "",
imageArtist: artistProfile.imageArtist || "",
imageArtist: artistProfile.imageArtist || null,

coverPack: packData.packCover?.name || "",
coverPackName: packData.packCover?.name || "",
coverPackFile: packData.packCover || null,

packLink: `app/pages/pack.html?id=${packId}`,

price: `${packData.globalPrice}€`,

categorie: [packData.identity.categorie],

downloadPage: `download.html?id=${packId}`,

    tracks: packData.tracks.map((track, index) => ({

      id: `${packId}-${index + 1}`,
       
      trackLink: `app/pages/pack.html?id=${packId}&trackId=${packId}-${index+1}`,
      downloadPage: `download.html?id=${packId}&trackId=${packId}-${index+1}`,
      title: track.title,

      artist: artistProfile.artistname || "",
      
   coverPack: track.coverFile ? track.coverFile.name : "",
coverPackFile: track.coverFile || null,

audioName: track.audioFile ? track.audioFile.name : "",
audioFile: track.audioFile || null,


      price: `${track.price}€`,

      previewDuration: 30,
      duration: track.duration || 0
    })),

    status: "pending",
    createdAt: new Date().toISOString()
  };

  console.log("FINAL PACK :", packData.finalPack);

  savePackDraft();
}


function loadPackDraft() {
  const saved = localStorage.getItem("sonaraPackDraft");
  if (!saved) return;

  Object.assign(packData, JSON.parse(saved));
  console.log("BROUILLON PACK RECHARGÉ :", packData);
}

const titles = [];
const prices = [];
const covers = [];
const audios = [];

let titleCount = 1;
let priceCount = 1;
let coverCount = 1;
let audioCount = 1;

const screens = [
  renderIdentity,
  renderAudio,
  renderPrice,
  renderLegal
];

function updateSteps() {
  steps.forEach((step, index) => {
    step.classList.toggle("active", index === currentStep);
  });
}

function render() {
  updateSteps();
  screens[currentStep]();
}

function renderIdentity() {
  missionCard.innerHTML = `
    <h2>Identité du pack</h2>
    <p>Donne une âme au pack. L'utilisateur doit comprendre directement l’ambiance.</p>

   <label>Titre du pack</label>

<input
  class="pack-title"
  placeholder="Ex : Nuit Cinématique"
  value="${packData.identity.title || ""}"
>

<label>Ambiance principale</label>

<select class="pack-mood" required>

  <option value="">
    Choisir une ambiance
  </option>

  <option 
    value="cinematique"
    ${packData.identity.categorie === "cinematique" ? "selected" : ""}
  >
    Cinématique
  </option>

  <option 
    value="sombre"
    ${packData.identity.categorie === "sombre" ? "selected" : ""}
  >
    Sombre
  </option>

  <option 
    value="calme"
    ${packData.identity.categorie === "calme" ? "selected" : ""}
  >
    Calme
  </option>

  <option 
    value="epique"
    ${packData.identity.categorie === "epique" ? "selected" : ""}
  >
    Épique
  </option>

  <option 
    value="emotionnel"
    ${packData.identity.categorie === "emotionnel" ? "selected" : ""}
  >
    Émotionnel
  </option>

    <option 
    value="dramatique"
    ${packData.identity.categorie === "dramatique" ? "selected" : ""}
  >
    Dramatique
  </option>

</select>

<label>Description</label>

<textarea
  class="pack-description"
  placeholder="Décris l’univers du pack"
>${packData.identity.description || ""}</textarea>

<label>Cover de la track</label>

<div class="upload-card">

  <input
    class="track-cover"
    type="file"
    accept="image/*"
    required
  >

  <div class="upload-content track-cover-preview">

    ${
      packData.identity.coverName
        ? `
          <span>${packData.identity.coverName}</span>
          <small>Cover chargée</small>
        `
        : `
          <span>Ajouter une cover</span>
        `
    }

  </div>

</div>

<div class="actions">
  <button class="next-btn">Continuer</button>
</div>
  `;

  const packCoverInput = document.querySelector(".track-cover");
const packCoverPreview = document.querySelector(".track-cover-preview");

packCoverInput.addEventListener("change", () => {
  const file = packCoverInput.files[0];
  if (!file) return;

  const imageUrl = URL.createObjectURL(file);

  packData.packCover = file;

  packCoverPreview.innerHTML = `
    <img class="track-cover-img" src="${imageUrl}">
    
    <div>
      <span>${file.name}</span>
      <small>Cover chargée</small>
    </div>
  `;
});

  document.querySelector(".pack-mood").value = packData.identity.categorie || "";

    document.querySelector(".next-btn").addEventListener("click", () => {
  packData.identity.title = document.querySelector(".pack-title").value.trim();
  packData.identity.categorie = document.querySelector(".pack-mood").value;
  packData.identity.description = document.querySelector(".pack-description").value.trim();

  packData.identity.cover = packData.packCover || null;
  packData.identity.coverUrl = packData.packCoverUrl || "";
  packData.identity.coverName = packData.packCoverName || "";



  console.log("ÉTAPE 1 — identité stockée :", packData.identity);
savePackDraft();
  currentStep++;
  render();
});
}

function renderAudio() {
  missionCard.innerHTML = `
<div class="track-container">
  <div class="track-card">
    <h2>Tracks 1</h2>
    <p>Ajoute les tracks qui composeront le pack. Chaque track pourra avoir son titre, son prix, sa cover et son fichier audio.</p>

    <label>Titre de la track</label>

<div class="title-clone-zone">
  <div class="input-line title-line">
    <input class="track-title" placeholder="Ex : Dernier Souffle">
  </div>
</div>
    

    <label>Prix de la track seule</label>

    <div class="price-clone-zone">
  <div class="input-line price-line">
    <input class="track-price" type="number" placeholder="Ex : 1.99" >
  </div>
</div>

    <p class="price-preview track-price-preview"></p>

    <label>Cover de la track</label>
    <div class="upload-card">
      <input class="track-cover" type="file" accept="image/*" >
      <div class="upload-content track-cover-preview">
        <span>Ajouter une cover</span>
      </div>
    </div>

    <label>Fichier MP3</label>
    <div class="upload-card">
      <input class="track-mp3" type="file" accept="audio/mpeg,audio/mp3">
      <div class="upload-content track-audio-preview">
        <span>Ajouter le son</span>
      </div>
    </div>

    <div class="choice-grid">
      <div class="choice">MP3 track</div>
      <div class="choice">Cover track</div>
    </div>
     </div>
    </div>

<div class="clone-buttons">
  <button class="add-track-btn" type="button">+ Ajouter une Nouvelle track</button>
</div>
   
    <div class="actions">
      <button class="prev-btn">Retour</button>
      <button class="next-btn" type="button">Continuer</button>
    </div>
   
  `;

  const trackPriceInput = document.querySelector(".track-price");
  const trackPricePreview = document.querySelector(".track-price-preview");


  const addTrackBtn = document.querySelector(".add-track-btn");

addTrackBtn.addEventListener("click", () => {
  const cards = document.querySelectorAll(".track-card");

  if (cards.length >= 20) return;

  const lastCard = cards[cards.length - 1];

  const title = lastCard.querySelector(".track-title").value.trim();
const price = lastCard.querySelector(".track-price").value.trim();
const cover = lastCard.querySelector(".track-cover").files[0];
const audio = lastCard.querySelector(".track-mp3").files[0];

if (!title || !price || !cover || !audio) {
  console.log("Remplis complètement la track avant d’en ajouter une autre.");
  return;
}

  const clone = lastCard.cloneNode(true);

  const newIndex = cards.length + 1;

  clone.querySelector("h2").textContent = `Tracks ${newIndex}`;

  clone.querySelector(".track-title").value = "";
  clone.querySelector(".track-price").value = "";
  clone.querySelector(".track-price-preview").textContent = "";

  clone.querySelector(".track-cover").value = "";
  clone.querySelector(".track-cover-preview").innerHTML = `
    <span>Ajouter une cover</span>
  `;

  clone.querySelector(".track-mp3").value = "";
  clone.querySelector(".track-audio-preview").innerHTML = `
    <span>Ajouter le son</span>
  `;

  lastCard.after(clone);

  activateCoverCard(clone.querySelector(".track-cover").closest(".upload-card"));
  activateAudioCard(clone.querySelector(".track-mp3").closest(".upload-card"));
});

  function updateTrackPricePreview() {
    trackPricePreview.textContent = trackPriceInput.value ? `${trackPriceInput.value}€` : "";
  }

  trackPriceInput.addEventListener("input", updateTrackPricePreview);
  updateTrackPricePreview();


 function activateCoverCard(card) {
  const input = card.querySelector(".track-cover");
  const preview = card.querySelector(".track-cover-preview");

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    preview.innerHTML = `
      <img class="track-cover-img" src="${imageUrl}">
      <div>
        <span>${file.name}</span>
        <small>Cover chargée</small>
      </div>
    `;

    if (card.nextElementSibling && card.nextElementSibling.classList.contains("upload-card")) {
      return;
    }

  
  });
 }

activateCoverCard(document.querySelector(".track-cover").closest(".upload-card"));

function activateAudioCard(card) {
  const input = card.querySelector(".track-mp3");
  const preview = card.querySelector(".track-audio-preview");

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    const audioUrl = URL.createObjectURL(file);

    const audio = document.createElement("audio");

    audio.src = audioUrl;

audio.onloadedmetadata = () => {

     const duration = Math.floor(audio.duration);

     card.dataset.duration = duration;
    
    console.log("Duration:", duration);
};



    preview.innerHTML = `
      <div style="width:100%;">
        <span>${file.name}</span>
        <audio class="audio-player" controls src="${audioUrl}"></audio>
      </div>
    `;
  });
}



activateAudioCard(document.querySelector(".track-mp3").closest(".upload-card"));


const savedTracks = packData.tracks || [];

savedTracks.forEach((track, index) => {
  const titleInput = document.querySelectorAll(".track-title")[index];
  const priceInput = document.querySelectorAll(".track-price")[index];

  if (titleInput) titleInput.value = track.title || "";
  if (priceInput) priceInput.value = track.price || "";
});


  document.querySelector(".prev-btn").addEventListener("click", () => {
    packData.audio = document.querySelector(".track-title").value;
    packData.trackPrice = document.querySelector(".track-price").value;

  savePackDraft();

    currentStep--;
    render();
  });

  
document.querySelector(".next-btn").addEventListener("click", () => {
  const titles = [...document.querySelectorAll(".track-title")];
  const prices = [...document.querySelectorAll(".track-price")];
  const covers = [...document.querySelectorAll(".track-cover")];
  const audios = [...document.querySelectorAll(".track-mp3")];

  packData.tracks = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i]?.value.trim() || "";
    const price = prices[i]?.value.trim() || "";
    const cover = covers[i]?.files[0] || null;
    const audio = audios[i]?.files[0] || null;
    const audioCard = audios[i]?.closest(".upload-card");
     const duration = Number(audioCard?.dataset.duration) || 0;


    // si la track est totalement vide → on l’ignore
    if (!title && !price && !cover && !audio) continue;

    // si elle est commencée mais incomplète → on bloque
    if (!title || !price || !cover || !audio) {
      console.log(`Track ${i + 1} incomplète`, {
        title,
        price,
        cover,
        audio,
      });
      return;
    }

    packData.tracks.push({
      id: `track_${i + 1}`,
      title,
      price,
      coverFile : cover,
      coverName: cover.name,
      audioFile : audio,
      audioName: audio.name,
      duration
    });
  }

  if (packData.tracks.length < 1) {
    console.log("Aucune track complète");
    return;
  }

  savePackDraft();

  console.log("ÉTAPE 2 — tracks stockées :", packData.tracks);

  currentStep++;
  render();
});
}

   

function renderPrice() {
  missionCard.innerHTML = `
    <h2>Prix du pack</h2>
    <p>Définis un prix clair. Le paiement créateur sera configuré plus tard avec Stripe Connect.</p>

    <label>Prix souhaité</label>

    <input class="pack-price" type="number" placeholder="Ex : 4.99" value="${packData.globalPrice || ""}" required>
<p class="price-preview"></p>

    

    <div class="choice-grid">
      <div class="choice">Pack gratuit</div>
      <div class="choice">Prix accessible</div>
      <div class="choice">Pack premium</div>
    </div>

    <div class="actions">
      <button class="prev-btn">Retour</button>
      <button class="next-btn">Continuer</button>
    </div>
  `;


const priceInput = document.querySelector(".pack-price");
const pricePreview = document.querySelector(".price-preview");

function updatePricePreview() {
  if (priceInput.value.trim() === "") {
    pricePreview.textContent = "";
    return;
  }

  pricePreview.textContent = `${priceInput.value}€`;
}

priceInput.addEventListener("input", updatePricePreview);
updatePricePreview();




  document.querySelector(".prev-btn").addEventListener("click", () => {
  packData.globalPrice = document.querySelector(".pack-price").value.trim();

  console.log("ÉTAPE 3 — prix global sauvegardé avant retour :", packData.globalPrice);

savePackDraft();

    currentStep--;
    render();
  });

  document.querySelector(".next-btn").addEventListener("click", () => {
    packData.globalPrice = document.querySelector(".pack-price").value.trim();

  console.log("ÉTAPE 3 — prix global sauvegardé avant retour :", packData.globalPrice);
savePackDraft(); 

    currentStep++;
    render();
  });
}

function renderLegal() {
  missionCard.innerHTML = `
    <h2>Validation légale</h2>
    <p>Dernière étape avant l’envoi à la modération Sonara.</p>

    <div class="legal-box">
      Je confirme posséder les droits nécessaires sur les sons envoyés.
      Je comprends que les fichiers volés, frauduleux ou non autorisés seront refusés.
    </div>

    <label>
      <input class="legal-check" type="checkbox" required>
      J’accepte les règles de publication Sonara.
    </label>

    <div class="actions">
      <button class="prev-btn">Retour</button>
      <button class="next-btn">Envoyer en validation</button>
    </div>
  `;

  document.querySelector(".prev-btn").addEventListener("click", () => {
    savePackDraft();

    currentStep--;

    render();
  });

document.querySelector(".next-btn").addEventListener("click", async () => {

  event.preventDefault();
  event.stopPropagation();

  const accepted = document.querySelector(".legal-check").checked;

 

  packData.rights = {
    accepted: true,
    acceptedAt: Date.now()
  };

  savePackDraft();

  function validatePackBeforeSubmit(packData) {
  if (!packData.identity?.title) return "Titre du pack obligatoire";
  if (!packData.identity?.categorie?.length) return "Catégorie obligatoire";
  if (!packData.packCover) return "Cover du pack obligatoire";
  if (!packData.rights?.accepted) return "Droits obligatoires";

  if (!packData.tracks || packData.tracks.length < 1) {
    return "Au moins une track obligatoire";
  }

const validTracks = packData.tracks.filter(track =>
  track.title &&
  track.coverFile &&
  track.audioFile &&
  track.price
);

if (validTracks.length < 1) {
  currentStep = 2;
  savePackDraft();
  render();

  return "La première track doit avoir titre, cover, audio et prix";
}

  return null;
}

const error = validatePackBeforeSubmit(packData);

ildFinalPack();

const formData = new FormData();

formData.append(
  "packData",
  JSON.stringify(packData.finalPack)
);

formData.append(
  "coverPack",
  packData.finalPack.coverPackFile
);



packData.tracks.forEach((track,index)=>{

    if(track.coverFile){
        formData.append(
            `trackCover_${index}`,
            track.coverFile
        );
    }
    if(track.audioFile){

        formData.append(
            `trackAudio_${index}`,
            track.audioFile
        );
    }

});




  const response = await fetch(`${API_BASE}/api/packs/pending`, {
    method: "POST",
    body: formData
  });



  const data = await response.json();

  

localStorage.removeItem("sonaraPackDraft");
localStorage.setItem("creatorToast", "Pack envoyé en préparation");


  window.location.href = "../creator.html";



});
};
const params = new URLSearchParams(window.location.search);
const isNewPack = params.get("new") === "true";

if (isNewPack) {
  localStorage.removeItem("sonaraPackDraft");
  console.log("NOUVEAU PACK — brouillon reset");
} else {
  loadPackDraft();
}

render(); 