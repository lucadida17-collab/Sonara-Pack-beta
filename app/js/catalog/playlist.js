"use strict";

// Compatibilité ancienne URL uniquement. Le rendu playlist utilise désormais pack.html + pack.js.
const playlistId = new URLSearchParams(window.location.search).get("id") || "";
window.location.replace(`/app/pages/catalog/pack.html?playlistId=${encodeURIComponent(playlistId)}`);
