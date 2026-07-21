async function verifySonaraSession() {
  const storedProfile = localStorage.getItem("sonaraProfile");

  if (!storedProfile) {
    redirectToInscription();
    return false;
  }

  let profile;

  try {
    profile = JSON.parse(storedProfile);
  } catch (error) {
    redirectToInscription();
    return false;
  }

  if (!profile?.accountId) {
    redirectToInscription();
    return false;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/profile/${profile.accountId}`
    );

    // Compte supprimé, banni ou introuvable
    if (
      response.status === 404 ||
      response.status === 401 ||
      response.status === 403
    ) {
      redirectToInscription();
      return false;
    }

    if (!response.ok) {
      throw new Error(
        `Erreur de vérification : ${response.status}`
      );
    }

    const freshProfile = await response.json();

    const freshRole = String(freshProfile.role || "").toLowerCase();
    const freshStatus = String(freshProfile.status || "").toLowerCase();

    const artistAccessRemoved =
      freshRole === "both" &&
      (
        freshStatus === "banned" ||
        freshStatus === "rejected" ||
        freshProfile.artistStatus === "banned" ||
        freshProfile.artistStatus === "rejected"
      );

    if (artistAccessRemoved) {
      freshProfile.role = "user";
      freshProfile.status = "approved";
      freshProfile.artistStatus =
        freshProfile.artistStatus ||
        freshStatus;
    } else if (
      freshStatus === "banned" ||
      freshStatus === "rejected"
    ) {
      redirectToInscription();
      return false;
    }

    // On actualise les informations locales avec le serveur
    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(freshProfile)
    );

    const moderationNotice = freshProfile.moderationNotice;
    const isHomePage =
      window.location.pathname === "/home.html" ||
      window.location.pathname.endsWith("/home.html");

    if (
      moderationNotice?.type === "creator_access_restored" &&
      moderationNotice.read !== true &&
      ["artist", "both"].includes(String(freshProfile.role || "").toLowerCase()) &&
      isHomePage
    ) {
      localStorage.setItem(
        "creatorToast",
        moderationNotice.message ||
          "Ton accès Creator a été restauré."
      );

      window.location.replace("/app/pages/creator.html");
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Impossible de vérifier la session :",
      error
    );

    return false;
  }
}

function redirectToInscription() {
  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");

  window.location.replace(
    "/app/pages/inscription.html"
  );
}