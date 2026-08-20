"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSensitivePath,
  sanitizeAccountSecrets,
  findUnsafeObjectKey
} = require("./data-protection");

test("sensitive server/database paths are blocked", () => {
  for (const pathname of [
    "/.env",
    "/.env.prod",
    "/data/users.json",
    "/backend/features/licenses/license-protection.js",
    "/server.js",
    "/package.json",
    "/%2eenv.test",
    "/.git/config"
  ]) {
    assert.equal(isSensitivePath(pathname), true, pathname);
  }
  assert.equal(isSensitivePath("/app/js/catalog/download.js"), false);
  assert.equal(isSensitivePath("/api/users/example"), false);
});

test("account sanitizer never returns authentication secrets", () => {
  const account = sanitizeAccountSecrets({
    accountId: "acc_demo",
    pseudo: "Demo",
    mail: "demo@example.invalid",
    password: "secret",
    verificationToken: "verification",
    founderSync: { token: "internal" },
    passwordHash: "hash",
    _id: "mongo"
  }, "user_demo");

  assert.equal(account.accountId, "acc_demo");
  assert.equal(account.userId, "user_demo");
  assert.equal(account.password, undefined);
  assert.equal(account.verificationToken, undefined);
  assert.equal(account.founderSync, undefined);
  assert.equal(account.passwordHash, undefined);
  assert.equal(account._id, undefined);
});

test("unsafe object keys are detected", () => {
  assert.equal(findUnsafeObjectKey({ safe: { value: 1 } }), null);
  assert.equal(findUnsafeObjectKey(JSON.parse('{"__proto__":{"polluted":true}}')), "__proto__");
});
