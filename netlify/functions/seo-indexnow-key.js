const { environmentFromEvent } = require('./_organic-seo');

exports.handler = async (event) => {
  if (environmentFromEvent(event) !== 'main') {
    return { statusCode: 404, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  const key = String(process.env.INDEXNOW_KEY || '').trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    return { statusCode: 404, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-Robots-Tag': 'noindex, nofollow'
    },
    body: key
  };
};
