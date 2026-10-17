"use strict";

/**
 * Éligibilité à la vente en LOCAL V1 uniquement.
 * paymentReady=false est l'ancien état initial des packs publiés avant
 * la correction : ne pas le confondre avec une suspension commerciale.
 * La validation réelle du compte Stripe Connect et du prix est effectuée
 * après ce contrôle par le checkout existant, avant toute session Stripe.
 */
function checkLocalV1SaleEligibility(pack, policy) {
  if (policy?.environment !== "local" || policy?.paymentsActive !== true || policy?.mode !== "COMMERCIAL") {
    return { ok: false, code: "COMMERCIAL_MODE_BLOCKED", error: "Les paiements ne sont pas actifs dans cet environnement." };
  }
  if (!pack || String(pack.status || "").toLowerCase() !== "approved") {
    return { ok: false, code: "PACK_NOT_APPROVED", error: "Ce pack n’est pas encore approuvé pour la vente." };
  }
  if (pack.moderationHidden === true || pack.deleted === true || pack.archived === true || pack.isArchived === true) {
    return { ok: false, code: "PACK_NOT_AVAILABLE", error: "Ce pack n’est plus disponible à la vente." };
  }
  if (pack.salePaused === true || pack.salesDisabled === true || pack.paymentBlocked === true) {
    return { ok: false, code: "PACK_SALE_PAUSED", error: "La vente de ce pack est suspendue." };
  }
  return { ok: true, legacyPaymentReady: pack.paymentReady !== true };
}

function updateLocalV1PaymentReadyOnModeration(pack, status, policy) {
  if (policy?.environment !== "local") return;
  // Aucun déblocage pendant la Pre-V1, ni pour un pack non approuvé.
  pack.paymentReady = String(status || "").toLowerCase() === "approved" &&
    policy.paymentsActive === true && policy.mode === "COMMERCIAL" &&
    pack.moderationHidden !== true;
}

module.exports = { checkLocalV1SaleEligibility, updateLocalV1PaymentReadyOnModeration };
