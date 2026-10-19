"use strict";
function createRateLimiter({windowMs=60000, limit=40, maxEntries=15000}={}) {
 const hits = new Map(); let requests=0;
 return (req,res,next)=>{
  const now=Date.now();
  if (++requests % 200===0) for(const [key,v] of hits) if(now-v.start>windowMs) hits.delete(key);
  if(hits.size>maxEntries) hits.clear();
  const ip=String(req.ip||req.socket?.remoteAddress||"unknown");
  const key=`${ip}:${req.path}`;
  const item=hits.get(key)||{start:now,count:0};
  if(now-item.start>windowMs){item.start=now;item.count=0;}
  item.count++; hits.set(key,item);
  if(item.count>limit){res.setHeader("Retry-After",String(Math.ceil((windowMs-(now-item.start))/1000)));return res.status(429).json({success:false,code:"RATE_LIMITED",message:"Trop de demandes, veuillez patienter."});}
  next();
 };
}
function installApiHardening(app) {
 const authLimit=createRateLimiter({windowMs:15*60000,limit:15});
 const codeLimit=createRateLimiter({windowMs:60*60000,limit:8});
 app.use((req,res,next)=>{
  const p=String(req.path||"");
  if(p.startsWith("/api/")) {
   res.setHeader("Cross-Origin-Resource-Policy","cross-origin");
   res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
   res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  }
  if(req.method==="POST" && /^\/api\/(?:login|accounts\/login|account-security\/verify-code)(?:\/|$)/.test(p)) return authLimit(req,res,next);
  if(req.method==="POST" && /(?:send-code|live-check|account-security\/check)$/.test(p)) return codeLimit(req,res,next);
  next();
 });
}
module.exports = {createRateLimiter, installApiHardening};
