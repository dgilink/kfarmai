(function (global) {
  'use strict';

  const DB_NAME = 'kfarmai-question-drafts';
  const STORE_NAME = 'images';
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('draft_db_unavailable'));
    });
  }

  async function withStore(mode, operation) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('draft_store_failed'));
      });
    } finally {
      db.close();
    }
  }

  function extensionFor(type) {
    return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  }

  function genericName(type, prefix = 'question-image') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(type)}`;
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in global) return createImageBitmap(file, { imageOrientation: 'from-image' });
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_decode_failed')); };
      image.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('image_encode_failed')),
      type,
      quality
    ));
  }

  async function prepareForUpload(file, options = {}) {
    if (!(file instanceof Blob) || !/^image\/(?:jpeg|png|webp)$/i.test(file.type || '')) {
      throw new Error('invalid_image_file');
    }
    const image = await decodeImage(file);
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) throw new Error('image_decode_failed');
    const maxDimension = Math.min(Math.max(Number(options.maxDimension) || 2560, 640), 4096);
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: file.type === 'image/png' });
    if (!context) throw new Error('image_canvas_unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (typeof image.close === 'function') image.close();
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasBlob(canvas, outputType, Number(options.quality) || 0.9);
    return new File([blob], genericName(outputType), { type: outputType, lastModified: Date.now() });
  }

  async function saveImage(file) {
    const safeFile = await prepareForUpload(file);
    const id = global.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await withStore('readwrite', store => store.put({
      id,
      blob: safeFile,
      type: safeFile.type,
      createdAt: Date.now()
    }));
    return id;
  }

  async function loadImage(id) {
    if (!id) return null;
    const row = await withStore('readonly', store => store.get(String(id)));
    if (!row?.blob || Date.now() - Number(row.createdAt || 0) > MAX_AGE_MS) {
      if (row) await removeImage(id);
      return null;
    }
    return new File([row.blob], genericName(row.type || row.blob.type, 'ai-draft'), {
      type: row.type || row.blob.type || 'image/jpeg',
      lastModified: Date.now()
    });
  }

  async function removeImage(id) {
    if (!id) return;
    await withStore('readwrite', store => store.delete(String(id)));
  }

  async function prune() {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          if (Date.now() - Number(item.value?.createdAt || 0) > MAX_AGE_MS) item.delete();
          item.continue();
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('draft_prune_failed'));
      });
    } finally {
      db.close();
    }
  }

  global.KFQuestionDraft = Object.freeze({ prepareForUpload, saveImage, loadImage, removeImage, prune });
})(window);
