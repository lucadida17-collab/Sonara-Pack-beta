"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const {ISO_COUNTRIES, COMMON_TYPES} = require("./artist-legal-identity");
const root = path.resolve(__dirname,"../../..");
const ui = fs.readFileSync(path.join(root,"app/js/creator/management/legal-identity.js"),"utf8");
const css = fs.readFileSync(path.join(root,"app/css/creator/management/legal-identity.css"),"utf8");
const html = fs.readFileSync(path.join(root,"app/pages/creator/management/legal-identity.html"),"utf8");

function responseReader() {
  const start = ui.indexOf("  async function readApiJson(response) {");
  const end = ui.indexOf("\n  // Populate all country options immediately", start);
  assert.ok(start >= 0 && end > start, "API response guard missing");
  return vm.runInNewContext(`(${ui.slice(start,end).trim()})`);
}

test("Les 249 pays sont disponibles sans attendre l'API",()=>{
  const match = ui.match(/ARTIST_LEGAL_FALLBACK_COUNTRIES\s*=\s*"([A-Z ]+)"\.split\(" "\)/);
  assert.ok(match);
  const clientCountries = match[1].split(" ");
  assert.deepEqual(clientCountries,ISO_COUNTRIES);
  assert.equal(clientCountries.length,249);
  assert.match(ui,/updateCountries\(ARTIST_LEGAL_FALLBACK_COUNTRIES, suggestedCountryFromLanguage\(\)\);/);
});

test("Les identifiants des marchés principaux restent liés aux choix du serveur",()=>{
  for(const [country,types] of Object.entries(COMMON_TYPES)) {
    assert.match(ui,new RegExp(`${country}:\\[${types.map(t=>`"${t}"`).join(",")}\\]`));
  }
  assert.match(ui,/country\.addEventListener\("change", \(\) => \{/);
  assert.match(ui,/updateTypes\(\);/);
});

test("Un serveur HTML 404 produit une erreur contrôlée plutôt qu'une erreur JSON navigateur",async()=>{
  const read = responseReader();
  await assert.rejects(read({status:404,headers:{get:()=>"text/html"},json:()=>{throw new Error("should not parse");}}),err => err.code === "NON_JSON_RESPONSE" && err.httpStatus === 404);
});

test("Un JSON malformé est capturé avec une erreur contrôlée",async()=>{
  const read = responseReader();
  await assert.rejects(read({status:200,headers:{get:()=>"application/json"},json:async()=>{throw new SyntaxError("Bad JSON");}}),err => err.code === "INVALID_JSON_RESPONSE");
});

test("Les réponses API authentifiées sont validées, sans convertir un 401 en succès",async()=>{
  const read = responseReader();
  await assert.rejects(read({ok:false,status:401,headers:{get:()=>"application/json"},json:async()=>({success:false,code:"AUTH_REQUIRED"})}),err=>err.code==="AUTH_REQUIRED" && err.httpStatus===401);
  const success = await read({ok:true,status:200,headers:{get:()=>"application/json; charset=utf-8"},json:async()=>({success:true,legalIdentity:{}})});
  assert.equal(success.success,true);
});

test("La page charge CSS et JS versionnés et le formulaire reste isolé en responsive",()=>{
  assert.match(html,/legal-identity\.css\?v=legal-registration-portals-local-v1/);
  assert.match(html,/legal-identity\.js\?v=legal-registration-portals-local-v1/);
  assert.match(css,/\.artist-legal-form \.artist-legal-field\[hidden\] \{display: none !important;\}/);
  assert.match(css,/\.artist-legal-form select\.artist-legal-control option,/);
  assert.match(css,/@media \(max-width:700px\)/);
  assert.match(ui,/function refreshSaveState\(\)/);
  assert.match(ui,/retry\.addEventListener\("click", loadDeclaration\)/);
});

test("Retour direct au dashboard management et nouveau module indépendant",()=>{
  const management=fs.readFileSync(path.join(root,"app/js/creator/dashboard/creator.js"),"utf8");
  const oldAccount=fs.readFileSync(path.join(root,"app/js/creator/management/account-creator.js"),"utf8");
  assert.doesNotMatch(management,/artist-legal-btn/);
  assert.match(management,/stripe-connect-btn/);
  assert.match(ui,/window\.location\.href = "\/app\/pages\/creator\/dashboard\.html\?mode=management"/);
  assert.doesNotMatch(ui,/window\.location\.href = "settings-creator\.html"/);
  assert.doesNotMatch(oldAccount,/function renderArtistLegalIdentity/);
  assert.match(oldAccount,/window\.location\.replace\("\/app\/pages\/creator\/management\/legal-identity\.html"\)/);
});
test("Statut de contrôle externe strictement informatif et privé",()=>{
  assert.match(ui,/\/api\/creator\/legal-identity\/verification/);
  assert.match(ui,/Stripe TEST : ce statut est simulé/);
  assert.match(ui,/providerAction\.hidden = result\.environment !== "local"/);
  assert.match(html,/data-sonara-auth="required"/);
});
