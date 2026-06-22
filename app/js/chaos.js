const chaosPage = document.querySelector(".chaos-page");

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.22:3000"
    : "https://sonara-pack-beta.onrender.com";

function saveProfileAndRedirect(data) {
  if (!data || !data.success || !data.profile) {
    console.error("REGISTER RESPONSE INVALID :", data);
    return;
  }

  localStorage.setItem("sonaraProfile", JSON.stringify(data.profile));
  localStorage.setItem("sonaraProfileCreated", "true");

  console.log("PROFILE SAVED :", data.profile);
  console.log("STATUS :", data.profile.status);
  console.log("ROLE :", data.profile.role);

  if (data.profile.status === "approved") {
    window.location.href = "../../home.html";
    return;
  }

  if (data.profile.status === "pending") {
    window.location.href = "pending.html";
    return;
  }

  window.location.href = "chaos.html";
}

async function sendRegister(profile, imageFile = null) {
  const formData = new FormData();
  formData.append("profile", JSON.stringify(profile));

  if (imageFile) {
    formData.append("imageArtist", imageFile);
  }

  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    console.log("BACKEND OK :", data);

    saveProfileAndRedirect(data);
  } catch (error) {
    console.error("ERREUR BACKEND :", error);
  }
}

function renderChoicePage() {
  chaosPage.innerHTML = `
    <section class="chaos-hero">
      <h1>Bienvenue sur Sonara Pack</h1>
      <p>Choisis comment tu veut utiliser la plateforme.</p>
    </section>

    <button class="chaos-card user-card" data-role="user">
      <h2>Utilisateur</h2>
      <p>Acheter, découvrir et télécharger des packs.</p>
    </button>

    <button class="chaos-card artist-card" data-role="artist">
      <h2>Artist</h2>
      <p>Publier des packs et vendre tes créations</p>
    </button>

    <button class="chaos-card both-card" data-role="both">
      <h2>Les deux</h2>
      <p>Acheter des packs et publier des packs sur la plateforme.</p>
    </button>
  `;

  document.querySelectorAll(".chaos-card").forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.dataset.role;

      if (role === "user") renderUserForm();
      if (role === "artist") renderArtistForm();
      if (role === "both") renderBothForm();
    });
  });
}

function renderUserForm() {
  chaosPage.innerHTML = `
    <section class="form-page"> 
      <button class="back-btn">Retour</button>

      <h1>Profil Utilisateur</h1>
      <p>Crée ton compte pour acheter, télécharger et retrouver tes packs.</p>

      <form class="user-form">
        <input type="text" placeholder="Prénom" class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" required>
        <input type="tel" placeholder="Téléphone facultatif" class="formulaire phone-input">

        <button type="submit" class="create-profil-user">Crée mon profil utilisateur</button>
      </form>
    </section>
  `;

  const userForm = document.querySelector(".user-form");

  userForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const profile = {
      firstname: document.querySelector(".firstname-input").value,
      lastname: document.querySelector(".lastname-input").value,
      date: document.querySelector(".date-input").value,
      mail: document.querySelector(".mail-input").value,
      password: document.querySelector(".password-input").value,
      phone: document.querySelector(".phone-input").value,
      role: "user"
    };

    await sendRegister(profile);
  });

  document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
}

function renderArtistForm() {
  chaosPage.innerHTML = `
    <section class="form-page">
      <button class="back-btn">Retour</button>

      <h1>Profil artiste</h1>
      <p>Crée ton profil artiste pour publier et vendre tes packs.</p>

      <form class="artist-form">
        <input type="text" placeholder="Prénom" class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input" required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input" required>
        <input type="text" placeholder="Nom d’artiste" class="formulaire artistname-input" required>

        <p>Format carré fortement conseillé.</p>

        <input 
          type="file" 
          accept="image/png,image/jpeg,image/jpg" 
          class="formulaire artist-image-input"
          required
        >

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme être majeur pour commencer à vendre
        </label>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme posséder les droits des sons que je publierai
        </label>

        <button type="submit" class="create-profil-artist">Créer mon profil artiste</button>
      </form>
    </section>
  `;

  const artistForm = document.querySelector(".artist-form");

  artistForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const imageInput = document.querySelector(".artist-image-input");
    const imageFile = imageInput.files[0];

    const profile = {
      firstname: document.querySelector(".firstname-input").value,
      lastname: document.querySelector(".lastname-input").value,
      date: document.querySelector(".date-input").value,
      adress: document.querySelector(".adress-input").value,
      mail: document.querySelector(".mail-input").value,
      password: document.querySelector(".password-input").value,
      phone: document.querySelector(".phone-input").value,
      artistname: document.querySelector(".artistname-input").value,
      role: "artist"
    };

    await sendRegister(profile, imageFile);
  });

  document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
}

function renderBothForm() {
  chaosPage.innerHTML = `
    <section class="form-page">
      <button class="back-btn">Retour</button>

      <h1>Profil complet</h1>
      <p>Crée un compte utilisateur + artiste.</p>

      <form class="both-form">
        <input type="text" placeholder="Prénom" class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input" required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input" required>
        <input type="text" placeholder="Nom d’artiste" class="formulaire artistname-input" required>

        <p>Format carré fortement conseillé.</p>

        <input 
          type="file" 
          accept="image/png,image/jpeg,image/jpg" 
          class="formulaire artist-image-input"
        >

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme avoir 18 ans ou plus
        </label>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme posséder les droits des sons que je publierai
        </label>

        <button type="submit" class="create-profil-both">Créer mon profil complet</button>
      </form>
    </section>
  `;

  const bothForm = document.querySelector(".both-form");

  bothForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const imageInput = document.querySelector(".artist-image-input");
    const imageFile = imageInput.files[0];

    const profile = {
      firstname: document.querySelector(".firstname-input").value,
      lastname: document.querySelector(".lastname-input").value,
      date: document.querySelector(".date-input").value,
      adress: document.querySelector(".adress-input").value,
      mail: document.querySelector(".mail-input").value,
      password: document.querySelector(".password-input").value,
      phone: document.querySelector(".phone-input").value,
      artistname: document.querySelector(".artistname-input").value,
      role: "both"
    };

    await sendRegister(profile, imageFile);
  });

  document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
}

renderChoicePage();