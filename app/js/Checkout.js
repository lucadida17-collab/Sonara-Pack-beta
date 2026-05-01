const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const selectedId = window.packs?.find(data => data.id === packId);

const checkoutGrandeCover = document.querySelector('.checkout-grande-cover');
const checkoutBtnText = document.querySelector('.checkout-button-texte');
const checkoutPrice = document.querySelector('.checkout-price');
const checkoutText = document.querySelector('.checkout-text');
const checkoutTitle = document.querySelector('.checkout-title');
const checkoutTextDroit = document.querySelector('.checkout-text-droit')

if (selectedId && checkoutGrandeCover) {
    checkoutGrandeCover.src = `../../${selectedId.coverPack}`
};

if (selectedId && checkoutBtnText) {
    checkoutBtnText.textContent = `Obtenir ${selectedId.title}`
};

if (selectedId && checkoutPrice) {
    checkoutPrice.textContent = `Gratuit `
};

if (selectedId && checkoutText) {
    checkoutText.textContent = `télécharger ${selectedId.title}`
};

if (selectedId && checkoutTextDroit) {
    checkoutTextDroit.textContent = `🎧 Utilisation du pack :
    ✔️ Vidéos (Tiktok, Youtube, films, etc.)
    ✔️ Usage illimité (projets perso & pro.)
    ✔️ Utiliser des daw (rajouter des effet sur les sons.)
    
    🚫 Interdit:
    ❌ revente des sons
    ❌ partage du pack
    ❌ upload sur une plateforme musicale.`
};

if (selectedId && checkoutTitle) {
    checkoutTitle.textContent = `${selectedId.title} Pack`
};


const CheckoutBtn = document.querySelector('.checkout-button');

if (selectedId && CheckoutBtn) {
window.addEventListener('pageshow', () => {
     CheckoutBtn.classList.remove('flash');
 });

  CheckoutBtn.addEventListener('click', () => {   
    console.log('CLICK DETECTED');
    
  fetch("https://api.counterapi.dev/v1/sonara/click-pack/up");

    
    CheckoutBtn.classList.add('flash');
    

    setTimeout(() => {
       window.location.href = selectedId.downloadUrl;
    }, 900);
}); 
 }