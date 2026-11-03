"use strict";
const crypto = require("crypto");
const HASH_PREFIX = "scrypt-v1";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 6;
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), 64).toString("hex");
  return `${HASH_PREFIX}$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 128 || typeof stored !== "string" || !stored) return false;
  if (!stored.startsWith(`${HASH_PREFIX}$`)) {
    const a = Buffer.from(password), b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const parts = stored.split("$");
  if (parts.length !== 3 || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return false;
  const hash = crypto.scryptSync(password, Buffer.from(parts[1], "hex"), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(parts[2], "hex"));
}
function makeSession(account, now = Date.now()) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  account.authSessions = (Array.isArray(account.authSessions) ? account.authSessions : [])
    .filter(x => x && x.expiresAt > now).slice(-(MAX_SESSIONS - 1));
  account.authSessions.push({ tokenHash, expiresAt: now + SESSION_MS, createdAt: new Date(now).toISOString() });
  return token;
}
function findSession(account, digest, now = Date.now()) {
  if (!account || !Array.isArray(account.authSessions)) return false;
  return account.authSessions.some(x => x && x.expiresAt > now && x.tokenHash === digest);
}
function digestToken(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function bearer(req) { const m = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(String(req.get("Authorization") || "")); return m ? m[1] : ""; }
const PUBLIC_AUTH = new Set(["/api/login", "/api/login/send-code", "/api/login/live-check", "/api/accounts/login", "/api/accounts/login/send-code", "/api/register", "/api/account-security/check", "/api/account-security/send-code", "/api/account-security/verify-code", "/api/auth/restore", "/api/auth/logout"]);
function isProtected(req) {
  const p = req.path;
  if (PUBLIC_AUTH.has(p) || p.startsWith("/api/founder/") || p === "/api/packs/pending" && req.method === "GET") return false;
  // Mutating ancillary endpoints were previously outside the central account gate.
  if (req.method === "POST" && /^\/api\/auto-playlists\/[^/]+\/acquire$/.test(p)) return true;
  if (/^\/api\/packs\/[^/]+\/moderation-(?:request|response)$/.test(p)) return true;
  if (p === "/api/growth/organic/link-account") return true;
  if (p.startsWith("/api/account/") || (p === "/api/accounts" || p.startsWith("/api/accounts/")) || p.startsWith("/api/creator/") || p.startsWith("/api/downloads/prepare") || p === "/api/free-download-access" || p.startsWith("/api/stripe/connect-account") || p.startsWith("/api/stripe/continue-onboarding") || p.startsWith("/api/stripe/login-link") || p.startsWith("/api/stripe/account-status") || (p === "/api/stripe/create-checkout-session" || p === "/api/stripe/confirm-checkout-session")) return true;
  if (/^\/api\/(?:users|profile)\//.test(p)) return true;
  if (p === "/api/profile") return true;
  if (p.startsWith("/api/support/tickets/") || p === "/api/support/tickets") return true;
  if (p === "/api/licenses/mine") return true;
  if (p === "/api/feedback/mine" || p === "/api/feedback") return true;
  if (p.startsWith("/api/appeals/")) return true;
  if (p === "/api/appeals") return true;
  if (p === "/api/packs/pending" || /^\/api\/creator\/packs/.test(p)) return true;
  return false;
}
function createAccountGate({ findTokenAccount, saveAccount, findAccountById }) {
  async function authenticate(req) {
    const token = bearer(req);
    if (!token) return null;
    const match = await findTokenAccount(digestToken(token));
    if (!match || !findSession(match.account, digestToken(token))) return null;
    const status = String(match.account.status || "").toLowerCase();
    if (["banned", "suspended", "rejected"].includes(status)) return null;
    return match;
  }
  async function middleware(req, res, next) {
    if (!isProtected(req)) return next();
    // Existing Founder-only moderation endpoint uses its separate signed key.
    // Only the dedicated founder-moderation status endpoint accepts founder-key
    // credentials instead of a customer session; it validates the key itself.
    if (/^\/api\/users\/[^/]+\/status$/.test(req.path) && req.method === "PATCH" && req.get("x-founder-key")) return next();
    try {
      const authenticated = await authenticate(req);
      if (!authenticated) return res.status(401).json({ success:false, code:"AUTH_REQUIRED", message:"Veuillez vous reconnecter pour sécuriser cette opération." });
      const {rootUser, account} = authenticated;
      const accountIds = new Set([account.id, account.accountId].filter(Boolean).map(String));
      const rootIds = new Set([rootUser.id, rootUser.userId].filter(Boolean).map(String));
      const params = req.params || {};
      const body = req.body || {};
      const query = req.query || {};
      const p = req.path;
      const idFields = ["accountId", "artistId", "userId", "currentAccountId", "ownerId", "creatorId"];
      // Account-specific URL segments represent identity only on these routes;
      // pack IDs and moderation case IDs are verified by route handlers.
      if (/^\/api\/packs\/[^/]+\/moderation-(?:request|response)$/.test(p)) {
        const requested = String(req.method === "GET" ? query.accountId || "" : body.accountId || "");
        if (!requested || !accountIds.has(requested)) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      }
      for (const field of idFields) {
        const val = body[field];
        if (val == null || String(val) === "") continue;
        if (field === "userId") { if (!rootIds.has(String(val)) && !accountIds.has(String(val))) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"}); }
        else if (!accountIds.has(String(val))) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      }
      for (const field of idFields) {
        const value = query[field];
        if (value == null || String(value)==="") continue;
        if (field === "userId" ? !(rootIds.has(String(value)) || accountIds.has(String(value))) : !accountIds.has(String(value))) {
          return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
        }
      }
      // URLs with an account id, never trust their ownership from client alone.
      if (/^\/api\/(?:profile|users)\//.test(p) || (/^\/api\/creator\/packs\/(?!bulk)([^/]+)$/.test(p) && req.method === "GET") || /^\/api\/creator\/missions\//.test(p) || /^\/api\/(?:support\/tickets|appeals\/decisions)\//.test(p)) {
        const bits = p.split("/").filter(Boolean);
        const urlId = (bits[1] === "profile" || bits[1] === "users") ? bits[2] : ((bits[1] === "appeals") ? bits[3] : bits[bits.length - 1]);
        if (!accountIds.has(urlId) && !rootIds.has(urlId)) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      }
      if (p === "/api/accounts/switch") {
        if (!accountIds.has(String(body.currentAccountId || ""))) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
        const nextId = String(body.targetAccountId || "");
        if (!(rootUser.accounts || []).some(a => String(a.accountId || a.id) === nextId)) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      }
      if (p === "/api/accounts/list" && !accountIds.has(String(body.currentAccountId || ""))) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      if (["/api/profile", "/api/account/password", "/api/account/email", "/api/account/informations", "/api/account/phone", "/api/account/delete"].includes(p) && body.id && !accountIds.has(String(body.id))) return res.status(403).json({success:false,code:"ACCOUNT_FORBIDDEN"});
      req.sonaraIdentity = { rootUser, account, accountId: String(account.accountId || account.id), rootId: String(rootUser.id) };
      return next();
    } catch (err) {
      console.error("[AUTH] Vérification impossible :", err.message);
      return res.status(503).json({ success:false, code:"AUTH_SERVICE_UNAVAILABLE" });
    }
  }
  async function issue(rootUser, account) {
    // Gradually migrate credentials created by older Pre-V1 builds.
    if (typeof account.password === "string" && account.password && !account.password.startsWith(`${HASH_PREFIX}$`)) {
      account.password = hashPassword(account.password);
    }
    const token = makeSession(account);
    await saveAccount(rootUser, account);
    return token;
  }
  async function restore(req, res) {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({success:false,code:"AUTH_REQUIRED"});
    const {rootUser,account} = auth;
    const {sanitizeAccountSecrets} = require("./data-protection");
    const sanitized = sanitizeAccountSecrets(account,rootUser.id);
    return res.json({success:true,sessionToken:bearer(req),profile:sanitized});
  }
  async function logout(req,res) {
    const auth = await authenticate(req);
    if (auth) {
      const digest = digestToken(bearer(req));
      auth.account.authSessions = (auth.account.authSessions || []).filter(s=>s.tokenHash !== digest);
      await saveAccount(auth.rootUser, auth.account);
    }
    return res.json({success:true});
  }
  return { middleware, issue, restore, logout, authenticate };
}
module.exports = {hashPassword,verifyPassword,makeSession,findSession,digestToken,bearer,createAccountGate,isProtected};
