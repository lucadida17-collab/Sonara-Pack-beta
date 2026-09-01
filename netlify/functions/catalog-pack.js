const { fetchJson, renderPackPage, htmlResponse, escapeHtml } = require("./_organic-seo");

function packIdFromEvent(event = {}) {
  const query = event.queryStringParameters || {};
  let id = String(query.id || query.path || "").trim().replace(/^\/+|\/+$/g, "");
  if (id.includes("/")) id = id.split("/").filter(Boolean)[0] || "";

  if (!id) {
    const candidates = [event.rawUrl, event.path, event.rawPath].filter(Boolean);
    for (const candidate of candidates) {
      let pathname = String(candidate || "");
      try {
        pathname = new URL(pathname, "https://sonarapack.com").pathname;
      } catch (_) {}
      const match = pathname.match(/\/catalog\/packs\/([^/?#]+)/i);
      if (!match) continue;
      id = decodeURIComponent(match[1]);
      break;
    }
  }

  return id;
}

exports.handler = async (event) => {
  const id = packIdFromEvent(event);
  if (!id) return htmlResponse(400, "Pack public invalide.");

  try {
    const { data, apiBase } = await fetchJson(event, `/api/public/catalog/pack/${encodeURIComponent(id)}`);
    if (!data?.pack) return htmlResponse(404, "Pack public introuvable.");
    return htmlResponse(200, renderPackPage(event, apiBase, data.pack));
  } catch (error) {
    const status = Number(error?.statusCode) === 404 ? 404 : 502;
    return htmlResponse(status, `<!doctype html><meta charset="utf-8"><title>Sonara Pack</title><p>${escapeHtml(status === 404 ? "Pack public introuvable." : "Pack public temporairement indisponible.")}</p>`);
  }
};

exports.packIdFromEvent = packIdFromEvent;
