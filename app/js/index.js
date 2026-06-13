
const introScreen = document.querySelector('.intro-screen');
const textMarque = document.querySelector('.intro-title');


const profilCreated = localStorage.getItem("sonaraProfilCreated");

setTimeout(() => {
    textMarque.classList.add ('hide');
}, 5500);

setTimeout(() => {
    if(profilCreated === "true") {
    window.location.href = "app/pages/countdown.html";
    }

    else {
        window.location.href = "app/pages/countdown.html";
    }

}, 5500);

function resetAccount() {
  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");

  window.location.href = "app/pages/countdown.html";
}