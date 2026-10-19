"use strict";

// Prevents a partial Sonara update from shipping server imports without their
// companion backend modules. Pure Node.js: no npm dependencies or credentials.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const projectRoot = path.resolve(__dirname, "../..");
const securityModules = [
  "account-security",
  "api-hardening",
  "data-protection",
  "password-migration",
  "private-media",
  "public-previews",
];

function checkRelativeImports(entry) {
  const queued = [path.join(projectRoot, entry)];
  const checked = new Set();
  let imports = 0;
  while (queued.length) {
    const filename = queued.pop();
    if (checked.has(filename)) continue;
    checked.add(filename);
    const source = fs.readFileSync(filename, "utf8");
    const localRequire = createRequire(filename);
    const regex = /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    for (const match of source.matchAll(regex)) {
      const specifier = match[1];
      let resolved;
      try {
        resolved = localRequire.resolve(specifier);
      } catch (error) {
        assert.fail(`${path.relative(projectRoot, filename)} importe ${specifier}, mais ce module est introuvable: ${error.message}`);
      }
      assert.ok(resolved.startsWith(projectRoot + path.sep), `Import hors projet: ${specifier}`);
      if (resolved.endsWith(".js")) queued.push(resolved);
      imports++;
    }
  }
  return { files: checked.size, imports };
}

for (const server of ["server.js", "server-local.js"]) {
  test(`${server} : tous les modules locaux importes existent`, () => {
    const result = checkRelativeImports(server);
    assert.ok(result.files > 20, `Audit incomplet : ${result.files} fichiers`);
    assert.ok(result.imports > 20, `Audit incomplet : ${result.imports} imports`);
  });
  test(`${server} : utilise les protections d'API`, () => {
    const contents = fs.readFileSync(path.join(projectRoot, server), "utf8");
    assert.match(contents, /require\(["']\.\/backend\/security\/api-hardening["']\)/);
    assert.match(contents, /installApiHardening\s*\(/);
  });
}

test("Les six modules de securite essentiels peuvent etre charges", () => {
  const expected = {
    "account-security": "createAccountGate",
    "api-hardening": "installApiHardening",
    "data-protection": "installDataProtection",
    "password-migration": "migrateLocalPasswords",
    "private-media": "createPrivateMedia",
    "public-previews": "publicMidiPreview",
  };
  for (const name of securityModules) {
    const exported = require(path.join(__dirname, name));
    assert.equal(typeof exported[expected[name]], "function", `${name}: export ${expected[name]} absent`);
  }
});

test("api-hardening active la limitation des requetes de connexion", () => {
  const {installApiHardening} = require("./api-hardening");
  const handlers=[];
  installApiHardening({ use: (handler) => handlers.push(handler) });
  assert.equal(handlers.length, 1);
  let successes=0;
  const req={method:"POST",path:"/api/login",ip:"192.0.2.100"};
  const res={
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(payload){this.payload=payload;return this;}
  };
  for (let i=0; i<16; i++) handlers[0](req,res,()=>successes++);
  assert.equal(successes,15);
  assert.equal(res.statusCode,429);
  assert.equal(res.payload.code,"RATE_LIMITED");
});
