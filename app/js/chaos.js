const chaosPage = document.querySelector(".chaos-page");

function renderChoicePage() {
  chaosPage.innerHTML = `
<section class="chaos-hero">

<h1> Bienvenue sur Sonara Pack </h1>

<p>
Choisis comment tu veut utiliser la plateforme.
</p>
</section>


<button class="chaos-card user-card" data-role="user">
<h2>Utilisateur</h2>

<p>
Acheter, découvrir et télécharger des packs.
 </p>

 </button>

<button class="chaos-card artist-card" data-role="artist">
<h2> Artist</h2>

<p>
 Publier des packs et vendre tes créations
 </p>

 </button>

 <button class="chaos-card both-card" data-role="both">
    <h2> Les deux</h2>

    <p>
     Acheter des packs et publier des packs sur la plateforme. 
    </p>
</button>
</section>


`;

  const btnCardChoice = document.querySelector(".chaos-card");




  const choiceCard = document.querySelectorAll(".chaos-card");

  choiceCard.forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.dataset.role;

      if (role === "user") {
        renderUserForm();
      }

      function renderUserForm() {
        chaosPage.innerHTML = `
            <section class="form-page"> 
            <button class="back-btn"> Retour</button>

            <h1>Profil Utilisateur </h1>
            <p> Crée ton compte pour acheter, télécharger et retrouver tes packs. </p>

            <form class="user-form">
              <input type="text" placeholder="Prénom"  class="formulaire firstname-input" required>
              <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
              <input type="date" class="formulaire date-input" required>
              <input type="email" placeholder="Email" class="formulaire mail-input" required>
              <input type="password" placeholder="Mot de passe" class="formulaire password-input" required>
              <input type="tel" placeholder="Téléphone facultatif" class="formulaire phone-input">
     
              <button type="submit" class="create-profil-user">Crée mon profil utilisateur </button>
            </form>
            </section>
            `;
        const userForm = document.querySelector(".user-form");

        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input")


        userForm.addEventListener("submit", (e) => {
          e.preventDefault();

          console.log(firstnameInput.value);
          console.log(lastnameInput.value);
          console.log(dateInput.value);
          console.log(mailInput.value);
          console.log(passwordInput.value);
          console.log(telInput.value);

          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            role: "user",
            status: "approved",
            createdAt: new Date().toISOString()

          };


          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          console.log(profile)
          const API_URL =
            window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1" ||
              window.location.hostname.startsWith("192.168.")
              ? "http://192.168.1.18:3000"
              : "https://sonara-pack-beta.onrender.com";



          fetch(`${API_URL}/api/register`, {
            method: "POST",

            body: formData
          })
            .then(res => res.json())
            .then(data => {
              console.log("BACKEND OK :", data);

              localStorage.setItem("sonaraProfile", JSON.stringify(data.profile));
              localStorage.setItem("sonaraProfileCreated", "true");

              window.location.href = "/home.html";
            })
            .catch(error => {
              console.error("ERREUR BACKEND :", error);
            });

        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage)
      }



      if (role === "artist") {
        renderArtistForm();
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
        <input type="date" class="formulaire date-input"  required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe"class="formulaire password-input"  required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input"  required>
        <input type="text" placeholder="Nom d’artiste"class="formulaire artistname-input"  required>
           Format carré fortement conseillé allez sur canva ou une IA pour redimensionner votre image au besoin 
        <input 
  type="file" 
  accept="image/png,image/jpeg,image/jpg" 
  class="formulaire artist-image-input"
  required
>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme être majeur pour commencer a vendre
        </label>

        <label class="checkbox-line">
          <input type="checkbox" required >
          Je confirme posséder les droits des sons que je publierai
        </label>

        <button type="submit" class="create-profil-artist">Créer mon profil artiste</button>
      </form>
    </section>
  `;
        const artistForm = document.querySelector(".artist-form");


        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const adressInput = document.querySelector(".adress-input")
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input");
        const artistName = document.querySelector(".artistname-input");
        const siretInput = document.querySelector(".siret-input")



        artistForm.addEventListener("submit", (e) => {
          e.preventDefault();



          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            artistname: artistName.value,
            role: "artist",
            status: "pending",
            createdAt: new Date().toISOString()
          };

          const artistImageInput = document.querySelector(".artist-image-input");
          const artistImageFile = artistImageInput.files[0];

          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          if (artistImageFile) {
            formData.append("imageArtist", artistImageFile);
          }

          const API_URL =
            window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1" ||
              window.location.hostname.startsWith("192.168.")
              ? "http://192.168.1.18:3000"
              : "https://sonara-pack-beta.onrender.com";


          if (artistImageFile) {
            alert("IMAGE OK : " + artistImageFile.name);
          } else {
            alert("AUCUNE IMAGE");
          }
          fetch(`${API_URL}/api/register`, {
            method: "POST",
            body: formData
          })
            .then(res => res.json())
            .then(data => {
              console.log("BACKEND OK :", data);

              localStorage.setItem("sonaraProfile", JSON.stringify(data.profile));
              localStorage.setItem("sonaraProfileCreated", "true");

              if (data.profile.status === "approved") {
                window.location.href = "home.html";
              } else {
                window.location.href = "pending.html";
              }
            })
            .catch(error => {
              console.error("ERREUR BACKEND :", error);
            });
        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
      }

      if (role === "both") {
        renderBothForm();
      }


      function renderBothForm() {
        chaosPage.innerHTML = `
    <section class="form-page">
    <button class="back-btn">Retour</button>

      <h1>Profil complet</h1>
      <p>Crée un compte utilisateur + artiste.</p>

      <form class="both-form">
        <input type="text" placeholder="Prénom"  class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input" required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input" required>
        <input type="text" placeholder="Nom d’artiste" class="formulaire artistname-input" required>
         Format carré fortement conseillé allez sur canva ou une IA pour redimensionner votre image au besoin 
        <input 
  type="file" 
  accept="image/png,image/jpeg,image/jpg" 
  class="formulaire artist-image-input"
  image
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

        const bothForm = document.querySelector(".both-form")

        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const adressInput = document.querySelector(".adress-input")
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input");
        const artistName = document.querySelector(".artistname-input");
        const siretInput = document.querySelector(".siret-input")



        bothForm.addEventListener("submit", (e) => {
          e.preventDefault();

          console.log(firstnameInput.value);
          console.log(lastnameInput.value);
          console.log(dateInput.value);
          console.log(mailInput.value);
          console.log(passwordInput.value);
          console.log(telInput.value);

          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            artistname: artistName.value,
            role: "both",
            status: "pending",
            createdAt: new Date().toISOString()
          };

          const artistImageInput = document.querySelector(".artist-image-input");
          const artistImageFile = artistImageInput.files[0];

          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          if (artistImageFile) {
            formData.append("imageArtist", artistImageFile);
          }

          const API_URL =
            window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1" ||
              window.location.hostname.startsWith("192.168.")
              ? "http://192.168.1.18:3000"
              : "https://sonara-pack-beta.onrender.com";

          if (artistImageFile) {
            alert("IMAGE OK : " + artistImageFile.name);
          } else {
            alert("AUCUNE IMAGE");
          }
          fetch(`${API_URL}/api/register`, {
            method: "POST",
            body: formData
          })

            .then(res => res.json())
            .then(data => {
              console.log("BACKEND OK :", data);

              localStorage.setItem("sonaraProfile", JSON.stringify(data.profile));
              localStorage.setItem("sonaraProfileCreated", "true");
              if (data.profile.status === "approved") {
                window.location.href = "home.html";
              } else {
                window.location.href = "pending.html";
              }
            })
            .catch(error => {
              console.error("ERREUR BACKEND :", error);
            });

        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
      }
    });
  });
}


renderChoicePage();

