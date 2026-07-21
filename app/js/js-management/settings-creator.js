const settingsLayout = document.querySelector(".app-layout");

const creatorSettingsSections = {
  rules: {
    title: "Règlement créateur",
    intro:
      "Ces règles protègent les créateurs, les acheteurs et la fiabilité de Sonara Pack.",
    groups: [
      {
        title: "Droits et propriété",
        paragraphs: [
          "Tu dois disposer de tous les droits nécessaires sur les sons, images, noms, voix et éléments publiés.",
          "Tout contenu non autorisé, trompeur, copié ou faisant l’objet d’une réclamation sérieuse peut être refusé ou retiré.",
          "Sonara Pack peut demander des éléments permettant de confirmer l’origine ou l’autorisation d’un contenu.",
          "Le créateur reste responsable de la légalité de ce qu’il publie."
        ]
      },
      {
        title: "Qualité des produits",
        paragraphs: [
          "Le produit livré doit correspondre exactement à sa présentation, à ses previews et à sa description.",
          "Les fichiers doivent être complets, fonctionnels, correctement nommés et utilisables par l’acheteur.",
          "Les informations de prix, de format et de contenu doivent rester exactes.",
          "Toute présentation volontairement trompeuse peut entraîner le refus du pack ou une sanction du compte."
        ]
      },
      {
        title: "Utilisation de la plateforme",
        paragraphs: [
          "Les ventes, livraisons et échanges liés aux produits publiés doivent respecter le fonctionnement prévu par Sonara Pack.",
          "Toute tentative de fraude, de manipulation, de contournement des protections ou d’utilisation abusive de la plateforme est interdite.",
          "Il est interdit de perturber les paiements, la modération, les téléchargements, les comptes ou les systèmes de sécurité.",
          "Les décisions techniques et de modération doivent être respectées tant qu’elles n’ont pas été officiellement révisées."
        ]
      },
      {
        title: "Relation avec les acheteurs",
        paragraphs: [
          "Les échanges doivent rester respectueux, honnêtes et directement liés au produit concerné.",
          "Les données personnelles d’un acheteur ne doivent pas être réutilisées sans base légitime.",
          "Les problèmes signalés doivent être traités de bonne foi.",
          "Les pressions, menaces, messages trompeurs ou pratiques commerciales abusives sont interdits."
        ]
      },
      {
        title: "Modération et sanctions",
        paragraphs: [
          "Sonara Pack peut vérifier un profil, un pack ou une activité avant et après publication.",
          "Un contenu peut être corrigé, suspendu ou retiré lorsqu’un risque sérieux est identifié.",
          "Selon la gravité ou la répétition, une violation peut entraîner une limitation, une suspension ou la fermeture du compte.",
          "Les mesures prises cherchent à protéger la plateforme, les créateurs et les acheteurs."
        ]
      }
    ]
  },

  legal: {
    title: "Pages légales vendeur",
    intro:
      "Les principales conditions liées à l’activité de vendeur sur Sonara Pack.",
    groups: [
      {
        title: "Rôle du créateur",
        paragraphs: [
          "Le créateur propose ses propres contenus sous réserve de validation de son compte et de ses publications.",
          "Il garantit l’exactitude des informations fournies et la légalité des produits proposés.",
          "Sonara Pack fournit les outils techniques nécessaires à la présentation, au paiement, au stockage et à la livraison.",
          "L’accès à certaines fonctions peut dépendre de vérifications ou d’exigences techniques."
        ]
      },
      {
        title: "Responsabilité",
        paragraphs: [
          "Le créateur reste responsable des contenus, descriptions, prix et déclarations associés à ses produits.",
          "Sonara Pack peut suspendre une publication lorsqu’un risque juridique, technique ou commercial sérieux existe.",
          "Une preuve de droit, d’autorisation ou d’identité peut être demandée lorsque cela est nécessaire.",
          "Les conséquences d’une déclaration volontairement fausse peuvent être imputées au créateur concerné."
        ]
      },
      {
        title: "Disponibilité du service",
        paragraphs: [
          "Les outils, formats, limites et fonctionnalités peuvent évoluer afin d’améliorer la plateforme.",
          "Certaines opérations peuvent être temporairement interrompues pour maintenance, sécurité ou conformité.",
          "Les changements importants concernant les vendeurs peuvent être annoncés dans l’espace créateur.",
          "Une nouvelle acceptation peut être demandée lorsque les conditions évoluent de manière importante."
        ]
      }
    ]
  },

  payments: {
    title: "Paiements et versements",
    intro:
      "Les règles générales concernant les revenus issus des ventes.",
    groups: [
      {
        title: "Compte de paiement",
        paragraphs: [
          "Un compte de paiement valide et vérifié peut être nécessaire pour recevoir des versements.",
          "Les informations sensibles sont traitées par le prestataire de paiement utilisé par Sonara Pack.",
          "Des vérifications d’identité ou d’activité peuvent être exigées.",
          "Les informations fournies doivent rester exactes et à jour."
        ]
      },
      {
        title: "Revenus",
        paragraphs: [
          "Les montants disponibles peuvent tenir compte des frais, remboursements, litiges et opérations en cours.",
          "Un versement peut être retardé lorsqu’une vérification ou un problème de paiement doit être résolu.",
          "Les revenus liés à une activité interdite, frauduleuse ou non autorisée peuvent être bloqués.",
          "Le créateur reste responsable de ses obligations fiscales, comptables et professionnelles."
        ]
      },
      {
        title: "Remboursements et litiges",
        paragraphs: [
          "Un remboursement peut être étudié lorsqu’un produit est inutilisable, incomplet ou sensiblement différent de sa présentation.",
          "Le montant correspondant peut être déduit des revenus du produit concerné.",
          "Les éléments disponibles peuvent être examinés avant toute décision.",
          "Les tentatives de fausse réclamation ou de manipulation peuvent entraîner des mesures de protection."
        ]
      }
    ]
  },

  privacy: {
    title: "Confidentialité créateur",
    intro:
      "La manière dont les données liées à ton activité créateur peuvent être utilisées.",
    groups: [
      {
        title: "Données traitées",
        paragraphs: [
          "Sonara Pack peut traiter les informations nécessaires au compte, aux contenus, aux ventes, aux paiements, à la sécurité et au support.",
          "Certaines données publiques du profil artiste peuvent être visibles par les utilisateurs.",
          "Les données peuvent être transmises uniquement aux prestataires nécessaires au fonctionnement du service ou au respect d’obligations légales.",
          "Les données ne sont pas vendues à des annonceurs."
        ]
      },
      {
        title: "Protection et conservation",
        paragraphs: [
          "Des mesures techniques et organisationnelles sont utilisées pour limiter les accès non autorisés.",
          "Certaines informations peuvent être conservées pendant la durée nécessaire aux ventes, litiges, obligations légales ou mesures de sécurité.",
          "Les données inutiles ne doivent pas être conservées indéfiniment.",
          "Une vérification peut être demandée avant une opération sensible."
        ]
      },
      {
        title: "Tes droits",
        paragraphs: [
          "Tu peux demander l’accès ou la rectification de certaines données personnelles.",
          "Tu peux demander leur suppression lorsque les obligations applicables le permettent.",
          "La fermeture d’un compte peut nécessiter le traitement préalable des opérations encore en cours.",
          "Les demandes doivent être formulées par les moyens de contact officiels de Sonara Pack."
        ]
      }
    ]
  },

  contact: {
    title: "Contact créateur",
    intro:
      "Contacter Sonara au sujet d’un profil, d’un pack, d’un paiement ou d’une décision de modération.",
    groups: [
      {
        title: "Préparer une demande",
        paragraphs: [
          "Décris clairement le problème et indique les références nécessaires à son identification.",
          "N’envoie jamais de mot de passe, de code secret ou d’information bancaire complète.",
          "Pour une question liée aux droits, transmets uniquement les éléments utiles à l’examen de la situation.",
          "Les demandes abusives, trompeuses ou volontairement incomplètes peuvent être refusées."
        ]
      },
      {
        title: "Canaux officiels",
        paragraphs: [
          "Utilise uniquement les moyens de contact proposés dans Sonara Pack.",
          "Une demande reçue en dehors des canaux officiels peut ne pas être traitée.",
          "Les réponses importantes concernant ton compte peuvent être conservées dans l’historique du support."
        ]
      }
    ],
    action: {
      label: "Ouvrir le support",
      href: "support-creator.html"
    }
  }
};

function creatorSettingsIcons() { if (window.lucide) window.lucide.createIcons() } function settingsRow(icon, label, section) { return `<button type="button" class="creator-settings-row" data-creator-section="${section}"><span><i data-lucide="${icon}"></i><strong>${label}</strong></span><i data-lucide="chevron-right"></i></button>` } function renderCreatorSettingsHome() { settingsLayout.innerHTML = `<section class="creator-settings-page"><header class="creator-settings-header"><button type="button" class="creator-settings-back" aria-label="Retour"><i data-lucide="arrow-left"></i></button><h1>Paramètres créateur</h1><div></div></header><main class="creator-settings-content"><section class="creator-settings-group"><button type="button" class="creator-settings-row" data-creator-page="account-creator.html"><span><i data-lucide="circle-user-round"></i><strong>Compte créateur</strong></span><i data-lucide="chevron-right"></i></button>${settingsRow("shield-check", "Règlement créateur", "rules")}${settingsRow("scale", "Pages légales vendeur", "legal")}${settingsRow("landmark", "Paiements et versements", "payments")}${settingsRow("lock-keyhole", "Confidentialité créateur", "privacy")}</section><section class="creator-settings-group"><button type="button" class="creator-settings-row" data-creator-page="support-creator.html"><span><i data-lucide="message-circle"></i><strong>Support</strong></span><i data-lucide="chevron-right"></i></button><button type="button" class="creator-settings-row creator-settings-dashboard"><span><i data-lucide="layout-dashboard"></i><strong>Retour au management</strong></span><i data-lucide="chevron-right"></i></button></section></main></section>`; creatorSettingsIcons(); document.querySelector(".creator-settings-back").addEventListener("click", () => { window.location.href = "../profile-creator.html" }); document.querySelector(".creator-settings-dashboard").addEventListener("click", () => { window.location.href = "../../creator.html?mode=management" }); document.querySelectorAll("[data-creator-section]").forEach(button => { button.addEventListener("click", () => renderCreatorSettingsSection(button.dataset.creatorSection)) }); document.querySelectorAll("[data-creator-page]").forEach(button => { button.addEventListener("click", () => { window.location.href = button.dataset.creatorPage }) }) } function renderCreatorSettingsSection(sectionKey) { const section = creatorSettingsSections[sectionKey]; if (!section) { renderCreatorSettingsHome(); return } settingsLayout.innerHTML = `<section class="creator-settings-page"><header class="creator-settings-header"><button type="button" class="creator-settings-back" aria-label="Retour"><i data-lucide="arrow-left"></i></button><h1>${section.title}</h1><div></div></header><main class="creator-settings-content creator-settings-document"><p class="creator-settings-intro">${section.intro}</p>${section.groups.map(group => `<article class="creator-document-card"><h2>${group.title}</h2>${group.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join("")}</article>`).join("")}${section.action ? `<a class="creator-settings-action" href="${section.action.href}">${section.action.label}</a>` : ""}</main></section>`; creatorSettingsIcons(); document.querySelector(".creator-settings-back").addEventListener("click", renderCreatorSettingsHome) } renderCreatorSettingsHome();