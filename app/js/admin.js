
const adminPage = document.querySelector(".admin-page") 

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.")
    ? "http://192.168.1.22:3000"
    : "https://sonara-pack-beta.onrender.com";

{
  adminPage.innerHTML = `
  
  
    <section class="admin-hero">
      <p class="admin-label">Sonara Pack Control Center</p>
      <h1>Admin</h1>
      <p class="admin-subtitle">
        Vérifie, accepte ou refuse les comptes artistes avant qu’ils puissent publier.
      </p>
    </section>

    <section class="admin-stats">
      <div class="stat-card">
        <span>Demandes en attente</span>
        <strong id="pendingCount">0</strong>
      </div>

      <div class="stat-card">
        <span>Système</span>
        <strong>ONLINE</strong>
      </div>

      <div class="stat-card">
        <span>Niveau sécurité</span>
        <strong>STRICT</strong>
      </div>


      
    </section>

 <div class="admin-modes">
    <button type="button" class="admin-mode-btn active" data-mode="users">
  <span class="mode-kicker">Mode</span>
  <strong>Demande Artist</strong>
</button>

<button type="button" class="admin-mode-btn" data-mode="packs">
  <span class="mode-kicker">Mode</span>
  <strong>Demande Pack</strong>
</button>
</div>

<section class="moderation-panel">
  <div class="panel-header">
    <h2>Demandes artistes</h2>
    <button type="button" class="refresh-btn">Rafraîchir</button>
  </div>

  <div id="pendingUsers" class="pending-users"></div>
  <div id="pendingPacks" class="pending-packs" style="display:none;"></div>
</section>

  `;



}



const pendingUsersContainer = document.querySelector("#pendingUsers");
const pendingPacksContainer = document.querySelector("#pendingPacks");
const pendingCount = document.querySelector("#pendingCount");
const refreshBtn = document.querySelector(".refresh-btn");
const modeBtns = document.querySelectorAll(".admin-mode-btn");
const moderationTitle = document.querySelector(".panel-header h2");

let adminMode = localStorage.getItem("adminMode") || "users";

modeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
     adminMode = btn.dataset.mode;
localStorage.setItem("adminMode", adminMode);

    modeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  
    if (adminMode === "users") {
  moderationTitle.textContent = "Demandes artistes";

  pendingUsersContainer.style.display = "grid";
  pendingPacksContainer.style.display = "none";

  loadPendingUsers();
}

if (adminMode === "packs") {
  moderationTitle.textContent = "Demandes packs";

  pendingUsersContainer.style.display = "none";
  pendingPacksContainer.style.display = "grid";

  loadPendingPacks();
}
  });
});

refreshBtn.addEventListener("click", () => {
  if (adminMode === "users") loadPendingUsers();
  if (adminMode === "packs") loadPendingPacks();
});

async function loadPendingUsers() {
  const response = await fetch(`${API_BASE}/api/pending-users`);
  const users = await response.json();

  pendingUsersContainer.innerHTML = "";
  pendingCount.textContent = users.length;

  if (users.length === 0) {
    pendingUsersContainer.innerHTML = `
      <div class="empty-state">
        <h3>Aucune demande en attente</h3>
        <p>Le royaume est calme. Aucun artiste à modérer pour l’instant.</p>
      </div>
    `;
    return;
  }

  users.forEach(user => {
    const card = document.createElement("article");
    card.className = "user-card";

    card.innerHTML = `
      <div class="user-top">
        <div>
          <h3>${user.artistname || user.firstname}</h3>
          <p>${user.role} · ${user.createdAt || "date inconnue"}</p>
        </div>
        <span class="status-badge">PENDING</span>
      </div>

      <div class="user-grid">
        <div class="info-box">
          <span>Nom complet</span>
          <strong>${user.firstname || ""} ${user.lastname || ""}</strong>
        </div>

        <div class="info-box">
          <span>Email</span>
          <strong>${user.mail || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>Téléphone</span>
          <strong>${user.phone || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>Date de naissance</span>
          <strong>${user.date || "Non renseignée"}</strong>
        </div>

        <div class="info-box">
          <span>Nom d’artiste</span>
          <strong>${user.artistname || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>SIRET</span>
          <strong>${user.siret || user.siretinput || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>Rôle demandé</span>
          <strong>${user.role}</strong>
        </div>

        <div class="info-box">
          <span>ID dossier</span>
          <strong>${user.id}</strong>
        </div>
      </div>

      <div class="warning-box">
        Vérification obligatoire : identité, cohérence du profil, droits de publication,
        SIRET si fourni, et risque de fraude. En cas de doute, refuser.
      </div>

      <div class="action-row">
        <button class="accept-btn" onclick="updateStatus('${user.id}', 'approved')">
          Accepter
        </button>

        <button class="reject-btn" onclick="updateStatus('${user.id}', 'rejected')">
          Refuser
        </button>
      </div>
    `;

    pendingUsersContainer.appendChild(card);
  });
}

 async function updateStatus(id, status) {
  await fetch(`${API_BASE}/api/users/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  loadPendingUsers()


}


async function loadPendingPacks() {
  console.log("LOAD PACKS LANCÉ");

  const response = await fetch(`${API_BASE}/api/packs/pending`);
 const packs = await response.json();
const pendingPacks = packs.filter(pack => pack.status === "pending");

pendingPacksContainer.innerHTML = "";
pendingCount.textContent = pendingPacks.length;

if (pendingPacks.length === 0) {
  pendingPacksContainer.innerHTML = `
    <div class="empty-state">
      <h3>Aucun pack en attente</h3>
      <p>Aucun pack à modérer pour l’instant.</p>
    </div>
  `;
  return;
}
  
 

  pendingPacks.forEach(pack => {
    const card = document.createElement("article");
    card.className = "user-card";

    card.innerHTML = `
      <div class="user-top">
        <div>
          <h3>${pack.title || pack.identity?.title || "Pack sans titre"}</h3>
          <p>${pack.artist || pack.artistName || "Artiste inconnu"} · ${pack.status || "pending"}</p>
        </div>
        <span class="status-badge">PACK</span>
      </div>

      <div class="user-grid">
        <div class="info-box">
          <span>Prix</span>
          <strong>${pack.price || pack.globalPrice || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>Ambiance</span>
          <strong>${pack.categorie || pack.identity?.categorie || "Non renseignée"}</strong>
        </div>

        <button class="info-box open-track-btn" data-id="${pack.id}">
          <span>Tracks</span>
          <strong>${pack.tracks?.length || 0}</strong>
        </button>

        <div class="info-box">
          <span>ID pack</span>
          <strong>${pack.id || "pending"}</strong>
        </div>
      </div>

      <div class="warning-box">
        Vérification obligatoire : cover, audio, droits, prix, cohérence du pack.
      </div>

      
       <div class="action-row">
   <button  class="accept-btn" onclick="updatePackStatus('${pack.id}', 'approved')">
  Accepter
</button>

<button class="reject-btn" onclick="updatePackStatus('${pack.id}', 'rejected')">
  Refuser
</button>
</div>
    `;

    pendingPacksContainer.appendChild(card);
  }); 
  
  document.querySelectorAll(".open-track-btn").forEach((btn) => {
  btn.addEventListener("click", () => {

    console.log("CLICK TRACK OK");

    const packId = btn.dataset.id;
    console.log("packId :", packId);

    const pack = pendingPacks.find(p => String(p.id) === String(packId));
    console.log("pack trouvé :", pack);

    if (!pack) return;

    renderPackTracksView(pack);
  });
});

}


function renderPackTracksView(pack) {
  const container = document.querySelector(".admin-page");

  container.innerHTML = `
    <button class="refresh-btn back-to-pack-requests">← Retour aux demandes packs</button>

    <h2 class="section-title">Tracks de ${pack.title || pack.name || "ce pack"}</h2>
  `;

  (pack.tracks || []).forEach((track, index) => {
    const trackCard = document.createElement("div");
    trackCard.className = "pending-pack-card";

    trackCard.innerHTML = `
      <h2>${track.title || "Track sans titre"}</h2>
      <p>${pack.artist || pack.artistName || "Artiste inconnu"} · track ${index + 1}</p>

      <span class="pack-badge">TRACK</span>

      <div class="user-grid">
        <div class="info-box">
          <span>Prix track</span>
          <strong>${track.price || "Non renseigné"}</strong>
        </div>

        <div class="info-box">
          <span>Audio</span>
          <strong>${track.audioName || "Aucun audio"}</strong>
        </div>

        <div class="info-box">
          <span>Cover</span>
          <strong>${track.coverName || track.coverPack || "Aucune cover"}</strong>
        </div>

        <div class="info-box">
          <span>ID track</span>
          <strong>${track.id || `track_${index + 1}`}</strong>
        </div>
      </div>
    `;

    container.appendChild(trackCard);
    
   
  });
 document.querySelector(".back-to-pack-requests").addEventListener("click", () => {
      console.log("RETOUR OK")
    location.href = "../../admin.html";
  });
  
}


async function updatePackStatus(id, status) {
  console.log("PACK CLICK :", id, status);

  const response = await fetch(`${API_BASE}/api/packs/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  const data = await response.json();
  console.log("PACK STATUS RESPONSE :", data);

  if (!response.ok) {
    console.error("Erreur update pack :", data);
    return;
  }

  adminMode = "packs";
  localStorage.setItem("adminMode", "packs");

  switchMode("packs");
   loadPendingPacks();
}