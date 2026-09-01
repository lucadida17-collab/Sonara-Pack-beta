const { environmentFromEvent, fetchJson } = require("./_organic-seo");

function xml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validLastmod(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

exports.handler = async (event) => {
  if (environmentFromEvent(event) !== "main") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      body: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    };
  }

  try {
    const { data } = await fetchJson(event, "/api/public/catalog/sitemap");
    const entries = [
      ...(Array.isArray(data?.packs) ? data.packs : []),
      ...(Array.isArray(data?.tracks) ? data.tracks : [])
    ];

    const urls = entries
      .filter((item) => item?.url)
      .map((item) => {
        const lastmod = validLastmod(item.updatedAt);
        return `  <url>\n    <loc>${xml(item.url)}</loc>${lastmod ? `\n    <lastmod>${xml(lastmod)}</lastmod>` : ""}\n  </url>`;
      })
      .join("\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=900"
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      body: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    };
  }
};
