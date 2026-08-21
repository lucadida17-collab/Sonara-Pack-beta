(() => {
  "use strict";

  const MONTAGE_MIN_LOADING_MS = 6000;
  const montageLoadingStartedAt = Date.now();

  const root = document.querySelector(".montage-content");
  if (!root) return;

  const state = {
    projectId: "",
    projectName: "",
    projectCreatedAt: "",
    videoFile: null,
    videoUrl: "",
    videoDuration: 0,
    audioTracks: [],
    isExporting: false,
    exportProgress: 0,
    exportStatus: "Prêt à monter votre projet.",
    previewAudios: new Map()
  };

  const objectUrls = new Set();
  const MIN_CLIP_DURATION = 0.1;
  let autoSaveChain = Promise.resolve();

  const t = (value) => window.SonaraI18n?.t?.(value) || value;
  const tp = (source, values = []) => values.reduce(
    (result, value, index) => result.replaceAll(`{${index}}`, String(value)),
    t(source)
  );

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatTime(seconds = 0) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function formatPrecise(seconds = 0) {
    return `${Math.max(0, Number(seconds) || 0).toFixed(1)} s`;
  }

  function formatRemainingTime(seconds = 0) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (safe < 60) return `${safe} s`;

    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainingSeconds = safe % 60;

    if (hours > 0) {
      return `${hours} h ${String(minutes).padStart(2, "0")} min`;
    }

    return `${minutes} min ${String(remainingSeconds).padStart(2, "0")} s`;
  }

  function createObjectUrl(file) {
    const url = URL.createObjectURL(file);
    objectUrls.add(url);
    return url;
  }

  function revokeUrl(url) {
    if (!url || !objectUrls.has(url)) return;
    URL.revokeObjectURL(url);
    objectUrls.delete(url);
  }

  function detachMediaElement(element) {
    if (!element) return;
    try { element.pause?.(); } catch {}
    try { element.removeAttribute("src"); } catch {}
    try { element.load?.(); } catch {}
  }

  function detachCurrentMediaSources() {
    detachMediaElement(document.querySelector("#montagePreviewVideo"));
    state.previewAudios.forEach((audio) => detachMediaElement(audio));
  }

  function releaseObjectUrls() {
    detachCurrentMediaSources();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  }

  function getProfile() {
    try { return JSON.parse(localStorage.getItem("sonaraProfile") || "null"); }
    catch { return null; }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function activeDraftStorageKey() {
    const profile = getProfile();
    const accountId = profile?.accountId || profile?.id || "anonymous";
    return `sonaraSyncActiveDraft:${accountId}`;
  }

  function rememberActiveDraft(projectId) {
    if (projectId) localStorage.setItem(activeDraftStorageKey(), String(projectId));
  }

  function forgetActiveDraft() {
    localStorage.removeItem(activeDraftStorageKey());
  }

  function getRememberedDraft() {
    return localStorage.getItem(activeDraftStorageKey()) || "";
  }

  function initializeNavigation(profile) {
    document.querySelectorAll('[data-montage-nav="home"]').forEach((button) => {
      button.addEventListener("click", () => window.location.assign("/home.html"));
    });

    document.querySelectorAll('[data-montage-nav="library"]').forEach((button) => {
      button.addEventListener("click", () => window.location.assign("/app/pages/catalog/library.html"));
    });

    const createButtons = document.querySelectorAll('[data-montage-nav="create"]');
    if (profile?.role !== "both") {
      createButtons.forEach((button) => { button.hidden = true; });
    } else {
      createButtons.forEach((button) => {
        button.addEventListener("click", () => window.location.assign("/app/pages/creator/dashboard.html"));
      });
    }
  }

  async function readMediaDuration(url, type) {
    return new Promise((resolve) => {
      const media = document.createElement(type);
      media.preload = "metadata";
      media.src = url;
      media.onloadedmetadata = () => resolve(Number.isFinite(media.duration) ? media.duration : 0);
      media.onerror = () => resolve(0);
    });
  }

  function getTrackPlayableDuration(track) {
    return Math.max(0.1, (Number(track.trimEnd) || 0) - (Number(track.trimStart) || 0));
  }

  function normalizeTrackTrim(track) {
    const duration = Math.max(0.1, Number(track.duration) || 0.1);
    track.trimStart = Math.max(0, Math.min(Number(track.trimStart) || 0, duration - 0.1));
    track.trimEnd = Math.max(track.trimStart + 0.1, Math.min(Number(track.trimEnd) || duration, duration));
    track.offset = Math.max(0, Math.min(Number(track.offset) || 0, Math.max(0, state.videoDuration || 0)));
    track.volume = Math.max(0, Math.min(Number(track.volume) || 0, 1.5));
  }

  function getTrackLaneStyle(track) {
    normalizeTrackTrim(track);
    const videoDuration = Math.max(0.1, state.videoDuration || getTrackPlayableDuration(track));
    const left = Math.min(100, Math.max(0, (track.offset / videoDuration) * 100));
    const playableDuration = Math.min(getTrackPlayableDuration(track), Math.max(0.1, videoDuration - track.offset));
    const width = Math.min(100 - left, Math.max(1.2, (playableDuration / videoDuration) * 100));
    return `left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;`;
  }

  function getTrackMeta(track) {
    return tp("{0} · placé à {1} · extrait {2} → {3}", [
      formatTime(getTrackPlayableDuration(track)),
      formatPrecise(track.offset),
      formatPrecise(track.trimStart),
      formatPrecise(track.trimEnd)
    ]);
  }

  function renderTrack(track) {
    normalizeTrackTrim(track);

    return `
      <article class="montage-track-card" data-track-id="${escapeHtml(track.id)}">
        <div class="montage-track-top">
          <div class="montage-track-name">
            <strong data-user-content>${escapeHtml(track.file.name)}</strong>
            <small class="montage-track-meta">${escapeHtml(getTrackMeta(track))}</small>
          </div>
          <button class="montage-remove-track" type="button" data-remove-track="${escapeHtml(track.id)}" aria-label="${escapeHtml(t("Retirer ce son"))}">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="montage-lane" data-track-lane="${escapeHtml(track.id)}" aria-label="${escapeHtml(t("Position et durée du son sur la vidéo"))}">
          <div class="montage-clip" data-track-drag="${escapeHtml(track.id)}" style="${getTrackLaneStyle(track)}">
            <button class="montage-trim-handle montage-trim-handle-start" type="button" data-track-trim-handle="start" aria-label="${escapeHtml(t("Couper le début"))}"></button>
            <span class="montage-clip-grip" aria-hidden="true"></span>
            <button class="montage-trim-handle montage-trim-handle-end" type="button" data-track-trim-handle="end" aria-label="${escapeHtml(t("Couper la fin"))}"></button>
          </div>
        </div>

        <small class="montage-track-direct-hint">${escapeHtml(t("Glissez le bloc pour le placer. Tirez le bord gauche ou droit pour couper le son."))}</small>

        <div class="montage-track-controls montage-volume-only">
          <label class="montage-control">
            <span><b>${escapeHtml(t("Volume"))}</b><output>${Math.round(track.volume * 100)}%</output></span>
            <input type="range" min="0" max="1.5" step="0.05" value="${track.volume}" data-track-volume="${escapeHtml(track.id)}">
          </label>
        </div>
      </article>
    `;
  }

  function render() {
    const hasVideo = Boolean(state.videoUrl);
    const hasAudio = state.audioTracks.length > 0;

    root.innerHTML = `
      <section class="montage-hero">
        <div class="montage-hero-topline">
          <div>
            <p class="montage-kicker">SONARA SYNC</p>
            <h1>${escapeHtml(t("Posez vos sons directement sur votre vidéo."))}</h1>
          </div>
          <div class="montage-project-actions">
            <button class="montage-btn" id="montageSavedProjectsButton" type="button">
              <i data-lucide="folder-open"></i>${escapeHtml(t("Brouillons"))}
            </button>
          </div>
        </div>
        <p>${escapeHtml(t("Ajoutez votre vidéo ou votre film, placez un ou plusieurs sons sous l'image, raccourcissez-les, synchronisez-les en direct puis enregistrez le résultat final."))}</p>
      </section>

      <section class="montage-grid">
        <article class="montage-panel">
          <div class="montage-panel-head">
            <div><h2>${escapeHtml(t("1. Votre vidéo"))}</h2><p>${escapeHtml(t("Le fichier reste dans votre navigateur pendant le montage."))}</p></div>
          </div>

          ${hasVideo ? `
            <div class="montage-video-shell">
              <video id="montagePreviewVideo" src="${escapeHtml(state.videoUrl)}" controls playsinline preload="metadata"></video>
              <div class="montage-video-meta">
                <span data-user-content>${escapeHtml(state.videoFile?.name || t("Vidéo"))}</span>
                <span>${formatTime(state.videoDuration)}</span>
              </div>
            </div>
            <div class="montage-actions">
              <label class="montage-btn">
                <i data-lucide="replace"></i>${escapeHtml(t("Changer la vidéo"))}
                <input id="montageVideoInput" type="file" accept="video/*" hidden>
              </label>
            </div>
          ` : `
            <label class="montage-dropzone">
              <input id="montageVideoInput" type="file" accept="video/*">
              <span>
                <i data-lucide="film"></i>
                <strong>${escapeHtml(t("Ajouter une vidéo ou un film"))}</strong>
                <small>${escapeHtml(t("MP4, MOV, WEBM et formats vidéo compatibles avec votre navigateur"))}</small>
              </span>
            </label>
          `}
        </article>

        <article class="montage-panel">
          <div class="montage-panel-head">
            <div><h2>${escapeHtml(t("2. Vos sons"))}</h2><p>${escapeHtml(t("Utilisez les fichiers Sonara téléchargés depuis votre appareil."))}</p></div>
          </div>

          <label class="montage-dropzone">
            <input id="montageAudioInput" type="file" accept="audio/*" multiple>
            <span>
              <i data-lucide="music-2"></i>
              <strong>${escapeHtml(t(hasAudio ? "Ajouter d'autres sons" : "Ajouter un ou plusieurs sons"))}</strong>
              <small>${escapeHtml(t("Déplacez, raccourcissez et réglez le volume de chaque son avant l'export."))}</small>
            </span>
          </label>
        </article>
      </section>

      <section class="montage-panel">
        <div class="montage-panel-head">
          <div><h2>${escapeHtml(t("3. Timeline audio"))}</h2><p>${escapeHtml(t("Déplacez directement chaque bloc sur la timeline. Attrapez ses bords pour raccourcir le début ou la fin."))}</p></div>
        </div>
        <div class="montage-audio-list">
          ${hasAudio ? state.audioTracks.map(renderTrack).join("") : `<div class="montage-empty-audio">${escapeHtml(t("Ajoutez un son pour créer votre première piste."))}</div>`}
        </div>
      </section>

      <section class="montage-export-card">
        <h3>${escapeHtml(t("4. Enregistrer"))}</h3>
        <p>${escapeHtml(t("L'export reconstruit la vidéo avec les sons placés sur la timeline. Le temps restant s'ajuste automatiquement selon la vitesse réelle de traitement de votre appareil."))}</p>
        <div class="montage-progress" aria-hidden="true"><span style="--progress:${state.exportProgress.toFixed(1)}%"></span></div>
        <div class="montage-status">${escapeHtml(t(state.exportStatus))}</div>
        <div class="montage-actions">
          <button class="montage-btn primary" id="montageExportButton" type="button" ${(!hasVideo || !hasAudio || state.isExporting) ? "disabled" : ""}>
            <i data-lucide="download"></i>${escapeHtml(t(state.isExporting ? "Enregistrement…" : "Enregistrer"))}
          </button>
        </div>
      </section>
    `;

    bindEditor();
    if (window.lucide) lucide.createIcons();
    window.SonaraI18n?.refresh?.();
  }

  async function handleVideoFile(file) {
    if (!file || !file.type.startsWith("video/")) return;

    if (state.videoUrl) {
      detachMediaElement(document.querySelector("#montagePreviewVideo"));
      revokeUrl(state.videoUrl);
    }
    state.videoFile = file;
    state.videoUrl = createObjectUrl(file);
    state.videoDuration = await readMediaDuration(state.videoUrl, "video");
    if (!state.projectName) state.projectName = file.name.replace(/\.[^.]+$/, "") || "Projet Sonara Sync";

    state.audioTracks.forEach((track) => {
      track.offset = Math.min(track.offset, Math.max(0, state.videoDuration));
      normalizeTrackTrim(track);
    });

    state.exportProgress = 0;
    state.exportStatus = "Vidéo chargée. Ajoutez ou positionnez vos sons.";
    render();
    await saveDraftNow();
  }

  async function handleAudioFiles(files) {
    const accepted = Array.from(files || []).filter((file) => file.type.startsWith("audio/"));

    for (const file of accepted) {
      const url = createObjectUrl(file);
      const duration = await readMediaDuration(url, "audio");
      state.audioTracks.push({
        id: `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        url,
        duration,
        offset: 0,
        volume: 1,
        trimStart: 0,
        trimEnd: Math.max(0.1, duration || 0.1)
      });
    }

    state.exportProgress = 0;
    if (accepted.length === 1) state.exportStatus = "1 son ajouté.";
    else if (accepted.length > 1) state.exportStatus = "Plusieurs sons ajoutés.";
    else state.exportStatus = "Aucun fichier audio compatible sélectionné.";
    render();
    if (accepted.length) void saveDraftNow();
  }

  function clearPreviewAudios() {
    state.previewAudios.forEach((audio) => detachMediaElement(audio));
    state.previewAudios.clear();
  }

  function getPreviewAudio(track) {
    if (state.previewAudios.has(track.id)) return state.previewAudios.get(track.id);
    const audio = new Audio(track.url);
    audio.preload = "auto";
    audio.volume = Math.min(1, track.volume);
    state.previewAudios.set(track.id, audio);
    return audio;
  }

  function syncPreviewAudio(video, forceSeek = false) {
    const now = video.currentTime || 0;

    state.audioTracks.forEach((track) => {
      normalizeTrackTrim(track);
      const audio = getPreviewAudio(track);
      audio.volume = Math.min(1, track.volume);
      const timelineTime = now - track.offset;
      const playableDuration = getTrackPlayableDuration(track);
      const active = timelineTime >= 0 && timelineTime < playableDuration && !video.ended;
      const sourceTime = track.trimStart + Math.max(0, timelineTime);

      if (!active) {
        if (!audio.paused) audio.pause();
        if (timelineTime < 0) {
          try { audio.currentTime = track.trimStart; } catch {}
        }
        return;
      }

      if (forceSeek || Math.abs((audio.currentTime || 0) - sourceTime) > 0.28) {
        try { audio.currentTime = Math.min(track.trimEnd, sourceTime); } catch {}
      }

      if (!video.paused && audio.paused) audio.play().catch(() => {});
    });
  }

  function bindPreviewVideo() {
    const video = document.querySelector("#montagePreviewVideo");
    if (!video) return;

    video.addEventListener("play", () => syncPreviewAudio(video, true));
    video.addEventListener("pause", () => state.previewAudios.forEach((audio) => audio.pause()));
    video.addEventListener("seeking", () => syncPreviewAudio(video, true));
    video.addEventListener("timeupdate", () => syncPreviewAudio(video, false));
    video.addEventListener("ended", () => state.previewAudios.forEach((audio) => audio.pause()));
  }

  function updateTrackUi(track) {
    normalizeTrackTrim(track);
    const card = document.querySelector(`[data-track-id="${CSS.escape(track.id)}"]`);
    if (!card) return;

    const clip = card.querySelector(".montage-clip");
    const meta = card.querySelector(".montage-track-meta");
    const volumeInput = card.querySelector("[data-track-volume]");

    if (clip) clip.setAttribute("style", getTrackLaneStyle(track));
    if (meta) meta.textContent = getTrackMeta(track);
    if (volumeInput) {
      volumeInput.value = String(track.volume);
      volumeInput.closest("label")?.querySelector("output")?.replaceChildren(`${Math.round(track.volume * 100)}%`);
    }

    const audio = state.previewAudios.get(track.id);
    if (audio) audio.volume = Math.min(1, track.volume);
  }

  function resyncPreview() {
    const video = document.querySelector("#montagePreviewVideo");
    if (video) syncPreviewAudio(video, true);
  }

  function bindTimelineInteractions() {
    document.querySelectorAll(".montage-track-card[data-track-id]").forEach((card) => {
      const track = state.audioTracks.find((item) => item.id === card.dataset.trackId);
      const lane = card.querySelector(".montage-lane");
      const clip = card.querySelector(".montage-clip");
      const startHandle = card.querySelector('[data-track-trim-handle="start"]');
      const endHandle = card.querySelector('[data-track-trim-handle="end"]');
      if (!track || !lane || !clip) return;

      const beginPointerEdit = (event, mode) => {
        if (!state.videoDuration || state.videoDuration <= 0) return;
        event.preventDefault();
        event.stopPropagation();

        const origin = event.currentTarget;
        const laneRect = lane.getBoundingClientRect();
        if (!laneRect.width) return;

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const initialOffset = track.offset;
        const initialTrimStart = track.trimStart;
        const initialTrimEnd = track.trimEnd;
        const initialPlayable = getTrackPlayableDuration(track);
        clip.classList.add("is-dragging");
        origin.setPointerCapture?.(pointerId);

        const onMove = (moveEvent) => {
          if (moveEvent.pointerId !== pointerId) return;
          moveEvent.preventDefault();
          const deltaTime = ((moveEvent.clientX - startX) / laneRect.width) * state.videoDuration;

          if (mode === "move") {
            const maxOffset = Math.max(0, state.videoDuration - Math.min(initialPlayable, state.videoDuration));
            track.offset = clamp(initialOffset + deltaTime, 0, maxOffset);
          } else if (mode === "trim-start") {
            const minDelta = Math.max(-initialTrimStart, -initialOffset);
            const maxDelta = Math.max(0, initialTrimEnd - initialTrimStart - MIN_CLIP_DURATION);
            const effectiveDelta = clamp(deltaTime, minDelta, maxDelta);
            track.trimStart = initialTrimStart + effectiveDelta;
            track.offset = initialOffset + effectiveDelta;
          } else if (mode === "trim-end") {
            const maxByVideo = initialTrimStart + Math.max(MIN_CLIP_DURATION, state.videoDuration - initialOffset);
            const maximum = Math.min(track.duration, maxByVideo);
            track.trimEnd = clamp(initialTrimEnd + deltaTime, initialTrimStart + MIN_CLIP_DURATION, maximum);
          }

          normalizeTrackTrim(track);
          updateTrackUi(track);
          resyncPreview();
        };

        const finish = (upEvent) => {
          if (upEvent.pointerId !== pointerId) return;
          clip.classList.remove("is-dragging");
          origin.releasePointerCapture?.(pointerId);
          origin.removeEventListener("pointermove", onMove);
          origin.removeEventListener("pointerup", finish);
          origin.removeEventListener("pointercancel", finish);
          void saveDraftNow();
        };

        origin.addEventListener("pointermove", onMove);
        origin.addEventListener("pointerup", finish);
        origin.addEventListener("pointercancel", finish);
      };

      clip.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".montage-trim-handle")) return;
        beginPointerEdit(event, "move");
      });
      startHandle?.addEventListener("pointerdown", (event) => beginPointerEdit(event, "trim-start"));
      endHandle?.addEventListener("pointerdown", (event) => beginPointerEdit(event, "trim-end"));

      lane.addEventListener("pointerdown", (event) => {
        if (event.target !== lane || !state.videoDuration) return;
        const rect = lane.getBoundingClientRect();
        const clickedTime = ((event.clientX - rect.left) / Math.max(1, rect.width)) * state.videoDuration;
        const maxOffset = Math.max(0, state.videoDuration - Math.min(getTrackPlayableDuration(track), state.videoDuration));
        track.offset = clamp(clickedTime, 0, maxOffset);
        updateTrackUi(track);
        resyncPreview();
        void saveDraftNow();
      });
    });
  }

  function bindTrackControls() {
    document.querySelectorAll("[data-track-volume]").forEach((input) => {
      input.addEventListener("input", () => {
        const track = state.audioTracks.find((item) => item.id === input.dataset.trackVolume);
        if (!track) return;
        track.volume = Number(input.value) || 0;
        updateTrackUi(track);
      });
      input.addEventListener("change", () => void saveDraftNow());
    });

    document.querySelectorAll("[data-remove-track]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.removeTrack;
        const track = state.audioTracks.find((item) => item.id === id);
        if (track) revokeUrl(track.url);
        const previewAudio = state.previewAudios.get(id);
        if (previewAudio) previewAudio.pause();
        state.previewAudios.delete(id);
        state.audioTracks = state.audioTracks.filter((item) => item.id !== id);
        state.exportStatus = "Piste retirée du projet.";
        render();
        void saveDraftNow();
      });
    });

    bindTimelineInteractions();
  }

  function bindEditor() {
    document.querySelector("#montageVideoInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) void handleVideoFile(file);
    });

    document.querySelector("#montageAudioInput")?.addEventListener("change", (event) => {
      if (event.target.files?.length) void handleAudioFiles(event.target.files);
    });

    document.querySelector("#montageExportButton")?.addEventListener("click", () => void exportMontage());
    document.querySelector("#montageSavedProjectsButton")?.addEventListener("click", () => window.location.assign("/app/pages/catalog/sync-saves.html"));

    bindTrackControls();
    bindPreviewVideo();
  }

  function fileNameWithoutExtension(name = "") {
    return String(name).replace(/\.[^.]+$/, "").trim();
  }

  function projectPayload() {
    return {
      id: state.projectId || undefined,
      name: state.projectName || fileNameWithoutExtension(state.videoFile?.name) || "Projet Sonara Sync",
      createdAt: state.projectCreatedAt || undefined,
      videoFile: state.videoFile,
      videoName: state.videoFile?.name || "",
      videoType: state.videoFile?.type || "",
      videoLastModified: state.videoFile?.lastModified || Date.now(),
      videoDuration: state.videoDuration,
      audioTracks: state.audioTracks.map((track) => ({
        id: track.id,
        file: track.file,
        name: track.file?.name || "",
        type: track.file?.type || "",
        lastModified: track.file?.lastModified || Date.now(),
        duration: track.duration,
        offset: track.offset,
        volume: track.volume,
        trimStart: track.trimStart,
        trimEnd: track.trimEnd
      }))
    };
  }

  async function persistDraft() {
    if (!state.videoFile || !window.SonaraSyncProjects?.save) return null;

    try {
      const saved = await window.SonaraSyncProjects.save({ ...projectPayload(), draft: true });
      state.projectId = saved.id;
      state.projectName = saved.name;
      state.projectCreatedAt = saved.createdAt;
      rememberActiveDraft(saved.id);

      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      url.searchParams.set("project", saved.id);
      history.replaceState({}, "", url.href);
      return saved;
    } catch (error) {
      console.error("Sauvegarde automatique Sonara Sync impossible :", error);
      state.exportStatus = "Impossible d'enregistrer automatiquement le brouillon.";
      return null;
    }
  }

  function saveDraftNow() {
    autoSaveChain = autoSaveChain.catch(() => null).then(() => persistDraft());
    return autoSaveChain;
  }

  function restoreFile(blob, name, type, lastModified) {
    if (!blob) return null;
    if (blob instanceof File && blob.name) return blob;
    try { return new File([blob], name || "media", { type: type || blob.type || "", lastModified: lastModified || Date.now() }); }
    catch { return blob; }
  }

  async function loadSavedProject(projectId) {
    if (!projectId || !window.SonaraSyncProjects?.get) return false;
    const project = await window.SonaraSyncProjects.get(projectId);
    if (!project) return false;

    clearPreviewAudios();
    releaseObjectUrls();

    state.projectId = project.id;
    rememberActiveDraft(project.id);
    state.projectName = project.name || "Projet Sonara Sync";
    state.projectCreatedAt = project.createdAt || "";
    state.videoFile = restoreFile(project.videoFile, project.videoName, project.videoType, project.videoLastModified);
    state.videoUrl = state.videoFile ? createObjectUrl(state.videoFile) : "";
    state.videoDuration = Number(project.videoDuration) || (state.videoUrl ? await readMediaDuration(state.videoUrl, "video") : 0);
    state.audioTracks = [];

    for (const savedTrack of Array.isArray(project.audioTracks) ? project.audioTracks : []) {
      const file = restoreFile(savedTrack.file, savedTrack.name, savedTrack.type, savedTrack.lastModified);
      if (!file) continue;
      const url = createObjectUrl(file);
      const duration = Number(savedTrack.duration) || await readMediaDuration(url, "audio");
      const track = {
        id: savedTrack.id || `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        url,
        duration,
        offset: Number(savedTrack.offset) || 0,
        volume: Number.isFinite(Number(savedTrack.volume)) ? Number(savedTrack.volume) : 1,
        trimStart: Number(savedTrack.trimStart) || 0,
        trimEnd: Number(savedTrack.trimEnd) || duration
      };
      normalizeTrackTrim(track);
      state.audioTracks.push(track);
    }

    state.exportProgress = 0;
    state.exportStatus = "Projet sauvegardé chargé.";
    return true;
  }

  function getSyncApiUrl() {
    if (typeof API_URL !== "undefined" && API_URL) return API_URL;
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  function startNativeDownload(downloadUrl) {
    const link = document.createElement("a");
    link.href = `${getSyncApiUrl()}${downloadUrl}`;
    link.download = "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function uploadToSonaraEngine(formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${getSyncApiUrl()}/api/sync/render`, true);

      const token = window.SonaraSession?.getToken?.();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const ratio = clamp(event.loaded / event.total, 0, 1);
        state.exportProgress = ratio * 35;
        const bar = document.querySelector(".montage-progress span");
        const status = document.querySelector(".montage-status");
        if (bar) bar.style.setProperty("--progress", `${state.exportProgress.toFixed(1)}%`);
        if (status) status.textContent = tp("Envoi au moteur Sonara {0}%…", [Math.round(ratio * 100)]);
      };

      xhr.upload.onload = () => {
        state.exportProgress = 35;
        const bar = document.querySelector(".montage-progress span");
        const status = document.querySelector(".montage-status");
        if (bar) bar.style.setProperty("--progress", "35%");
        if (status) status.textContent = t("Sonara intègre le son sans réencoder l'image…");
      };

      xhr.onerror = () => reject(new Error(t("Connexion au moteur Sonara Sync impossible.")));
      xhr.ontimeout = () => reject(new Error(t("Le moteur Sonara Sync a mis trop de temps à répondre.")));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status < 200 || xhr.status >= 300 || !data?.success || !data?.downloadUrl) {
          reject(new Error(data?.message || t("Le moteur Sonara Sync n'a pas pu générer la vidéo.")));
          return;
        }
        resolve(data);
      };

      xhr.send(formData);
    });
  }

  async function exportMontage() {
    if (state.isExporting || !state.videoFile || !state.audioTracks.length) return;

    state.isExporting = true;
    state.exportProgress = 0;
    state.exportStatus = t("Préparation de l'envoi au moteur Sonara…");
    render();

    try {
      const formData = new FormData();
      formData.append("video", state.videoFile, state.videoFile.name || "video.mp4");

      const audioTracks = state.audioTracks.map((track, index) => {
        normalizeTrackTrim(track);
        formData.append(`audio_${index}`, track.file, track.file.name || `audio-${index}`);
        return {
          offset: Number(track.offset) || 0,
          trimStart: Number(track.trimStart) || 0,
          trimEnd: Number(track.trimEnd) || Number(track.duration) || 0,
          volume: Number(track.volume) || 0
        };
      });

      formData.append("project", JSON.stringify({
        videoDuration: Number(state.videoDuration) || 0,
        audioTracks
      }));

      const result = await uploadToSonaraEngine(formData);
      state.exportProgress = 100;
      state.exportStatus = t("Vidéo prête. Téléchargement du MP4 original avec le son intégré…");
      render();
      startNativeDownload(result.downloadUrl);
    } catch (error) {
      console.error("Export Sonara Sync impossible :", error);
      state.exportStatus = error?.message || t("Impossible d'enregistrer ce projet.");
    } finally {
      state.isExporting = false;
      render();
    }
  }

  async function initialize() {
    const profile = getProfile();
    initializeNavigation(profile);

    try {
      const access = await window.SonaraMontageAccess?.ready;
      if (!access?.allowed) { window.location.replace("/home.html"); return; }
    } catch (error) {
      console.error("Accès Sonara Sync impossible :", error);
      window.location.replace("/home.html");
      return;
    }

    try { await window.SonaraI18n?.ready; } catch {}

    const params = new URLSearchParams(window.location.search);
    if (params.has("new")) {
      forgetActiveDraft();
    } else {
      const projectId = params.get("project") || getRememberedDraft();
      if (projectId) {
        try {
          const loaded = await loadSavedProject(projectId);
          if (!loaded) {
            forgetActiveDraft();
            state.exportStatus = "Brouillon introuvable.";
          }
        } catch (error) {
          console.error("Chargement du brouillon Sonara Sync impossible :", error);
          forgetActiveDraft();
          state.exportStatus = "Impossible de charger ce brouillon.";
        }
      }
    }

    await window.SonaraLoadingExperience?.waitMinimum?.(montageLoadingStartedAt, MONTAGE_MIN_LOADING_MS);
    render();
  }

  // Ne révoque pas les blob: URLs pendant le déchargement de la page.
  // Chrome peut encore terminer une lecture média pendant la navigation et
  // journaliser ERR_FILE_NOT_FOUND si l'URL est révoquée trop tôt. Le navigateur
  // libère automatiquement ces URLs lorsque le document est détruit.
  window.addEventListener("pagehide", () => {
    state.previewAudios.forEach((audio) => {
      try { audio.pause(); } catch {}
    });
    const video = document.querySelector("#montagePreviewVideo");
    try { video?.pause?.(); } catch {}
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
