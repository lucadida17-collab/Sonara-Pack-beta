const MIN_LOADING_TIME = 3500;
const loadingStartedAt = Date.now();

let loadingText = null;
let loadingChangeTimeout = null;

document.addEventListener("DOMContentLoaded", () => {
  loadingText = document.querySelector(".intro-chargement");
  startSonara();
});

async function startSonara() {
  await setLoadingStep("Initialisation de Sonara Pack…", 350);
  await setLoadingStep("Vérification de votre compte…", 350);

  if (!window.SonaraAuth?.ready) {
    showServerError();
    return;
  }

  const authResult = await window.SonaraAuth.ready;

  if (!authResult?.ok) {
    if (
      [
        "missing_profile",
        "profile_not_found",
        "invalid_profile",
        "blocked",
        "permanently_deleted"
      ].includes(authResult?.reason)
    ) {
      await setLoadingStep("Aucun compte valide retrouvé…", 450);
      await setLoadingStep("Ouverture de l’inscription…", 450);
      await respectMinimumLoadingTime();
      goToInscription();
      return;
    }

    showServerError();
    return;
  }

  const profile = authResult.profile;

  await setLoadingStep("Chargement de votre profil…", 350);
  await setLoadingStep("Synchronisation de vos données…", 450);
  await setLoadingStep("Préparation de votre espace…", 400);
  await respectMinimumLoadingTime();
  await setLoadingStep("Ouverture de Sonara Pack…", 450);

  redirectByRole(profile);
}

function setLoadingStep(message, duration = 300) {
  return new Promise((resolve) => {
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

function redirectByRole(profile) {
  const role = String(profile?.role || "").toLowerCase();
  const status = String(profile?.status || "").toLowerCase();

  if (["artist", "both"].includes(role)) {
    if (status === "pending") {
      window.location.replace("/app/pages/pending.html");
      return;
    }

    window.location.replace("/app/pages/creator.html");
    return;
  }

  if (role === "user") {
    window.location.replace("/home.html");
    return;
  }

  window.SonaraAuth?.clear?.();
  goToInscription();
}

function goToInscription() {
  window.location.replace("/app/pages/inscription.html");
}

function showServerError() {
  if (!loadingText) return;

  loadingText.classList.remove("changing");
  loadingText.textContent = "Serveur indisponible. Cliquez pour réessayer.";

  document.body.classList.add("server-error");
  document.body.style.cursor = "pointer";

  document.body.addEventListener(
    "click",
    () => window.location.reload(),
    { once: true }
  );
}

async function respectMinimumLoadingTime() {
  const elapsedTime = Date.now() - loadingStartedAt;
  const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);
  await wait(remainingTime);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
