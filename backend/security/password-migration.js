"use strict";
const fs=require("fs");
const path=require("path");
const {hashPassword}=require("./account-security");
const PREFIX="scrypt-v1$";
function migrateAccountPasswords(root) {
  if(!Array.isArray(root?.accounts)) return [];
  const changes=[];
  root.accounts.forEach((account,index)=>{
    const password=account?.password;
    if(typeof password==="string" && password && !password.startsWith(PREFIX)) {
      changes.push({index,original:password,hashed:hashPassword(password)});
    }
  });
  return changes;
}
function migrateLocalPasswords(usersPath) {
  if(!fs.existsSync(usersPath)) return 0;
  const users=JSON.parse(fs.readFileSync(usersPath,"utf8"));
  let count=0;
  for(const root of users) for(const change of migrateAccountPasswords(root)) {
    root.accounts[change.index].password=change.hashed;
    count++;
  }
  if(count) {
    const tmp=path.join(path.dirname(usersPath),`.users-migrate-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(tmp,JSON.stringify(users,null,2),{mode:0o600});
    try {fs.renameSync(tmp,usersPath);}catch(e){try{fs.unlinkSync(tmp)}catch{};throw e;}
  }
  return count;
}
async function migrateMongoPasswords(usersCollection) {
  let count=0;
  const cursor=usersCollection.find({"accounts.password":{$exists:true}},{projection:{accounts:1}});
  for await(const root of cursor) {
    for(const change of migrateAccountPasswords(root)) {
      const path=`accounts.${change.index}.password`;
      const result=await usersCollection.updateOne({_id:root._id,[path]:change.original},{$set:{[path]:change.hashed}});
      count+=result.modifiedCount||0;
    }
  }
  return count;
}
module.exports={migrateAccountPasswords,migrateLocalPasswords,migrateMongoPasswords};
