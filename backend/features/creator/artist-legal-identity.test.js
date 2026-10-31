"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { validateSiret, artistLegalSummary } = require("./artist-legal-identity");
const { sanitizeAccountSecrets } = require("../../security/data-protection");
test("SIRET valid Luhn", () => assert.deepEqual(validateSiret("732 829 320 00074"), { valid: true, siret: "73282932000074" }));
test("invalid SIRET checksum rejected", () => assert.equal(validateSiret("73282932000075").valid, false));
test("non-14-digit rejected", () => assert.equal(validateSiret("123").valid, false));
test("SIRET declared without legal verification claim", () => assert.equal(artistLegalSummary({artistLegalIdentity:{siret:"73282932000074"}}).status, "declared_unverified"));
test("non artist private identity not leaked by standard sanitizer", () => {
 const result = sanitizeAccountSecrets({ role:"artist", artistLegalIdentity:{ siret:"73282932000074" } }, "root1");
 assert.equal(result.artistLegalIdentity, undefined);
});
test("single management entry opens unified bank and declaration page", () => {
 const dashboard=fs.readFileSync("app/js/creator/dashboard/creator.js","utf8");
 const bank=fs.readFileSync("app/js/creator/management/bank.js","utf8");
 assert.match(dashboard,/stripe-connect-btn/);
 assert.match(dashboard,/\/app\/pages\/creator\/management\/bank\.html/);
 assert.doesNotMatch(dashboard,/artist-legal-btn/);
 assert.match(bank,/bankLegalMarkup\(\)/);
});
const {registerArtistLegalIdentityRoutes} = require('./artist-legal-identity');
function makeRoutes() {
  const handlers = {};
  const app = { post: (path, fn) => { handlers[`POST ${path}`] = fn; }, get: (path, fn) => { handlers[`GET ${path}`] = fn; }, patch: (path, fn) => { handlers[`PATCH ${path}`] = fn; }};
  let saves=0;
  registerArtistLegalIdentityRoutes({app, saveAccountState: async () => {saves++;}});
  function response(){return {statusCode:200,headers:{}, status(code){this.statusCode=code;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;}}}
  async function invoke(method, identity, body) { const res=response(); await handlers[`${method} /api/creator/legal-identity`]({sonaraIdentity:identity,body},res);return res; }
  return {invoke, saves:()=>saves};
}
test('legal endpoint refuses absent server-authenticated session', async()=> {
 const {invoke}=makeRoutes();const res=await invoke('PATCH',null,{siret:'73282932000074'});
 assert.equal(res.statusCode,401);
});
test('legal endpoint rejects non-artist even if role supplied in body',async()=>{
 const {invoke}=makeRoutes();const res=await invoke('PATCH',{account:{role:'user'},rootUser:{id:'A'}},{siret:'73282932000074',role:'artist'});
 assert.equal(res.statusCode,403);
});
test('legal update writes only authenticated artist account',async()=>{
 const artist={accountId:'artist1',role:'artist'}; const other={accountId:'artist2',role:'artist'};
 const routes=makeRoutes(); const res=await routes.invoke('PATCH',{rootUser:{id:'A'},account:artist},{siret:'73282932000074',artistId:'artist2'});
 assert.equal(res.statusCode,200);assert.equal(routes.saves(),1);
 assert.equal(artist.artistLegalIdentity.siret,'73282932000074');assert.equal(other.artistLegalIdentity,undefined);
 assert.equal(res.body.legalIdentity.status,'declared_unverified');
});
test('legal update rejects bad SIRET without a write',async()=>{
 const routes=makeRoutes();const res=await routes.invoke('PATCH',{rootUser:{id:'A'},account:{role:'artist'}},{siret:'73282932000075'});
 assert.equal(res.statusCode,400);assert.equal(routes.saves(),0);
});
const {isProtected} = require('../../security/account-security');
test('GET legal endpoint goes through central session gate',()=>{
 assert.equal(isProtected({path:'/api/creator/legal-identity',method:'GET'}),true);
});
test('PATCH legal endpoint goes through central session gate',()=>{
 assert.equal(isProtected({path:'/api/creator/legal-identity',method:'PATCH'}),true);
});

// International legal identity regression coverage.
const { ISO_COUNTRIES, allowedTypes, normalizeSubmission, validateRegistrationNumber } = (() => {
  const mod = require("./artist-legal-identity");
  return {...mod, allowedTypes:(country)=>[...(mod.COMMON_TYPES[country]||[]),"LOCAL_REGISTRATION"]};
})();
test("country selector includes global ISO codes for anglophone and francophone countries",()=> {
  for (const code of ["FR","US","GB","CA","BE","CH","AU","NZ","SN","CI","GN","MA","IE","IN","ZA","JP"]) assert.ok(ISO_COUNTRIES.includes(code));
  assert.equal(ISO_COUNTRIES.length,249);
});
test("French SIRET and SIREN are validated separately",()=> {
  assert.equal(normalizeSubmission({country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"732 829 320 00074"}).registrationNumber,"73282932000074");
  assert.equal(normalizeSubmission({country:"FR",activityType:"registered",identifierType:"FR_SIREN",registrationNumber:"732829320"}).valid,true);
  assert.equal(normalizeSubmission({country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"73282932000075"}).valid,false);
});
test("US business EIN accepted but not in France; no personal tax identifier type",()=> {
  assert.equal(normalizeSubmission({country:"US",activityType:"registered",identifierType:"US_EIN",registrationNumber:"12-3456789"}).registrationNumber,"123456789");
  assert.equal(normalizeSubmission({country:"FR",activityType:"registered",identifierType:"US_EIN",registrationNumber:"12-3456789"}).code,"IDENTIFIER_TYPE_INVALID");
  assert.ok(!allowedTypes("US").some(k=>/SSN|SIN|UTR/.test(k)));
});
test("UK Companies House accepts numeric and alphanumeric company numbers",()=> {
  for (const v of ["01234567","SC123456"]) assert.equal(normalizeSubmission({country:"GB",activityType:"registered",identifierType:"GB_CRN",registrationNumber:v}).valid,true);
  assert.equal(validateRegistrationNumber("GB_CRN","<script>").valid,false);
});
test("Canadian BN vs Québec NEQ use different lengths",()=> {
  assert.equal(normalizeSubmission({country:"CA",activityType:"registered",identifierType:"CA_BN",registrationNumber:"123456789"}).valid,true);
  assert.equal(normalizeSubmission({country:"CA",activityType:"registered",identifierType:"CA_NEQ",registrationNumber:"1234567890"}).valid,true);
  assert.equal(normalizeSubmission({country:"CA",activityType:"registered",identifierType:"CA_NEQ",registrationNumber:"123456789"}).valid,false);
});
test("Australian ABN check digit is validated against official example",()=> {
  assert.equal(validateRegistrationNumber("AU_ABN","51 824 753 556").valid,true);
  assert.equal(validateRegistrationNumber("AU_ABN","51 824 753 557").code,"ABN_CHECKSUM_INVALID");
});
test("other countries accept only local company registration type",()=> {
  assert.equal(normalizeSubmission({country:"JP",activityType:"registered",identifierType:"LOCAL_REGISTRATION",registrationNumber:"AB-123456"}).valid,true);
  assert.equal(normalizeSubmission({country:"JP",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"73282932000074"}).code,"IDENTIFIER_TYPE_INVALID");
  assert.equal(normalizeSubmission({country:"QQ",activityType:"registered",identifierType:"LOCAL_REGISTRATION",registrationNumber:"AB1234"}).code,"COUNTRY_INVALID");
});
test("self-declared individual remains explicitly unverified without a fake number",()=> {
  const checked=normalizeSubmission({country:"US",activityType:"individual_no_number",individualAttested:true,registrationNumber:"fake"});
  assert.equal(checked.valid,true);assert.equal(checked.registrationNumber,null);
  const summary=artistLegalSummary({artistLegalIdentity:checked});
  assert.equal(summary.status,"self_declared_unverified");
  assert.equal(summary.registrationNumber,null);
});
test("legacy French SIRET account is readable by new international form",()=> {
  const legacy=artistLegalSummary({artistLegalIdentity:{siret:"73282932000074",updatedAt:"2026-01-01"}});
  assert.equal(legacy.country,"FR");assert.equal(legacy.identifierType,"FR_SIRET");assert.equal(legacy.registrationNumber,"73282932000074");
  assert.equal(legacy.status,"declared_unverified");
});
test("non-France entry does not present as SIRET and official verification never assumed",()=> {
  const summary=artistLegalSummary({artistLegalIdentity:{country:"US",activityType:"registered",identifierType:"US_EIN",registrationNumber:"123456789"}});
  assert.equal(summary.siret,null);assert.equal(summary.status,"declared_unverified");
});
test("international PATCH writes authenticated account only, with input coercion protections",async()=> {
  const artist={accountId:"A",role:"artist"};const routes=makeRoutes();
  const ok=await routes.invoke("PATCH",{rootUser:{id:"R"},account:artist},{country:"BE",activityType:"registered",identifierType:"BE_BCE",registrationNumber:"0123456789",artistId:"other"});
  assert.equal(ok.statusCode,200);assert.equal(routes.saves(),1);
  assert.equal(artist.artistLegalIdentity.country,"BE");assert.equal(artist.artistLegalIdentity.siret,null);
  const bad=await routes.invoke("PATCH",{rootUser:{id:"R"},account:artist},{country:"US",activityType:"registered",identifierType:"US_EIN",registrationNumber:{text:"123456789"}});
  assert.equal(bad.statusCode,400);assert.equal(routes.saves(),1);
});
test("only authenticated artist may clear legal identity",async()=> {
  const a={accountId:"A",role:"artist",artistLegalIdentity:{siret:"73282932000074"}};
  const routes=makeRoutes();
  const no=await routes.invoke("PATCH",null,{activityType:"not_provided"});assert.equal(no.statusCode,401);
  const yes=await routes.invoke("PATCH",{rootUser:{id:"R"},account:a},{activityType:"not_provided",clear:true});
  assert.equal(yes.statusCode,200);assert.equal(a.artistLegalIdentity,undefined);
});
test("international legal identity is not exposed in general account sanitizer",()=> {
  const scrubbed=sanitizeAccountSecrets({role:"artist",artistLegalIdentity:{country:"CA",identifierType:"CA_BN",registrationNumber:"123456789"}},"R");
  assert.equal(scrubbed.artistLegalIdentity,undefined);
});
test("Founder account moderation displays registration country and verification caveat",()=> {
  const ui=fs.readFileSync("../founder/app/js/founder.js","utf8");
  assert.match(ui,/Pays d’activité/);assert.match(ui,/Registre national à vérifier/);
  assert.doesNotMatch(ui,/Contrôle officiel SIRET/);
});
test("MAIN and LOCAL still share the exact identity module and Stripe environment gating",()=> {
  for(const file of ["server.js","server-local.js"]) assert.match(fs.readFileSync(file,"utf8"),/registerArtistLegalIdentityRoutes/);
  assert.match(fs.readFileSync("backend/config/commercial-mode.js","utf8"),/pre-v1|PRE_V1|Pre-V1/i);
});
