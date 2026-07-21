const creatorPage = document.querySelector(".creator-page")


creatorPage.innerHTML = `


<button class="creator-settings-btn">
    <i data-lucide="settings"></i>
</button>
 

 <button class="creator-settings-btn-desktop">
    <i data-lucide="settings"></i>
</button>

       <section class="creator-header">
       
      <p class="creator-label">SONARA CREATOR</p>
      <h1>Dashboard Arstistique</h1>
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

      <i data-lucide="SquarePlus" class="svg-create-pack"></i>
        <span>Créer un pack</span>
        <small>Ajouter sons, cover, prix et description</small>
      </button>
      
  

      <button class="creator-action mes-pack">
      <i data-lucide="library" class="svg-create-pack"></i>
        <span>Mes packs</span>
        <small>Prochain mode avenir En cours</small>
      </button>

    </section>

   <h1>Les prochains modes seronts disponibles dans la V2. </h1>
  
    `;

lucide.createIcons();

    document.querySelector(".creator-settings-btn").addEventListener("click", () => {
  renderCreatorManagement();
});

 document.querySelector(".creator-settings-btn-desktop").addEventListener("click", () => {
  renderCreatorManagement();
});


const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

if (!profile) {
  window.location.href = "inscription.html";
}

if (profile.role === "user") {
  window.location.href = "/home.html";
}

if (profile.status === "pending") {
  window.location.href = "pending.html";
}

if (profile.status === "rejected") {
  if (profile.role === "both") {
    window.location.href = "/home.html";
  } else {
    window.location.href = "inscription.html";
  }
}

const createPackBtn = document.querySelector(".crée-un-pack");



createPackBtn.addEventListener("click", () => {
  console.log("Créer un pack");
  window.location.href = "page-creator/create-pack.html"
});






const btnHome = document.querySelector(".btn-home")

btnHome.addEventListener("click", () => {
  if (profile.role === "both") {
    window.location.href = "/home.html"
  }
})

if (profile.role === "artist") {
  btnHome.style.display = "none"
}



async function consumeCreatorModerationNotice() {
  const currentProfile = JSON.parse(
    localStorage.getItem("sonaraProfile") || "null"
  );

  const notice = currentProfile?.moderationNotice;

  if (
    !currentProfile?.accountId ||
    !notice ||
    notice.read === true
  ) {
    return;
  }

  try {
    await fetch(
      `${API_URL}/api/profile/${encodeURIComponent(
        currentProfile.accountId
      )}/moderation-notice/read`,
      { method: "PATCH" }
    );

    currentProfile.moderationNotice = {
      ...notice,
      read: true,
      readAt: new Date().toISOString()
    };

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(currentProfile)
    );
  } catch (error) {
    console.warn(
      "Notice de modération non confirmée :",
      error
    );
  }
}

consumeCreatorModerationNotice();

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

function renderCreatorManagement() {
  creatorPage.innerHTML = `
    <button class="creator-settings-btn">
      <i data-lucide="settings"></i>
    </button>

    <section class="creator-header">
      <p class="creator-label">SONARA CREATOR</p>
      <h1>Dashboard management</h1>
      <p class="creator-subtitle">
        Gère ton compte, tes revenus et les paramètres importants de ton espace artiste.
      </p>
    </section>

    <button class="btn-home back-creator-dashboard">
      Retourner a l'espace Artistique
    </button>

    <section class="creator-actions">
      <button class="creator-action stripe-connect-btn">
        <i data-lucide="landmark"></i>
        <span>Compte bancaire</span>
        <small>Ajoute ton compte bancaire pour recevoir l’argent de tes ventes</small>
      </button>

      <button class="creator-action artist-profile-btn">
        <i data-lucide="user-round"></i>
        <span>Profil artiste</span>
        <small>Gérer ton image, ton nom et tes informations publiques</small>
      </button>

      <button class="creator-action creator-rules-btn">
        <i data-lucide="shield-check"></i>
        <span>Règles créateur</span>
        <small>Consulter les règles de publication Sonara Pack</small>
      </button>
      
    </section>
  `;

  if (window.lucide) lucide.createIcons();

  document.querySelector(".back-creator-dashboard").addEventListener("click", () => {
    window.location.href = "creator.html"
  });

  document.querySelector(".stripe-connect-btn").addEventListener("click", () => {
    window.location.href = "page-management/bank.html"
  })


  document.querySelector(".artist-profile-btn").addEventListener("click", () => {
    window.location.href = "page-management/profile-creator.html";
  });

  document.querySelector(".creator-settings-management-btn").addEventListener("click", () => {
    window.location.href = "page-management/settings-creator/settings-creator.html";
  });
}

const params = new URLSearchParams(window.location.search);

if (params.get("mode") === "management") {
  renderCreatorManagement();
}
