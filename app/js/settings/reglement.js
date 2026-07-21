const appLayout = document.querySelector(".app-layout");

const rulesContent = {
    copyright: {
        title: "Droit d’auteur",
        content: `
      <p>
        Les contenus disponibles sur Sonara Pack restent protégés
        par le droit d’auteur.
      </p>

      <p>
        Le téléchargement ou l’achat d’un son ne transfère pas
        sa propriété à l’utilisateur.
      </p>

      <p>
        L’utilisateur obtient uniquement le droit d’utiliser le
        contenu selon la licence associée au pack ou à la track.
      </p>

      <p>
        Il est interdit de revendre, redistribuer, partager ou
        publier directement un fichier téléchargé depuis Sonara Pack.
      </p>

      <p>
        Il est interdit de présenter un son téléchargé sur Sonara Pack
        comme étant une création originale entièrement réalisée
        par l’utilisateur.
      </p>

      <p>
        Toute utilisation d’un contenu doit respecter les droits
        du créateur et les conditions de la licence associée.
      </p>

      <p>
        La modification d’un fichier ne donne pas automatiquement
        à l’utilisateur la propriété du contenu original.
      </p>
    `
    },

    licenses: {
        title: "Licences",
        content: `
      <p>
        Chaque contenu disponible sur Sonara Pack est soumis à une
        licence d’utilisation.
      </p>

      <p>
        La licence précise les droits accordés à l’utilisateur après
        l’achat ou le téléchargement du contenu.
      </p>

      <p>
        L’utilisateur peut utiliser le son dans ses propres créations
        lorsque la licence associée l’autorise.
      </p>

      <p>
      La redistribution du fichier audio téléchargé, seul et en dehors d’un projet final, est interdite.
      </p>

      <p>
        Le partage du fichier avec une autre personne est interdit.
      </p>

      <p>
        Une licence est liée au compte ayant obtenu ou acheté le contenu.
      </p>

      <p>
        L’utilisateur reste responsable de l’utilisation qu’il fait
        du contenu téléchargé.
      </p>

      <p>
        Les conditions d’une licence peuvent varier selon le contenu
        proposé sur Sonara Pack.
      </p>

      <p>
        Lorsqu’une licence particulière est indiquée sur un pack ou
        une track, cette licence doit être respectée.
      </p>
    `
    },

    platform: {
        title: "Règles de la plateforme",
        content: `
      <p>
        Sonara Pack doit être utilisé de manière normale, honnête
        et respectueuse.
      </p>

      <p>
        Il est interdit de tenter de contourner les systèmes de paiement,
        de téléchargement ou de sécurité de la plateforme.
      </p>

      <p>
        Il est interdit d’exploiter volontairement un bug afin d’obtenir
        gratuitement un contenu normalement payant.
      </p>

      <p>
        Il est interdit d’utiliser plusieurs comptes afin de contourner
        une restriction ou une sanction.
      </p>

      <p>
        Il est interdit d’utiliser des outils automatisés dans le but
        de perturber ou d’exploiter la plateforme.
      </p>

      <p>
        Toute tentative d’accès non autorisé à un compte, une donnée ou
        une partie interne de Sonara Pack est interdite.
      </p>

      <p>
        Les utilisateurs ne doivent pas volontairement provoquer une
        surcharge, une interruption ou un dysfonctionnement de la plateforme.
      </p>

      <p>
        Un bug peut être signalé au support Sonara Pack.
      </p>

      <p>
        L’exploitation volontaire et répétée d’un bug peut entraîner
        une sanction.
      </p>
    `
    },

    community: {
        title: "Règles de la communauté",
        content: `
      <p>
        Les utilisateurs doivent respecter les autres membres
        de Sonara Pack.
      </p>

      <p>
        Le harcèlement, les menaces et les comportements visant
        volontairement à nuire à une autre personne sont interdits.
      </p>

      <p>
        Les propos discriminatoires ou haineux ne sont pas autorisés.
      </p>

      <p>
        L’usurpation de l’identité d’un utilisateur, d’un créateur ou
        d’un membre de l’équipe Sonara Pack est interdite.
      </p>

      <p>
        Les faux signalements volontaires sont interdits.
      </p>

      <p>
        Les systèmes de commentaires, de support ou de signalement
        ne doivent pas être utilisés pour envoyer du spam.
      </p>

      <p>
        Les désaccords entre utilisateurs ne justifient pas les insultes
        répétées, les menaces ou le harcèlement.
      </p>

      <p>
        Sonara Pack peut limiter certaines fonctionnalités d’un compte
        en cas de comportement abusif.
      </p>
    `
    },

    creators: {
        title: "Créateurs",
        content: `
      <p>
        Un créateur est responsable des contenus qu’il propose
        sur Sonara Pack.
      </p>

      <p>
        Les informations affichées sur un pack ou une track doivent
        correspondre au contenu réellement proposé.
      </p>

      <p>
        Il est interdit de publier volontairement un faux contenu ou
        un fichier différent de celui présenté à l’utilisateur.
      </p>

      <p>
        Le créateur doit utiliser correctement les titres, descriptions,
        images et informations de ses contenus.
      </p>

      <p>
        Il est interdit de manipuler volontairement un acheteur avec
        de fausses informations.
      </p>

      <p>
        Le créateur est responsable du prix qu’il choisit pour ses contenus
        lorsque Sonara Pack lui permet de définir ce prix.
      </p>

      <p>
        Les créateurs doivent respecter les règles de publication
        et de modération de Sonara Pack.
      </p>

      <p>
        Un contenu peut être refusé, masqué ou retiré s’il ne respecte
        pas les règles de la plateforme.
      </p>

      <p>
        Les tentatives de fraude liées aux ventes, aux paiements ou
        aux téléchargements sont interdites.
      </p>

      <p>
        Un créateur sanctionné ne doit pas créer un nouveau compte afin
        de contourner une suspension.
      </p>
    `
    },

    buyers: {
        title: "Acheteurs",
        content: `
      <p>
        Un acheteur doit utiliser les contenus téléchargés selon
        leur licence.
      </p>

      <p>
        Il est interdit de partager un fichier acheté avec
        d’autres personnes.
      </p>

      <p>
        Il est interdit de revendre directement un pack ou une track
        acheté sur Sonara Pack.
      </p>

      <p>
        Il est interdit de rendre publiquement accessible le fichier
        original téléchargé.
      </p>

      <p>
        L’acheteur est responsable de la sécurité de son compte.
      </p>

      <p>
        Les achats réalisés depuis le compte de l’utilisateur sont
        associés à ce compte.
      </p>

      <p>
        En cas de problème de paiement ou de téléchargement,
        l’utilisateur doit contacter le support Sonara Pack.
      </p>

      <p>
        Il est interdit de tenter d’obtenir un contenu par fraude,
        exploitation technique ou contournement du système de paiement.
      </p>

      <p>
        Une contestation de paiement volontairement frauduleuse peut
        entraîner une restriction du compte.
      </p>
    `
    },

    reports: {
        title: "Signalements",
        content: `
      <p>
        Un utilisateur peut signaler un contenu, un créateur ou un
        comportement qui semble enfreindre les règles de Sonara Pack.
      </p>

      <p>
        Un signalement doit être effectué de bonne foi.
      </p>

      <p>
        Les informations fournies dans un signalement doivent être
        aussi précises que possible.
      </p>

      <p>
        Sonara Pack peut examiner les éléments disponibles avant
        de prendre une décision.
      </p>

      <p>
        Un signalement ne provoque pas automatiquement la suppression
        d’un contenu ou la sanction d’un compte.
      </p>

      <p>
        L’envoi répété de faux signalements est interdit.
      </p>

      <p>
        Il est interdit d’organiser des signalements massifs dans
        le but de nuire à un utilisateur ou à un créateur.
      </p>

      <p>
        Sonara Pack peut demander des informations supplémentaires
        lorsqu’un signalement nécessite une vérification.
      </p>
    `
    },

    sanctions: {
        title: "Sanctions",
        content: `
      <p>
        Sonara Pack peut appliquer une sanction lorsqu’un utilisateur
        ou un créateur ne respecte pas le règlement.
      </p>

      <p>
        La sanction dépend de la gravité, de la répétition et de la
        nature du comportement.
      </p>

      <ul>
        <li>Avertissement</li>
        <li>Restriction temporaire d’une fonctionnalité</li>
        <li>Retrait ou masquage d’un contenu</li>
        <li>Suspension temporaire du compte</li>
        <li>Suspension du profil créateur</li>
        <li>Restriction des téléchargements ou des achats</li>
        <li>Bannissement définitif</li>
      </ul>

      <p>
        Sonara Pack n’est pas obligé d’appliquer les sanctions
        dans cet ordre.
      </p>

      <p>
        En cas de fraude, d’attaque, d’usurpation, de contournement
        volontaire d’une sanction ou d’abus grave, une suspension ou
        un bannissement peut être appliqué directement.
      </p>

      <p>
        Un compte banni ne doit pas créer un nouveau compte dans
        le but de contourner la sanction.
      </p>

      <p>
        Sonara Pack peut conserver les informations nécessaires à
        l’identification d’un compte sanctionné afin d’éviter le
        contournement d’un bannissement.
      </p>
    `
    },

    permissions: {
  title: "Autorisations",

  content: `
    <p>
      Les contenus disponibles sur Sonara Pack peuvent être utilisés
      dans des projets personnels ou professionnels lorsque la licence
      associée au contenu l’autorise.
    </p>

    <p>
      L’utilisateur peut intégrer un son téléchargé depuis Sonara Pack
      dans une musique, une vidéo, un film, un court métrage, une publicité,
      un jeu vidéo, un podcast ou tout autre projet créatif autorisé
      par la licence du contenu.
    </p>

    <p>
      L’utilisateur peut modifier le contenu afin de l’adapter à son projet.
    </p>

    <p>
      Il est notamment possible de couper un son, modifier son volume,
      ajouter des effets, modifier sa durée, changer sa tonalité ou
      l’intégrer à une composition plus large.
    </p>

    <p>
      Un projet utilisant un contenu Sonara Pack peut être publié sur
      des plateformes numériques, des réseaux sociaux ou des services
      de diffusion lorsque la licence associée l’autorise.
    </p>

    <p>
      L’utilisateur peut monétiser son projet lorsque la licence du
      contenu autorise une utilisation commerciale.
    </p>

    <p>
      Le contenu téléchargé peut être utilisé dans plusieurs parties
      d’un même projet.
    </p>

    <p>
      L’utilisateur peut conserver le fichier téléchargé dans ses
      propres espaces de stockage afin de l’utiliser dans ses projets.
    </p>

    <p>
      Il est autorisé de partager un projet final contenant un contenu
      Sonara Pack.
    </p>

    <p>
      Cette autorisation ne permet pas de partager, revendre ou redistribuer
      séparément le fichier original téléchargé.
    </p>

    <p>
      Les autorisations accordées restent soumises à la licence associée
      au pack ou à la track utilisée.
    </p>
  `
},



};

function renderReglement() {
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
          Règlement
        </h1>

        <div class="settings-header-space"></div>

      </header>

      <div class="settings-content">

        <div class="settings-group">

          <button class="settings-row" data-rule="copyright">
            <span class="settings-row-left">
              <i data-lucide="copyright"></i>
              <span>Droit d’auteur</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="licenses">
            <span class="settings-row-left">
              <i data-lucide="badge-check"></i>
              <span>Licences</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="platform">
            <span class="settings-row-left">
              <i data-lucide="shield"></i>
              <span>Règles de la plateforme</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="community">
            <span class="settings-row-left">
              <i data-lucide="users"></i>
              <span>Règles de la communauté</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

        </div>

        <div class="settings-group">

          <button class="settings-row" data-rule="creators">
            <span class="settings-row-left">
              <i data-lucide="music-2"></i>
              <span>Créateurs</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="buyers">
            <span class="settings-row-left">
              <i data-lucide="shopping-bag"></i>
              <span>Acheteurs</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="reports">
            <span class="settings-row-left">
              <i data-lucide="flag"></i>
              <span>Signalements</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="sanctions">
            <span class="settings-row-left">
              <i data-lucide="ban"></i>
              <span>Sanctions</span>
            </span>

            <i data-lucide="chevron-right" class="settings-chevron"></i>
          </button>

          <button class="settings-row" data-rule="permissions">
          <span class="settings-row-left">
          <i data-lucide="circle-check-big"></i>
          <span>Autorisations</span>
          </span>

        <i data-lucide="chevron-right" class="settings-chevron"></i>
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
                renderRule(row.dataset.rule);
            });
        });
}

function renderRule(ruleKey) {
    const rule = rulesContent[ruleKey];

    if (!rule) {
        renderReglement();
        return;
    }

    appLayout.innerHTML = `
    <section class="rule-page">

      <header class="settings-header">

        <button
          type="button"
          class="settings-back-button"
          aria-label="Retour"
        >
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="settings-title">
          ${rule.title}
        </h1>

        <div class="settings-header-space"></div>

      </header>

      <article class="rule-content">
        ${rule.content}
      </article>

    </section>
  `;

    lucide.createIcons();

    document
        .querySelector(".settings-back-button")
        .addEventListener("click", renderReglement);
}

renderReglement();