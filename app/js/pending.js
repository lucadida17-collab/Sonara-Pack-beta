const homeAccessBtn = document.querySelector(".home-access-btn");
let profile = JSON.parse(localStorage.getItem("sonaraProfile") || "null");
let decisionInProgress = false;

if (profile?.role === "artist" && homeAccessBtn) {
  homeAccessBtn.style.display = "none";
}

homeAccessBtn?.addEventListener("click", () => {
  window.location.href = "/home.html";
});

async function checkStatus() {
  if (!profile || !(profile.id || profile.accountId) || decisionInProgress) return;

  try {
    const requestedId = profile.accountId || profile.id;
    const res = await fetch(`${API_URL}/api/users/${encodeURIComponent(requestedId)}`);
    const data = await res.json();
    const account = data.account;

    if (!res.ok || !account) return;

    profile = account;
    localStorage.setItem("sonaraProfile", JSON.stringify(account));

    if (account.status === "approved" && account.artistStatus !== "rejected") {
      window.location.href = "creator.html";
      return;
    }

    if (account.status === "rejected" || account.artistStatus === "rejected") {
      decisionInProgress = true;
      await window.SonaraModeration?.showNext(account);

      if (String(account.role || "").toLowerCase() === "both" || account.status === "approved") {
        window.location.href = "/home.html";
      } else {
        window.location.href = "inscription.html";
      }
    }
  } catch (error) {
    console.warn("Vérification du statut artiste impossible :", error);
  }
}

setInterval(checkStatus, 3000);
checkStatus();
