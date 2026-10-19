"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {hashPassword,verifyPassword,makeSession,digestToken,findSession,createAccountGate,isProtected}=require("./account-security");
const {migrateAccountPasswords}=require("./password-migration");
const {sanitizeAccountSecrets}=require("./data-protection");

function mockResponse(){return {statusCode:200,payload:null,status(code){this.statusCode=code;return this},json(data){this.payload=data;return this}};}
const root={id:"user_1",accounts:[{id:"acc_1",accountId:"acc_1",status:"approved",password:"old-password",downloadedPacks:["pack_1"]},{id:"acc_2",accountId:"acc_2",status:"approved",password:"other"}]};
function testGate(){
 const account=root.accounts[0]; const token=makeSession(account);
 const gate=createAccountGate({findTokenAccount:async digest=>findSession(account,digest)?{rootUser:root,account}:null,saveAccount:async()=>{},findAccountById:async()=>({rootUser:root,account})});
 return {gate,token};
}
function req(path,token="",body={}){return {method:"POST",path,body,query:{},get: name => name==="Authorization"&&token?`Bearer ${token}`:""};}
test("scrypt: salted, verifies, rejects wrong, legacy verification supported",()=>{
 const a=hashPassword("strong-password"),b=hashPassword("strong-password");
 assert.notEqual(a,b); assert.equal(verifyPassword("strong-password",a),true);
 assert.equal(verifyPassword("oops",a),false);
 assert.equal(verifyPassword("legacy","legacy"),true);
});
test("password migration converts legacy without touching already salted",()=>{
 const hashed=hashPassword("saved"); const r={accounts:[{password:"cleartext"},{password:hashed}]};
 const changes=migrateAccountPasswords(r);
 assert.equal(changes.length,1);assert.equal(verifyPassword("cleartext",changes[0].hashed),true);
});
test("sessions are opaque; only hashes stored; sanitizer removes tokens",()=>{
 const a={id:"account",password:hashPassword("password")};const token=makeSession(a);
 assert.ok(token.length>32);assert.equal(JSON.stringify(a).includes(token),false);
 assert.equal(findSession(a,digestToken(token)),true);
 assert.equal(findSession(a,digestToken("bad")),false);
 assert.equal(sanitizeAccountSecrets(a).authSessions,undefined);
});
test("bank request without session forbidden",async()=>{
 const {gate}=testGate();let next=0;const response=mockResponse();
 await gate.middleware(req("/api/stripe/connect-account","",{artistId:"acc_1"}),response,()=>next++);
 assert.equal(response.statusCode,401);assert.equal(next,0);
});
test("bank IDOR blocked even with valid session",async()=>{
 const {gate,token}=testGate();let next=0;const response=mockResponse();
 await gate.middleware(req("/api/stripe/connect-account",token,{artistId:"acc_2"}),response,()=>next++);
 assert.equal(response.statusCode,403);assert.equal(next,0);
});
test("legitimate bank access accepted with owner token",async()=>{
 const {gate,token}=testGate();let next=0;const response=mockResponse();
 await gate.middleware(req("/api/stripe/connect-account",token,{artistId:"acc_1"}),response,()=>next++);
 assert.equal(next,1);assert.equal(response.statusCode,200);
});
test("profile direct lookup not allowed on unrelated account",async()=>{
 const {gate,token}=testGate();const response=mockResponse();let next=0;
 await gate.middleware({...req("/api/profile/acc_2",token),method:"GET"},response,()=>next++);
 assert.equal(response.statusCode,403);assert.equal(next,0);
});
test("public catalog remains public, Stripe confirmation remains private",()=>{
 assert.equal(isProtected({path:"/api/packs",method:"GET"}),false);
 assert.equal(isProtected({path:"/api/stripe/confirm-checkout-session",method:"POST"}),true);
 assert.equal(isProtected({path:"/api/downloads/prepare",method:"POST"}),true);
});
