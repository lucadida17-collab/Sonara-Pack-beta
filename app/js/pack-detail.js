const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);


const btnPreview = document.querySelector(".playBtn");
const audio = document.querySelector(".audioPreview");

const packDetailGrandeCover = document.querySelector('.packDetail-grande-cover')
const packDetailTitre = document.querySelector('.packDetail-titre');
const packDetailCompositeur = document.querySelector('.packDetail-compositeur');
const packDetailCompositeurMobile = document.querySelector('.packDetail-compositeur-mobile');
const buttonAccederAuPack = document.querySelector('.button-acceder-au-pack');
const audioPreview = document.querySelector('.audioPreview');
const audioSource = document.querySelector('source');


if (selectedId && audioSource && btnPreview && audio) {
    audioSource.src = `../../${selectedId.audio}`;
    audio.load();

let isPlaying = false;

   if (btnPreview && audio) {
     console.log("BOUTON AUDIO TROUVER ");

    btnPreview.addEventListener("click", () => {
       console.log("click button");
       console.log("isPlaying avant =", isPlaying);

      if(!isPlaying) {
        audio.play()
        btnPreview.textContent = "❚❚"; 
        isPlaying = true;
        console.log("Audio Play");
        } else {
        audio.pause();
        audio.currentTime = 0;
        btnPreview.textContent = "▶";
        isPlaying = false
        console.log("AUDIO PAUSE + RESET");
        }
        console.log("isplaying aprés =", isPlaying);
         });

         audio.addEventListener("ended", () => {
            btnPreview.textContent = "▶";
            isPlaying = false;
         });
    }
}

     if (selectedId && packDetailGrandeCover) {
        packDetailGrandeCover.src = `../../${selectedId.coverPack}`;
        packDetailGrandeCover.alt = `Cover ${selectedId.title}`
     };
     
    if (selectedId && packDetailTitre) {
        packDetailTitre.textContent = selectedId.title;
    };
    
    if ( selectedId && packDetailCompositeur) {
        packDetailCompositeur.textContent = ` 

        Utilise ${selectedId.title} dans tes vidéos, montages ou projets créatifs.
        Garde le son tel quel, ou transforme-le avec tes effets, plugins et logiciels audio. 
         
        ${selectedId.title} a été composé par ${selectedId.artist} 
     a droite 👉 les réseaux de l'artiste. 🎵
     `
     };

     if (selectedId && packDetailCompositeurMobile) {
         packDetailCompositeurMobile.textContent = 
         `Utilise ${selectedId.title} dans tes projets créatif.
         tu peux garder le son tel quel ou le transformer avec tes propres effets audio.

         ${selectedId.title} a été composé par ${selectedId.artist} 
    swipe en bas 👇 pour voir les réseaux de l'artiste. 🎵`;
     };

     if (selectedId && buttonAccederAuPack) {
        buttonAccederAuPack.textContent = `Acceder a ${selectedId.title}`;
    };

    const tiktokLink = document.querySelector('#tiktok-link');

if (selectedId && tiktokLink) {
    tiktokLink.href = selectedId.socialLink;
}

const btnAccederAuPack = document.querySelector('.button-acceder-au-pack');

if (btnAccederAuPack) {
window.addEventListener('pageshow', () => {
    btnAccederAuPack.classList.remove('flash');
 });

btnAccederAuPack.addEventListener('click', () => {
    const packId = btnAccederAuPack.dataset.id;
     
    btnAccederAuPack.classList.add('flash');
    
    setTimeout(() => {
       window.location.href = `Checkout.html?id=${packId}`;
    }, 900);
}); 
 }