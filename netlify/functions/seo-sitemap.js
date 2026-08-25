const MAIN_ORIGIN = 'https://sonarapack.com';
const MAIN_API = 'https://sonara-pack-beta.onrender.com';
const CATALOGUE_TIMEOUT_MS = 2500;

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function packArtistId(pack = {}) {
  return String(
    pack.artistProfile?.accountId ||
    pack.accountId ||
    pack.artistAccountId ||
    pack.artistId ||
    ''
  ).trim();
}

function sitemapXml(urls) {
  const nodes = urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${nodes}${nodes ? '\n' : ''}</urlset>\n`;
}

exports.handler = async (event) => {
  const host = String(event.headers?.host || '').toLowerCase().split(':')[0];
  const isMain = host === 'sonarapack.com' || host === 'www.sonarapack.com';

  if (!isMain) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      },
      body: 'Not Found'
    };
  }

  const urls = new Set();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CATALOGUE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${MAIN_API}/api/packs`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new Error(`Catalogue HTTP ${response.status}`);
    const packs = await response.json();

    if (Array.isArray(packs)) {
      for (const pack of packs) {
        if (!pack?.id || String(pack?.status || '').toLowerCase() !== 'approved' || pack?.moderationHidden === true) continue;

        urls.add(`${MAIN_ORIGIN}/app/pages/catalog/pack.html?id=${encodeURIComponent(String(pack.id))}`);

        const artistId = packArtistId(pack);
        if (artistId) {
          urls.add(`${MAIN_ORIGIN}/app/pages/catalog/artist.html?id=${encodeURIComponent(artistId)}`);
        }
      }
    }
  } catch (error) {
    console.error('[SEO sitemap] catalogue temporairement indisponible:', error.message);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff'
    },
    body: sitemapXml([...urls])
  };
};
