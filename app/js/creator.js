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
      <h1>Dashboard Artistique</h1>
    </section>
<button class="btn-home ">Retourner à l'accueil</button>
    <section class="creator-stats">
      <div class="stat-card creator-pack-count-card">
        <span>Packs créés</span>
        <strong id="creator-pack-count">0</strong>
      </div>


      <div class="stat-card creator-revenue-card">
        <span>Revenus</span>
        <strong id="creator-revenue">0,00 €</strong>
      </div>
    </section>

    <section class="creator-actions">

      <button class="creator-action crée-un-pack is-locked" type="button" aria-disabled="true">

          <i data-lucide="SquarePlus" class="svg-create-pack"></i>
          <span>Créer un pack</span>
          <small>Ajouter sons, cover, prix et droits</small>


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
        <small>Gérer vos packs créés et publiés</small>
      </button>

    </section>

  
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
const creatorAccountKey = profile.accountId || profile.id || "unknown";
const creatorStripeUnlockedKey = `sonaraCreatorStripeUnlocked:${creatorAccountKey}`;
const creatorStripeAnimationKey = `sonaraCreatorStripeAnimationV5355:${creatorAccountKey}`;
let creatorCanCreatePack = false;
let creatorStripeVerificationPromise = null;

function isStripeVerifiedState(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "verified";
}

function hasVerifiedStripeAccess(data = {}) {
  return (
    data.canCreatePack === true ||
    data.stripeVerified === true ||
    isStripeVerifiedState(data.stripeStatus) ||
    (data.chargesEnabled === true && data.payoutsEnabled === true)
  );
}

function hasPermanentStripeUnlock() {
  return localStorage.getItem(creatorStripeUnlockedKey) === "true";
}

function getCurrentCreatorProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "{}") || {};
  } catch {
    return {};
  }
}

function hasLocalVerifiedStripeAccess() {
  const currentProfile = getCurrentCreatorProfile();
  return (
    hasPermanentStripeUnlock() ||
    hasVerifiedStripeAccess(profile) ||
    hasVerifiedStripeAccess(currentProfile)
  );
}

async function refreshCreatorProfileFromServer() {
  const currentProfile = getCurrentCreatorProfile();
  const identifiers = [
    currentProfile.accountId,
    profile.accountId,
    currentProfile.id,
    profile.id,
    currentProfile.userId,
    profile.userId
  ].filter(Boolean);

  if (!identifiers.length) return currentProfile;

  const apiUrl = await waitForApiUrl();

  for (const identifier of [...new Set(identifiers.map(String))]) {
    try {
      const response = await fetch(
        `${apiUrl}/api/profile/${encodeURIComponent(identifier)}`
      );
      const data = await readCreatorJson(response);

      if (!response.ok) continue;

      const mergedProfile = {
        ...currentProfile,
        ...data
      };

      localStorage.setItem(
        "sonaraProfile",
        JSON.stringify(mergedProfile)
      );

      return mergedProfile;
    } catch {
      // On essaie l'identifiant suivant sans casser le dashboard.
    }
  }

  return currentProfile;
}

function persistPermanentStripeUnlock(data = {}) {
  localStorage.setItem(creatorStripeUnlockedKey, "true");

  const currentProfile = JSON.parse(
    localStorage.getItem("sonaraProfile") || "{}"
  );

  const updatedProfile = {
    ...currentProfile,
    ...data,
    canCreatePack: true,
    stripeVerified: true,
    stripeStatus: "verified"
  };

  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify(updatedProfile)
  );
}

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

function waitForApiUrl(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (typeof API_URL !== "undefined" && API_URL) {
        resolve(API_URL);
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        reject(new Error("Configuration API indisponible."));
        return;
      }

      window.setTimeout(check, 40);
    };

    check();
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

function removeCreatePackLockPermanently({ animate = false } = {}) {
  creatorCanCreatePack = true;
  persistPermanentStripeUnlock();

  createPackBtn.classList.remove("is-locked");
  createPackBtn.setAttribute("aria-disabled", "false");

  const lockOverlay = createPackBtn.querySelector(".create-pack-lock-overlay");

  if (!animate) {
    lockOverlay?.remove();
    return;
  }

  createPackBtn.classList.remove("is-unlocking");
  void createPackBtn.offsetWidth;
  createPackBtn.classList.add("is-unlocking");

  window.setTimeout(() => {
    createPackBtn.classList.remove("is-unlocking");
    lockOverlay?.remove();
    localStorage.setItem(creatorStripeAnimationKey, "true");
    showCreatorUnlockPopup();
  }, 1150);
}

function keepCreatePackLocked() {
  if (hasPermanentStripeUnlock()) {
    removeCreatePackLockPermanently();
    return;
  }

  creatorCanCreatePack = false;
  createPackBtn.classList.add("is-locked");
  createPackBtn.setAttribute("aria-disabled", "true");
}

async function verifyCreatorStripeAccess() {
  if (creatorStripeVerificationPromise) {
    return creatorStripeVerificationPromise;
  }

  creatorStripeVerificationPromise = (async () => {
    if (hasLocalVerifiedStripeAccess()) {
      const currentProfile = getCurrentCreatorProfile();
      persistPermanentStripeUnlock(currentProfile);

      const animationAlreadyPlayed =
        localStorage.getItem(creatorStripeAnimationKey) === "true";

      removeCreatePackLockPermanently({
        animate: !animationAlreadyPlayed
      });

      return true;
    }

    let latestProfile = getCurrentCreatorProfile();

    try {
      latestProfile = await refreshCreatorProfileFromServer();
    } catch (error) {
      console.warn("Actualisation du profil Creator impossible :", error);
    }

    if (hasVerifiedStripeAccess(latestProfile)) {
      persistPermanentStripeUnlock(latestProfile);

      const animationAlreadyPlayed =
        localStorage.getItem(creatorStripeAnimationKey) === "true";

      removeCreatePackLockPermanently({
        animate: !animationAlreadyPlayed
      });

      return true;
    }

    const identifiers = [
      latestProfile.accountId,
      profile.accountId,
      latestProfile.id,
      profile.id,
      latestProfile.userId,
      profile.userId
    ].filter(Boolean);

    if (!identifiers.length) {
      keepCreatePackLocked();
      return false;
    }

    try {
      const apiUrl = await waitForApiUrl();

      for (const artistId of [...new Set(identifiers.map(String))]) {
        const response = await fetch(`${apiUrl}/api/stripe/account-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artistId })
        });
        const data = await readCreatorJson(response);

        if (!response.ok) continue;

        if (hasVerifiedStripeAccess(data)) {
          persistPermanentStripeUnlock({
            ...latestProfile,
            stripeAccountId:
              data.stripeAccountId || latestProfile.stripeAccountId || null,
            chargesEnabled: data.chargesEnabled === true,
            payoutsEnabled: data.payoutsEnabled === true,
            stripeStatus: "verified"
          });

          const animationAlreadyPlayed =
            localStorage.getItem(creatorStripeAnimationKey) === "true";

          removeCreatePackLockPermanently({
            animate: !animationAlreadyPlayed
          });

          return true;
        }
      }
    } catch (error) {
      console.warn("Vérification Stripe Creator impossible :", error);
    }

    // Un accès déjà validé n'est jamais révoqué par une erreur réseau.
    if (hasLocalVerifiedStripeAccess()) {
      removeCreatePackLockPermanently();
      return true;
    }

    keepCreatePackLocked();
    return false;
  })();

  try {
    return await creatorStripeVerificationPromise;
  } finally {
    creatorStripeVerificationPromise = null;
  }
}

createPackBtn.addEventListener("click", async () => {
  // Dès qu'un compte a déjà été validé, le clic mène définitivement à Create Pack.
  if (creatorCanCreatePack || hasLocalVerifiedStripeAccess()) {
    removeCreatePackLockPermanently();
    window.location.href = "page-creator/create-pack.html";
    return;
  }

  const verified = await verifyCreatorStripeAccess();

  if (verified) {
    window.location.href = "page-creator/create-pack.html";
    return;
  }

  window.location.href = "page-management/bank.html";
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





/* =========================
   DASHBOARD CREATOR — STATS ET REDIRECTION MES PACKS
========================= */

const creatorPackCountElement = document.querySelector("#creator-pack-count");
const creatorRevenueElement = document.querySelector("#creator-revenue");
const mesPacksButton = document.querySelector(".mes-pack");

function getCreatorAccountId() {
  const current = getCurrentCreatorProfile();
  return current.accountId || profile.accountId || current.id || profile.id || null;
}

function formatCreatorMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

async function refreshCreatorDashboardStats() {
  const accountId = getCreatorAccountId();
  if (!accountId) return;

  try {
    const apiUrl = await waitForApiUrl();
    const response = await fetch(
      `${apiUrl}/api/creator/packs/${encodeURIComponent(accountId)}`
    );
    const data = await readCreatorJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Statistiques Creator indisponibles.");
    }

    if (creatorPackCountElement) {
      creatorPackCountElement.textContent = String(data.stats?.packCount || 0);
    }

    if (creatorRevenueElement) {
      creatorRevenueElement.textContent = formatCreatorMoney(data.stats?.revenue || 0);
    }
  } catch (error) {
    console.warn("Statistiques Creator indisponibles :", error);
  }
}

mesPacksButton?.addEventListener("click", () => {
  window.location.href = "page-creator/my-pack.html";
});

refreshCreatorDashboardStats();

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

const creatorReturnParams = new URLSearchParams(window.location.search);
const returnedPackId = creatorReturnParams.get("packSent");
const storedCreatorToast = localStorage.getItem("creatorToast");
const toastMessage =
  storedCreatorToast ||
  (returnedPackId ? "Pack envoyé en validation" : "");

if (toastMessage) {
  if (storedCreatorToast) {
    localStorage.removeItem("creatorToast");
  }

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

if (returnedPackId && window.history?.replaceState) {
  const cleanDashboardUrl = new URL(window.location.href);
  cleanDashboardUrl.searchParams.delete("packSent");
  window.history.replaceState({}, "", cleanDashboardUrl.href);
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
      Retourner à l'espace Artistique
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
