const appLayout = document.querySelector(".app-layout");

const legalContent = {
  terms: {
    title: "Conditions d’utilisation",

    content: `
      <p>
        Sonara Pack est une plateforme permettant aux utilisateurs
        de découvrir, acheter et télécharger des contenus audio.
      </p>

      <p>
        L’utilisation de Sonara Pack implique le respect du règlement
        de la plateforme et des licences associées aux contenus.
      </p>

      <p>
        L’utilisateur est responsable des informations renseignées
        sur son compte et de l’utilisation de celui-ci.
      </p>

      <p>
        Il est interdit d’utiliser Sonara Pack dans le but de contourner
        ses systèmes de paiement, de téléchargement ou de sécurité.
      </p>

      <p>
        Sonara Pack peut limiter ou suspendre l’accès à certaines
        fonctionnalités lorsqu’un compte ne respecte pas les règles
        de la plateforme.
      </p>

      <p>
        Les fonctionnalités de Sonara Pack peuvent évoluer au fil
        des mises à jour de la plateforme.
      </p>

      <p>
        Certaines fonctionnalités peuvent être temporairement
        indisponibles en cas de maintenance ou de problème technique.
      </p>

      <p>
        Les règles spécifiques concernant les contenus audio sont
        précisées dans la section Règlement de Sonara Pack.
      </p>
    `
  },

  privacy: {
    title: "Confidentialité",

    content: `
      <p>
        Sonara Pack utilise certaines données personnelles afin
        de permettre le fonctionnement de la plateforme.
      </p>

      <p>
        Les données peuvent notamment être utilisées pour créer
        et gérer un compte, assurer les téléchargements, traiter
        les achats et fournir les fonctionnalités de Sonara Pack.
      </p>

      <p>
        Sonara Pack peut également traiter certaines informations
        techniques nécessaires à la sécurité et au bon fonctionnement
        de la plateforme.
      </p>

      <p>
        Les données personnelles ne sont pas vendues à des tiers.
      </p>

      <p>
        Certaines données peuvent être traitées par des services
        techniques utilisés par Sonara Pack pour l’hébergement,
        le stockage, le paiement ou l’envoi d’e-mails.
      </p>

      <p>
        Sonara Pack limite l’utilisation des données aux besoins
        nécessaires au fonctionnement et à la gestion de la plateforme.
      </p>

      <p>
        Les utilisateurs peuvent exercer leurs droits concernant
        leurs données personnelles conformément aux règles applicables.
      </p>

      <p>
        Toute demande concernant les données personnelles peut être
        adressée à Sonara Pack depuis la page Contact.
      </p>
    `
  },

  rgpd: {
    title: "RGPD",

    content: `
      <p>
        Sonara Pack traite des données personnelles nécessaires
        au fonctionnement de ses services.
      </p>

      <p>
        Ces données peuvent comprendre les informations associées
        au compte, au profil, aux achats, aux téléchargements et
        à l’utilisation des fonctionnalités de la plateforme.
      </p>

      <p>
        L’utilisateur dispose d’un droit d’accès aux données personnelles
        détenues à son sujet.
      </p>

      <p>
        L’utilisateur peut demander la rectification d’informations
        personnelles inexactes.
      </p>

      <p>
        L’utilisateur peut demander l’effacement de certaines données
        lorsque les conditions applicables le permettent.
      </p>

      <p>
        L’utilisateur peut également demander la limitation de certains
        traitements ou exercer son droit d’opposition lorsque celui-ci
        est applicable.
      </p>

      <p>
        Dans les situations prévues par la réglementation, l’utilisateur
        peut demander une copie de certaines données dans le cadre
        de son droit à la portabilité.
      </p>

      <p>
        Certaines informations peuvent être conservées lorsque leur
        conservation est nécessaire au respect d’une obligation,
        à la sécurité de la plateforme ou à la gestion d’un litige.
      </p>

      <p>
        Pour exercer ses droits, l’utilisateur peut contacter Sonara Pack
        depuis la page Contact.
      </p>

      <p>
        Une vérification de l’identité du demandeur peut être effectuée
        lorsqu’elle est nécessaire afin d’éviter qu’une personne accède
        aux données d’un autre utilisateur.
      </p>
    `
  },

  legalNotice: {
    title: "Mentions légales",

    content: `
      <h2>Éditeur de la plateforme</h2>

      <p>
        Sonara Pack
      </p>

      <p>
        Exploitant : Luca Dida
      </p>

      <p>
        Statut juridique : À COMPLÉTER
      </p>

      <p>
        Numéro SIREN / SIRET : À COMPLÉTER
      </p>

      <p>
        Adresse : À COMPLÉTER
      </p>

      <p>
        Adresse e-mail : sonarapack.support@gmail.com
      </p>

      <h2>Directeur de la publication</h2>

      <p>
        Luca Dida
      </p>

      <h2>Hébergement du site</h2>

      <p>
        Le site Sonara Pack utilise des services d’hébergement
        et d’infrastructure nécessaires à son fonctionnement.
      </p>

      <p>
        Hébergeur du site : Netlify
      </p>

      <p>
        Infrastructure serveur : Render
      </p>

      <p>
        Stockage de fichiers : Cloudflare R2
      </p>

      <p>
        Informations légales et coordonnées complètes des hébergeurs :
        À COMPLÉTER AVEC LES INFORMATIONS OFFICIELLES DES PRESTATAIRES.
      </p>

      <h2>Propriété intellectuelle</h2>

      <p>
        La structure, l’identité visuelle et les éléments appartenant
        à Sonara Pack ne peuvent pas être reproduits ou exploités
        sans autorisation lorsqu’ils sont protégés par les droits applicables.
      </p>

      <p>
        Les contenus proposés par les créateurs restent soumis aux droits
        et licences qui leur sont associés.
      </p>
    `
  },

  refund: {
    title: "Remboursements",

    content: `
      <p>
        Les demandes concernant un achat réalisé sur Sonara Pack
        sont examinées selon la situation rencontrée.
      </p>

      <p>
        Un problème technique empêchant réellement l’accès ou
        le téléchargement d’un contenu peut faire l’objet
        d’une vérification par Sonara Pack.
      </p>

      <p>
        L’utilisateur doit fournir les informations nécessaires
        à l’identification de l’achat concerné.
      </p>

      <p>
        Une demande de remboursement ne garantit pas automatiquement
        son acceptation.
      </p>

      <p>
        Les demandes frauduleuses ou comportant de fausses informations
        peuvent être refusées.
      </p>

      <p>
        Les contenus numériques peuvent être disponibles immédiatement
        après l’achat.
      </p>

      <p>
        Les règles applicables au droit de rétractation dépendent
        notamment des conditions dans lesquelles l’accès au contenu
        numérique a commencé.
      </p>

      <p>
        Les informations relatives à l’exécution immédiate du contenu
        numérique et au droit de rétractation sont présentées
        au moment de l’achat lorsque cela est nécessaire.
      </p>

      <p>
        Pour toute demande concernant un achat, l’utilisateur peut
        contacter le support Sonara Pack.
      </p>
    `
  },

  contact: {
    title: "Contact",

    content: `
      <p>
        Sonara Pack peut être contacté pour toute question concernant
        la plateforme, un compte, un achat ou l’utilisation des services.
      </p>

      <h2>Contact général</h2>

      <p>
        E-mail : sonarapack.support@gmail.com
      </p>

      <h2>Compte et données personnelles</h2>

      <p>
        Les demandes concernant un compte ou les données personnelles
        peuvent être envoyées depuis le support Sonara Pack.
      </p>

      <h2>Achats et téléchargements</h2>

      <p>
        Pour faciliter le traitement d’une demande, l’utilisateur doit
        indiquer les informations permettant d’identifier l’achat
        ou le téléchargement concerné.
      </p>

      <h2>Signalements</h2>

      <p>
        Les contenus ou comportements susceptibles de ne pas respecter
        les règles de Sonara Pack pourront être signalés depuis
        les fonctionnalités prévues sur la plateforme.
      </p>

      <p>
        Lorsque ces fonctionnalités ne sont pas encore disponibles,
        une demande peut être adressée au support Sonara Pack.
      </p>
    `
  }
};

function renderLegal() {
  appLayout.innerHTML = `
    <section class="settings-page">

      <header class="settings-header">

        <button
          type="button"
          class="settings-back-button"
          aria-label="Retour"
        >
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="settings-title">
          Pages légales
        </h1>

        <div class="settings-header-space"></div>

      </header>

      <div class="settings-content">

        <div class="settings-group">

          <button
            type="button"
            class="settings-row"
            data-legal="terms"
          >
            <span class="settings-row-left">
              <i data-lucide="file-text"></i>
              <span>Conditions d’utilisation</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-legal="privacy"
          >
            <span class="settings-row-left">
              <i data-lucide="lock-keyhole"></i>
              <span>Confidentialité</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-legal="rgpd"
          >
            <span class="settings-row-left">
              <i data-lucide="database"></i>
              <span>RGPD</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

        </div>

        <div class="settings-group">

          <button
            type="button"
            class="settings-row"
            data-legal="legalNotice"
          >
            <span class="settings-row-left">
              <i data-lucide="landmark"></i>
              <span>Mentions légales</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-legal="refund"
          >
            <span class="settings-row-left">
              <i data-lucide="rotate-ccw"></i>
              <span>Remboursements</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-legal="contact"
          >
            <span class="settings-row-left">
              <i data-lucide="mail"></i>
              <span>Contact</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

        </div>

      </div>

    </section>
  `;

  lucide.createIcons();

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", () => {
      window.location.href = "../settings.html";
    });

  document
    .querySelectorAll(".settings-row")
    .forEach((row) => {
      row.addEventListener("click", () => {
        renderLegalPage(row.dataset.legal);
      });
    });
}

function renderLegalPage(legalKey) {
  const legalPage = legalContent[legalKey];

  if (!legalPage) {
    renderLegal();
    return;
  }

  appLayout.innerHTML = `
    <section class="legal-page">

      <header class="settings-header">

        <button
          type="button"
          class="settings-back-button"
          aria-label="Retour"
        >
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="settings-title">
          ${legalPage.title}
        </h1>

        <div class="settings-header-space"></div>

      </header>

      <article class="legal-content">
        ${legalPage.content}
      </article>

    </section>
  `;

  lucide.createIcons();

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", renderLegal);
}

renderLegal();