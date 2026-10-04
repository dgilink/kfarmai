'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const asset='static/kfarmai-logo-horizontal.png';const href='/static/kfarmai-logo-horizontal.png';
const pages=['index.html','mfg.html','kb/ras-recirculating-aquaculture.html','kb/land-aquaculture-water-quality.html','q/pepper-leaf-curling.html','kb/pepper-leaf-curling-f99ce6.html'];
let passed=0;function test(name,fn){try{fn();passed++}catch(error){error.message=name+': '+error.message;throw error}}
test('approved favicon asset exists',()=>assert.ok(fs.existsSync(path.join(root,asset))));
test('release smoke pages declare the approved favicon',()=>pages.forEach(file=>assert.match(read(file),new RegExp('<link rel="icon" href="'+href.replaceAll('/','\\/')+'">'),file)));
test('favicon declarations resolve to an existing public file',()=>pages.forEach(file=>{const target=read(file).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.ok(target);assert.ok(fs.existsSync(path.join(root,target.replace(/^\//,''))),file)}));
test('release favicon never uses an external or local-only URL',()=>pages.forEach(file=>{const target=read(file).match(/<link rel="icon" href="([^"]+)">/)?.[1]||'';assert.doesNotMatch(target,/^(?:https?:)?\/\/|localhost|127\.0\.0\.1/i)}));
process.stdout.write('Phase 5C favicon contracts: '+passed+'/'+passed+' PASS\n');
