(async function () {
  const STATUS_KEY = 'ks-ua-planner-status-v3';
  const OVERRIDE_KEY = 'ks-ua-planner-overrides-v3';
  const FORMATS = [
    { id: 'static',        label: 'Static' },
    { id: 'carousel',      label: 'Carousel' },
    { id: 'reel',          label: 'Reel' },
    { id: 'stories-only',  label: 'Stories' },
  ];
  const STATUSES = ['draft', 'ready', 'scheduled', 'posted'];

  const state = {
    data: null,
    images: { main: [], productShots: [] },
    activeTab: 'all',
    activeFormats: new Set(),
    activePillars: new Set(),
    activeStatuses: new Set(),
    productionOnly: false,
    view: 'grid',
    statuses: loadStatuses(),
    overrides: loadOverrides(),
    pickerOpen: false,
    pickerCallback: null,
  };

  function loadStatuses() { try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); } catch { return {}; } }
  function saveStatuses() { localStorage.setItem(STATUS_KEY, JSON.stringify(state.statuses)); }
  function getStatus(id) { return state.statuses[id] || 'draft'; }
  function setStatus(id, st) {
    if (st === 'draft') delete state.statuses[id]; else state.statuses[id] = st;
    saveStatuses();
  }

  function loadOverrides() { try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); } catch { return {}; } }
  function saveOverrides() { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(state.overrides)); }
  // Override structure: { postId: { image: "filename", slides: ["f1", null, "f3"] } }
  function getEffectiveImage(post) {
    const ov = state.overrides[post.id];
    if (ov?.image) return ov.image;
    return post.image;
  }
  function getEffectiveSlideImage(post, slideIdx) {
    const ov = state.overrides[post.id];
    if (ov?.slides && ov.slides[slideIdx]) return ov.slides[slideIdx];
    const slide = post.slides?.[slideIdx];
    if (slide?.image) return slide.image;
    // Auto-detect: if slot has suggestedFile and that file exists in product-shots, use it
    if (slide?.isProductShotSlot && slide.suggestedFile && state.images.productShots.includes(slide.suggestedFile)) {
      return 'product-shots/' + slide.suggestedFile;
    }
    return null;
  }
  function setImageOverride(postId, image) {
    if (!state.overrides[postId]) state.overrides[postId] = {};
    state.overrides[postId].image = image;
    saveOverrides();
  }
  function setSlideOverride(postId, slideIdx, image) {
    if (!state.overrides[postId]) state.overrides[postId] = {};
    if (!state.overrides[postId].slides) state.overrides[postId].slides = [];
    state.overrides[postId].slides[slideIdx] = image;
    saveOverrides();
  }
  function clearOverride(postId, slideIdx) {
    if (!state.overrides[postId]) return;
    if (slideIdx == null) delete state.overrides[postId].image;
    else if (state.overrides[postId].slides) state.overrides[postId].slides[slideIdx] = null;
    saveOverrides();
  }

  // Get the "thumbnail" image to show on a tile (first available image for carousel, main image for static)
  function getThumbnail(post) {
    if (post.format === 'carousel' && post.slides) {
      for (let i = 0; i < post.slides.length; i++) {
        const img = getEffectiveSlideImage(post, i);
        if (img) return img;
      }
      return null;
    }
    return getEffectiveImage(post);
  }

  /* Fetch image listings from http.server */
  async function scanDir(path) {
    try {
      const r = await fetch(path);
      const html = await r.text();
      const matches = [...html.matchAll(/href="([^"?]+)"/g)].map(m => m[1]);
      return matches.filter(f => /\.(jpe?g|png|gif|webp|mp4|mov|webm)$/i.test(f));
    } catch { return []; }
  }
  state.images.main = await scanDir('images/');
  state.images.productShots = await scanDir('images/product-shots/');

  const r = await fetch('posts.json');
  state.data = await r.json();
  for (const p of state.data.posts) {
    p.isVideo = !!(p.image && /\.(mp4|mov|webm)$/i.test(p.image));
  }

  // Bind handlers first so a rendering error can never leave the modal un-closable.
  bindModal();
  bindView();
  bindBio();
  bindPicker();
  renderTabs();
  renderFilters();
  renderStats();
  renderAll();

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function isVideoFile(name) { return name && /\.(mp4|mov|webm)$/i.test(name); }

  function bindBio() {
    document.querySelector('.bio').textContent = 'KIND SIGMA · The Origin Collection · Italian Mazzucchelli acetate · UV400 · Available in Ukraine through Direct';
  }

  function renderTabs() {
    const tabs = $('#tabs'); tabs.innerHTML = '';
    tabs.appendChild(mkTab('all', 'All', state.data.posts.length));
    state.data.phases.forEach(ph => {
      const count = state.data.posts.filter(p => p.phase === ph.id).length;
      tabs.appendChild(mkTab(ph.id, ph.label, count));
    });
  }
  function mkTab(id, label, count) {
    const b = el('button', 'tab' + (state.activeTab === id ? ' active' : ''));
    b.dataset.tab = id;
    b.innerHTML = `${label}<span class="ct">${count}</span>`;
    b.onclick = () => { state.activeTab = id; renderTabs(); renderAll(); };
    return b;
  }

  function renderFilters() {
    const fc = $('#formatChips'); fc.innerHTML = '';
    FORMATS.forEach(f => fc.appendChild(mkChip(f.label, state.activeFormats.has(f.id), () => {
      toggleSet(state.activeFormats, f.id); renderFilters(); renderAll();
    })));
    const pc = $('#pillarChips'); pc.innerHTML = '';
    Object.entries(state.data.pillars).forEach(([id, info]) => {
      pc.appendChild(mkChip(info.label, state.activePillars.has(id), () => {
        toggleSet(state.activePillars, id); renderFilters(); renderAll();
      }, info.color));
    });
    const sc = $('#statusChips'); sc.innerHTML = '';
    STATUSES.forEach(st => sc.appendChild(mkChip(stLabel(st), state.activeStatuses.has(st), () => {
      toggleSet(state.activeStatuses, st); renderFilters(); renderAll();
    })));
    const prodChip = $('#prodChip');
    if (prodChip) {
      prodChip.classList.toggle('active', state.productionOnly);
      const count = state.data.posts.filter(p => p.productionRequired).length;
      prodChip.textContent = (state.productionOnly ? '✓ ' : '') + `Production required (${count})`;
    }
  }
  function mkChip(label, active, onClick, color) {
    const c = el('button', 'chip' + (active ? ' active' : ''), label);
    if (active && color) { c.style.background = color; c.style.borderColor = color; c.style.color = '#fff'; }
    c.onclick = onClick;
    return c;
  }
  function toggleSet(s, v) { if (s.has(v)) s.delete(v); else s.add(v); }
  function stLabel(s) { return ({ draft: 'Draft', ready: 'Ready', scheduled: 'Scheduled', posted: 'Posted' })[s]; }

  function filteredPosts() {
    return state.data.posts.filter(p => {
      if (state.activeTab !== 'all' && p.phase !== state.activeTab) return false;
      if (state.activeFormats.size && !state.activeFormats.has(p.format)) return false;
      if (state.activePillars.size && !state.activePillars.has(p.pillar)) return false;
      if (state.activeStatuses.size && !state.activeStatuses.has(getStatus(p.id))) return false;
      if (state.productionOnly && !p.productionRequired) return false;
      return true;
    }).sort((a, b) => a.order - b.order);
  }

  function renderStats() {
    const sts = $('#stats'); sts.innerHTML = '';
    const posts = state.data.posts;
    const feedPosts = posts.filter(p => p.format !== 'stories-only');
    add(sts, 'stat', `<div class="num">${feedPosts.length}</div><div class="lbl">posts</div>`);
    add(sts, 'stat', `<div class="num">${posts.filter(p => p.format === 'carousel').length}</div><div class="lbl">carousels</div>`);
    add(sts, 'stat', `<div class="num">${posts.filter(p => p.productionRequired).length}</div><div class="lbl">production</div>`);
    const posted = posts.filter(p => getStatus(p.id) === 'posted').length;
    add(sts, 'stat', `<div class="num">${posted}/${posts.length}</div><div class="lbl">published</div>`);
  }
  function add(parent, cls, html) { const e = el('div', cls); e.innerHTML = html; parent.appendChild(e); }

  function renderAll() {
    renderStats();
    if (state.view === 'grid') { $('#gridView').classList.remove('hidden'); $('#listView').classList.add('hidden'); renderGrid(); }
    else { $('#gridView').classList.add('hidden'); $('#listView').classList.remove('hidden'); renderList(); }
  }

  function renderGrid() {
    const g = $('#gridView'); g.innerHTML = '';
    const posts = filteredPosts();
    if (!posts.length) { g.innerHTML = '<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--ink-mute)">No posts match the current filters.</div>'; return; }
    posts.forEach(p => {
      try { g.appendChild(makeTile(p)); }
      catch (err) { console.error('Failed to render tile for post', p?.id, err); }
    });
  }

  function makeTile(p) {
    const isProd = p.productionRequired;
    const isStories = p.format === 'stories-only';
    const isCarousel = p.format === 'carousel';
    const thumb = getThumbnail(p);
    const t = el('div', 'tile'
      + (isStories ? ' stories-only-tile' : '')
      + (isProd && !thumb ? ' production' : '')
      + (getStatus(p.id) === 'posted' ? ' posted' : ''));
    t.dataset.id = p.id;
    t.onclick = () => openModal(p);

    if (thumb) {
      const path = thumb.includes('/') ? 'images/' + thumb : 'images/' + thumb;
      if (isVideoFile(thumb)) {
        const v = document.createElement('video');
        v.src = path; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
        v.addEventListener('mouseenter', () => v.play().catch(() => {}));
        v.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
        t.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = path; img.alt = p.title; img.loading = 'lazy';
        t.appendChild(img);
      }
    } else if (isProd) {
      const card = el('div', 'prod-card');
      const typ = el('div', 'prod-type', (p.productionType || 'production').replace('-', ' ') + ' needed');
      card.appendChild(typ);
      const title = el('div', 'prod-title', p.title);
      card.appendChild(title);
      const lbl = el('div', 'prod-label', 'Brief');
      card.appendChild(lbl);
      t.appendChild(card);
    } else if (isStories) {
      const card = el('div', 'stories-card');
      const lab = el('div', 'stories-label', 'Stories-only day');
      card.appendChild(lab);
      const ti = el('div', 'stories-title', p.title);
      card.appendChild(ti);
      t.appendChild(card);
    } else if (isCarousel) {
      // Carousel with all slides being placeholders
      const card = el('div', 'prod-card');
      card.appendChild(el('div', 'prod-type', 'carousel · ' + (p.slides?.length || 0) + ' slides'));
      card.appendChild(el('div', 'prod-title', p.title));
      card.appendChild(el('div', 'prod-label', 'Add photos'));
      t.appendChild(card);
    }

    const left = el('div', 'tile-badges');
    if (p.day) left.appendChild(badge('day', dayLabel(p.day)));
    t.appendChild(left);
    const right = el('div', 'tile-badge-right');
    if (isCarousel && p.slides?.length) right.appendChild(badge('carousel-ind', '⊞ ' + p.slides.length));
    right.appendChild(badge('format-' + p.format, fmtShort(p.format)));
    const st = getStatus(p.id);
    if (st !== 'draft') right.appendChild(badge('status-' + st, stShort(st)));
    t.appendChild(right);
    if (thumb) {
      const bot = el('div', 'tile-bottom', p.title);
      t.appendChild(bot);
    }
    return t;
  }
  function dayLabel(d) {
    if (!d) return '';
    if (d.startsWith('Drop')) return 'DROP';
    return 'D' + d;
  }
  function fmtShort(f) { return ({ static: 'STATIC', carousel: 'CAR', reel: 'REEL', 'stories-only': 'STORY' })[f] || f.toUpperCase(); }
  function stShort(s) { return ({ ready: '●', scheduled: '◐', posted: '✓' })[s]; }
  function badge(cls, txt) { return Object.assign(document.createElement('span'), { className: 'badge ' + cls, textContent: txt }); }

  function renderList() {
    const l = $('#listView'); l.innerHTML = '';
    filteredPosts().forEach(p => l.appendChild(makeRow(p)));
  }
  function makeRow(p) {
    const r = el('div', 'row' + (p.productionRequired ? ' production' : ''));
    r.onclick = () => openModal(p);
    const thumb = el('div', 'thumb');
    const thumbImg = getThumbnail(p);
    if (thumbImg) {
      const path = 'images/' + thumbImg;
      if (isVideoFile(thumbImg)) {
        const v = document.createElement('video'); v.src = path; v.muted = true; v.preload = 'metadata';
        thumb.appendChild(v);
      } else {
        const img = document.createElement('img'); img.src = path; img.loading = 'lazy';
        thumb.appendChild(img);
      }
    }
    r.appendChild(thumb);
    const info = el('div', 'info');
    const meta = el('div', 'meta-line');
    if (p.day) meta.appendChild(badge('day', dayLabel(p.day)));
    meta.appendChild(badge('format-' + p.format, fmtShort(p.format)));
    if (p.format === 'carousel') meta.appendChild(badge('carousel-ind', '⊞ ' + (p.slides?.length || 0)));
    const pillarBadge = badge('', state.data.pillars[p.pillar]?.label || p.pillar);
    pillarBadge.style.background = state.data.pillars[p.pillar]?.color || '#888';
    pillarBadge.style.color = 'white';
    meta.appendChild(pillarBadge);
    if (p.productionRequired) {
      const pb = badge('', 'PRODUCTION · ' + (p.productionType || '').replace('-', ' '));
      pb.style.background = '#C25E5E'; pb.style.color = 'white';
      meta.appendChild(pb);
    }
    const st = getStatus(p.id);
    if (st !== 'draft') meta.appendChild(badge('status-' + st, stLabel(st)));
    info.appendChild(meta);
    info.appendChild(el('h3', '', p.title));
    info.appendChild(el('div', 'caption-preview', (p.caption || '').replace(/\n/g, ' ')));
    r.appendChild(info);
    return r;
  }

  /* MODAL */
  function openModal(p) {
    const body = $('#modalBody');
    body.innerHTML = '';

    // LEFT — media (carousel slides stacked vertically, or single image)
    const wrap = el('div', 'modal-img-wrap'
      + (p.productionRequired && !getThumbnail(p) ? ' production' : '')
      + (p.format === 'stories-only' ? ' stories-only' : ''));

    if (p.format === 'carousel' && p.slides) {
      renderCarouselSlides(wrap, p);
    } else if (p.image || getEffectiveImage(p)) {
      renderSingleImage(wrap, p);
    } else if (p.productionRequired) {
      const lg = el('div', 'prod-large');
      lg.appendChild(el('div', 'lab', 'Production required'));
      lg.appendChild(el('div', 'type', (p.productionType || '').replace('-', ' ')));
      lg.appendChild(el('h3', '', p.title));
      wrap.appendChild(lg);
    } else if (p.format === 'stories-only') {
      wrap.appendChild(el('div', 'lab', 'Stories-only day'));
      wrap.appendChild(el('h3', '', p.title));
    }
    body.appendChild(wrap);

    // RIGHT — content
    const c = el('div', 'modal-content');
    c.appendChild(el('h2', 'modal-title', p.title));

    const mb = el('div', 'modal-badges');
    if (p.day) mb.appendChild(badge('day', p.day));
    mb.appendChild(badge('format-' + p.format, p.format.toUpperCase()));
    const pBadge = badge('', state.data.pillars[p.pillar]?.label || p.pillar);
    pBadge.style.background = state.data.pillars[p.pillar]?.color || '#888';
    pBadge.style.color = 'white';
    mb.appendChild(pBadge);
    const ph = state.data.phases.find(x => x.id === p.phase);
    if (ph) {
      const phB = badge('', ph.label);
      phB.style.background = ph.color; phB.style.color = 'white';
      mb.appendChild(phB);
    }
    if (p.productionRequired) {
      const prb = badge('', 'PRODUCTION · ' + (p.productionType || '').replace('-', ' '));
      prb.style.background = '#C25E5E'; prb.style.color = 'white';
      mb.appendChild(prb);
    }
    c.appendChild(mb);

    // Status picker
    const sSec = el('div', 'modal-section');
    sSec.appendChild(elInner('h4', '', 'Status'));
    const picker = el('div', 'status-picker');
    STATUSES.forEach(st => {
      const b = el('button', 'status-btn', stLabel(st));
      b.dataset.st = st; b.dataset.active = String(getStatus(p.id) === st);
      b.onclick = () => { setStatus(p.id, st); openModal(p); renderGrid(); renderStats(); };
      picker.appendChild(b);
    });
    sSec.appendChild(picker);
    c.appendChild(sSec);

    // Production brief
    if (p.productionRequired && p.productionBrief) {
      const pb = el('div', 'modal-section');
      pb.appendChild(elInner('h4', '', 'Production brief'));
      pb.appendChild(el('div', 'brief', p.productionBrief));
      c.appendChild(pb);
    }

    // Caption
    if (p.caption) {
      const cap = el('div', 'modal-section');
      cap.appendChild(elInner('h4', '', p.format === 'stories-only' ? 'Stories plan' : 'Caption (UA)'));
      cap.appendChild(el('div', 'body', p.caption));
      if (p.format !== 'stories-only') {
        const btns = el('div', 'btn-row');
        btns.appendChild(mkBtn('Copy caption + hashtags', () => copyText(p.caption + (p.hashtags?.length ? '\n\n' + p.hashtags.join(' ') : ''))));
        btns.appendChild(mkBtn('Caption only', () => copyText(p.caption), true));
        cap.appendChild(btns);
      }
      c.appendChild(cap);
    }

    // Hashtags
    if (p.hashtags?.length) {
      const h = el('div', 'modal-section');
      h.appendChild(elInner('h4', '', `Hashtags (${p.hashtags.length})`));
      const list = el('div', 'hashtag-list');
      p.hashtags.forEach(t => list.appendChild(el('span', 'hashtag', t)));
      h.appendChild(list);
      const btns = el('div', 'btn-row');
      btns.appendChild(mkBtn('Copy hashtags', () => copyText(p.hashtags.join(' '))));
      h.appendChild(btns);
      c.appendChild(h);
    }

    body.appendChild(c);
    $('#modal').classList.add('open');
  }

  function renderSingleImage(wrap, p) {
    const img = getEffectiveImage(p);
    if (img) {
      const path = 'images/' + img;
      if (isVideoFile(img)) {
        const v = document.createElement('video');
        v.src = path; v.controls = true; v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
        wrap.appendChild(v);
      } else {
        const i = document.createElement('img'); i.src = path; i.alt = p.title;
        wrap.appendChild(i);
      }
      const swap = el('button', 'swap-btn', 'Change image');
      swap.onclick = (e) => { e.stopPropagation(); openPicker((file) => { setImageOverride(p.id, file); openModal(p); renderGrid(); }); };
      wrap.appendChild(swap);
      if (state.overrides[p.id]?.image) {
        const reset = el('button', 'reset-btn', 'Reset');
        reset.onclick = (e) => { e.stopPropagation(); clearOverride(p.id, null); openModal(p); renderGrid(); };
        wrap.appendChild(reset);
      }
    }
  }

  function renderCarouselSlides(wrap, p) {
    wrap.classList.add('carousel-stack');
    p.slides.forEach((slide, idx) => {
      const slot = el('div', 'slide-slot');
      const img = getEffectiveSlideImage(p, idx);
      const head = el('div', 'slide-head');
      head.appendChild(el('span', 'slide-num', String(idx + 1)));
      head.appendChild(el('span', 'slide-label', slide.label || ('Slide ' + (idx + 1))));
      slot.appendChild(head);
      const inner = el('div', 'slide-inner');
      if (img) {
        const path = 'images/' + img;
        if (isVideoFile(img)) {
          const v = document.createElement('video'); v.src = path; v.muted = true; v.controls = true; v.preload = 'metadata';
          inner.appendChild(v);
        } else {
          const i = document.createElement('img'); i.src = path; i.alt = slide.label || '';
          inner.appendChild(i);
        }
      } else {
        const ph = el('div', 'slide-placeholder');
        if (slide.isProductShotSlot) {
          ph.innerHTML = '<div class="ps-lab">Add product shot</div><div class="ps-name">' + (slide.suggestedFile || '') + '</div>';
          if (slide.note) ph.innerHTML += '<div class="ps-note">' + slide.note + '</div>';
        } else {
          ph.textContent = slide.label || ('Slide ' + (idx + 1));
        }
        inner.appendChild(ph);
      }
      slot.appendChild(inner);
      const actions = el('div', 'slide-actions');
      const swap = el('button', 'swap-btn-sm', img ? 'Change' : 'Pick image');
      swap.onclick = (e) => { e.stopPropagation(); openPicker((file) => { setSlideOverride(p.id, idx, file); openModal(p); renderGrid(); }); };
      actions.appendChild(swap);
      if (state.overrides[p.id]?.slides?.[idx]) {
        const reset = el('button', 'reset-btn-sm', 'Reset');
        reset.onclick = (e) => { e.stopPropagation(); clearOverride(p.id, idx); openModal(p); renderGrid(); };
        actions.appendChild(reset);
      }
      slot.appendChild(actions);
      wrap.appendChild(slot);
    });
  }

  function elInner(tag, cls, html) { const e = el(tag, cls); e.innerHTML = html; return e; }
  function mkBtn(txt, onClick, ghost) {
    const b = el('button', 'btn' + (ghost ? ' ghost' : ''), txt);
    b.onclick = onClick;
    return b;
  }
  function copyText(t) {
    navigator.clipboard.writeText(t).then(() => {
      const toast = el('div', '', 'Copied');
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:white;padding:10px 18px;border-radius:8px;font-size:13px;z-index:300;box-shadow:0 4px 16px rgba(0,0,0,.2)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1200);
    });
  }

  function bindModal() {
    $('#modalClose').onclick = (e) => { e.stopPropagation(); closeModal(); };
    document.querySelector('.modal-backdrop').onclick = closeModal;
    // Safety: any click on .modal that isn't on .modal-card or its children → close
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (state.pickerOpen) closePicker();
        else if (document.getElementById('modal').classList.contains('open')) closeModal();
      }
    });
  }
  function closeModal() {
    document.getElementById('modal').classList.remove('open');
  }

  function bindView() {
    const btn = $('#viewToggle');
    btn.onclick = () => {
      state.view = state.view === 'grid' ? 'list' : 'grid';
      btn.textContent = state.view === 'grid' ? 'List view' : 'Grid view';
      renderAll();
    };
    const prodChip = $('#prodChip');
    if (prodChip) {
      prodChip.onclick = () => { state.productionOnly = !state.productionOnly; renderFilters(); renderAll(); };
    }
  }

  /* IMAGE PICKER */
  function openPicker(callback) {
    state.pickerOpen = true;
    state.pickerCallback = callback;
    const pk = $('#picker');
    pk.classList.add('open');
    const body = $('#pickerBody');
    body.innerHTML = '';

    // Search
    const search = el('input', 'picker-search');
    search.placeholder = 'Filter by filename';
    search.oninput = () => renderPickerGrid(search.value.toLowerCase());
    body.appendChild(search);

    // Tabs
    const tabs = el('div', 'picker-tabs');
    const mainTab = el('button', 'picker-tab active', `images/ (${state.images.main.length})`);
    const psTab = el('button', 'picker-tab', `product-shots/ (${state.images.productShots.length})`);
    tabs.appendChild(mainTab); tabs.appendChild(psTab);
    body.appendChild(tabs);

    const grid = el('div', 'picker-grid');
    body.appendChild(grid);

    let activeTab = 'main';
    function renderPickerGrid(filter = '') {
      grid.innerHTML = '';
      const files = (activeTab === 'main' ? state.images.main : state.images.productShots)
        .filter(f => !filter || f.toLowerCase().includes(filter));
      if (!files.length) {
        grid.innerHTML = '<div style="padding:40px; text-align:center; color:var(--ink-mute); grid-column:1/-1">No images. Add files to images/' + (activeTab === 'productShots' ? 'product-shots/' : '') + ' folder and refresh.</div>';
        return;
      }
      files.forEach(f => {
        const tile = el('div', 'picker-tile');
        const fullPath = activeTab === 'main' ? f : 'product-shots/' + f;
        if (isVideoFile(f)) {
          const v = document.createElement('video'); v.src = 'images/' + fullPath; v.muted = true; v.preload = 'metadata';
          tile.appendChild(v);
        } else {
          const img = document.createElement('img'); img.src = 'images/' + fullPath; img.loading = 'lazy';
          tile.appendChild(img);
        }
        const cap = el('div', 'picker-tile-name', f);
        tile.appendChild(cap);
        tile.onclick = () => {
          const cb = state.pickerCallback;
          closePicker();
          if (cb) try { cb(fullPath); } catch (err) { console.error('Picker callback error:', err); }
        };
        grid.appendChild(tile);
      });
    }
    mainTab.onclick = () => { activeTab = 'main'; mainTab.classList.add('active'); psTab.classList.remove('active'); renderPickerGrid(search.value.toLowerCase()); };
    psTab.onclick = () => { activeTab = 'productShots'; psTab.classList.add('active'); mainTab.classList.remove('active'); renderPickerGrid(search.value.toLowerCase()); };
    renderPickerGrid();
  }
  function closePicker() {
    state.pickerOpen = false;
    state.pickerCallback = null;
    document.getElementById('picker').classList.remove('open');
  }
  function bindPicker() {
    $('#pickerClose').onclick = (e) => { e.stopPropagation(); closePicker(); };
    document.querySelector('#picker .picker-backdrop').onclick = closePicker;
    // Safety: click on .picker that isn't card or its children → close
    document.getElementById('picker').addEventListener('click', (e) => {
      if (e.target.id === 'picker') closePicker();
    });
  }
})();
