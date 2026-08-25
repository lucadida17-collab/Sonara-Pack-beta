exports.handler = async (event) => {
  const host = String(event.headers?.host || '').toLowerCase().split(':')[0];
  const isMain = host === 'sonarapack.com' || host === 'www.sonarapack.com';
  const body = isMain
    ? 'User-agent: *\nAllow: /\nSitemap: https://sonarapack.com/sitemap.xml\n'
    : 'User-agent: *\nDisallow: /\n';
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    },
    body
  };
};
