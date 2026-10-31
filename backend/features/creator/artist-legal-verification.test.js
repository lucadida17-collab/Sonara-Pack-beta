"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {registerArtistLegalIdentityRoutes,externalVerificationSummary} = require("./artist-legal-identity");
function fakeApp(verificationProvider) {
  const routes={};
  const app={post:(p,f)=>routes[`POST ${p}`]=f,get:(p,fn)=>routes[p]=fn,patch:()=>{}};
  registerArtistLegalIdentityRoutes({app,saveAccountState:async()=>{},verificationProvider});
  const reply=()=>({statusCode:200, headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(k){this.statusCode=k;return this;},json(p){this.body=p;return this;}});
  return async function invoke(identity){const res=reply();await routes["/api/creator/legal-identity/verification"]({sonaraIdentity:identity},res);return res;};
}
const artist=id=>({rootUser:{id:"root"},account:{role:"artist",accountId:id,stripeAccountId:"acct_external"}});
test("Vérification externe interdit les requêtes anonymes et non-artistes",async()=>{
 const invoke=fakeApp({enabled:true,environment:"local",retrieveAccount:async()=>({livemode:false})});
 assert.equal((await invoke(null)).statusCode,401);
 assert.equal((await invoke({rootUser:{id:"x"},account:{role:"user"}})).statusCode,403);
});
test("MAIN: aucune demande Stripe Connect et statut non activé",async()=>{
 let calls=0;
 const invoke=fakeApp({enabled:false,environment:"main",retrieveAccount:async()=>{calls++;return {}}});
 const res=await invoke(artist("owner"));
 assert.equal(res.statusCode,200);assert.equal(res.body.status,"disabled");assert.equal(res.body.officiallyVerified,false);assert.equal(calls,0);
});
test("LOCAL: compte du titulaire connecté uniquement, sans données sensibles",async()=>{
 let seen;
 const invoke=fakeApp({enabled:true,environment:"local",retrieveAccount:async id=>{
    seen=id;return {livemode:false,charges_enabled:true,payouts_enabled:true,details_submitted:true,
      requirements:{currently_due:[],pending_verification:[]},email:"confidentiel@example.net",external_accounts:["iban"]};
 }});
 const res=await invoke(artist("owner"));
 assert.equal(seen,"acct_external");assert.equal(res.body.status,"test_ready");
 assert.equal(res.body.officiallyVerified,false);assert.equal(res.body.isTestOnly,true);
 assert.equal(JSON.stringify(res.body).includes("confidentiel"),false);
 assert.equal(JSON.stringify(res.body).includes("acct_external"),false);
});
test("Stripe TEST indisponible ou compte live interdit par sécurité",async()=>{
 const invoke=fakeApp({enabled:true,environment:"local",retrieveAccount:async()=>({livemode:true})});
 const res=await invoke(artist("owner"));
 assert.equal(res.statusCode,503);assert.equal(res.body.code,"INVALID_PROVIDER_ENVIRONMENT");
});
test("Manque d'informations et contrôle en cours non étiquetés vérifiés",()=>{
 assert.equal(externalVerificationSummary({details_submitted:true,requirements:{currently_due:["business_type"]}}).status,"needs_information");
 assert.equal(externalVerificationSummary({requirements:{currently_due:[],pending_verification:["business_profile"]}}).status,"in_review");
});
test("Compte Stripe absent : l'utilisateur ne peut pas afficher un statut tiers",async()=>{
 const invoke=fakeApp({enabled:true,environment:"local",retrieveAccount:async()=>{throw Error("should not call")}});
 const res=await invoke({rootUser:{id:"x"},account:{role:"artist",id:"a"}});
 assert.equal(res.body.status,"not_connected");
});

test("Déclaration hors France: LOCAL ne propose jamais un contrôle français comme vérification internationale",async()=>{
 let calls=0;
 const invoke=fakeApp({enabled:true,environment:"local",retrieveAccount:async()=>{calls++;return {livemode:false}}});
 const identity=artist("owner");identity.account.artistLegalIdentity={country:"US",activityType:"registered",identifierType:"US_EIN",registrationNumber:"123456789"};
 const res=await invoke(identity);
 assert.equal(res.body.status,"country_not_supported");assert.equal(res.body.officiallyVerified,false);assert.equal(calls,0);
});
