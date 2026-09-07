const { fetchJson, renderArtistPage, htmlResponse, escapeHtml } = require("./_organic-seo");

function artistSlugFromEvent(event = {}) {
  const query = event.queryStringParameters || {};
  let slug = String(query.slug || query.path || "").trim().replace(/^\/+|\/+$/g, "");
  if (slug.includes("/")) slug = slug.split("/").filter(Boolean).at(-1) || "";

  if (!slug) {
    const candidates = [event.rawUrl, event.path, event.rawPath].filter(Boolean);
    for (const candidate of candidates) {
      let pathname = String(candidate || "");
      try { pathname = new URL(pathname, "https://sonarapack.com").pathname; } catch (_) {}
      const match = pathname.match(/\/catalog\/artists\/([^/?#]+)/i);
      if (!match) continue;
      slug = decodeURIComponent(match[1]);
      break;
    }
  }
  return slug;
}

exports.handler = async (event) => {
  const slug = artistSlugFromEvent(event);
  if (!slug) return htmlResponse(400, "Page artiste invalide.");

  try {
    const { data, apiBase } = await fetchJson(event, `/api/public/catalog/artist/${encodeURIComponent(slug)}`);
    if (!data?.artist || !Array.isArray(data?.packs)) return htmlResponse(404, "Artiste public introuvable.");
    return htmlResponse(200, renderArtistPage(event, apiBase, data.artist, data.packs));
  } catch (error) {
    const status = Number(error?.statusCode) === 404 ? 404 : 502;
    return htmlResponse(status, `<!doctype html><meta charset="utf-8"><title>Sonara Pack</title><p>${escapeHtml(status === 404 ? "Artiste public introuvable." : "Page artiste temporairement indisponible.")}</p>`);
  }
};

exports.artistSlugFromEvent = artistSlugFromEvent;
