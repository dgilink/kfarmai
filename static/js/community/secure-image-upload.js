(function (global) {
  'use strict';
  async function upload(client, file, purpose, postId) {
    if (!client || !(file instanceof Blob) || !['create', 'edit'].includes(purpose)) throw new Error('invalid upload');
    const form = new FormData();
    form.append('file', file, file.name || 'image');
    form.append('purpose', purpose);
    if (purpose === 'edit') form.append('postId', postId);
    const { data, error } = await client.functions.invoke('secure-image-upload', { body: form });
    if (error || !data?.url || !data?.path || data.contentType !== 'image/webp') {
      throw new Error('사진 검증 또는 업로드에 실패했습니다. 파일을 확인한 뒤 다시 시도해주세요.');
    }
    return data;
  }
  global.KFSecureImageUpload = Object.freeze({ upload });
})(window);
