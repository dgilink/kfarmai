"""Local-only real Chromium IndexedDB draft round-trip; no Production API calls."""

import os
import tempfile
import functools
import http.server
import threading
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


ROOT = Path(__file__).resolve().parents[1]
server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0),
    functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)),
)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/tests/phase7hr-compose-harness.html'


def browser(profile):
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-gpu')
    options.add_argument('--user-data-dir=' + profile)
    return webdriver.Chrome(options=options)


MOUNT = r'''
const done = arguments[arguments.length - 1];
(async () => {
  window.fixtureFiles = window.fixtureFiles || [];
  window.fixtureDraft = await KFComposeDraft.create({
    ownerId: arguments[0], kind: 'create', form: document.getElementById('fixture'),
    anchor: document.getElementById('fixtureSubmit'), fields: ['fixtureTitle', 'fixtureBody'],
    capture: () => ({files: window.fixtureFiles, tags: []}),
    open: () => {}, apply: row => {window.fixtureFiles = Array.from(row.files || []);},
  });
  const restored = await window.fixtureDraft.restore();
  done({restored, title: document.getElementById('fixtureTitle').value,
    body: document.getElementById('fixtureBody').value,
    files: window.fixtureFiles.map(file => file.name), draftId: window.fixtureDraft.draftId});
})().catch(error => done({error: String(error)}));
'''


with tempfile.TemporaryDirectory(prefix='kfarmai-phase7hr-chrome-') as profile:
    driver = browser(profile)
    try:
        driver.get(URL)
        assert driver.execute_script('return !!window.KFComposeDraft')
        first = driver.execute_async_script(MOUNT, 'owner-a')
        assert first['restored'] is False, first
        saved = driver.execute_async_script(r'''
const done=arguments[arguments.length-1];
(async()=>{
  document.getElementById('fixtureTitle').value='온실 질문';
  document.getElementById('fixtureBody').value='사진 두 장의 순서를 확인합니다.';
  window.fixtureFiles=[new File([new Uint8Array([1,2,3])],'first.jpg',{type:'image/jpeg'}),
    new File([new Uint8Array([4,5,6])],'second.png',{type:'image/png'})];
  await fixtureDraft.saveNow();
  done({draftId:fixtureDraft.draftId,status:document.querySelector('[data-compose-draft-status]').textContent});
})().catch(e=>done({error:String(e)}));
''')
        assert saved['draftId'] and '저장됨' in saved['status'], saved
        driver.get(URL + '?tab=2')
        second = driver.execute_async_script(MOUNT, 'owner-b')
        assert second['restored'] is False and not second['title'], second
        driver.get(URL + '?return=1')
        restored = driver.execute_async_script(MOUNT, 'owner-a')
        assert restored['restored'] and restored['draftId'] == saved['draftId'], restored
        assert restored['title'] == '온실 질문' and restored['files'] == ['first.jpg', 'second.png'], restored
        quota = driver.execute_async_script(r'''
const done=arguments[arguments.length-1];
(async()=>{
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(store,mode,...rest){
    if(mode==='readwrite')throw new DOMException('quota','QuotaExceededError');
    return original.call(this,store,mode,...rest);
  };
  let rejected=false;
  try{await fixtureDraft.saveNow();}catch(_){rejected=true;}
  IDBDatabase.prototype.transaction=original;
  done({rejected,status:document.querySelector('[data-compose-draft-status]').textContent});
})().catch(e=>done({error:String(e)}));
''')
        assert quota['rejected'] and '저장하지 못했습니다' in quota['status'], quota
        driver.quit()
        driver = browser(profile)
        driver.get(URL + '?restart=1')
        restarted = driver.execute_async_script(MOUNT, 'owner-a')
        assert restarted['restored'] and restarted['files'] == ['first.jpg', 'second.png'], restarted
        replay = driver.execute_async_script(r'''
const done=arguments[arguments.length-1];
(async()=>{
  let attempts=0;
  const file=window.fixtureFiles[0];
  try{await fixtureDraft.upload(file,0,'create',null,async()=>{attempts++;throw Error('offline');});}catch(_){}
  const transfer=async()=>{attempts++;return {path:'owner-a/draft-fixture/photo.webp',
    url:'https://example.invalid/photo.webp',contentType:'image/webp'};};
  const first=await fixtureDraft.upload(file,0,'create',null,transfer);
  const second=await fixtureDraft.upload(file,0,'create',null,transfer);
  await fixtureDraft.beginSubmission({title:'온실 질문',content:'body-on-server'});
  done({attempts,same:first.path===second.path});
})().catch(e=>done({error:String(e)}));
''')
        assert replay == {'attempts': 2, 'same': True}, replay
        driver.get(URL + '?reconcile=1')
        intent = driver.execute_async_script(MOUNT, 'owner-a')
        assert intent['restored']
        reconciled = driver.execute_async_script(r'''
const done=arguments[arguments.length-1];
(async()=>{
  const query={eq(){return this;},gte(){return this;},order(){return this;},
    async limit(){return {data:[{title:'온실 질문',content:'body-on-server'}],error:null};}};
  const found=await fixtureDraft.reconcile({from(){return {select(){return query;}}}});
  await fixtureDraft.clearAfterSuccess();
  done(found);
})().catch(e=>done({error:String(e)}));
''')
        assert reconciled is True, reconciled
        driver.get(URL + '?cleared=1')
        cleared = driver.execute_async_script(MOUNT, 'owner-a')
        assert cleared['restored'] is False, cleared
        newer = driver.execute_async_script(r'''
const done=arguments[arguments.length-1];
(async()=>{
  document.getElementById('fixtureTitle').value='게시된 제목';
  document.getElementById('fixtureBody').value='원래 초안';
  await fixtureDraft.beginSubmission({title:'게시된 제목',content:'server body'});
  document.getElementById('fixtureBody').value='게시 뒤 새로 쓴 내용';
  await fixtureDraft.saveNow();
  const query={eq(){return this;},gte(){return this;},order(){return this;},
    async limit(){return {data:[{title:'게시된 제목',content:'server body'}],error:null};}};
  let blocked=false;
  try{await fixtureDraft.reconcile({from(){return {select(){return query;}}}});}catch(_){blocked=true;}
  done({blocked,body:document.getElementById('fixtureBody').value});
})().catch(e=>done({error:String(e)}));
''')
        assert newer == {'blocked': True, 'body': '게시 뒤 새로 쓴 내용'}, newer
        driver.get(URL + '?newer=1')
        retained = driver.execute_async_script(MOUNT, 'owner-a')
        assert retained['restored'] and retained['body'] == '게시 뒤 새로 쓴 내용', retained
    finally:
        driver.quit()
        server.shutdown()

print('PHASE7HR_COMPOSE_BROWSER_PASS')
