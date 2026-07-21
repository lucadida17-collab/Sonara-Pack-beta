


const homeAccessBtn = document.querySelector(".home-access-btn");

const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

if (profile && profile.role === "artist") {
  homeAccessBtn.style.display = "none";
}

homeAccessBtn.addEventListener("click", () => {
  window.location.href = "/home.html";
});


async function checkStatus() {
  if (!profile || !profile.id) return;

  const res = await fetch(`${API_URL}/api/users/${profile.id}`);
  const data = await res.json();

  const account = data.account;

  if (account.status === "approved") {
    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(account)
    );

    window.location.href = "creator.html";
  }

  if (account.status === "rejected") {
         localStorage.setItem("sonaraProfile", JSON.stringify(account));

    if (account.role === "both") {
      window.location.href = "/home.html";
    } else {
      window.location.href = "inscription.html";
    }
  }
}

setInterval(checkStatus, 3000);

checkStatus();



