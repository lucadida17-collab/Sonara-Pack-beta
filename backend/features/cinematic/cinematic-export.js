const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

let WebSocketClient = globalThis.WebSocket;
if (!WebSocketClient) {
  try { WebSocketClient = require("undici").WebSocket; } catch {}
}

const EXPORT = Object.freeze({
  width: 1080,
  height: 1920,
  cssWidth: 360,
  cssHeight: 640,
  deviceScaleFactor: 3,
  fps: 60,
  durationSeconds: 60,
  jobTtlMs: 30 * 60 * 1000,
  maxRuntimeMs: 12 * 60 * 1000
});

const DEFAULT_OWNERS = Object.freeze({
  local: Object.freeze([
    Object.freeze({ userId: "1785754209210", accountId: "acc_1785754209210_chiv2t" })
  ]),
  test: Object.freeze([]),
  main: Object.freeze([
    Object.freeze({ userId: "1786847505723", accountId: "acc_1786847505723_w0ou7f" })
  ])
});

const text = (value) => String(value || "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findCommand(command) {
  try {
    const resolver = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(resolver, [command], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) return "";
    return String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  } catch {
    return "";
  }
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return "";
}

function findChromiumExecutable(projectRoot) {
  const configured = firstExisting([
    process.env.SONARA_CHROMIUM_PATH,
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ]);
  if (configured) return configured;

  const cacheRoot = path.join(projectRoot, ".cache", "sonara-chromium");
  const cached = firstExisting([
    path.join(cacheRoot, "chrome-linux64", "chrome"),
    path.join(cacheRoot, "chrome-win64", "chrome.exe"),
    path.join(cacheRoot, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
    path.join(cacheRoot, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")
  ]);
  if (cached) return cached;

  if (process.platform === "win32") {
    const pf = process.env.PROGRAMFILES || "C:\\Program Files";
    const pfx86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    return firstExisting([
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
      local && path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe")
    ]);
  }

  if (process.platform === "darwin") {
    return firstExisting([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ]);
  }

  return firstExisting([
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome"
  ]) || findCommand("chromium") || findCommand("google-chrome");
}

function findFfmpegExecutable() {
  try {
    const staticPath = require("ffmpeg-static");
    if (staticPath && fs.existsSync(staticPath)) return staticPath;
  } catch {}
  return findCommand("ffmpeg") || "ffmpeg";
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Set();
  }

  async open(timeoutMs = 12000) {
    await new Promise((resolve, reject) => {
      if (!WebSocketClient) return reject(new Error("WebSocket Node indisponible pour le rendu."));
      const socket = new WebSocketClient(this.url);
      this.socket = socket;
      const timer = setTimeout(() => reject(new Error("Connexion Chromium expirée.")), timeoutMs);

      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });

      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Connexion Chromium impossible."));
      }, { once: true });

      socket.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(String(event.data || "{}")); } catch { return; }

        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || "Erreur Chromium."));
          else pending.resolve(message.result || {});
          return;
        }

        for (const handler of this.handlers) {
          try { handler(message); } catch {}
        }
      });

      socket.addEventListener("close", () => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error("Chromium a fermé la connexion d'export."));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}, sessionId = "", timeoutMs = 15000) {
    if (!this.socket || this.socket.readyState !== WebSocketClient.OPEN) {
      return Promise.reject(new Error("Chromium n'est pas connecté."));
    }

    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chromium timeout : ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); }
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

function waitForDevTools(browser, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let finished = false;

    const done = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    browser.stderr?.on("data", (chunk) => {
      buffer += String(chunk || "");
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) done(null, match[1]);
      if (buffer.length > 20000) buffer = buffer.slice(-20000);
    });
    browser.once("error", (error) => done(error));
    browser.once("exit", (code) => done(new Error(`Chromium s'est fermé avant le rendu (${code}).`)));

    const timer = setTimeout(() => done(new Error("Chromium n'a pas démarré à temps.")), timeoutMs);
  });
}

async function waitForExportPage(cdp, sessionId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let diagnostic = "";

  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({ready: document.body?.dataset?.sonaraCinematicExportReady || "", error: document.body?.dataset?.sonaraCinematicExportError || "", hasRuntime: Boolean(window.SonaraPreV1Cinematic)})`,
      returnByValue: true
    }, sessionId).catch(() => null);

    if (result?.result?.value) {
      try {
        const state = JSON.parse(result.result.value);
        diagnostic = state.error || diagnostic;
        if (state.ready === "true" && state.hasRuntime) return;
      } catch {}
    }
    await sleep(140);
  }

  throw new Error(diagnostic || "La page cinématique n'est pas prête pour l'export.");
}

function ffmpegVideoProcess(outputPath, audioPath) {
  const ffmpeg = findFfmpegExecutable();
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(EXPORT.fps), "-vcodec", "mjpeg", "-i", "pipe:0"
  ];

  const hasAudio = Boolean(audioPath && fs.existsSync(audioPath));
  if (hasAudio) args.push("-i", audioPath);

  args.push(
    "-t", String(EXPORT.durationSeconds),
    "-vf", `scale=${EXPORT.width}:${EXPORT.height}:flags=lanczos,setsar=1`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-r", String(EXPORT.fps)
  );
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  else args.push("-an");
  args.push("-movflags", "+faststart", outputPath);

  const child = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let errorText = "";
  child.stderr.on("data", (chunk) => {
    errorText += String(chunk || "");
    if (errorText.length > 18000) errorText = errorText.slice(-18000);
  });

  return { child, errorText: () => errorText };
}

function writeImage(stream, buffer) {
  return new Promise((resolve, reject) => {
    if (stream.write(buffer)) return resolve();
    const onError = (error) => { cleanup(); reject(error); };
    const onDrain = () => { cleanup(); resolve(); };
    const cleanup = () => {
      stream.removeListener("error", onError);
      stream.removeListener("drain", onDrain);
    };
    stream.once("error", onError);
    stream.once("drain", onDrain);
  });
}

async function renderCinematicMp4({ projectRoot, sourceOrigin, outputPath, onProgress = () => {} }) {
  const chromium = findChromiumExecutable(projectRoot);
  if (!chromium) throw new Error("Navigateur de rendu Sonara introuvable.");

  const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), "sonara-cinematic-browser-"));
  const browser = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0",
    `--user-data-dir=${browserProfile}`,
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });

  let cdp;
  let ffmpeg;
  let off = () => {};
  const totalFrames = EXPORT.fps * EXPORT.durationSeconds;
  let firstTimestamp = null;
  let lastImage = null;
  let written = 0;
  let queue = Promise.resolve();

  try {
    onProgress(2, "Démarrage du moteur vidéo");
    const wsUrl = await waitForDevTools(browser);
    cdp = new CdpConnection(wsUrl);
    await cdp.open();

    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: EXPORT.cssWidth,
      height: EXPORT.cssHeight,
      deviceScaleFactor: EXPORT.deviceScaleFactor,
      mobile: true,
      screenWidth: EXPORT.cssWidth,
      screenHeight: EXPORT.cssHeight,
      positionX: 0,
      positionY: 0
    }, sessionId);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
    }, sessionId);

    const url = new URL("/index.html", sourceOrigin);
    url.searchParams.set("cinematic", "export");
    url.searchParams.set("render", "1");
    url.searchParams.set("v", String(Date.now()));

    onProgress(5, "Chargement de Sonara Pack");
    await cdp.send("Page.navigate", { url: url.href }, sessionId);
    await waitForExportPage(cdp, sessionId);

    const audioPath = path.join(projectRoot, "assets", "son", "NEW UNIVERSE.wav");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const encoder = ffmpegVideoProcess(outputPath, audioPath);
    ffmpeg = encoder.child;
    const encoderFinished = new Promise((resolve, reject) => {
      ffmpeg.once("error", reject);
      ffmpeg.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(encoder.errorText() || `FFmpeg erreur ${code}.`));
      });
    });

    let resolveCapture;
    let rejectCapture;
    let captureDone = false;
    const captured = new Promise((resolve, reject) => {
      resolveCapture = resolve;
      rejectCapture = reject;
    });

    async function consumeFrame(image, timestamp) {
      if (captureDone || !image?.length) return;
      const stamp = Number(timestamp || 0);
      if (firstTimestamp === null) firstTimestamp = stamp;
      const elapsed = Math.max(0, stamp - firstTimestamp);
      const targetIndex = Math.min(totalFrames - 1, Math.floor(elapsed * EXPORT.fps));

      if (lastImage) {
        while (written < targetIndex && written < totalFrames) {
          await writeImage(ffmpeg.stdin, lastImage);
          written += 1;
        }
      }

      if (written < totalFrames) {
        await writeImage(ffmpeg.stdin, image);
        lastImage = image;
        written += 1;
      }

      const progress = 10 + Math.floor((written / totalFrames) * 82);
      onProgress(Math.min(92, progress), "Rendu vertical 1080 × 1920");
      if (written >= totalFrames && !captureDone) {
        captureDone = true;
        resolveCapture();
      }
    }

    off = cdp.on((message) => {
      if (message.sessionId !== sessionId || message.method !== "Page.screencastFrame") return;
      const params = message.params || {};
      void cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }, sessionId).catch(() => {});
      const image = Buffer.from(String(params.data || ""), "base64");
      queue = queue.then(() => consumeFrame(image, params.metadata?.timestamp)).catch((error) => {
        if (!captureDone) {
          captureDone = true;
          rejectCapture(error);
        }
      });
    });

    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 94,
      maxWidth: EXPORT.width,
      maxHeight: EXPORT.height,
      everyNthFrame: 1
    }, sessionId);

    const started = await cdp.send("Runtime.evaluate", {
      expression: "Boolean(window.SonaraPreV1Cinematic?.startExportPlayback?.())",
      returnByValue: true
    }, sessionId);
    if (started?.result?.value !== true) throw new Error("La lecture d'export ne démarre pas.");

    onProgress(10, "Cinématique en cours");
    const fallbackTimer = setTimeout(() => {
      if (!captureDone) {
        captureDone = true;
        resolveCapture();
      }
    }, EXPORT.durationSeconds * 1000 + 8000);

    await captured;
    clearTimeout(fallbackTimer);
    await queue;
    await cdp.send("Page.stopScreencast", {}, sessionId).catch(() => {});

    if (!lastImage) throw new Error("Aucune image n'a été produite par Chromium.");
    while (written < totalFrames) {
      await writeImage(ffmpeg.stdin, lastImage);
      written += 1;
    }

    ffmpeg.stdin.end();
    onProgress(95, "Encodage MP4 et bande-son");
    await encoderFinished;

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
      throw new Error("Le MP4 généré est vide.");
    }
    onProgress(100, "Vidéo prête");
    return { ...EXPORT, outputPath };
  } finally {
    off();
    try { ffmpeg?.stdin?.end(); } catch {}
    try { cdp?.close(); } catch {}
    try { browser.kill("SIGKILL"); } catch {}
    try { fs.rmSync(browserProfile, { recursive: true, force: true }); } catch {}
  }
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}

function registerCinematicExport(app, { environment = "local", projectRoot = process.cwd(), owners = DEFAULT_OWNERS } = {}) {
  const env = String(environment).toLowerCase();
  const ownerList = Array.isArray(owners[env]) ? owners[env] : [];
  const jobs = new Map();
  let activeJobId = "";

  const allowed = (userId, accountId) => ownerList.some((owner) =>
    text(owner.userId) === text(userId) && text(owner.accountId) === text(accountId)
  );

  function acceptedOrigin(req, requested) {
    const origin = safeOrigin(requested || req.get("origin") || "");
    if (!origin) return "";
    const url = new URL(origin);

    if (env === "main") {
      return ["sonarapack.com", "www.sonarapack.com"].includes(url.hostname.toLowerCase()) && url.protocol === "https:"
        ? origin : "";
    }
    if (env === "test") {
      return /sonarapack-test|sonara-pack-beta/i.test(url.hostname) && url.protocol === "https:" ? origin : "";
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
      url.hostname.startsWith("192.168.") || url.hostname.startsWith("10.");
    return local ? origin : "";
  }

  function clean() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (["queued", "running"].includes(job.status)) continue;
      if (now - job.updatedAt < EXPORT.jobTtlMs) continue;
      try { fs.rmSync(job.directory, { recursive: true, force: true }); } catch {}
      jobs.delete(id);
    }
  }

  const publicJob = (job) => ({
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.status === "failed" ? job.error : "",
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    video: job.status === "completed" ? {
      width: EXPORT.width,
      height: EXPORT.height,
      fps: EXPORT.fps,
      duration: EXPORT.durationSeconds,
      ratio: "9:16",
      format: "mp4"
    } : null,
    downloadUrl: job.status === "completed"
      ? `/api/cinematic-export/${encodeURIComponent(job.id)}/download?userId=${encodeURIComponent(job.userId)}&accountId=${encodeURIComponent(job.accountId)}`
      : ""
  });

  setInterval(clean, 5 * 60 * 1000).unref?.();

  app.get("/api/cinematic-export/access", (req, res) => {
    const isAllowed = allowed(req.query?.userId, req.query?.accountId);
    res.json({
      success: true,
      allowed: isAllowed,
      environment: env,
      format: isAllowed ? { width: EXPORT.width, height: EXPORT.height, fps: EXPORT.fps, ratio: "9:16" } : null
    });
  });

  app.post("/api/cinematic-export", (req, res) => {
    clean();
    const userId = text(req.body?.userId);
    const accountId = text(req.body?.accountId);
    if (!allowed(userId, accountId)) {
      return res.status(403).json({ success: false, message: "Export cinématique privé." });
    }

    const sourceOrigin = acceptedOrigin(req, req.body?.sourceOrigin);
    if (!sourceOrigin) {
      return res.status(400).json({ success: false, message: "Origine Sonara invalide." });
    }

    const active = activeJobId ? jobs.get(activeJobId) : null;
    if (active && ["queued", "running"].includes(active.status)) {
      if (active.userId === userId && active.accountId === accountId) {
        return res.status(202).json({ success: true, reused: true, job: publicJob(active) });
      }
      return res.status(429).json({ success: false, message: "Un export est déjà en cours." });
    }

    const id = crypto.randomBytes(24).toString("hex");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sonara-cinematic-export-"));
    const outputPath = path.join(directory, "Sonara-Pack-cinematic-mobile.mp4");
    const now = Date.now();
    const job = {
      id, userId, accountId, sourceOrigin, directory, outputPath,
      status: "queued", progress: 0, message: "Préparation", error: "",
      createdAt: now, updatedAt: now
    };
    jobs.set(id, job);
    activeJobId = id;

    void (async () => {
      job.status = "running";
      job.updatedAt = Date.now();
      const watchdog = setTimeout(() => {
        if (job.status === "running") {
          job.status = "failed";
          job.error = "L'export a dépassé la durée maximale.";
          job.message = "Export interrompu";
          job.updatedAt = Date.now();
        }
      }, EXPORT.maxRuntimeMs);

      try {
        await renderCinematicMp4({
          projectRoot: path.resolve(projectRoot),
          sourceOrigin,
          outputPath,
          onProgress(progress, message) {
            if (job.status !== "running") return;
            job.progress = Math.max(job.progress, Math.min(100, Number(progress) || 0));
            job.message = String(message || "Export en cours");
            job.updatedAt = Date.now();
          }
        });
        if (job.status === "running") {
          job.status = "completed";
          job.progress = 100;
          job.message = "Vidéo prête";
          job.updatedAt = Date.now();
        }
      } catch (error) {
        job.status = "failed";
        job.error = String(error?.message || error || "Export impossible.");
        job.message = "Export impossible";
        job.updatedAt = Date.now();
      } finally {
        clearTimeout(watchdog);
        if (activeJobId === id) activeJobId = "";
      }
    })();

    return res.status(202).json({ success: true, job: publicJob(job) });
  });

  app.get("/api/cinematic-export/:jobId", (req, res) => {
    clean();
    const job = jobs.get(String(req.params.jobId || ""));
    if (!job) return res.status(404).json({ success: false, message: "Export introuvable." });
    if (!allowed(req.query?.userId, req.query?.accountId) ||
      text(req.query?.userId) !== job.userId || text(req.query?.accountId) !== job.accountId) {
      return res.status(403).json({ success: false, message: "Export privé." });
    }
    return res.json({ success: true, job: publicJob(job) });
  });

  app.get("/api/cinematic-export/:jobId/download", (req, res) => {
    clean();
    const job = jobs.get(String(req.params.jobId || ""));
    if (!job || job.status !== "completed" || !fs.existsSync(job.outputPath)) {
      return res.status(404).json({ success: false, message: "Vidéo indisponible." });
    }
    if (!allowed(req.query?.userId, req.query?.accountId) ||
      text(req.query?.userId) !== job.userId || text(req.query?.accountId) !== job.accountId) {
      return res.status(403).json({ success: false, message: "Téléchargement privé." });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.download(job.outputPath, "Sonara-Pack-cinematic-mobile.mp4");
  });

  return Object.freeze({ environment: env, allowed });
}

module.exports = {
  registerCinematicExport,
  renderCinematicMp4,
  findChromiumExecutable,
  DEFAULT_OWNERS,
  EXPORT
};
