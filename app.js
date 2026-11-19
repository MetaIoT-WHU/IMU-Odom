/* Classic scripts deliberately support double-clicked file:// pages. */
(() => {
  'use strict';
  const data = window.SHOWCASE;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>'
  };
  const fmt = (s) => {
    if (!Number.isFinite(s)) return '00:00';
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };
  const players = new Set();
  let theater = null;
  function announce(text) { $('#announcer').textContent = text; }
  function makePlayer(host, item, opts = {}) {
    opts = {autoplay:true, ...opts};
    if (host._player) {
      host._player.destroy();
      host.replaceChildren();
    }
    const root = el('div', 'player');
    const frame = el('div', 'video-frame');
    const video = el('video');
    video.poster = item.poster;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute('muted','');
    video.setAttribute('playsinline','');
    video.preload = opts.autoplay ? 'metadata' : 'none';
    video.setAttribute('aria-label', `${item.title}，动态轨迹视频`);
    video.controls = false;
    frame.append(video);
    const hint = el('span', 'playing-indicator', '双击画面放大');
    frame.append(hint);
    const bar = el('div', 'player-controls');
    function button(label, icon, cls = '') {
      const b = el('button', `control-btn ${cls}`);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      if (icon) b.innerHTML = icon;
      bar.append(b);
      return b;
    }
    const play = button('播放', icons.play, 'play-btn');
    const time = el('span', 'player-time', `00:00 / ${fmt(item.duration)}`);
    bar.append(time);
    const seek = el('input', 'seek');
    seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.step = 1; seek.value = 0;
    seek.setAttribute('aria-label', '播放进度');
    seek.setAttribute('aria-valuetext', '00:00');
    bar.append(seek);
    const rate = button('切换播放速度，当前一倍', null, 'text-control');
    rate.textContent = '1×';
    let highQuality = false;
    let quality;
    if (item.hd) {
      quality = button('切换到 4K 超清', null, 'quality');
      quality.textContent = '高清';
      quality.setAttribute('aria-pressed', 'false');
    }
    const expand = button('放大观看', icons.expand);
    const close = el('button', 'theater-close', '关闭放大 ×');
    close.setAttribute('aria-label', '关闭放大');
    root.append(frame, bar, close);
    host.append(root);
    const state = {root, video, item, destroy, resume:()=>{if(visible&&!manuallyPaused)video.play().catch(()=>{});}};
    host._player = state;
    players.add(state);
    let savedTime = 0;
    let pendingSeek = false;
    let resumeAfterLoad = false;
    let errorBox;
    let desiredSrc = item.src;
    let manuallyPaused = false;
    let visible = false;
    function load() {
      if (!video.getAttribute('src')) video.src = desiredSrc;
    }
    function toggle() {
      load();
      if (video.paused) {
        manuallyPaused = false;
        video.play().catch(() => {});
      } else { manuallyPaused = true;video.pause(); }
    }
    play.addEventListener('click', toggle);
    video.addEventListener('click', toggle);
    video.addEventListener('play', () => {
      play.innerHTML = icons.pause;
      play.setAttribute('aria-label', '暂停'); play.title = '暂停';
    });
    video.addEventListener('pause', () => {
      play.innerHTML = icons.play;
      play.setAttribute('aria-label', '播放'); play.title = '播放';
    });
    function update() {
      const duration = Number.isFinite(video.duration) ? video.duration : item.duration;
      time.textContent = `${fmt(video.currentTime)} / ${fmt(duration)}`;
      seek.value = duration ? Math.round(video.currentTime / duration * 1000) : 0;
      seek.style.setProperty('--played', `${Number(seek.value) / 10}%`);
      seek.setAttribute('aria-valuetext', `${fmt(video.currentTime)}，共 ${fmt(duration)}`);
    }
    video.addEventListener('timeupdate', update);
    video.addEventListener('loadedmetadata', () => {
      if (pendingSeek) {
        video.currentTime = Math.min(savedTime, video.duration || savedTime);
        pendingSeek = false;
      }
      if (resumeAfterLoad) { video.play().catch(() => {}); resumeAfterLoad = false; }
      update();
    });
    seek.addEventListener('input', () => {
      load();
      const t = Number(seek.value) / 1000 * (Number.isFinite(video.duration) ? video.duration : item.duration);
      if (video.readyState >= 1) video.currentTime = t;
      else { savedTime = t; pendingSeek = true; }
      seek.style.setProperty('--played', `${Number(seek.value) / 10}%`);
    });
    const rates = [1, 0.5, 1.5, 2];
    let rateIndex = 0;
    rate.addEventListener('click', () => {
      rateIndex = (rateIndex + 1) % rates.length;
      video.playbackRate = rates[rateIndex];
      rate.textContent = `${rates[rateIndex]}×`;
      rate.setAttribute('aria-label', `切换播放速度，当前 ${rates[rateIndex]} 倍`);
    });
    if (quality) quality.addEventListener('click', () => {
      savedTime = video.currentTime; pendingSeek = true; resumeAfterLoad = !video.paused;
      highQuality = !highQuality;
      desiredSrc = highQuality ? item.hd : item.src;
      video.src = desiredSrc;
      video.load();
      quality.textContent = highQuality ? '4K' : '高清';
      quality.title = highQuality ? '切换到高清' : '切换到 4K 超清';
      quality.setAttribute('aria-label', quality.title);
      quality.setAttribute('aria-pressed', String(highQuality));
      if (errorBox) { errorBox.remove(); errorBox = null; }
    });
    function closeTheater() {
      if (theater === root) {
        root.classList.remove('theater'); root.removeAttribute('role'); root.removeAttribute('aria-modal');
        theater = null; document.body.style.overflow = ''; expand.focus();
      }
    }
    async function fullscreen() {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (root.requestFullscreen) {
        try { await root.requestFullscreen(); return; } catch (_) { /* local browser fallback */ }
      }
      if (theater === root) { closeTheater(); return; }
      root.classList.add('theater'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', `${item.title}，放大观看`);
      theater = root; document.body.style.overflow = 'hidden'; close.focus();
    }
    expand.addEventListener('click', fullscreen);
    video.addEventListener('dblclick', fullscreen);
    close.addEventListener('click', closeTheater);
    video.addEventListener('error', () => {
      if (errorBox) return;
      errorBox = el('div', 'player-error');
      errorBox.append(el('p', '', '暂时无法播放，请尝试用浏览器直接打开原片。'));
      const link = el('a', '', '打开视频原片 ↗'); link.href = desiredSrc; link.target = '_blank'; link.rel = 'noopener';
      errorBox.append(link); frame.append(errorBox);
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        visible = e.isIntersecting;
        if (e.isIntersecting) {
          if (opts.autoplay && !manuallyPaused && !document.hidden) {
            load(); video.play().catch(() => {});
          }
        } else video.pause();
      });
    }, {threshold: .25});
    observer.observe(root);
    function destroy() {
      observer.disconnect(); closeTheater(); video.pause();
      video.removeAttribute('src'); video.load(); players.delete(state);
    }
    return state;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) players.forEach(p => p.video.pause());
    else players.forEach(p => p.resume());
  });
  document.addEventListener('keydown', e => {
    if (!theater) return;
    if (e.key === 'Escape') theater.querySelector('.theater-close').click();
    if (e.key === 'Tab') {
      const focusables = [...theater.querySelectorAll('button,input,a')].filter(n => !n.disabled);
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  function pressed(buttons, current) {
    buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === current)));
  }
  const heroButtons = new Map();
  function selectHero(id, autoplay = true) {
    pressed(heroButtons, id);
    const label=$('.live-label'); label.replaceChildren(el('i'),document.createTextNode(`${data.scenes[id].location} ${data.scenes[id].gnssLabel}`));
    makePlayer($('#hero-player'), data.scenes[id], {autoplay});
  }
  data.hero.forEach(({id, label}) => {
    const b = el('button', '', label); b.type = 'button';
    b.addEventListener('click', () => selectHero(id));
    heroButtons.set(id, b); $('#hero-tabs').append(b);
  });
  selectHero(data.hero[0].id);
  data.small.forEach(id => {
    const s = data.scenes[id];
    const card = el('article', 'scene-card');
    const heading = el('div', 'scene-card-heading');
    const text = el('div'); text.append(el('h3', '', s.title), el('p', '', s.subtitle));
    heading.append(text, el('span', 'pill', s.quality));
    text.append(el('p','assistance-label',s.gnssAdded ? s.gnssLabel : '间歇视觉位置辅助（未加入GNSS观测）'));
    const host = el('div');
    const meta = el('div', 'card-meta');
    meta.append(el('span','',`${s.anchorCount} 个${s.gnssAdded?' GNSS ':'视觉'}点 · 位置均方根误差 ${s.errorBefore.toFixed(2)} → ${s.errorAfter.toFixed(2)} 米`)); 
    const source = el('a', '', s.hd ? '打开 4K 视频 ↗' : '打开高清视频 ↗');
    source.href = s.hd || s.src; source.target = '_blank'; source.rel = 'noopener'; meta.append(source);
    card.append(heading, host, meta); $('#small-grid').append(card); makePlayer(host, s);
  });
  const largeButtons = new Map();
  function selectLarge(id, autoplay = true) {
    const s = data.scenes[id]; pressed(largeButtons, id);
    $('#large-name').textContent = s.title;

    $('#large-badge').textContent = s.gnssLabel;
    $('#large-badge').className = `pill ${s.gnssAdded ? 'assisted' : ''}`;
    const original=$('#large-original');
    original.href=s.original;original.textContent='昨日原片 '+(s.originalGnss?'（间接性加入GNSS观测）':'（未加入GNSS观测）')+' ↗';
    makePlayer($('#large-player'), s, {autoplay});
  }
  data.large.forEach(id => {
    const s = data.scenes[id]; const b = el('button', 'large-tab'); b.type = 'button';
    const img = el('img'); img.src = s.poster; img.alt = ''; img.loading = 'lazy'; img.width = 640; img.height = 360;
    const caption = el('span', 'tab-caption'); caption.append(el('strong', '', s.shortTitle), el('small', '', s.location));
    b.append(img, caption); b.addEventListener('click', () => selectLarge(id, true));
    largeButtons.set(id, b); $('#large-tabs').append(b);
  });
  selectLarge(data.large[0]);
  let galleryFilter = '全部'; let galleryQuery = ''; let selectedGallery = data.gallery[0];
  const galleryFilterButtons = new Map(); let galleryVisible = [...data.gallery];
  let galleryCanvas = null;
  let galleryVideo = false;
  $('#gallery-mode').addEventListener('click',()=>{
    galleryVideo=!galleryVideo; selectGallery(selectedGallery);
  });
  function selectGallery(id, redraw = true) {
    selectedGallery = id; const s = data.scenes[id];
    $('#gallery-category').textContent = s.location;
    $('#gallery-name').textContent = s.title;

    $('#gallery-note').textContent = s.note+' 辅助点取自同一参考轨迹。yaw 为行进航向。';
    const host=$('#gallery-player');
    if(galleryCanvas){galleryCanvas.destroy();galleryCanvas=null;}
    if(host._player){host._player.destroy();host._player=null;host.replaceChildren();}
    $('#gallery-mode').textContent=galleryVideo?'看动态图':'看视频';
    $('#gallery-mode').setAttribute('aria-pressed',String(galleryVideo));
    $('#gallery-animation').closest('label').hidden=galleryVideo;
    if(galleryVideo) makePlayer(host,s);
    else galleryCanvas = new window.TrajectoryCanvas(host,s,$('#gallery-animation').checked);
    if (redraw) drawGalleryList();
    announce(`已选择${s.title}`);
  }
  function drawGalleryList() {
    const host = $('#gallery-list'); host.replaceChildren();
    galleryVisible = data.gallery.filter(id => {
      const s = data.scenes[id];
      return (galleryFilter === '全部' || s.location === galleryFilter || (galleryFilter==='视觉辅助'&&!s.gnssAdded) || (galleryFilter==='GNSS 辅助'&&s.gnssAdded)) && `${s.title}${s.subtitle}${s.description}${s.gnssLabel}`.includes(galleryQuery);
    });
    $('#gallery-count').textContent = `${galleryVisible.length} 条精选路线`;
    $('#gallery-prev').disabled = galleryVisible.length < 2;
    $('#gallery-next').disabled = galleryVisible.length < 2;
    $('#gallery-player').parentElement.hidden = !galleryVisible.length;
    if (!galleryVisible.length) host.append(el('p', 'gallery-empty', '未找到匹配场景，试试其他关键词。'));
    galleryVisible.forEach(id => {
      const s = data.scenes[id]; const b = el('button', 'gallery-item'); b.type = 'button';
      b.setAttribute('aria-pressed', String(id === selectedGallery));
      const number=el('span','gallery-number',String(data.gallery.indexOf(id)+1).padStart(2,'0'));
      const text = el('span'); text.append(el('strong', '', s.title), el('small', '', s.gnssAdded?'间接性加入GNSS观测':'视觉位置辅助 · 未加入GNSS观测'));
      b.append(number, text); b.addEventListener('click', () => selectGallery(id)); host.append(b);
    });
  }
  ['全部', '室外', '室内', '视觉辅助', 'GNSS 辅助'].forEach(name => {
    const count=data.gallery.filter(id=>name==='全部'||data.scenes[id].location===name||(name==='视觉辅助'&&!data.scenes[id].gnssAdded)||(name==='GNSS 辅助'&&data.scenes[id].gnssAdded)).length;
    const b = el('button', '', `${name} ${count}`); b.type = 'button';
    b.addEventListener('click', () => {
      galleryFilter = name; pressed(galleryFilterButtons, name); drawGalleryList();
      if (galleryVisible.length && !galleryVisible.includes(selectedGallery)) selectGallery(galleryVisible[0]);
    });
    galleryFilterButtons.set(name, b); $('#gallery-filters').append(b);
  });
  pressed(galleryFilterButtons, '全部');
  $('#gallery-animation').addEventListener('change', e=>galleryCanvas?.setEnabled(e.target.checked));
  $('#gallery-search').addEventListener('input', e => {
    galleryQuery = e.target.value.trim(); drawGalleryList();
    if (galleryVisible.length && !galleryVisible.includes(selectedGallery)) selectGallery(galleryVisible[0]);
  });
  function moveGallery(delta) {
    if (!galleryVisible.length) return;
    const i = galleryVisible.indexOf(selectedGallery);
    selectGallery(galleryVisible[(i + delta + galleryVisible.length) % galleryVisible.length], true, true);
  }
  $('#gallery-prev').addEventListener('click', () => moveGallery(-1));
  $('#gallery-next').addEventListener('click', () => moveGallery(1));
  selectGallery(selectedGallery);
  let vivoFilter = '全部'; let selectedVivo = data.vivo[0].id; let vivoVisible = [...data.vivo];
  const vivoButtons = new Map();
  function selectVivo(id, redraw = true, autoplay = true) {
    selectedVivo = id;
    const s = data.vivo.find(s => s.id === id);
    $('#vivo-name').textContent = `场景 ${id} · 预测轨迹`;
    makePlayer($('#vivo-player'), s, {autoplay});
    if (redraw) drawVivoList();
    announce(`已选择 VIVO 场景 ${id}，无真值`);
  }
  function drawVivoList() {
    const host = $('#vivo-list'); host.replaceChildren();
    vivoVisible = data.vivo.filter(s => vivoFilter === '全部' || s.id.startsWith(vivoFilter));
    $('#vivo-count').textContent = `${vivoVisible.length} 个场景`;
    vivoVisible.forEach(s => {
      const b = el('button', 'vivo-case', s.id); b.type = 'button';
      b.setAttribute('aria-label', `VIVO 场景 ${s.id}`);
      b.setAttribute('aria-pressed', String(s.id === selectedVivo));
      b.addEventListener('click', () => selectVivo(s.id, true, true)); host.append(b);
    });
    $('#vivo-prev').disabled = vivoVisible.length < 2;
    $('#vivo-next').disabled = vivoVisible.length < 2;
  }
  ['全部', 'A', 'B', 'C', 'D'].forEach(name => {
    const b = el('button', '', name === '全部' ? name : `${name} 组`); b.type = 'button';
    b.addEventListener('click', () => {
      vivoFilter = name; pressed(vivoButtons, name); drawVivoList();
      if (!vivoVisible.some(s => s.id === selectedVivo)) selectVivo(vivoVisible[0].id);
    });
    vivoButtons.set(name, b); $('#vivo-filters').append(b);
  });
  pressed(vivoButtons, '全部'); selectVivo(selectedVivo);
  function moveVivo(delta) {
    const i = vivoVisible.findIndex(s => s.id === selectedVivo);
    selectVivo(vivoVisible[(i + delta + vivoVisible.length) % vivoVisible.length].id, true, true);
  }
  $('#vivo-prev').addEventListener('click', () => moveVivo(-1));
  $('#vivo-next').addEventListener('click', () => moveVivo(1));
  const sections = [...document.querySelectorAll('main>section[id]')];
  const links = [...document.querySelectorAll('.site-header nav a')];
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach(a => {
      const active = a.hash === `#${visible.target.id}`;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
  }, {rootMargin:'-12% 0px -48% 0px', threshold:[0, .1, .3]});
  sections.forEach(s => navObserver.observe(s));
})();
