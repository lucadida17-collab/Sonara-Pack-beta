async function waitForPageSession() {
  const sessionReady =
    window.sonaraPageSessionReady;

  if (!sessionReady) {
    return true;
  }

  try {
    return Boolean(
      await sessionReady
    );
  } catch (error) {
    console.error(
      "Header : session de page indisponible.",
      error
    );

    return false;
  }
}

async function loadDynamicHeader() {
  const sessionIsReady =
    await waitForPageSession();

  if (!sessionIsReady) {
    return;
  }

  const container = document.querySelector(".header");

  if (!container) {
    console.error("Header : conteneur .header introuvable.");
    return;
  }

  try {
    const response = await fetch("/app/components/header/header.html");

    if (!response.ok) {
      throw new Error(
        `Impossible de charger le header : ${response.status}`
      );
    }

    container.innerHTML = await response.text();

    initDynamicHeader();
  } catch (error) {
    console.error("Erreur header :", error);
  }
}

function initDynamicHeader() {
  const profile = getStoredProfile();

  const profileButton =
    document.getElementById("dynamicHeaderProfile");

  const profileImage =
    document.getElementById("dynamicHeaderImage");

  const profileIcon =
    document.getElementById("dynamicHeaderIcon");

  const pageTitle =
    document.getElementById("dynamicHeaderTitle");

  if (
    !profileButton ||
    !profileImage ||
    !profileIcon ||
    !pageTitle
  ) {
    console.error("Header : éléments internes introuvables.");
    return;
  }

  pageTitle.textContent = getCurrentPageTitle();

  const storedImage = getProfileImageByRole(profile);
  const imageUrl = buildProfileImageUrl(storedImage);

  function showDefaultIcon() {
    profileImage.onerror = null;
    profileImage.removeAttribute("src");
    profileImage.hidden = true;
    profileIcon.hidden = false;

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  if (imageUrl) {
    profileImage.src = imageUrl;
    profileImage.hidden = false;
    profileIcon.hidden = true;

    profileImage.onerror = showDefaultIcon;
  } else {
    showDefaultIcon();
  }

  profileButton.addEventListener(
    "click",
    redirectToProfilePage
  );

  if (window.lucide) {
    lucide.createIcons();
  }
}

function getProfilePageUrl() {
  return new URL(
    "/app/pages/profile.html",
    window.location.origin
  );
}

function redirectToProfilePage() {
  const profileUrl =
    getProfilePageUrl();

  window.location.assign(
    profileUrl.href
  );
}

function getStoredProfile() {
  try {
    return JSON.parse(
      localStorage.getItem("sonaraProfile") || "null"
    );
  } catch (error) {
    console.error("Profil local invalide :", error);
    return null;
  }
}

function getProfileImageByRole(profile) {
  if (!profile) return "";


  if (
    profile.role === "artist" ||
    profile.role === "both"   ||
    profile.role === "user"   
  ) {
    return profile.imageProfile || "";
  }

  return "";
}

function buildProfileImageUrl(imageValue) {
  if (!imageValue) return "";

  const value = String(imageValue).trim();

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${API_URL}${value}`;
  }

  return `${API_URL}/uploads/${value}`;
}

function getCurrentPageTitle() {
  const pageName = window.location.pathname
    .split("/")
    .pop()
    .replace(".html", "")
    .toLowerCase();

  const pageTitles = {
    home: "Accueil",
    library: "Bibliothèque",
    pack: "Pack",
  };

  return pageTitles[pageName] || "Sonara Pack";
}

document.addEventListener(
  "DOMContentLoaded",
  loadDynamicHeader
);