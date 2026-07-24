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

      <button class="creator-action crée-un-pack is-locked" type="button" aria-disabled="true">
        <span class="creator-action-content">
          <i data-lucide="SquarePlus" class="svg-create-pack"></i>
          <span>Créer un pack</span>
          <small>Ajouter sons, cover, prix et description</small>
        </span>

        <span class="create-pack-lock-overlay" aria-live="polite">
          <span class="create-pack-lock-icon">
            <i data-lucide="ban"></i>
          </span>
          <strong>Avant de commencer à vendre un pack, vous devez d’abord ajouter un compte bancaire.</strong>
        </span>
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
const creatorStripeStateKey = `sonaraCreatorStripeState:${profile.accountId || profile.id || "unknown"}`;
let creatorCanCreatePack = false;

function readCreatorJson(response) {
  return response.text().then((text) => {
    if (!text.trim()) return {};

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Réponse serveur invalide (${response.status}).`);
    }
  });
}

function showCreatorUnlockPopup() {
  const existingPopup = document.querySelector(".creator-unlock-popup");
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement("section");
  popup.className = "creator-unlock-popup";
  popup.innerHTML = `
    <div class="creator-unlock-popup-card">
      <button type="button" class="creator-unlock-close" aria-label="Fermer">
        <i data-lucide="x"></i>
      </button>
      <i data-lucide="badge-check" class="creator-unlock-main-icon"></i>
      <p class="creator-unlock-label">SONARA CREATOR</p>
      <h2>Créer un pack est maintenant disponible</h2>
      <p>Votre compte bancaire Stripe est vérifié. Vous pouvez désormais publier et vendre vos packs.</p>
      <div class="creator-unlock-tips">
        <strong>Conseils pour donner plus de force à votre pack :</strong>
        <span>Présentez-le sur vos réseaux avec un extrait clair et mémorable.</span>
        <span>Utilisez une cover lisible qui représente vraiment l’ambiance du pack.</span>
        <span>Expliquez à qui il s’adresse et ce que les acheteurs peuvent créer avec.</span>
      </div>
      <button type="button" class="creator-unlock-start">Créer mon premier pack</button>
    </div>
  `;

  document.body.appendChild(popup);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => popup.classList.add("show"));

  const closePopup = () => {
    popup.classList.remove("show");
    setTimeout(() => popup.remove(), 320);
  };

  popup.querySelector(".creator-unlock-close")?.addEventListener("click", closePopup);
  popup.addEventListener("click", (event) => {
    if (event.target === popup) closePopup();
  });
  popup.querySelector(".creator-unlock-start")?.addEventListener("click", () => {
    window.location.href = "page-creator/create-pack.html";
  });
}

function applyCreatePackLock(isVerified, { animateUnlock = false } = {}) {
  creatorCanCreatePack = Boolean(isVerified);
  createPackBtn.classList.toggle("is-locked", !creatorCanCreatePack);
  createPackBtn.setAttribute("aria-disabled", String(!creatorCanCreatePack));

  if (creatorCanCreatePack && animateUnlock) {
    createPackBtn.classList.add("is-unlocking");
    setTimeout(() => createPackBtn.classList.remove("is-unlocking"), 1200);
    setTimeout(showCreatorUnlockPopup, 700);
  }
}

async function verifyCreatorStripeAccess() {
  const artistId = profile.accountId || profile.id || "";
  const previousState = localStorage.getItem(creatorStripeStateKey);

  if (!artistId) {
    applyCreatePackLock(false);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/stripe/account-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId })
    });
    const data = await readCreatorJson(response);
    const verified = response.ok && data.stripeStatus === "verified";

    const updatedProfile = {
      ...profile,
      stripeAccountId: data.stripeAccountId || profile.stripeAccountId || null,
      stripeStatus: data.stripeStatus || profile.stripeStatus || "not_connected"
    };
    localStorage.setItem("sonaraProfile", JSON.stringify(updatedProfile));

    applyCreatePackLock(verified, {
      animateUnlock: verified && previousState === "locked"
    });
    localStorage.setItem(creatorStripeStateKey, verified ? "verified" : "locked");
  } catch (error) {
    console.warn("Vérification Stripe Creator impossible :", error);
    applyCreatePackLock(false);
    localStorage.setItem(creatorStripeStateKey, "locked");
  }
}

createPackBtn.addEventListener("click", () => {
  if (!creatorCanCreatePack) {
    window.location.href = "page-management/bank.html";
    return;
  }

  window.location.href = "page-creator/create-pack.html";
});

verifyCreatorStripeAccess();






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
