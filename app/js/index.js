
const introScreen = document.querySelector('.intro-screen');
const textMarque = document.querySelector('.intro-title');




setTimeout(() => {
    textMarque.classList.add ('hide');
}, 5500);

setTimeout(() => {
    window.location.href = "home.html";
}, 5500);