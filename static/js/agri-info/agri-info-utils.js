(function(){
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const escapeAttr = value => escapeHtml(value).replace(/'/g, '&#39;');

  function displayDate(value, fallback = '게시일 확인 중'){
    if(!value)return fallback;
    const text = String(value);
    const date = new Date(text);
    if(!Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)){
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    return text;
  }

  function tagBadges(tags = []){
    return (tags || []).slice(0, 3).map(tag => `<span class="agri-badge">${escapeHtml(tag)}</span>`).join('');
  }

  function youtubeThumbnail(videoId, fallback){
    return fallback || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  }

  function youtubeEmbed(videoId){
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=0&rel=0&modestbranding=1`;
  }

  function videoBadge(item){
    const type = item?.sourceType || '';
    if(type.startsWith('overseas'))return '<span class="agri-badge overseas">해외 참고</span>';
    if(type === 'domestic_official')return '<span class="agri-badge">국내 공식</span>';
    return '<span class="agri-badge">공개 영상</span>';
  }

  window.KFAgriInfoUtils = {
    escapeHtml,
    escapeAttr,
    displayDate,
    tagBadges,
    youtubeThumbnail,
    youtubeEmbed,
    videoBadge
  };

  window.escHtml = window.escHtml || escapeHtml;
  window.escAttr = window.escAttr || escapeAttr;
})();
