const fs = require("fs");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");
const { findChromiumExecutable } = require("../features/cinematic/cinematic-export");

const projectRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(projectRoot, ".cache", "sonara-chromium");

function platformKey() {
  if (process.platform === "win32") return "win64";
  if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (process.platform === "linux") return "linux64";
  return "";
}

async function install() {
  const current = findChromiumExecutable(projectRoot);
  if (current) {
    console.log(`[Sonara cinematic] Navigateur déjà disponible : ${current}`);
    return;
  }

  const platform = platformKey();
  if (!platform) {
    console.warn(`[Sonara cinematic] Installation automatique non prise en charge : ${process.platform}/${process.arch}`);
    return;
  }

  const versionsResponse = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json",
    { redirect: "follow" }
  );
  if (!versionsResponse.ok) throw new Error(`Catalogue Chrome indisponible (${versionsResponse.status}).`);

  const versions = await versionsResponse.json();
  const download = versions?.channels?.Stable?.downloads?.chrome?.find((item) => item.platform === platform);
  if (!download?.url) throw new Error(`Chrome ${platform} introuvable.`);

  const response = await fetch(download.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Téléchargement Chrome impossible (${response.status}).`);

  fs.mkdirSync(cacheRoot, { recursive: true });
  const temporaryZip = path.join(os.tmpdir(), `sonara-chromium-${process.pid}-${Date.now()}.zip`);
  try {
    fs.writeFileSync(temporaryZip, Buffer.from(await response.arrayBuffer()));
    new AdmZip(temporaryZip).extractAllTo(cacheRoot, true);
  } finally {
    try { fs.rmSync(temporaryZip, { force: true }); } catch {}
  }

  const installed = findChromiumExecutable(projectRoot);
  if (!installed) throw new Error("Chromium téléchargé mais exécutable introuvable.");
  if (process.platform !== "win32") {
    try { fs.chmodSync(installed, 0o755); } catch {}
  }
  console.log(`[Sonara cinematic] Navigateur installé : ${installed}`);
}

install().catch((error) => {
  // Cet outil est privé : son absence ne bloque jamais le déploiement public de Sonara.
  console.warn(`[Sonara cinematic] Installation différée : ${error.message}`);
  process.exitCode = 0;
});
