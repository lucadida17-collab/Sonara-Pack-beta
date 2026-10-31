"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {registerArtistLegalIdentityRoutes, lookupFrenchBusiness} = require("./artist-legal-identity");
const {REGISTRATION_PORTALS} = require("./legal-registration-portals");

function rig({local = true, registry = async () => ({status:"registry_matched",registryName:"Entreprise test",registryUrl:"https://annuaire-entreprises.data.gouv.fr/entreprise/732829320"})}={}) {
  const routes={};let writes=0;
  const app={get:(p,h)=>routes[`GET ${p}`]=h,post:(p,h)=>routes[`POST ${p}`]=h,patch:(p,h)=>routes[`PATCH ${p}`]=h};
  registerArtistLegalIdentityRoutes({app,saveAccountState:async()=>{writes++},localV1Simulation:local,registryLookup:registry});
  const session={rootUser:{id:"r"},account:{role:"artist",accountId:"a"}};
  async function hit(path,body={}, identity=session) {
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(o){this.body=o;return this;}};
    await routes[path]({sonaraIdentity:identity,body},res);return res;
  }
  return {session,hit,writes:()=>writes};
}
const fr={country:"FR",identifierType:"FR_SIRET",registrationNumber:"73282932000074",ownershipAttested:true};

test("Français : la correspondance registre public est enregistrée, propriétaire non vérifié",async()=>{
  const r=rig();const res=await r.hit("POST /api/creator/legal-identity/check-registration",fr);
  assert.equal(res.statusCode,200);assert.equal(res.body.registrationCheck.status,"registry_matched");
  assert.equal(res.body.legalIdentity.status,"declared_unverified");
  assert.equal(res.body.registrationCheck.ownershipVerified,false);
  assert.equal(r.session.account.artistLegalIdentity.registrationNumber,"73282932000074");
  assert.equal(r.writes(),1);
});
test("Le serveur refuse les sessions inconnues, comptes non artistes et attestations absentes",async()=>{
  const r=rig();
  assert.equal((await r.hit("POST /api/creator/legal-identity/check-registration",fr,null)).statusCode,401);
  assert.equal((await r.hit("POST /api/creator/legal-identity/check-registration",fr,{rootUser:{id:"r"},account:{role:"user"}})).statusCode,403);
  assert.equal((await r.hit("POST /api/creator/legal-identity/check-registration",{...fr,ownershipAttested:false})).statusCode,400);
  assert.equal(r.writes(),0);
});
test("MAIN ne propose pas le contrôle, même si la route y était installée par erreur",async()=>{
  const r=rig({local:false});const res=await r.hit("POST /api/creator/legal-identity/check-registration",fr);
  assert.equal(res.statusCode,403);assert.equal(res.body.code,"LOCAL_V1_ONLY");assert.equal(r.writes(),0);
});
test("SIRET faux ou introuvable ne crée aucune déclaration validée",async()=>{
  const r=rig({registry:async()=>({status:"not_found"})});
  const invalid=await r.hit("POST /api/creator/legal-identity/check-registration",{...fr,registrationNumber:"73282932000075"});
  assert.equal(invalid.statusCode,400);
  const missing=await r.hit("POST /api/creator/legal-identity/check-registration",fr);
  assert.equal(missing.body.registrationCheck.status,"not_found");assert.equal(r.writes(),0);
});
test("Registre indisponible : pas de faux succès ni sauvegarde",async()=>{
  const r=rig({registry:async()=>{throw new Error("offline");}});
  const res=await r.hit("POST /api/creator/legal-identity/check-registration",fr);
  assert.equal(res.statusCode,503);assert.equal(res.body.code,"REGISTRY_UNAVAILABLE");assert.equal(r.writes(),0);
});
test("Autres pays : contrôle du format seulement et statut non vérifié",async()=>{
  const r=rig({registry:async()=>{throw Error("should not call French registry");}});
  const res=await r.hit("POST /api/creator/legal-identity/check-registration",{
    country:"US",identifierType:"US_EIN",registrationNumber:"12-3456789",ownershipAttested:true
  });
  assert.equal(res.statusCode,200);assert.equal(res.body.registrationCheck.status,"format_only");
  assert.equal(res.body.registrationCheck.ownershipVerified,false);assert.equal(res.body.legalIdentity.siret,null);
});
test("Vérification SIRET français utilise le domaine officiel et exige une correspondance de l'établissement",async()=>{
  const seen=[];
  const fetcher=async(url)=>{seen.push(url);return {ok:true,json:async()=>({results:[{siren:"732829320",matching_etablissements:[{siret:"73282932000074"}]}]})};};
  const found=await lookupFrenchBusiness({identifierType:"FR_SIRET",registrationNumber:"73282932000074"},fetcher);
  assert.equal(found.status,"registry_matched");assert.match(seen[0],/^https:\/\/recherche-entreprises\.api\.gouv\.fr\/search\?q=73282932000074/);
  const absent=await lookupFrenchBusiness({identifierType:"FR_SIRET",registrationNumber:"73282932000077"},fetcher);
  assert.equal(absent.status,"not_found");
});
test("Portails directs documentés et pays non couverts sans lien inventé",async()=>{
  for(const key of ["FR","GB","US","CA","BE","AU","DE","NL","PT","PL","AL","ID","MA"]) {
    assert.match(REGISTRATION_PORTALS[key].url,/^https:\/\//);
  }
  assert.equal(REGISTRATION_PORTALS.CN,undefined);
  assert.match(fs.readFileSync("app/js/creator/management/bank.js","utf8"),/suggestedRegistrationCountry/);
  assert.match(fs.readFileSync("app/js/creator/management/bank.js","utf8"),/check-registration/);
});
