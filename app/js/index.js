const MIN_LOADING_TIME = 3500;
const REQUEST_TIMEOUT = 60000;
const loadingStartedAt = Date.now();

let loadingText = null;
let loadingChangeTimeout = null;

document.addEventListener("DOMContentLoaded", () => {
  loadingText = document.querySelector(".intro-chargement");
  startSonara();
});

async function startSonara() {
  await setLoadingStep("Initialisation de Sonara Pack…", 350);
  await setLoadingStep("Récupération de votre session…", 350);

  const localProfile = getLocalProfile();

  /*
    Aucun profil enregistré :
    l’utilisateur doit passer par l’inscription.
  */
  if (!localProfile?.id) {
    clearLocalSession();

    await setLoadingStep("Aucun compte connecté…", 500);
    await setLoadingStep("Ouverture de l’inscription…", 500);

    await respectMinimumLoadingTime();
    goToInscription();

    return;
  }

  try {
    await setLoadingStep("Connexion au serveur…", 300);

    const serverProfile = await fetchProfileFromServer(
      localProfile.id
    );

    await setLoadingStep("Vérification de votre compte…", 350);

    validateServerProfile(serverProfile);

    await setLoadingStep("Chargement de votre profil…", 350);

    saveFreshProfile(serverProfile);

    await setLoadingStep(
      "Synchronisation de vos données…",
      450
    );

    await setLoadingStep(
      "Préparation de votre espace…",
      400
    );

    await respectMinimumLoadingTime();

    await setLoadingStep(
      "Ouverture de Sonara Pack…",
      450
    );

    redirectByRole(serverProfile);
  } catch (error) {
    console.error(
      "Erreur pendant le démarrage de Sonara :",
      error
    );

    /*
      Le compte n’existe plus, a été supprimé,
      banni, rejeté ou possède des données invalides.
    */
    if (error.name === "InvalidAccountError") {
      clearLocalSession();

      await setLoadingStep(
        "Compte introuvable ou désactivé…",
        800
      );

      await setLoadingStep(
        "Retour à l’inscription…",
        500
      );

      goToInscription();
      return;
    }

    /*
      Le serveur est temporairement inaccessible.
      On ne supprime pas la session locale car le
      compte peut toujours exister.
    */
    showServerError();
  }
}

/* ──────────────────────────────────────────────
   ANIMATION DES ÉTAPES DE CHARGEMENT
────────────────────────────────────────────── */

function setLoadingStep(message, duration = 300) {
  return new Promise(resolve => {
    if (!loadingText) {
      resolve();
      return;
    }

    if (loadingChangeTimeout) {
      clearTimeout(loadingChangeTimeout);
    }

    loadingText.classList.add("changing");

    loadingChangeTimeout = setTimeout(() => {
      loadingText.textContent = message;
      loadingText.classList.remove("changing");

      setTimeout(resolve, duration);
    }, 180);
  });
}

/* ──────────────────────────────────────────────
   RÉCUPÉRATION DU PROFIL LOCAL
────────────────────────────────────────────── */

function getLocalProfile() {
  const storedProfile =
    localStorage.getItem("sonaraProfile");

  if (!storedProfile) {
    return null;
  }

  try {
    return JSON.parse(storedProfile);
  } catch (error) {
    console.error(
      "Le profil enregistré localement est invalide :",
      error
    );

    return null;
  }
}

/* ──────────────────────────────────────────────
   VÉRIFICATION DU PROFIL AUPRÈS DU SERVEUR
────────────────────────────────────────────── */

async function fetchProfileFromServer(profileId) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(
      `${API_URL}/api/profile/${encodeURIComponent(profileId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    /*
      Le serveur indique que le compte est absent
      ou que l’accès est refusé.
    */
    if ([401, 403, 404].includes(response.status)) {
      throw createInvalidAccountError();
    }

    if (!response.ok) {
      throw new Error(
        `Erreur serveur : ${response.status}`
      );
    }

    const data = await response.json();

    /*
      Ta route peut renvoyer directement le profil
      ou éventuellement { profile: ... }.
      Cette ligne accepte les deux formats.
    */
    return data.profile || data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "La connexion au serveur a expiré."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ──────────────────────────────────────────────
   VALIDATION DU COMPTE
────────────────────────────────────────────── */

function validateServerProfile(profile) {
  if (!profile?.id || !profile?.role) {
    throw createInvalidAccountError();
  }

  const allowedRoles = [
    "user",
    "artist",
    "both"
  ];

  if (!allowedRoles.includes(profile.role)) {
    throw createInvalidAccountError();
  }

  const forbiddenStatuses = [
    "banned",
    "deleted",
    "rejected",
    "disabled",
    "suspended"
  ];

  const normalizedStatus =
    String(profile.status || "").toLowerCase();

  if (forbiddenStatuses.includes(normalizedStatus)) {
    throw createInvalidAccountError();
  }

  /*
    Un user doit être approuvé.
    Un artiste pending peut encore être envoyé vers
    sa page adaptée selon ta logique actuelle.
  */
  if (
    profile.role === "user" &&
    normalizedStatus !== "approved"
  ) {
    throw createInvalidAccountError();
  }
}

/* ──────────────────────────────────────────────
   MISE À JOUR DU LOCALSTORAGE
────────────────────────────────────────────── */

function saveFreshProfile(profile) {
  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify(profile)
  );

  localStorage.setItem(
    "sonaraProfileCreated",
    "true"
  );
}

function clearLocalSession() {
  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");
}

/* ──────────────────────────────────────────────
   REDIRECTION SELON LE RÔLE
────────────────────────────────────────────── */

function redirectByRole(profile) {
  if (
    profile.role === "artist" ||
    profile.role === "both"
  ) {
    window.location.replace(
      "app/pages/creator.html"
    );

    return;
  }

  if (profile.role === "user") {
    window.location.replace("/home.html");
    return;
  }

  clearLocalSession();
  goToInscription();
}

function goToInscription() {
  window.location.replace(
    "app/pages/inscription.html"
  );
}

/* ──────────────────────────────────────────────
   ERREUR SERVEUR
────────────────────────────────────────────── */

function showServerError() {
  if (!loadingText) return;

  loadingText.classList.remove("changing");
  loadingText.textContent =
    "Serveur indisponible. Cliquez pour réessayer.";

  document.body.classList.add("server-error");
  document.body.style.cursor = "pointer";

  document.body.addEventListener(
    "click",
    () => {
      window.location.reload();
    },
    { once: true }
  );
}

/* ──────────────────────────────────────────────
   OUTILS
────────────────────────────────────────────── */

function createInvalidAccountError() {
  const error = new Error(
    "Compte invalide, supprimé ou désactivé."
  );

  error.name = "InvalidAccountError";

  return error;
}

async function respectMinimumLoadingTime() {
  const elapsedTime =
    Date.now() - loadingStartedAt;

  const remainingTime = Math.max(
    0,
    MIN_LOADING_TIME - elapsedTime
  );

  await wait(remainingTime);
}

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}