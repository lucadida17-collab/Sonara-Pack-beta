const { environmentFromEvent, pageOrigin } = require("./_organic-seo");

const MAIN_PRIVATE_PATHS = Object.freeze([
  "/app/pages/creator/",
  "/app/pages/account/",
  "/app/pages/auth/",
  "/app/pages/user/",
  "/app/pages/system/",
  "/app/pages/components/",
  "/app/pages/catalog/download.html",
  "/app/pages/catalog/library.html",
  "/app/pages/catalog/montage.html",
  "/app/pages/catalog/sync-saves.html",
  "/app/pages/catalog/pack.html",
  "/app/pages/catalog/artist.html",
  "/app/pages/catalog/share.html",
  "/app/pages/catalog/playlist.html",
  "/.netlify/",
  "/backend/",
  "/data/",
  "/node_modules/"
]);

exports.handler = async (event) => {
  const main = environmentFromEvent(event) === "main";
  const body = main
    ? [
        "User-agent: *",
        "Allow: /",
        ...MAIN_PRIVATE_PATHS.map((pathname) => `Disallow: ${pathname}`),
        `Sitemap: ${pageOrigin(event)}/sitemap.xml`,
        ""
      ].join("\n")
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
