const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);


const downloadPage = document.querySelector('.Download');

const downloadDesktop = document.querySelector('.download-desktop');
const downloadMobile = document.querySelector('.download-mobile');
const downloadMobileTitle = document.querySelector('.download-mobile-title');
const downloadMobileText = document.querySelector('.download-mobile-text');
const downloadTitle = document.querySelector('.download-title');
const downloadText = document.querySelector('.download-text');
const downloadButton = document.querySelector('.download-button');
const downloadHomeButton = document.querySelector('.download-home-button');
 const confirmButton = document.querySelector(".download-confirm-button");

if (downloadPage && selectedId) {
 const isMobile = window.innerWidth <= 768;

 const isAndroid = /Android/i.test(navigator.userAgent);
 const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
 const iphoneVideo = document.querySelector(".download-iphone-video");

 function downloadPack() {
    console.log("downloadPack exécuté");
     
    
  fetch("https://api.counterapi.dev/v1/sonara/download-real/up");


    const link = document.createElement("a");
    link.href = `../../${selectedId.telechargementUrl}`;
    link.download = `Dernier-Souffle.zip`;
    
    console.log("link.href =", link.href);
    console.log("link.download =", link.download);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
 }

 if (isMobile) {
    if (downloadDesktop) downloadDesktop.style.display = "none";
    if (confirmButton) confirmButton.style.display = "none";
    if (downloadHomeButton) downloadHomeButton.style.display = "none";
    if (downloadMobile) downloadMobile.style.display = 'flex';
    if (iphoneVideo) iphoneVideo.style.display = "none";
    

  if (downloadMobileTitle) {
    downloadMobileTitle.textContent = "Comment Télécharger ?";
  }

  if (downloadMobileText) {
    downloadMobileText.textContent =
    `⚠️ IMPORTANT (iPhone IOS uniquement)
    Cliquer sur télécharger et regarder bien les explications, 
    comment on récupére le fichier.
    
    Androïd continuer. Vous ces automatiques.`; 
  }

    if (downloadButton) {
        downloadButton.textContent = `Télécharger ${selectedId.title}`;

        downloadButton.addEventListener("click", () => {
            downloadPack();

            if (isIphone && iphoneVideo) {
                iphoneVideo.style.display = "block";
            };

            if (downloadMobileTitle) {
                downloadMobileTitle.textContent = "Dernière étape";
            };

            if (downloadMobileText) {
                if (isIphone ) {
                    downloadMobileText.textContent = `📱 iPhone :
                1. cliquer sur télécharger en bas. 
               2. Appuyer sur l'icône partager en bas a gauche,
               3. choisissez "Enregistrer dans Fichiers".
                Revenez ensuite ici et confirmez. 

                pour ceux qui veuleut plus comprendre y'a une vidéo en plus.

               💡Astuce : Créez un dossier "Sonara Pack" pour retrouver facilement vos sons.`
                } else if (isAndroid) {
                `
                 🤖 Androïd :
                 Le fichier se télécharge automatiquement.
                 ou soi y'a une pop up qui apparait en haut.
                 
                 📁 Ouvrez "Fichiers" -> "Téléchargements"
                 Vous trouverez votre pack ici.
                 
                 Samsung -> "mes fichiers"
                 Xiaomi -> "Gestionnaire de fichier"
                 Pixel -> "Files by Google"
                 
                 Le principe est toujours le même.
                 Si vous avez compris confirmer. 
                 Sinon vidéo juste en bas 👇 `;
                 }
                }
 
            downloadButton.style.display = "none";
            
           
                      
            if (confirmButton) {
                confirmButton.style.display = "inline-flex";
                confirmButton.textContent = "j'ai enregistrer le fichier";
                confirmButton.addEventListener("click", () => {
                    
             iphoneVideo.style.display = "none"; 
           confirmButton.style.display = "none";

           if (downloadMobileText) {
            downloadMobileText.textContent = `Nouvelle mise a jour prévu`;
           };

            if (downloadMobileTitle) {
                downloadMobileTitle.textContent = "Téléchargement lancé";
            };

            if (downloadMobileText) {
                downloadMobileText.textContent = "Merci pour votre achat";
            };

            if (downloadHomeButton) {
                downloadHomeButton.style.display = "inline-flex";
                downloadHomeButton.textContent = "Retour à l'accueil";

                downloadHomeButton.addEventListener("click", () => {
                    window.location.href = "../../index.html";
                });
             };    
          });   
        };
     });
    }

 } else {
    if (downloadMobile) downloadMobile.style.display = "none";
    if (downloadDesktop) downloadDesktop.style.display = "flex";

    if (downloadTitle) {
        downloadTitle.textContent = "Téléchargement en cours...";
    };

    if (downloadText) {
        downloadText.textContent = `Le pack ${selectedId.title} se prépare.`;
    };

    setTimeout(() => {
        downloadPack();

        if (downloadTitle) {
            downloadTitle.textContent = "Téléchargement Terminer";
        };

        if (downloadText) {
        downloadText.textContent = `Merci pour votre achat.`;
        }
     
       

       }, 5000);
        setTimeout(() => {
            window.location.href = "../../index.html";
        }, 6000);
   
 }


  
}