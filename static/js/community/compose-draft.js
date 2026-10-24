(function (global) {
  'use strict';

  const DATABASE = 'kfarmai-compose-drafts';
  const STORE = 'drafts';
  const NOTICE = '이 기기의 브라우저에 임시 저장됩니다. 다른 계정·기기에서는 복원되지 않습니다.';

  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('draft database unavailable'));
    });
  }

  async function transaction(mode, operation) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = operation(tx.objectStore(STORE));
        let value;
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || new Error('draft transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('draft transaction failed'));
      });
    } finally {
      db.close();
    }
  }

  function fieldValues(ids) {
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)?.value || '']));
  }

  function show(anchor, message, failed) {
    if (!anchor) return;
    let element = anchor.parentElement?.querySelector('[data-compose-draft-status]');
    if (!element) {
      element = document.createElement('p');
      element.dataset.composeDraftStatus = '';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.style.cssText = 'font-size:12px;line-height:1.5;margin:8px 0;color:#525252';
      anchor.insertAdjacentElement('beforebegin', element);
    }
    element.textContent = message;
    element.style.color = failed ? '#da1e28' : '#525252';
  }

  async function create(options) {
    if (!options.ownerId || !options.kind || !options.form) throw new Error('draft owner/form required');
    const key = `${options.ownerId}:${options.kind}`;
    let row = await transaction('readonly', store => store.get(key));
    let timer = null;
    let dirty = false;
    let saving = Promise.resolve();
    let removed = false;
    const anchor = options.anchor;
    const isActive = () => !removed && (!options.active || options.active());

    function snapshot() {
      const current = options.capture();
      return {
        key, ownerId: options.ownerId, kind: options.kind,
        draftId: row?.draftId || global.crypto.randomUUID(),
        updatedAt: Date.now(), fields: fieldValues(options.fields || []),
        files: Array.from(current.files || []),
        tags: Array.from(current.tags || []),
        existingUrls: Array.from(current.existingUrls || []),
        receipts: row?.receipts || {}, submission: row?.submission || null,
      };
    }

    function saveNow() {
      if (!isActive()) return saving;
      clearTimeout(timer);
      saving = saving.catch(() => {}).then(async () => {
        const next = snapshot();
        try {
          await transaction('readwrite', store => store.put(next));
          row = next;
          dirty = false;
          show(anchor, `초안 저장됨 · ${NOTICE}`, false);
        } catch (error) {
          dirty = true;
          show(anchor, '초안을 저장하지 못했습니다. 저장 공간을 확인하고 이 화면을 닫지 마세요.', true);
          throw error;
        }
      });
      return saving;
    }

    function schedule() {
      if (!isActive()) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => { saveNow().catch(() => {}); }, 180);
    }

    async function restore() {
      if (!row || row.ownerId !== options.ownerId) return false;
      await options.open();
      for (const id of options.fields || []) {
        const element = document.getElementById(id);
        if (element) element.value = row.fields?.[id] || '';
      }
      options.apply(row);
      show(anchor, `초안을 복원했습니다. ${NOTICE}`, false);
      return true;
    }

    async function upload(file, slot, purpose, postId, transfer) {
      if (!(file instanceof Blob)) throw new Error('image draft missing');
      const digest = [...new Uint8Array(await global.crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      const receiptKey = `${purpose}:${postId || ''}:${slot}:${digest}`;
      const prior = row?.receipts?.[receiptKey];
      if (prior?.path?.startsWith(options.ownerId + '/') && prior.contentType === 'image/webp') return prior;
      const received = await transfer();
      if (!received?.path?.startsWith(options.ownerId + '/') || received.contentType !== 'image/webp' || !received.url) {
        throw new Error('unbound upload receipt');
      }
      row = { ...(row || snapshot()), receipts: { ...(row?.receipts || {}), [receiptKey]: received } };
      await saveNow();
      return received;
    }

    async function beginSubmission(payload) {
      row = { ...(row || snapshot()), submission: {
        userId: options.ownerId, title: payload.title, content: payload.content,
        startedAt: new Date().toISOString(), fields: fieldValues(options.fields || []),
        fileSignature: (options.capture().files || []).map(file => `${file.name}:${file.size}:${file.lastModified}`),
      } };
      await saveNow();
    }

    async function reconcile(client) {
      if (!row?.submission) return false;
      const intent = row.submission;
      if (intent.userId !== options.ownerId) throw new Error('draft owner mismatch');
      const since = new Date(new Date(intent.startedAt).getTime() - 120000).toISOString();
      const { data, error } = await client.from('posts').select('id,title,content,created_at')
        .eq('user_id', options.ownerId).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(50);
      if (error || !Array.isArray(data) || data.length >= 50) {
        show(anchor, '게시 결과를 확인할 수 없습니다. 중복 등록 방지를 위해 다시 게시하지 마세요.', true);
        throw error || new Error('submission state uncertain');
      }
      if (data.some(post => post.title === intent.title && post.content === intent.content)) {
        const fields = fieldValues(options.fields || []);
        const files = (options.capture().files || []).map(file => `${file.name}:${file.size}:${file.lastModified}`);
        if (JSON.stringify(fields) !== JSON.stringify(intent.fields) ||
            JSON.stringify(files) !== JSON.stringify(intent.fileSignature)) {
          show(anchor, '이전 글은 등록됐지만 이후 수정한 초안이 남아 있습니다. 내용을 복사·확인한 뒤 새 글로 작성하세요.', true);
          throw new Error('previous post confirmed; newer draft retained');
        }
        return true;
      }
      row = { ...row, submission: null };
      await saveNow();
      return false;
    }

    async function clearAfterSuccess() {
      clearTimeout(timer);
      await saving.catch(() => {});
      await transaction('readwrite', store => store.delete(key));
      row = null;
      dirty = false;
      show(anchor, '게시 내용이 서버에 저장되어 이 기기의 초안을 정리했습니다.', false);
    }

    const onChange = event => {
      if (options.fields?.includes(event.target?.id) || event.target?.closest?.('[data-compose-draft]')) schedule();
    };
    options.form.addEventListener('input', onChange);
    options.form.addEventListener('change', onChange);
    const onVisibility = () => { if (document.visibilityState === 'hidden' && dirty) saveNow().catch(() => {}); };
    const onUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', onVisibility);
    global.addEventListener('beforeunload', onUnload);
    show(anchor, NOTICE, false);

    return {
      saveNow, schedule, restore, upload, beginSubmission, reconcile, clearAfterSuccess,
      get draftId() { return row?.draftId || null; },
      destroy() {
        removed = true;
        clearTimeout(timer);
        options.form.removeEventListener('input', onChange);
        options.form.removeEventListener('change', onChange);
        document.removeEventListener('visibilitychange', onVisibility);
        global.removeEventListener('beforeunload', onUnload);
      },
    };
  }

  global.KFComposeDraft = Object.freeze({ create });
})(window);
