'use strict';
// Builds with the pinned official CLI; uploads a buffered multipart archive.
// The buffer avoids the Missing File stream-upload failure seen with CLI 3.12.2.
const path=require('node:path');const fs=require('node:fs');const {spawnSync}=require('node:child_process');
const tar=require('tar');const FormData=require('form-data');
const root=path.resolve(__dirname,'..');
async function main(){
 const major=Number(process.versions.node.split('.')[0]);if(major<24)throw new Error('Node.js 24 or newer is required.');
 const buildOnly=process.argv.includes('--build-only');
 let homey;
 if(!buildOnly){const auth=require('homey/services/AthomApi');homey=await auth.getActiveHomey();console.log('Installing on the Homey selected with: npm run homey -- select');}
 const cli=require.resolve('homey/bin/homey.js');
 const result=spawnSync(process.execPath,[cli,'app','build'],{cwd:root,stdio:'inherit',env:process.env});
 if(result.error)throw result.error;if(result.status!==0)throw new Error('Homey build failed. Nothing was uploaded.');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 const dir=path.join(root,'dist');fs.mkdirSync(dir,{recursive:true});const archive=path.join(dir,`${manifest.id}-${manifest.version}.tar.gz`);
 await tar.create({gzip:true,portable:true,cwd:path.join(root,'.homeybuild'),file:archive},['.']);
 if(buildOnly){console.log('Build verified; archive saved in dist/. No installation performed.');return;}
 const form=new FormData();form.append('app',fs.readFileSync(archive),{filename:'app.tar.gz',contentType:'application/gzip'});form.append('env','{}');form.append('debug','false');form.append('purgeSettings','false');
 const body=form.getBuffer();
 await homey.call({method:'POST',path:'/api/manager/devkit/',json:false,headers:{...form.getHeaders(),'Content-Length':String(body.length)},body,$timeout:120000});
 console.log(`Installed Anker ${manifest.version}. You can close this terminal. Open Homey to add the charger.`);
}
main().then(()=>process.exit(0)).catch(error=>{console.error('Installation failed:',error.message);console.error('See docs/INSTALL.en.md or docs/INSTALL.ru.md. Existing devices are not deliberately removed.');process.exit(1);});
