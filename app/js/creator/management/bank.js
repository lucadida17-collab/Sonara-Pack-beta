const bankPage = document.querySelector(".bank-page");

function readSonaraProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null") || {};
  } catch (error) {
    console.error("Profil Sonara invalide :", error);
    return {};
  }
}

function getArtistId(profile = {}) {
  return profile.accountId || profile.id || "";
}

function stripeIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function stripeEscape(value = "") {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function showBankToast(message, type = "success") {
  let toast = document.querySelector(".bank-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "bank-toast";
    document.body.appendChild(toast);
  }

  toast.className = `bank-toast ${type}`;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));

  clearTimeout(showBankToast.timer);
  showBankToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Réponse vide du serveur (${response.status}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

async function fetchFreshArtistProfile() {
  const localProfile = readSonaraProfile();
  const artistId = getArtistId(localProfile);

  if (!artistId) {
    throw new Error("Identifiant artiste introuvable.");
  }

  const response = await fetch(
    `${API_URL}/api/profile/${encodeURIComponent(artistId)}`
  );

  const profile = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      profile.message ||
      profile.error ||
      "Impossible de récupérer le profil artiste."
    );
  }

  const mergedProfile = {
    ...localProfile,
    ...profile
  };

  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify(mergedProfile)
  );

  return mergedProfile;
}


function persistCreatorStripeUnlock(account = {}, { replayAnimation = false } = {}) {
  if (String(account.stripeStatus || "").toLowerCase() !== "verified") return;

  const accountKey = account.accountId || account.id || "unknown";
  localStorage.setItem(`sonaraCreatorStripeUnlocked:${accountKey}`, "true");

  if (replayAnimation) {
    localStorage.removeItem(`sonaraCreatorStripeAnimationV5355:${accountKey}`);
  }

  const currentProfile = readSonaraProfile();
  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify({
      ...currentProfile,
      ...account,
      canCreatePack: true,
      stripeVerified: true,
      stripeStatus: "verified"
    })
  );
}

function bankStatusMarkup(account = {}) {
  const stripeStatus = account.stripeStatus || "not_connected";
  const stripeAccountId = account.stripeAccountId || "";

  if (!stripeAccountId || stripeStatus === "not_connected") {
    return `
      <section class="bank-card">
        <i data-lucide="landmark"></i>
        <h2>Ajouter un compte bancaire</h2>
        <p>
          Sonara Pack utilise Stripe pour sécuriser les paiements
          et les versements destinés aux artistes.
        </p>
        <button type="button" class="bank-connect-btn">
          Connecter avec Stripe
        </button>
      </section>
    `;
  }

  if (stripeStatus === "verified") {
    return `
      <section class="bank-status-card">
        <h2>Compte bancaire</h2>
        <p class="success">Compte Stripe vérifié</p>

        <div class="bank-info">
          <p>ID Stripe</p>
          <b>${stripeEscape(stripeAccountId)}</b>

          <p>Statut</p>
          <b>Vérifié</b>

          <p>Paiements</p>
          <b>Activés</b>
        </div>

        <button type="button" class="bank-dashboard-btn">
          Gérer mon compte Stripe
        </button>

        <button type="button" class="bank-refresh-btn">
          Actualiser le statut
        </button>
      </section>
    `;
  }

  return `
    <section class="bank-status-card">
      <h2>Statut du compte</h2>
      <p class="pending">Vérification en cours</p>

      <p>
        Termine les informations demandées par Stripe.
        La création de packs restera bloquée tant que le compte
        ne sera pas entièrement vérifié.
      </p>

      <p>
        ID Stripe :
        <strong>${stripeEscape(stripeAccountId)}</strong>
      </p>

      <button type="button" class="bank-manage-btn">
        Continuer la vérification
      </button>

      <button type="button" class="bank-refresh-btn">
        Actualiser le statut
      </button>
    </section>
  `;
}

function renderBankPage(account = {}) {
  bankPage.innerHTML = `
    <button type="button" class="creator-settings-btn">
      <i data-lucide="settings"></i>
    </button>

    <button type="button" class="creator-settings-btn-desktop">
      <i data-lucide="settings"></i>
    </button>

    <header class="bank-header">
      <p class="bank-label">SONARA MANAGEMENT</p>
      <h1>Compte bancaire</h1>
      <p class="bank-subtitle">
        Connecte ton compte Stripe pour recevoir automatiquement
        les revenus de tes ventes.
      </p>
    </header>

    <button type="button" class="btn-home back-dashboard">
      Retourner au dashboard
    </button>

    ${bankStatusMarkup(account)}
  `;

  stripeIcons();
  bindBankActions(account);
}

function setButtonLoading(button, text) {
  if (!button) return () => {};

  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = text;

  return () => {
    button.disabled = false;
    button.innerHTML = original;
    stripeIcons();
  };
}

async function connectStripe(account) {
  const button = document.querySelector(".bank-connect-btn");
  const restore = setButtonLoading(button, "Connexion…");

  try {
    const artistId = getArtistId(account);

    if (!artistId) {
      throw new Error("Identifiant artiste introuvable.");
    }

    const response = await fetch(`${API_URL}/api/stripe/connect-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        artistId,
        email: account.mail || account.email || ""
      })
    });

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de lancer Stripe."
      );
    }

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify({
        ...account,
        stripeAccountId: data.accountId || account.stripeAccountId,
        stripeStatus: data.stripeStatus || "onboarding_started"
      })
    );

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function continueStripeOnboarding(account) {
  const button = document.querySelector(".bank-manage-btn");
  const restore = setButtonLoading(button, "Ouverture…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/continue-onboarding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de continuer la vérification."
      );
    }

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function openStripeDashboard(account) {
  const button = document.querySelector(".bank-dashboard-btn");
  const restore = setButtonLoading(button, "Ouverture…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/login-link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible d’ouvrir le dashboard Stripe."
      );
    }

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function refreshStripeStatus(account, silent = false) {
  const button = document.querySelector(".bank-refresh-btn");
  const restore = setButtonLoading(button, "Actualisation…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/account-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible d’actualiser le statut Stripe."
      );
    }

    const updatedProfile = {
      ...account,
      stripeAccountId:
        data.stripeAccountId ||
        account.stripeAccountId ||
        null,
      stripeStatus:
        data.stripeStatus ||
        account.stripeStatus ||
        "onboarding_started"
    };

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(updatedProfile)
    );

    if (updatedProfile.stripeStatus === "verified") {
      persistCreatorStripeUnlock(updatedProfile, { replayAnimation: true });
    }

    renderBankPage(updatedProfile);

    if (!silent) {
      showBankToast(
        updatedProfile.stripeStatus === "verified"
          ? "Compte Stripe vérifié."
          : "Statut Stripe actualisé."
      );
    }
  } catch (error) {
    if (!silent) {
      showBankToast(error.message, "error");
    }
    restore();
  }
}

function bindBankActions(account) {
  document.querySelector(".creator-settings-btn")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".creator-settings-btn-desktop")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".back-dashboard")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".bank-connect-btn")?.addEventListener(
    "click",
    () => connectStripe(account)
  );

  document.querySelector(".bank-manage-btn")?.addEventListener(
    "click",
    () => continueStripeOnboarding(account)
  );

  document.querySelector(".bank-dashboard-btn")?.addEventListener(
    "click",
    () => openStripeDashboard(account)
  );

  document.querySelector(".bank-refresh-btn")?.addEventListener(
    "click",
    () => refreshStripeStatus(account)
  );
}

async function initBankPage() {
  if (!bankPage) return;

  const commercialState = await window.SonaraCommercial?.ready?.();

  if (!commercialState?.bankAccessible) {
    window.location.replace("/app/pages/creator/dashboard.html?mode=management");
    return;
  }

  bankPage.innerHTML = `
    <section class="bank-status-card">
      <h2>Chargement du compte Stripe…</h2>
    </section>
  `;

  try {
    const account = await fetchFreshArtistProfile();
    persistCreatorStripeUnlock(account);
    renderBankPage(account);

    const params = new URLSearchParams(window.location.search);

    if (
      params.get("stripe") === "success" &&
      account.stripeAccountId
    ) {
      await refreshStripeStatus(account, true);
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  } catch (error) {
    bankPage.innerHTML = `
      <section class="bank-status-card">
        <h2>Chargement impossible</h2>
        <p>${stripeEscape(error.message)}</p>
        <button type="button" class="bank-retry-btn">
          Réessayer
        </button>
      </section>
    `;

    document.querySelector(".bank-retry-btn")?.addEventListener(
      "click",
      initBankPage
    );
  }

  stripeIcons();
}

initBankPage();
