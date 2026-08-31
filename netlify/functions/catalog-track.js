const { fetchJson, renderTrackPage, htmlResponse, escapeHtml } = require("./_organic-seo");

exports.handler = async (event) => {
  const packId = String(event.queryStringParameters?.packId || "").trim();
  const trackId = String(event.queryStringParameters?.trackId || "").trim();
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
