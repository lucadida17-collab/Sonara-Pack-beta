const { fetchJson, renderFacetPage, htmlResponse, escapeHtml } = require('./_organic-seo');

exports.handler = async (event) => {
  try {
    const { data, apiBase } = await fetchJson(event, '/api/public/catalog/index');
    if (!data?.catalog || !Array.isArray(data?.packs)) return htmlResponse(404, 'Catalogue public introuvable.');
    return htmlResponse(200, renderFacetPage(event, apiBase, data.catalog, data.packs));
  } catch (error) {
    return htmlResponse(502, `<!doctype html><meta charset="utf-8"><title>Sonara Pack</title><p>${escapeHtml('Catalogue public temporairement indisponible.')}</p>`);
  }
};
