const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.22:3000"
    : "https://sonara-pack-beta.onrender.com";

const R2_PUBLIC_URL = "https://pub-17f0bc248a3549bea1cec66ac9f6abe1.r2.dev";

function getFilePath(file) {
  if (!file) return "";

  if (file.startsWith("http")) return file;

  if (file.startsWith("/uploads/")) {
    return `${API_BASE}${file}`;
  }

  if (file.startsWith("uploads/")) {
    return `${API_BASE}/${file}`;
  }

  if (
    file.startsWith("packs/") ||
    file.startsWith("tracks/") ||
    file.startsWith("artists/") ||
    file.startsWith("zips/")
  ) {
    return `${R2_PUBLIC_URL}/${file}`;
  }

  return `${API_BASE}/uploads/${file}`;
}



const searchContent = document.querySelector(".search-content");

async function renderSearchPage() {
    searchContent.innerHTML = `
        <section class="search-page"> 
          <h1>Recherche</h1>
       
          

  <div class="search-input-box">
    <i data-lucide="search"></i>

    <input
      class="search-input"
      type="text"
      placeholder="Pack, Track"
    >
  </div>
</div>


              <div class="search-results">

        <div class="search-section">
            <h2>Packs</h2>
            <div class="packs-results"></div>
        </div>

        <div class="search-section">
            <h2>Tracks</h2>
            <div class="tracks-results"></div>
        </div>

    </div>

    
        </section>
    `;

    const response = await fetch(`${API_BASE}/api/packs`);
    const packs = await response.json();

    const input = document.querySelector(".search-input");
    const packsResults = document.querySelector(".packs-results");
    const tracksResults = document.querySelector(".tracks-results");

    function search(query) {
        const q = query.toLowerCase().trim();

        const filteredPacks = packs.filter(pack =>
            pack.title?.toLowerCase().includes(q) ||
            pack.artist?.toLowerCase().includes(q) ||
            pack.categorie?.join(" ").toLowerCase().includes(q)
        );

        const allTracks = packs.flatMap(pack =>
            pack.tracks.map(track => ({
                ...track,
                packId: pack.id,
                packTitle: pack.title
            }))
        );

        const filteredTracks = allTracks.filter(track =>
            track.title?.toLowerCase().includes(q) ||
            track.artist?.toLowerCase().includes(q)
        );

        packsResults.innerHTML = filteredPacks.map(pack => `
            <div class="search-pack-card" data-pack-id="${pack.id}">
                <img src="${getFilePath(pack.coverPack)}">
                <h3>${pack.title}</h3>
                <p>${pack.artist}</p>
            </div>
        `).join("");

        tracksResults.innerHTML = filteredTracks.map(track => `
            <div class="search-track-row" data-pack-id="${track.packId}" data-track-id="${track.id}">
                <img src="${getFilePath(track.coverPack)}">
                <div>
                    <h3>${track.title}</h3>
                    <p>${track.artist}</p>
                </div>
            </div>
        `).join("");
    }

    input.addEventListener("input", () => {
        search(input.value);
    });

    document.querySelectorAll(".popular-searches button").forEach(btn => {
        btn.addEventListener("click", () => {
            input.value = btn.dataset.query;
            search(btn.dataset.query);
        });
    });

    search("");
}
    


lucide.createIcons();

const profile = JSON.parse(localStorage.getItem("sonaraProfile"));

const mobileCreateBtn = document.querySelector(".nav-mobile-create");

if (profile?.role !== "both") {
    mobileCreateBtn.style.display = "none";
}

function setActiveNav(activeBtn) {
    document.querySelectorAll(".nav-mobile-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    activeBtn.classList.add("active");
}


document.querySelector(".nav-mobile-home").addEventListener("click", () => {
    window.location.href = "../../home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
    window.location.href = "creator.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {
    window.location.href = "library.html";
});

document.querySelector(".nav-mobile-search").addEventListener("click", () => {
    setActiveNav(document.querySelector(".nav-mobile-search"))
});