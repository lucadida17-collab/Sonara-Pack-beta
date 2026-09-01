const { fetchJson, renderTrackPage, htmlResponse, escapeHtml } = require("./_organic-seo");

function trackIdsFromEvent(event = {}) {
  const query = event.queryStringParameters || {};
  let packId = String(query.packId || "").trim();
  let trackId = String(query.trackId || "").trim();

  const redirectedPath = String(query.path || "").trim().replace(/^\/+|\/+$/g, "");
  if ((!packId || !trackId) && redirectedPath) {
    const parts = redirectedPath.split("/").filter(Boolean);
    if (!packId) packId = String(parts[0] || "").trim();
    if (!trackId) trackId = String(parts[1] || "").trim();
  }

  if (!packId || !trackId) {
    const candidates = [event.rawUrl, event.path, event.rawPath].filter(Boolean);
    for (const candidate of candidates) {
      let pathname = String(candidate || "");
      try {
        pathname = new URL(pathname, "https://sonarapack.com").pathname;
      } catch (_) {}
      const match = pathname.match(/\/catalog\/tracks\/([^/]+)\/([^/?#]+)/i);
      if (!match) continue;
      if (!packId) packId = decodeURIComponent(match[1]);
      if (!trackId) trackId = decodeURIComponent(match[2]);
      break;
    }
  }

  return { packId, trackId };
}

exports.handler = async (event) => {
  const { packId, trackId } = trackIdsFromEvent(event);
  if (!packId || !trackId) return htmlResponse(400, "Track publique invalide.");

  try {
    const { data, apiBase } = await fetchJson(event, `/api/public/catalog/track/${encodeURIComponent(packId)}/${encodeURIComponent(trackId)}`);
    if (!data?.pack || !data?.track) return htmlResponse(404, "Track publique introuvable.");
    return htmlResponse(200, renderTrackPage(event, apiBase, data.pack, data.track));
  } catch (error) {
    const status = Number(error?.statusCode) === 404 ? 404 : 502;
    return htmlResponse(status, `<!doctype html><meta charset="utf-8"><title>Sonara Pack</title><p>${escapeHtml(status === 404 ? "Track publique introuvable." : "Track publique temporairement indisponible.")}</p>`);
  }
};

exports.trackIdsFromEvent = trackIdsFromEvent;
