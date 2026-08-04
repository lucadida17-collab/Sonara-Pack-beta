const homeAccessBtn = document.querySelector(".home-access-btn");
let profile = JSON.parse(localStorage.getItem("sonaraProfile") || "null");
let statusCheckInProgress = false;

if (profile?.role === "artist" && homeAccessBtn) {
  homeAccessBtn.style.display = "none";
}

homeAccessBtn?.addEventListener("click", () => {
  window.location.href = "/home.html";
});

async function checkStatus() {
  if (statusCheckInProgress) return;
  statusCheckInProgress = true;

  try {
    const authResult = await window.SonaraAuth?.ready;

    if (!authResult?.ok || !authResult.profile) {
      return;
    }

    profile = authResult.profile;
    const requestedId = profile.accountId || profile.id;

    if (!requestedId) return;

    const res = await fetch(`${API_URL}/api/users/${encodeURIComponent(requestedId)}`);
    const data = await res.json().catch(() => ({}));
    const account = data.account;

    if (!res.ok || !account) return;

    profile = account;
    localStorage.setItem("sonaraProfile", JSON.stringify(account));

    if (account.status === "approved" && account.artistStatus !== "rejected") {
      window.location.href = "creator.html";
      return;
    }

    if (account.status === "rejected" || account.artistStatus === "rejected") {
      if (String(account.role || "").toLowerCase() === "both" || account.status === "approved") {
        window.location.href = "/home.html";
      } else {
        window.location.href = "inscription.html";
      }
    }
  } catch (error) {
    console.warn("Vérification du statut artiste impossible :", error);
  } finally {
    statusCheckInProgress = false;
  }
}

setInterval(checkStatus, 3000);
checkStatus();
