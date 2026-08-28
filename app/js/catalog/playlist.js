"use strict";

const playlistView = document.querySelector(".playlist-view");
const playlistLoading = document.querySelector(".playlist-loading");
let activePlaylistAudio = null;

function playlistEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function playlistFilePath(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^(https?:|blob:|data:)/i.test(raw)) return encodeURI(raw);
  if (raw.startsWith("/uploads/")) return encodeURI(`${API_URL}${raw}`);
  if (raw.startsWith("uploads/")) return encodeURI(`${API_URL}/${raw}`);
  return encodeURI(`${API_URL}/uploads/${raw.replace(/^\/+/, "")}`);
}

function storedPlaylistProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
  } catch {
    return null;
  }
}

function stopPlaylistAudio() {
  if (!activePlaylistAudio) return;
  activePlaylistAudio.audio.pause();
  activePlaylistAudio.button.textContent = "Écouter 30 s";
  activePlaylistAudio = null;
}

function bindPreviewButtons() {
  document.querySelectorAll(".playlist-track-preview").forEach((button) => {
    button.addEventListener("click", async () => {
      const source = playlistFilePath(button.dataset.audio);
      if (!source) return;
      if (activePlaylistAudio?.button === button) {
        stopPlaylistAudio();
        return;
      }
      stopPlaylistAudio();
      const audio = new Audio(source);
      const start = Math.max(0, Number(button.dataset.start || 0));
      const limit = Math.min(30, Math.max(1, Number(button.dataset.duration || 30)));
      activePlaylistAudio = { audio, button };
      button.textContent = "Pause";
      const finish = () => {
        if (activePlaylistAudio?.audio !== audio) return;
        stopPlaylistAudio();
      };
      audio.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(start, Math.max(0, audio.duration - .2));
        }
      }, { once: true });
      audio.addEventListener("timeupdate", () => {
        if (audio.currentTime - start >= limit) finish();
      });
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      await audio.play().catch(finish);
    });
  });
}

async function downloadPreparedFiles(downloads, messageElement) {
  let completed = 0;
  for (const item of downloads) {
    if (messageElement) {
      messageElement.textContent = `Téléchargement ${completed + 1}/${downloads.length}…`;
    }
    const response = await fetch(`${API_URL}${item.fileUrl}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Téléchargement impossible : ${item.title || "track"}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(item.title || "sonara-track").replace(/[^a-z0-9._-]+/gi, "-")}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    completed += 1;
  }
}

function renderPlaylist(playlist, commercialState = {}) {
  const cover = playlistFilePath(playlist.coverPack || playlist.tracks?.[0]?.coverPack || "");
  const total = Number(playlist.pricing?.totalPriceCents || 0) / 100;
  const isCommercial = commercialState.paymentsActive === true;

  playlistView.innerHTML = `
    <section class="playlist-hero">
      <div class="playlist-cover">${cover ? `<img src="${playlistEscape(cover)}" alt="">` : ""}</div>
      <div>
        <p class="playlist-eyebrow">Playlist automatique Sonara</p>
        <h1 data-user-content>${playlistEscape(playlist.title)}</h1>
        <p class="playlist-meta">${playlist.trackCount} tracks · ${playlistEscape(playlist.category?.display || "Sonara")} · édition ${playlistEscape(playlist.editionKey)}</p>
      </div>
    </section>

    <section class="playlist-price-card">
      <div>
        <small>Prix prévu V1</small>
        <strong>${total.toFixed(2)} €</strong>
      </div>
      <span>20 % Sonara · 80 % reversés aux artistes selon le prix de chaque single</span>
    </section>

    <section class="playlist-track-list">
      ${playlist.tracks.map((track, index) => `
        <article class="playlist-track-row">
          <span class="playlist-track-index">${index + 1}</span>
          <div class="playlist-track-copy">
            <strong data-user-content>${playlistEscape(track.title)}</strong>
            <span data-user-content>${playlistEscape(track.artist?.name || "Artiste Sonara")}</span>
          </div>
          <button class="playlist-track-preview" type="button" data-audio="${playlistEscape(track.audioName || "")}" data-start="${Number(track.previewStart || 0)}" data-duration="${Math.min(30, Number(track.previewDuration || 30))}">Écouter 30 s</button>
          <button class="playlist-track-open" type="button" data-pack-id="${playlistEscape(track.packId)}">${isCommercial ? "Acheter" : "Obtenir"}</button>
        </article>
      `).join("")}
    </section>

    <label class="playlist-license-confirm">
      <input type="checkbox" class="playlist-license-checkbox">
      <span>J’ai lu et j’accepte les licences applicables à chacun des morceaux de cette playlist.</span>
    </label>
    <button class="playlist-download-button" type="button">${isCommercial ? "Acheter la playlist" : "Télécharger la playlist"}</button>
    <p class="playlist-message" role="status"></p>
  `;

  bindPreviewButtons();
  playlistView.querySelectorAll(".playlist-track-open").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/app/pages/catalog/pack.html?id=${encodeURIComponent(button.dataset.packId || "")}`;
    });
  });

  const acquireButton = playlistView.querySelector(".playlist-download-button");
  const checkbox = playlistView.querySelector(".playlist-license-checkbox");
  const message = playlistView.querySelector(".playlist-message");

  acquireButton?.addEventListener("click", async () => {
    if (!checkbox?.checked) {
      message.textContent = "Accepte les licences avant de continuer.";
      return;
    }
    if (isCommercial) {
      message.textContent = "Le paiement multi-artistes reste verrouillé tant que le checkout playlist V1 n’est pas activé.";
      return;
    }

    const profile = storedPlaylistProfile();
    const userId = String(profile?.id || profile?.accountId || "").trim();
    if (!userId) {
      message.textContent = "Profil introuvable. Reconnecte-toi puis réessaie.";
      return;
    }

    acquireButton.disabled = true;
    message.textContent = "Préparation de la playlist…";
    try {
      const response = await fetch(`${API_URL}/api/auto-playlists/${encodeURIComponent(playlist.id)}/acquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, licensesAccepted: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        throw new Error(data.message || "Playlist indisponible.");
      }
      await downloadPreparedFiles(Array.isArray(data.downloads) ? data.downloads : [], message);
      message.textContent = "Playlist ajoutée à votre bibliothèque. Les statistiques ont été attribuées à chaque artiste.";
    } catch (error) {
      message.textContent = error.message || "Téléchargement impossible.";
    } finally {
      acquireButton.disabled = false;
    }
  });

  window.lucide?.createIcons?.();
}

async function loadPlaylistPage() {
  const playlistId = new URLSearchParams(window.location.search).get("id");
  if (!playlistId) throw new Error("Playlist introuvable.");
  const response = await fetch(`${API_URL}/api/auto-playlists/${encodeURIComponent(playlistId)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.playlist) throw new Error(data.message || "Playlist introuvable.");
  document.title = `${data.playlist.title} | Sonara Pack`;
  playlistLoading.hidden = true;
  playlistView.hidden = false;
  renderPlaylist(data.playlist, data.commercialState || {});
}

loadPlaylistPage().catch((error) => {
  playlistLoading.className = "playlist-error";
  playlistLoading.textContent = error.message || "Playlist Sonara indisponible.";
});
