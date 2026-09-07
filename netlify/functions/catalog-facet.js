const { fetchJson, renderFacetPage, htmlResponse, escapeHtml } = require("./_organic-seo");

const TYPES = Object.freeze({
  categories: "category",
  genres: "genre",
  moods: "mood",
  uses: "usage"
});

function facetFromEvent(event = {}) {
  const query = event.queryStringParameters || {};
  let segment = String(query.type || "").trim().toLowerCase();
  let slug = String(query.slug || query.path || "").trim().replace(/^\/+|\/+$/g, "");

  if (slug.includes("/")) {
    const parts = slug.split("/").filter(Boolean);
    if (!segment) segment = String(parts[0] || "").toLowerCase();
    slug = String(parts.at(-1) || "");
  }

  if (!segment || !slug) {
    const candidates = [event.rawUrl, event.path, event.rawPath].filter(Boolean);
    for (const candidate of candidates) {
      let pathname = String(candidate || "");
      try { pathname = new URL(pathname, "https://sonarapack.com").pathname; } catch (_) {}
      const match = pathname.match(/\/catalog\/(categories|genres|moods|uses)\/([^/?#]+)/i);
      if (!match) continue;
      segment = match[1].toLowerCase();
      slug = decodeURIComponent(match[2]);
      break;
    }
  }

  return { type: TYPES[segment] || "", slug };
}

exports.handler = async (event) => {
  const { type, slug } = facetFromEvent(event);
  if (!type || !slug) return htmlResponse(400, "Page catalogue invalide.");

  try {
    const { data, apiBase } = await fetchJson(event, `/api/public/catalog/facet/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`);
    if (!data?.facet || !Array.isArray(data?.packs)) return htmlResponse(404, "Page catalogue introuvable.");
    return htmlResponse(200, renderFacetPage(event, apiBase, data.facet, data.packs));
  } catch (error) {
    const status = Number(error?.statusCode) === 404 ? 404 : 502;
    return htmlResponse(status, `<!doctype html><meta charset="utf-8"><title>Sonara Pack</title><p>${escapeHtml(status === 404 ? "Page catalogue introuvable." : "Catalogue public temporairement indisponible.")}</p>`);
  }
};

exports.facetFromEvent = facetFromEvent;
