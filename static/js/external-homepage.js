(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KFExternalLinks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SENTINELS = new Set(['미확인', '없음', '-', '정보 없음', '해당 없음']);
  const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;

  function hasValidHostname(url) {
    if (!url.hostname || !url.hostname.includes('.')) return false;
    return url.hostname.split('.').every(label =>
      label.length >= 1 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    );
  }

  function normalizeExternalHomepage(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || SENTINELS.has(text.toLowerCase())) return null;
    if (/^(?:javascript|data|file|blob|vbscript):/i.test(text)) return null;

    let candidate = text;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
      if (!BARE_DOMAIN.test(candidate)) return null;
      candidate = `https://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol) || !hasValidHostname(parsed)) return null;
      return candidate;
    } catch {
      return null;
    }
  }

  return { normalizeExternalHomepage };
});
