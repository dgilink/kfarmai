'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const asset='static/kfarmai-logo-horizontal.png';const href='/static/kfarmai-logo-horizontal.png';
const pages=['index.html','mfg.html','kb/ras-recirculating-aquaculture.html','kb/land-aquaculture-water-quality.html','q/pepper-leaf-curling.html','kb/pepper-leaf-curling-f99ce6.html'];
const oauthPages=['oauth/index.html','oauth/privacy/index.html'];
const channelPage='channel.html';
const deployHtmlPages=execFileSync('git',['ls-files','*.html'],{cwd:root,encoding:'utf8'})
  .trim().split(/\r?\n/).filter(Boolean)
  .filter(file=>!/(^|\/)(worker|node_modules|tests?|backup|archive|private|supabase)(\/|$)/i.test(file))
  .filter(file=>/<head(?:\s|>)/i.test(read(file)));
let passed=0;function test(name,fn){try{fn();passed++}catch(error){error.message=name+': '+error.message;throw error}}
test('approved favicon asset exists',()=>assert.ok(fs.existsSync(path.join(root,asset))));
test('every deployed public HTML document declares the approved favicon',()=>{
  assert.ok(deployHtmlPages.length>=190,'unexpected public HTML inventory');
  deployHtmlPages.forEach(file=>assert.match(read(file),new RegExp('<link rel="icon" href="'+href.replaceAll('/','\\/')+'">'),file));
});
test('every deployed favicon declaration resolves to the approved asset',()=>deployHtmlPages.forEach(file=>{
  const targets=[...read(file).matchAll(/<link rel="icon" href="([^"]+)">/g)].map(match=>match[1]);
  assert.ok(targets.length>=1,file);targets.forEach(target=>assert.equal(target,href,file));
  assert.ok(fs.existsSync(path.join(root,href.replace(/^\//,''))),file);
}));
test('release smoke pages declare the approved favicon',()=>pages.forEach(file=>assert.match(read(file),new RegExp('<link rel="icon" href="'+href.replaceAll('/','\\/')+'">'),file)));
test('favicon declarations resolve to an existing public file',()=>pages.forEach(file=>{const target=read(file).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.ok(target);assert.ok(fs.existsSync(path.join(root,target.replace(/^\//,''))),file)}));
test('release favicon never uses an external or local-only URL',()=>pages.forEach(file=>{const target=read(file).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.doesNotMatch(target,/^(?:https?:)?\/\/|localhost|127\.0\.0\.1/i)}));
test('OAuth public pages declare the approved favicon',()=>oauthPages.forEach(file=>assert.match(read(file),new RegExp('<link rel="icon" href="'+href.replaceAll('/','\\/')+'">'),file)));
test('OAuth favicon declarations resolve to the approved asset',()=>oauthPages.forEach(file=>{const target=read(file).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.equal(target,href);assert.ok(fs.existsSync(path.join(root,target.replace(/^\//,''))),file)}));
test('community channel declares the approved existing favicon',()=>{const target=read(channelPage).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.equal(target,href);assert.ok(fs.existsSync(path.join(root,target.replace(/^\//,''))))});
process.stdout.write('Phase 5C favicon contracts: '+passed+'/'+passed+' PASS\n');
