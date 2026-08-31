const { fetchJson, renderPackPage, htmlResponse, escapeHtml } = require("./_organic-seo");

exports.handler = async (event) => {
  const id = String(event.queryStringParameters?.id || "").trim();
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
