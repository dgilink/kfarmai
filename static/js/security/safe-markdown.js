(function initSafeMarkdown(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KFSafeMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSafeMarkdown() {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function safeHref(value) {
    const href = String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
    if (!href) return '';
    if (/^(https?:|mailto:)/i.test(href)) return href;
    if (/^(\/|\.\/|\.\.\/|#)/.test(href)) return href;
    return '';
  }

  function renderEmphasis(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  }

  function renderInline(value) {
    const source = String(value == null ? '' : value);
    const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    let html = '';
    let cursor = 0;
    let match;

    while ((match = linkPattern.exec(source))) {
      html += renderEmphasis(source.slice(cursor, match.index));
      const href = safeHref(match[2]);
      if (href) {
        html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderEmphasis(match[1])}</a>`;
      } else {
        html += renderEmphasis(match[1]);
      }
      cursor = match.index + match[0].length;
    }

    return html + renderEmphasis(source.slice(cursor));
  }

  function render(markdown) {
    const lines = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let listType = '';

    function closeList() {
      if (listType) output.push(`</${listType}>`);
      listType = '';
    }

    for (const line of lines) {
      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const item = unordered || ordered;
      const nextListType = unordered ? 'ul' : ordered ? 'ol' : '';

      if (item) {
        if (listType !== nextListType) {
          closeList();
          listType = nextListType;
          output.push(`<${listType}>`);
        }
        output.push(`<li>${renderInline(item[1])}</li>`);
        continue;
      }

      closeList();
      if (!line.trim()) continue;
      output.push(`<p>${renderInline(line)}</p>`);
    }

    closeList();
    return output.join('');
  }

  return Object.freeze({ escapeHtml, safeHref, render });
});
