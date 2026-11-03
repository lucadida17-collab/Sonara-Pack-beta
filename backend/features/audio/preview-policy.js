"use strict";

const PREVIEW_SECONDS = 30;
const FADE_SECONDS = 5;

function isManualPreview(track) {
  return String(track?.previewMode || "").toLowerCase() === "manual";
}

function validatePreviewStart(rawStart, audioDuration) {
  const start = Number(rawStart);
  const duration = Number(audioDuration);
  if (!Number.isFinite(start) || start < 0 || start > 86400) {
    throw new RangeError("Le début de l'extrait doit être un temps valide et positif.");
  }
  // Server-side analysis supplies the real length; never trust only the client duration.
  if (Number.isFinite(duration) && duration > 0 && start > Math.max(0, duration - Math.min(PREVIEW_SECONDS, duration)) + 0.5) {
    throw new RangeError("Le passage choisi dépasse la durée du morceau.");
  }
  return Math.round(start * 10) / 10;
}

function applyCreatorPreview(track, analyzed, duration) {
  const automatic = { ...analyzed };
  const audioDuration = Number(analyzed?.audioDuration) || Number(duration) || 0;
  const mode = isManualPreview(track) ? "manual" : "auto";
  const start = mode === "manual"
    ? validatePreviewStart(track.previewStart, audioDuration)
    : Math.max(0, Number(automatic.previewStart) || 0);
  return {
    ...automatic,
    previewStart: start,
    previewDuration: audioDuration > 0 ? Math.min(PREVIEW_SECONDS, audioDuration) : PREVIEW_SECONDS,
    previewMode: mode,
    previewChosenBy: mode === "manual" ? "artist" : "system",
    previewFadeIn: FADE_SECONDS,
    previewFadeOut: FADE_SECONDS
  };
}

function applyModeratorPreviews(pack, previews) {
  if (!Array.isArray(previews) || previews.length === 0) return { ok: true, updated: 0 };
  const tracks = Array.isArray(pack?.tracks) ? pack.tracks : [];
  const seen = new Set();
  const changes = [];
  for (const change of previews) {
    const id = String(change?.trackId || "");
    const track = tracks.find(item => String(item?.id || "") === id);
    if (!id || !track || seen.has(id)) return { ok: false, message: "Son de modération invalide." };
    seen.add(id);
    if (isManualPreview(track)) return { ok: false, message: "Le choix de l'artiste est prioritaire sur la modération." };
    try {
      const start = validatePreviewStart(change.previewStart, track.audioDuration || track.duration);
      changes.push({ track, start });
    } catch (err) { return { ok: false, message: err.message }; }
  }
  for (const change of changes) {
    change.track.previewStart = change.start;
    change.track.previewDuration = Math.min(PREVIEW_SECONDS, Math.max(1, Number(change.track.audioDuration || change.track.duration) || PREVIEW_SECONDS));
    change.track.previewChosenBy = "moderator";
    change.track.previewMode = "auto";
    change.track.previewFadeIn = FADE_SECONDS;
    change.track.previewFadeOut = FADE_SECONDS;
  }
  return { ok: true, updated: changes.length };
}

module.exports = { PREVIEW_SECONDS, FADE_SECONDS, isManualPreview, validatePreviewStart, applyCreatorPreview, applyModeratorPreviews };
