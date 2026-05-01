const backButton = document.querySelector('.back-button')

if (backButton) {
 window.addEventListener('pageshow', () => {
    
 });

 backButton.addEventListener('click', () => {
    
    setTimeout(() => {
       window.location.href = `../index.html`;
    },50);
    
}); 
}