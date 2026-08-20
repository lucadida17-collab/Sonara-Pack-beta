"use strict";

const SENSITIVE_TOP_LEVEL = Object.freeze([
  "/.env",
  "/.git",
  "/data",
  "/backend",
  "/server.js",
  "/server-test.js",
  "/server-local.js",
  "/package.json",
  "/package-lock.json",
  "/node_modules"
]);

const SECRET_ACCOUNT_KEYS = new Set([
  "password",
  "passwordhash",
  "passwordsalt",
  "verificationtoken",
  "resettoken",
  "passwordresettoken",
  "emailverificationtoken",
  "foundersync",
  "secret",
  "secretkey",
  "apikey",
  "accesstoken",
  "refreshtoken"
]);

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function normalizedPathname(input = "") {
  let value = String(input || "").split("?", 1)[0] || "/";
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return value.startsWith("/") ? value : `/${value}`;
}

function isSensitivePath(input = "") {
  const pathname = normalizedPathname(input).toLowerCase();

  if (pathname.includes("/../") || pathname.endsWith("/..") || pathname.includes("/.%2e")) {
    return true;
  }

  return SENSITIVE_TOP_LEVEL.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`) ||
    (prefix === "/.env" && pathname.startsWith("/.env."))
  );
}

function findUnsafeObjectKey(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeObjectKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    if (UNSAFE_OBJECT_KEYS.has(String(key).toLowerCase())) return key;
    const found = findUnsafeObjectKey(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function sanitizeAccountSecrets(account, userId) {
  if (!account || typeof account !== "object") return null;
  const safe = { ...account };
  if (userId !== undefined && userId !== null) safe.userId = userId;

  for (const key of Object.keys(safe)) {
    if (SECRET_ACCOUNT_KEYS.has(String(key).toLowerCase())) {
      delete safe[key];
    }
  }

  delete safe._id;
  return safe;
}

function installDataProtection(app, { environment = "unknown" } = {}) {
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");

    if (String(req.path || "").startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Pragma", "no-cache");
    }

    const method = String(req.method || "GET").toUpperCase();
    if (["TRACE", "TRACK", "CONNECT"].includes(method)) {
      return res.status(405).json({
        success: false,
        code: "METHOD_NOT_ALLOWED"
      });
    }

    if (isSensitivePath(req.originalUrl || req.url || req.path)) {
      console.warn(`[SECURITY:${environment}] Accès fichier sensible bloqué : ${req.method} ${req.originalUrl}`);
      return res.status(404).json({
        success: false,
        code: "RESOURCE_NOT_FOUND"
      });
    }

    return next();
  });
}

function rejectUnsafeJsonKeys(req, res, next) {
  const unsafeKey = findUnsafeObjectKey(req.body);
  if (!unsafeKey) return next();
  return res.status(400).json({
    success: false,
    code: "UNSAFE_PAYLOAD",
    message: "Requête refusée."
  });
}

module.exports = {
  installDataProtection,
  rejectUnsafeJsonKeys,
  sanitizeAccountSecrets,
  isSensitivePath,
  normalizedPathname,
  findUnsafeObjectKey
};
