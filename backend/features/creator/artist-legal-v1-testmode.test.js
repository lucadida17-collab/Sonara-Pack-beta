"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {normalizeSubmission,artistLegalSummary,registerArtistLegalIdentityRoutes} = require("./artist-legal-identity");
const source=path.resolve(__dirname,"../../..");
function routes(options={}) {
 const handlers={};let writes=0;
 const app={post:(p,f)=>handlers[`POST ${p}`]=f,get:(p,f)=>handlers[`GET ${p}`]=f,patch:(p,f)=>handlers[`PATCH ${p}`]=f};
 registerArtistLegalIdentityRoutes({app,saveAccountState:async()=>{writes++;},...options});
 return {writes:()=>writes,async hit(method,body={},ip="::1",account={role:"artist"}) {
  const res={statusCode:200,status(n){this.statusCode=n;return this;},setHeader(){},json(data){this.body=data;return this;}};
  await handlers[`${method} /api/creator/legal-identity`]({socket:{remoteAddress:ip},sonaraIdentity:{rootUser:{id:"R"},account},body},res);
  return {res,account};
 }};
}
const zeros={country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"00000000000000",localTestMode:true};
test("All zero SIRET remains invalid normally",()=>{
 assert.equal(normalizeSubmission(zeros).code,"REGISTRATION_PLACEHOLDER_INVALID");
 assert.equal(normalizeSubmission({...zeros,registrationNumber:"0000000000000"},{localTestSimulation:true}).code,"REGISTRATION_FORMAT_INVALID");
});
test("V1 LOCAL loopback check allows 14 zeros only with opt-in",async()=>{
 const r=routes({localV1Simulation:true,requireProviderDocument:true});
 const {res,account}=await r.hit("PATCH",zeros);
 assert.equal(res.statusCode,200);assert.equal(res.body.legalIdentity.status,"test_simulated");
 assert.equal(res.body.legalIdentity.testOnly,true);
 assert.equal(res.body.legalIdentity.siret,null);
 assert.equal(account.artistLegalIdentity.registrationNumber,"00000000000000");
 assert.equal(r.writes(),1);
});
test("Cannot fake all-zero validation by sending only client flag to non-LOCAL routes",async()=>{
 const r=routes();const {res}=await r.hit("PATCH",zeros);
 assert.equal(res.statusCode,403);assert.equal(res.body.code,"LOCAL_SIMULATION_FORBIDDEN");assert.equal(r.writes(),0);
});
test("Cannot enable LOCAL simulation over LAN even with correct checkbox",async()=>{
 const r=routes({localV1Simulation:true,requireProviderDocument:true});
 const {res}=await r.hit("PATCH",zeros,"192.168.1.2");
 assert.equal(res.statusCode,403);assert.equal(r.writes(),0);
});
test("Without local checkbox, provider proof is required and no data is saved",async()=>{
 const r=routes({localV1Simulation:true,requireProviderDocument:true});
 const {res}=await r.hit("PATCH",{...zeros,localTestMode:false,registrationNumber:"73282932000074"});
 assert.equal(res.statusCode,409);assert.equal(res.body.code,"DOCUMENT_VERIFICATION_REQUIRED");assert.equal(r.writes(),0);
});
test("LOCAL simulation supports valid-format US EIN zeros but no real Stripe verification",async()=>{
 const r=routes({localV1Simulation:true,requireProviderDocument:true});
 const {res}=await r.hit("PATCH",{...zeros,country:"US",identifierType:"US_EIN",registrationNumber:"000000000"});
 assert.equal(res.statusCode,200);assert.equal(res.body.legalIdentity.status,"test_simulated");
});
test("Standard declaration with actual SIRET retains original validation when provider document gate is not configured",async()=>{
 const r=routes();const {res}=await r.hit("PATCH",{...zeros,registrationNumber:"73282932000074",localTestMode:false});
 assert.equal(res.statusCode,200);assert.equal(res.body.legalIdentity.testOnly,false);
});
test("Local test checkbox and proof messaging are UI-only; MAIN navigation hides commercial entry",()=>{
 const mainDashboard=fs.readFileSync(path.join(source,"app/js/creator/dashboard/creator.js"),"utf8");
 const ui=fs.readFileSync(path.join(source,"app/js/creator/management/legal-identity.js"),"utf8");
 const localServer=fs.readFileSync(path.join(source,"server-local.js"),"utf8");
 const mainServer=fs.readFileSync(path.join(source,"server.js"),"utf8");
 assert.match(mainDashboard,/class="creator-action stripe-connect-btn/);
 assert.doesNotMatch(mainDashboard,/artist-legal-btn/);
 assert.match(ui,/LOCAL test/);assert.match(ui,/localTestMode:localTestAllowed && testSwitch.checked/);
 assert.match(ui,/state\.mode === "COMMERCIAL" && state\.stripeEnabled === true/);
 assert.match(localServer,/requireProviderDocument: true/);
 assert.doesNotMatch(mainServer,/^registerArtistLegalIdentityRoutes\(/m);
 assert.doesNotMatch(ui,/FileReader|FormData\(/);
});
