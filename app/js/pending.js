const API_BASE =
window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.18:3000"
    : "https://sonara-pack-beta.onrender.com";


const homeAccessBtn = document.querySelector(".home-access-btn");

const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

if (profile && profile.role === "artist") {
  homeAccessBtn.style.display = "none";
}

homeAccessBtn.addEventListener("click", () => {
  window.location.href = "../../home.html";
});


async function checkStatus() {
  if (!profile || !profile.id) return;

  const res = await fetch(`${API_BASE}/api/users/${profile.id}`);
  const data = await res.json();

  if (data.user.status === "approved") {
    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(data.user)
    );

    window.location.href = "creator.html";
  }

  if (data.user.status === "rejected") {
         localStorage.setItem("sonaraProfile", JSON.stringify(data.user));

    if (data.user.role === "both") {
      window.location.href = "../../home.html";
    } else {
      window.location.href = "chaos.html";
    }
  }
}

setInterval(checkStatus, 3000);

checkStatus();



