(function(){
  const DATA_URL = 'data/agri-info/agri-videos.json';
  let pointerState = { x: 0, y: 0 };

  function u(){
    return window.KFAgriInfoUtils;
  }

  async function loadAgriVideos(){
    const section = document.getElementById('agriVideoSection');
    const hero = document.getElementById('agriVideoHero');
    const list = document.getElementById('agriVideoList');
    if(!section || !hero || !list)return;

    try{
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if(!res.ok)throw new Error('video data unavailable');
      const items = await res.json();
      const videos = (Array.isArray(items) ? items : [])
        .filter(item => item.status === 'active' && item.platform === 'youtube' && item.videoId);
      if(!videos.length){
        section.hidden = true;
        return;
      }
      section.hidden = false;
      hero.innerHTML = agriVideoHeroHtml(videos[0]);
      list.innerHTML = videos.map(item => agriVideoCardHtml(item)).join('');
    }catch(error){
      console.warn('농업 영상 데이터를 불러오지 못했습니다.', error?.message);
      section.hidden = true;
    }
  }

  function agriVideoHeroHtml(item){
    const utils = u();
    const thumb = utils.youtubeThumbnail(item.videoId, item.thumbnailUrl);
    const overseasNote = String(item.sourceType || '').startsWith('overseas')
      ? '<div class="agri-source-note">해외 영상은 국내 품종, 기후, 작형과 다를 수 있으므로 참고용으로 확인하세요.</div>'
      : '';
    return `<article class="agri-video-hero">
      <div class="agri-video-media" role="button" tabindex="0" onclick="playAgriVideo('${utils.escapeAttr(item.videoId)}','hero')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();playAgriVideo('${utils.escapeAttr(item.videoId)}','hero');}">
        <img src="${utils.escapeAttr(thumb)}" alt="${utils.escapeAttr(item.title)} 썸네일" loading="lazy">
        <button class="agri-video-play" type="button" aria-label="영상 재생">▶</button>
      </div>
      <div class="agri-video-body">
        <div class="agri-card-title">${utils.escapeHtml(item.title)}</div>
        <div class="agri-meta">${utils.escapeHtml(item.channelName || '공개 채널')}</div>
        <div class="agri-date">게시일: ${utils.escapeHtml(utils.displayDate(item.publishedAt))}</div>
        <div class="agri-badges">${utils.videoBadge(item)}${utils.tagBadges(item.tags)}</div>
        <a class="agri-source-link" href="${utils.escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 영상 보기</a>
      </div>
      ${overseasNote}
    </article>`;
  }

  function agriVideoCardHtml(item){
    const utils = u();
    const thumb = utils.youtubeThumbnail(item.videoId, item.thumbnailUrl);
    return `<article class="agri-video-card">
      <div class="agri-video-media" role="button" tabindex="0" data-video-id="${utils.escapeAttr(item.videoId)}" onpointerdown="agriVideoPointerDown(event)" onpointerup="agriVideoPointerUp(event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();playAgriVideo('${utils.escapeAttr(item.videoId)}','hero');}">
        <img src="${utils.escapeAttr(thumb)}" alt="${utils.escapeAttr(item.title)} 썸네일" loading="lazy">
        <button class="agri-video-play" type="button" aria-label="영상 재생">▶</button>
      </div>
      <div class="agri-video-body">
        <div class="agri-card-title">${utils.escapeHtml(item.title)}</div>
        <div class="agri-meta">${utils.escapeHtml(item.channelName || '공개 채널')}</div>
        <div class="agri-date">게시일: ${utils.escapeHtml(utils.displayDate(item.publishedAt))}</div>
        <div class="agri-badges">${utils.videoBadge(item)}</div>
      </div>
    </article>`;
  }

  function agriVideoPointerDown(event){
    pointerState = { x: event.clientX || 0, y: event.clientY || 0 };
  }

  function agriVideoPointerUp(event){
    const el = event.currentTarget;
    const movedX = Math.abs((event.clientX || 0) - pointerState.x);
    const movedY = Math.abs((event.clientY || 0) - pointerState.y);
    if(movedX > 10 || movedY > 10)return;
    playAgriVideo(el.dataset.videoId, 'hero');
  }

  function playAgriVideo(videoId, target = 'hero'){
    const hero = document.getElementById('agriVideoHero');
    if(!hero || !videoId)return;
    const media = hero.querySelector('.agri-video-media');
    if(!media)return;
    media.innerHTML = `<iframe src="${u().escapeAttr(u().youtubeEmbed(videoId))}" title="농업 영상 재생" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }

  window.KFAgriVideos = {
    loadAgriVideos,
    playAgriVideo
  };

  window.loadAgriVideos = loadAgriVideos;
  window.playAgriVideo = playAgriVideo;
  window.agriVideoPointerDown = agriVideoPointerDown;
  window.agriVideoPointerUp = agriVideoPointerUp;
})();
