const creatorPage = document.querySelector(".creator-page")


    creatorPage.innerHTML = `
    
       <section class="creator-header">
       
      <p class="creator-label">SONARA CREATOR</p>
      <h1>Dashboard créateur</h1>
      <p class="creator-subtitle">
        Crée, prépare et gère tes packs audio depuis un espace simple, clair et premium.
      </p>
    </section>
<button class="btn-home ">Retourner a l'accueil</button>
    <section class="creator-stats">
      <div class="stat-card">
        <span>Packs créés</span>
        <strong>0</strong>
      </div>


      <div class="stat-card">
        <span>Revenus</span>
        <strong>0€</strong>
      </div>
    </section>

    <section class="creator-actions">

      <button class="creator-action crée-un-pack">
        <span>Créer un pack</span>
        <small>Ajouter sons, cover, prix et description</small>
      </button>

      <button class="creator-action mes-pack">
        <span>Mes packs</span>
        <small>Voir les packs envoyés ou publiés</small>
      </button>

      <button class="creator-action regle-creator">
        <span>Règles créateur</span>
        <small>Droits, interdictions et conditions</small>
      </button>

    </section>

   <h1>Les prochains modes seronts disponibles dans la V2. </h1>
  
    `;

    const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

if (!profile) {
  window.location.href = "chaos.html";
}

if (profile.role === "user") {
  window.location.href = "home.html";
}

if (profile.status === "pending") {
  window.location.href = "pending.html";
}

if (profile.status === "rejected") {
  if (profile.role === "both") {
    window.location.href = "home.html";
  } else {
    window.location.href = "chaos.html";
  }
}

const createPackBtn = document.querySelector(".crée-un-pack");
const mesPackBtn = document.querySelector(".mes-pack");
const regleCreatorBtn = document.querySelector(".regle-creator");

createPackBtn.addEventListener("click", () => {
  console.log("Créer un pack");
  window.location.href ="page-creator/create-pack.html"
});

mesPackBtn.addEventListener("click", () => {
  window.location.href = "page-creator/my-pack.html"
});

regleCreatorBtn.addEventListener("click", () => {
  window.location.href = "page-creator/creator-rules.html"
});

const btnHome = document.querySelector(".btn-home")

btnHome.addEventListener("click", () => {
  if (profile.role === "both") {
    window.location.href = "../../home.html"
  }
})

if (profile.role ==="artist"){
btnHome.style.display = "none"
}


const toastMessage = localStorage.getItem("creatorToast");

if (toastMessage) {
  localStorage.removeItem("creatorToast");

  const toast = document.createElement("div");
  toast.className = "creator-toast";
  toast.textContent = toastMessage;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 50);

  setTimeout(() => {
    toast.classList.remove("show");

    setTimeout(() => {
      toast.remove();
    }, 5000);
    
  }, 5000);
}