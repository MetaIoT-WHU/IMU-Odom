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
  function announce(text) { $('#announcer').textContent = text; }
  const auxiliaryLabel = scene => scene.legend.find(entry => entry.id === 'aux').label;
  function playerLegend(entries) {
    const list = el('ul', 'player-legend');
    list.setAttribute('aria-label', '轨迹图例');
    for (const entry of entries) {
      const label = el('li', '', entry.label);
      label.style.setProperty('--stroke', entry.color);
      list.append(label);
    }
    return list;
  }
  function makePlayer(host,item) {
    host._player?.destroy();
    host.replaceChildren();
    host._player=new window.TrackReplay(host,item,playerLegend(item.legend));
  }
  function pressed(buttons, current) {
    buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === current)));
  }
  const heroButtons = new Map();
  function selectHero(id) {
    pressed(heroButtons, id);
    const label=$('.live-label'); label.replaceChildren(el('i'),document.createTextNode(data.scenes[id].location));
    makePlayer($('#hero-player'), data.scenes[id]);
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
    const text = el('div'); text.append(el('h3', '', s.title), el('p', '', s.subtitle+' · '+s.splitLabel));
    heading.append(text);
    text.append(el('p','assistance-label',auxiliaryLabel(s)));
    const host = el('div');
    const meta = el('div', 'card-meta');
    meta.append(el('span','',`${s.anchorCount} 个${s.gnssAdded?' GNSS ':'视觉'}点 · 位置均方根误差 ${s.errorBefore.toFixed(2)} → ${s.errorAfter.toFixed(2)} 米`)); 
    card.append(heading, host, meta); $('#small-grid').append(card); makePlayer(host, s);
  });
  const largeButtons = new Map();
  function selectLarge(id) {
    const s = data.scenes[id]; pressed(largeButtons, id);
    $('#large-name').textContent = s.title;

    $('#large-badge').textContent = auxiliaryLabel(s);
    $('#large-badge').className = `pill ${s.gnssAdded ? 'assisted' : ''}`;
    const toggle=$('#large-history');
    toggle.hidden=!s.history;
    if(s.history){
      let historical=false;
      toggle.setAttribute('aria-pressed','false'); toggle.textContent='查看历史回放';
      toggle.onclick=()=>{
        historical=!historical;
        toggle.setAttribute('aria-pressed',String(historical));toggle.textContent=historical?'返回三轨对照':'查看历史回放';
        $('#large-name').textContent=historical?s.history.title:s.title;
        $('#large-badge').textContent=historical?s.history.legend[1].label:auxiliaryLabel(s);
        makePlayer($('#large-player'),historical?{...s.history,mapLayer:s.mapLayer}:s);
      };
    }
    makePlayer($('#large-player'), s);
  }
  data.large.forEach(id => {
    const s = data.scenes[id]; const b = el('button', 'large-tab'); b.type = 'button';
    const img = el('img'); img.src = s.poster; img.alt = ''; img.loading = 'lazy'; img.width = 640; img.height = 360;
    const caption = el('span', 'tab-caption'); caption.append(el('strong', '', s.shortTitle), el('small', '', s.location));
    b.append(img, caption); b.addEventListener('click', () => selectLarge(id));
    largeButtons.set(id, b); $('#large-tabs').append(b);
  });
  selectLarge(data.large[0]);
  makePlayer($('#eastlake-player'),data.ultra);
  let galleryFilter = '全部'; let galleryQuery = ''; let selectedGallery = data.gallery[0];
  const galleryFilterButtons = new Map(); let galleryVisible = [...data.gallery];
  let galleryCanvas = null;
  let galleryReplay = false;
  $('#gallery-mode').addEventListener('click',()=>{
    galleryReplay=!galleryReplay; selectGallery(selectedGallery);
  });
  function selectGallery(id, redraw = true) {
    selectedGallery = id; const s = data.scenes[id];
    $('#gallery-category').textContent = s.location;
    $('#gallery-name').textContent = s.title;

    $('#gallery-note').textContent = s.splitLabel+' · 基础推理仅使用手表惯性传感器。展示坐标用参考轨迹对齐。'+s.note+'辅助点与真值同源。yaw 为行进航向。';
    const host=$('#gallery-player');
    if(galleryCanvas){galleryCanvas.destroy();galleryCanvas=null;}
    if(host._player){host._player.destroy();host._player=null;host.replaceChildren();}
    $('#gallery-mode').textContent=galleryReplay?'看坐标图':s.camera?'看实景回放':'看轨迹回放';
    $('#gallery-mode').setAttribute('aria-pressed',String(galleryReplay));
    $('#gallery-animation').closest('label').hidden=galleryReplay;
    if(galleryReplay) makePlayer(host,s);
    else galleryCanvas = new window.TrajectoryCanvas(host,s,$('#gallery-animation').checked);
    if (redraw) drawGalleryList();
    announce(`已选择${s.title}`);
  }
  function drawGalleryList() {
    const host = $('#gallery-list'); host.replaceChildren();
    galleryVisible = data.gallery.filter(id => {
      const s = data.scenes[id];
      return (galleryFilter === '全部' || s.location === galleryFilter || (galleryFilter==='视觉辅助'&&!s.gnssAdded) || (galleryFilter==='GNSS 辅助'&&s.gnssAdded)) && `${s.title}${s.subtitle}${s.description}${auxiliaryLabel(s)}`.includes(galleryQuery);
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
      const text = el('span'); text.append(el('strong', '', s.title), el('small', '', auxiliaryLabel(s)));
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
    selectGallery(galleryVisible[(i + delta + galleryVisible.length) % galleryVisible.length], true);
  }
  $('#gallery-prev').addEventListener('click', () => moveGallery(-1));
  $('#gallery-next').addEventListener('click', () => moveGallery(1));
  selectGallery(selectedGallery);
  const sparseTabs = new Map();
  const sparseReplay = new window.SparseReplay($('#gnss-player'));
  function selectSparse(clip) {
    pressed(sparseTabs, clip.id);
    $('#gnss-name').textContent = clip.title;
    $('#gnss-result').textContent = `${clip.count} 个 GNSS 观测点 · 位置均方根误差 ${clip.before.toFixed(2)} → ${clip.after.toFixed(2)} 米`;
    sparseReplay.select(clip, data.scenes[clip.route]);
  }
  for (const clip of data.sparse) {
    const button = el('button', '', clip.title);
    button.type = 'button';
    button.onclick = () => selectSparse(clip);
    $('#gnss-tabs').append(button);
    sparseTabs.set(clip.id, button);
  }
  selectSparse(data.sparse[0]);
  let vivoFilter = '全部'; let selectedVivo = data.vivo[0].id; let vivoVisible = [...data.vivo];
  const vivoButtons = new Map();
  function selectVivo(id, redraw = true) {
    selectedVivo = id;
    const s = data.vivo.find(s => s.id === id);
    $('#vivo-name').textContent = `场景 ${id} · 预测轨迹`;
    makePlayer($('#vivo-player'), s);
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
      b.addEventListener('click', () => selectVivo(s.id, true)); host.append(b);
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
    selectVivo(vivoVisible[(i + delta + vivoVisible.length) % vivoVisible.length].id, true);
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
