const { environmentFromEvent, pageOrigin } = require("./_organic-seo");

exports.handler = async (event) => {
  const main = environmentFromEvent(event) === "main";
  const body = main
    ? `User-agent: *\nAllow: /\nSitemap: ${pageOrigin(event)}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900"
    },
    body
  };
};
