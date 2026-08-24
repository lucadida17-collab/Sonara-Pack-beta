"use strict";

const PURCHASE_STORAGE_KEY = "sonaraStripePurchase";
const PURCHASE_MAX_AGE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60000;
const STRIPE_MIN_LOADING_MS = 6000;
const stripeLoadingStartedAt = Date.now();

const statusElement = document.getElementById("stripeLoadingStatus");
const stepElement = document.getElementById("stripeProgressStep");
const valueElement = document.getElementById("stripeProgressValue");
const progressElement = document.querySelector(".stripe-progress");
const progressBar = document.getElementById("stripeProgressBar");
const errorBox = document.getElementById("stripeLoadingError");
const errorMessage = document.getElementById("stripeLoadingErrorMessage");
const retryButton = document.getElementById("stripeRetryButton");
const returnButton = document.getElementById("stripeReturnButton");

let purchase = null;
let requestRunning = false;

function setProgress(value, step, message) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  progressBar.style.width = `${safeValue}%`;
  progressElement.setAttribute("aria-valuenow", String(safeValue));
  valueElement.textContent = `${safeValue} %`;
  stepElement.textContent = step;
  statusElement.textContent = message;
}

function readPurchase() {
  const rawPurchase = sessionStorage.getItem(PURCHASE_STORAGE_KEY);

  if (!rawPurchase) {
    throw new Error("Aucun achat en attente. Retourne sur le pack et réessaie.");
  }

  let parsedPurchase;

  try {
    parsedPurchase = JSON.parse(rawPurchase);
  } catch {
    sessionStorage.removeItem(PURCHASE_STORAGE_KEY);
    throw new Error("Les informations de l’achat sont invalides.");
  }

  const createdAt = Number(parsedPurchase.createdAt || 0);
  if (!createdAt || Date.now() - createdAt > PURCHASE_MAX_AGE_MS) {
    sessionStorage.removeItem(PURCHASE_STORAGE_KEY);
    throw new Error("Cette tentative d’achat a expiré. Retourne sur le pack.");
  }

  const userId = String(parsedPurchase.userId || "").trim();
  const packId = String(parsedPurchase.packId || "").trim();
  const trackId = String(parsedPurchase.trackId || "").trim();
  const resourceId = String(parsedPurchase.resourceId || "").trim();
  const purchaseType = trackId ? "track" : resourceId ? "resource" : "pack";

  if (!userId || !packId) {
    throw new Error("Le compte acheteur ou le pack est introuvable.");
  }

  return {
    ...parsedPurchase,
    userId,
    packId,
    trackId: trackId || null,
    resourceId: resourceId || null,
    purchaseType
  };
}

async function readResponse(response) {
  const data = await response.json().catch(() => null);

  if (!data) {
    throw new Error("Le serveur n’a pas renvoyé une réponse valide.");
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "Le paiement ne peut pas être préparé.");
  }

  return data;
}

function showError(error) {
  const message = error?.name === "AbortError"
    ? "Le serveur met trop de temps à répondre. Réessaie dans un instant."
    : error?.message || "Impossible de préparer le paiement Stripe.";

  setProgress(0, "Redirection interrompue", message);
  errorMessage.textContent = message;
  errorBox.hidden = false;
}

function returnToPack() {
  const fallback = purchase?.returnUrl || `/app/pages/catalog/pack.html?id=${encodeURIComponent(purchase?.packId || "")}`;
  window.location.href = fallback;
}

async function createCheckoutSession() {
  if (requestRunning) return;

  const commercialState = await window.SonaraCommercial?.ready?.();
  if (!commercialState?.stripeEnabled) {
    showError(new Error("Les paiements seront disponibles lors du lancement commercial."));
    return;
  }

  requestRunning = true;
  errorBox.hidden = true;
  retryButton.disabled = true;

  try {
    setProgress(12, "Commande vérifiée", "Vérification du compte acheteur et du contenu sélectionné…");
    purchase = readPurchase();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setProgress(38, "Serveur Sonara", "Recherche du compte Stripe du créateur…");

    let response;
    try {
      response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: purchase.userId,
          packId: purchase.packId,
          trackId: purchase.trackId,
          resourceId: purchase.resourceId,
          purchaseType: purchase.purchaseType,
          licenseVersion: purchase.licenseVersion,
          licenseId: purchase.licenseId
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    setProgress(78, "Réponse reçue", "Validation de la session de paiement Stripe…");
    const data = await readResponse(response);

    const checkoutUrl = String(data.url || "").trim();
    if (!/^https:\/\/checkout\.stripe\.com\//i.test(checkoutUrl)) {
      throw new Error("Le lien de paiement Stripe reçu est invalide.");
    }

    sessionStorage.removeItem(PURCHASE_STORAGE_KEY);
    setProgress(100, "Session prête", "Redirection vers le paiement sécurisé Stripe…");
    await window.SonaraLoadingExperience?.waitMinimum?.(stripeLoadingStartedAt, STRIPE_MIN_LOADING_MS);
    window.location.replace(checkoutUrl);
  } catch (error) {
    showError(error);
  } finally {
    requestRunning = false;
    retryButton.disabled = false;
  }
}

retryButton.addEventListener("click", createCheckoutSession);
returnButton.addEventListener("click", returnToPack);

createCheckoutSession();
