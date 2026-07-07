(async function () {
  const STATUS_KEY = 'ks-ua-planner-status-v3';
  const OVERRIDE_KEY = 'ks-ua-planner-overrides-v3';
  const CUSTOM_KEY = 'ks-ua-custom-posts-v1';
  const ORDER_KEY = 'ks-ua-order-v1';
  const NOTES_KEY = 'ks-ua-notes-v1';
  const CAPTION_KEY = 'ks-ua-captions-v1';
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
    customPosts: loadCustom(),
    order: loadOrder(),
    notes: loadNotes(),
    captions: loadCaptions(),
    editingCaption: null,
    dragId: null,
    justDragged: 0,
    pickerOpen: false,
    pickerCallback: null,
  };

  /* ---- Editable captions (per post), persisted in LocalStorage ---- */
  function loadCaptions() { try { return JSON.parse(localStorage.getItem(CAPTION_KEY) || '{}'); } catch { return {}; } }
  function saveCaptions() { try { localStorage.setItem(CAPTION_KEY, JSON.stringify(state.captions)); } catch {} }
  function getEffectiveCaption(p) {
    if (isCustom(p)) return p.caption || '';
    return (p.id in state.captions) ? state.captions[p.id] : (p.caption || '');
  }
  function hasCaptionOverride(p) { return !isCustom(p) && (p.id in state.captions); }
  function setCaption(p, text) {
    text = text == null ? '' : text;
    if (isCustom(p)) { p.caption = text; saveCustom(); }
    else { state.captions[p.id] = text; saveCaptions(); }
  }
  function resetCaption(p) { if (!isCustom(p)) { delete state.captions[p.id]; saveCaptions(); } }

  /* ---- Notes for Ahmed (per post), persisted in LocalStorage ---- */
  function loadNotes() { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; } }
  function saveNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes)); } catch {} }
  function getNote(id) { return state.notes[id] || ''; }
  function setNote(id, txt) {
    txt = (txt || '').trim();
    if (txt) state.notes[id] = txt; else delete state.notes[id];
    saveNotes();
  }

  /* ---- 1-click high-res download (for posting to Instagram) ---- */
  function slugify(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function downloadMedia(ref, filename) {
    if (!ref) return;
    const a = document.createElement('a');
    a.href = mediaPath(ref);
    a.download = filename || (String(ref).startsWith('data:') ? 'kindsigma.jpg' : String(ref).split('/').pop());
    document.body.appendChild(a); a.click(); a.remove();
  }
  // Download every image of a post (original resolution). Carousel slides are staggered.
  function downloadPostMedia(p) {
    const refs = postMediaRefs(p);
    refs.forEach((ref, i) => {
      const name = String(ref).startsWith('data:')
        ? (slugify(p.title) || 'post') + (refs.length > 1 ? '-' + (i + 1) : '') + '.jpg'
        : String(ref).split('/').pop();
      setTimeout(() => downloadMedia(ref, name), i * 350);
    });
  }

  function loadCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; } }
  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customPosts)); return true; }
    catch (e) { alert('Could not save: browser storage is full. Try smaller/lighter images or delete a few of your own posts.'); return false; }
  }
  // All posts = plan posts (from posts.json) + user-created posts (from LocalStorage)
  function allPosts() { return state.data.posts.concat(state.customPosts); }
  function isCustom(p) { return !!p && p.custom === true; }

  /* ---- Custom ordering (drag to reorder), persisted in LocalStorage ---- */
  function loadOrder() { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || 'null'); } catch { return null; } }
  function saveOrder() { try { localStorage.setItem(ORDER_KEY, JSON.stringify(state.order)); } catch {} }
  // Reconcile saved order with the current set of posts: keep saved sequence,
  // drop removed ids, append any new posts in their default (order-field) position.
  function ensureOrder() {
    const ids = allPosts().slice().sort((a, b) => a.order - b.order).map(p => p.id);
    const idset = new Set(ids);
    const base = Array.isArray(state.order) ? state.order.filter(id => idset.has(id)) : [];
    const have = new Set(base);
    ids.forEach(id => { if (!have.has(id)) base.push(id); });
    state.order = base;
    return base;
  }
  function orderIndexMap() {
    const ord = ensureOrder();
    const m = {};
    ord.forEach((id, i) => { m[id] = i; });
    return m;
  }
  function reorderPost(dragId, targetId, before) {
    if (dragId === targetId) return;
    const arr = ensureOrder().slice();
    const from = arr.indexOf(dragId);
    if (from < 0) return;
    arr.splice(from, 1);
    const to = arr.indexOf(targetId);
    if (to < 0) arr.push(dragId);
    else arr.splice(before ? to : to + 1, 0, dragId);
    state.order = arr;
    saveOrder();
    renderAll();
  }

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

  // Unified, ordered list of a carousel's image refs. Plan posts persist edits in
  // overrides.slidesFull; custom posts persist directly in post.slides.
  function getSlideRefs(post) {
    if (isCustom(post)) return (post.slides || []).map(s => s.image).filter(Boolean);
    const ov = state.overrides[post.id];
    if (ov && Array.isArray(ov.slidesFull)) return ov.slidesFull.filter(Boolean);
    const base = (post.slides || []).map((s, i) => getEffectiveSlideImage(post, i));
    return base.concat(ov?.addedSlides || []).filter(Boolean);
  }
  function setSlideRefs(p, refs) {
    refs = refs.filter(Boolean);
    if (isCustom(p)) {
      p.slides = refs.map((ref, i) => ({ image: ref, label: 'Slide ' + (i + 1) }));
      saveCustom();
    } else {
      if (!state.overrides[p.id]) state.overrides[p.id] = {};
      state.overrides[p.id].slidesFull = refs;
      delete state.overrides[p.id].slides;
      delete state.overrides[p.id].addedSlides;
      saveOverrides();
    }
  }
  function slideCount(post) { return getSlideRefs(post).length; }
  // Every image ref of a post, original resolution, in display order.
  function postMediaRefs(post) {
    if (post.format === 'carousel' || post.slides) return getSlideRefs(post);
    const t = getThumbnail(post); return t ? [t] : [];
  }
  function getThumbnail(post) {
    if (post.format === 'carousel') { const r = getSlideRefs(post); return r.length ? r[0] : null; }
    return getEffectiveImage(post);
  }
  function moveSlide(p, idx, dir) {
    const refs = getSlideRefs(p); const j = idx + dir;
    if (j < 0 || j >= refs.length) return;
    [refs[idx], refs[j]] = [refs[j], refs[idx]];
    setSlideRefs(p, refs); openModal(p); renderGrid();
  }
  function removeSlide(p, idx) {
    const refs = getSlideRefs(p); refs.splice(idx, 1);
    setSlideRefs(p, refs); openModal(p); renderGrid();
  }
  function changeSlide(p, idx, ref) {
    const refs = getSlideRefs(p); refs[idx] = ref;
    setSlideRefs(p, refs); openModal(p); renderGrid();
  }
  function addSlideRefs(p, newRefs) {
    if (!newRefs || !newRefs.length) return;
    setSlideRefs(p, getSlideRefs(p).concat(newRefs)); openModal(p); renderGrid();
  }
  // Read several image files -> data URLs, preserving selection order.
  function filesToDataURLs(files, maxDim, cb) {
    const out = new Array(files.length); let pending = files.length;
    if (!pending) return cb([]);
    files.forEach((f, i) => fileToDataURL(f, maxDim, durl => { out[i] = durl; if (--pending === 0) cb(out.filter(Boolean)); }));
  }
  // "+ Add photos": open a multi-select file dialog and append all as slides.
  function uploadSlides(p) {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true });
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = () => { const files = [...inp.files]; inp.remove(); filesToDataURLs(files, 1600, refs => addSlideRefs(p, refs)); };
    inp.click();
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

  const r = await fetch('posts.json?v=17');
  state.data = await r.json();
  for (const p of state.data.posts) {
    p.isVideo = !!(p.image && /\.(mp4|mov|webm)$/i.test(p.image));
  }

  // Bind handlers first so a rendering error can never leave the modal un-closable.
  bindModal();
  bindView();
  bindBio();
  bindPicker();
  bindEditor();
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
  // Resolve a stored media ref to a usable src: pass through data:/blob:/http/absolute, else prefix images/
  function mediaPath(name) {
    if (!name) return '';
    return /^(data:|blob:|https?:|\/)/i.test(name) ? name : 'images/' + name;
  }

  function bindBio() {
    document.querySelector('.bio').innerHTML =
      'Не для того, щоб тебе бачили.<br>А щоб бачити інакше.<br>' +
      'Українська сторінка @kindsigma · Emirati eyewear · Italian Mazzucchelli acetate<br>kindsigma.com';
  }

  function renderTabs() {
    const tabs = $('#tabs'); tabs.innerHTML = '';
    const posts = allPosts();
    tabs.appendChild(mkTab('all', 'All', posts.length));
    state.data.phases.forEach(ph => {
      const count = posts.filter(p => p.phase === ph.id).length;
      tabs.appendChild(mkTab(ph.id, ph.label, count));
    });
    if (state.customPosts.length) {
      tabs.appendChild(mkTab('custom', 'My posts', state.customPosts.length));
    }
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
    const idx = orderIndexMap();
    return allPosts().filter(p => {
      if (state.activeTab !== 'all' && p.phase !== state.activeTab) return false;
      if (state.activeFormats.size && !state.activeFormats.has(p.format)) return false;
      if (state.activePillars.size && !state.activePillars.has(p.pillar)) return false;
      if (state.activeStatuses.size && !state.activeStatuses.has(getStatus(p.id))) return false;
      if (state.productionOnly && !p.productionRequired) return false;
      return true;
    }).sort((a, b) => (idx[a.id] ?? 1e9) - (idx[b.id] ?? 1e9));
  }

  function renderStats() {
    const sts = $('#stats'); sts.innerHTML = '';
    const posts = allPosts();
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
    t.onclick = () => { if (Date.now() - state.justDragged < 250) return; openModal(p); };

    if (thumb) {
      const path = mediaPath(thumb);
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
    } else {
      // Fallback (e.g. a custom post saved without media): show a titled card
      const card = el('div', 'prod-card');
      card.appendChild(el('div', 'prod-type', fmtShort(p.format)));
      card.appendChild(el('div', 'prod-title', p.title));
      t.appendChild(card);
    }

    const left = el('div', 'tile-badges');
    if (p.day) left.appendChild(badge('day', dayLabel(p.day)));
    t.appendChild(left);
    const right = el('div', 'tile-badge-right');
    if (isCarousel && slideCount(p)) right.appendChild(badge('carousel-ind', '⊞ ' + slideCount(p)));
    right.appendChild(badge('format-' + p.format, fmtShort(p.format)));
    const st = getStatus(p.id);
    if (st !== 'draft') right.appendChild(badge('status-' + st, stShort(st)));
    if (getNote(p.id)) right.appendChild(badge('note', '✎'));
    t.appendChild(right);
    if (thumb) {
      const bot = el('div', 'tile-bottom', p.title);
      t.appendChild(bot);
      const dl = el('button', 'tile-dl', '⤓');
      dl.title = 'Download high-res';
      dl.onclick = (e) => { e.stopPropagation(); downloadPostMedia(p); };
      t.appendChild(dl);
    }
    makeDraggable(t, p);
    return t;
  }
  function dayLabel(d) {
    if (!d) return '';
    if (/дроп|drop/i.test(d)) return 'DROP';
    return d;
  }

  /* ---- drag-to-reorder wiring, shared by tiles (grid) and rows (list) ---- */
  function clearDropMarks() {
    document.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
  }
  function dropBefore(e, node) {
    const r = node.getBoundingClientRect();
    return state.view === 'list' ? (e.clientY - r.top) < r.height / 2 : (e.clientX - r.left) < r.width / 2;
  }
  function makeDraggable(node, p) {
    node.draggable = true;
    node.addEventListener('dragstart', e => {
      state.dragId = p.id; node.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch {} }
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging'); state.dragId = null; state.justDragged = Date.now(); clearDropMarks();
    });
    node.addEventListener('dragover', e => {
      if (!state.dragId || state.dragId === p.id) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const before = dropBefore(e, node);
      node.classList.toggle('drop-before', before);
      node.classList.toggle('drop-after', !before);
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-before', 'drop-after'));
    node.addEventListener('drop', e => {
      e.preventDefault();
      const before = dropBefore(e, node);
      const dragId = state.dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      node.classList.remove('drop-before', 'drop-after');
      if (dragId) reorderPost(dragId, p.id, before);
    });
    // prevent inner media from starting its own native image-drag
    node.querySelectorAll('img,video').forEach(m => { m.draggable = false; });
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
    r.onclick = () => { if (Date.now() - state.justDragged < 250) return; openModal(p); };
    const thumb = el('div', 'thumb');
    const thumbImg = getThumbnail(p);
    if (thumbImg) {
      const path = mediaPath(thumbImg);
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
    if (p.format === 'carousel') meta.appendChild(badge('carousel-ind', '⊞ ' + slideCount(p)));
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
    if (getNote(p.id)) meta.appendChild(badge('note', '✎ Ahmed'));
    info.appendChild(meta);
    info.appendChild(el('h3', '', p.title));
    info.appendChild(el('div', 'caption-preview', (getEffectiveCaption(p) || '').replace(/\n/g, ' ')));
    r.appendChild(info);
    makeDraggable(r, p);
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

    // Download (high-res, for posting to Instagram)
    if (getThumbnail(p)) {
      const refs = postMediaRefs(p);
      const dlSec = el('div', 'modal-section');
      const dlBtns = el('div', 'btn-row');
      dlBtns.appendChild(mkBtn(refs.length > 1 ? `⤓ Download all (${refs.length})` : '⤓ Download image', () => downloadPostMedia(p)));
      dlSec.appendChild(dlBtns);
      c.appendChild(dlSec);
    }

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

    // Note for Ahmed
    const nSec = el('div', 'modal-section');
    nSec.appendChild(elInner('h4', '', 'Note for Ahmed'));
    const noteInput = el('textarea', 'note-input');
    noteInput.value = getNote(p.id);
    noteInput.placeholder = 'Leave a note for Ahmed…';
    nSec.appendChild(noteInput);
    const nBtns = el('div', 'btn-row');
    nBtns.appendChild(mkBtn('Save note', () => { setNote(p.id, noteInput.value); renderGrid(); toast('Note saved'); }));
    if (getNote(p.id)) nBtns.appendChild(mkBtn('Clear', () => { setNote(p.id, ''); openModal(p); renderGrid(); }, true));
    nSec.appendChild(nBtns);
    c.appendChild(nSec);

    // Production brief
    if (p.productionRequired && p.productionBrief) {
      const pb = el('div', 'modal-section');
      pb.appendChild(elInner('h4', '', 'Production brief'));
      pb.appendChild(el('div', 'brief', p.productionBrief));
      c.appendChild(pb);
    }

    // Caption (editable)
    {
      const cap = el('div', 'modal-section');
      cap.appendChild(elInner('h4', '', 'Caption (UA)'));
      if (state.editingCaption === p.id) {
        const ta = el('textarea', 'note-input caption-input');
        ta.value = getEffectiveCaption(p);
        ta.placeholder = 'Write the caption…';
        cap.appendChild(ta);
        const btns = el('div', 'btn-row');
        btns.appendChild(mkBtn('Save', () => { setCaption(p, ta.value); state.editingCaption = null; openModal(p); renderGrid(); toast('Caption saved'); }));
        btns.appendChild(mkBtn('Cancel', () => { state.editingCaption = null; openModal(p); }, true));
        if (hasCaptionOverride(p)) btns.appendChild(mkBtn('Reset to original', () => { resetCaption(p); state.editingCaption = null; openModal(p); renderGrid(); }, true));
        cap.appendChild(btns);
        c.appendChild(cap);
        setTimeout(() => { ta.focus(); }, 0);
      } else {
        const capText = getEffectiveCaption(p);
        const body = el('div', 'body', capText || 'No caption yet');
        if (!capText) body.classList.add('muted');
        cap.appendChild(body);
        if (hasCaptionOverride(p)) cap.appendChild(el('div', 'edited-note', 'Edited'));
        const btns = el('div', 'btn-row');
        btns.appendChild(mkBtn('Edit caption', () => { state.editingCaption = p.id; openModal(p); }));
        if (capText) {
          btns.appendChild(mkBtn('Copy caption + hashtags', () => copyText(capText + (p.hashtags?.length ? '\n\n' + p.hashtags.join(' ') : '')), true));
          btns.appendChild(mkBtn('Caption only', () => copyText(capText), true));
        }
        cap.appendChild(btns);
        c.appendChild(cap);
      }
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

    // Custom-post controls
    if (isCustom(p)) {
      const sec = el('div', 'modal-section');
      const row = el('div', 'btn-row');
      row.appendChild(mkBtn('Edit', () => { closeModal(); openEditor(p); }));
      const del = mkBtn('Delete', () => {
        if (confirm('Delete this post?')) {
          state.customPosts = state.customPosts.filter(x => x.id !== p.id);
          if (!state.customPosts.length && state.activeTab === 'custom') state.activeTab = 'all';
          saveCustom(); ensureOrder(); saveOrder(); closeModal(); renderTabs(); renderAll();
        }
      }, true);
      del.classList.add('danger');
      row.appendChild(del);
      sec.appendChild(row);
      c.appendChild(sec);
    }

    body.appendChild(c);
    $('#modal').classList.add('open');
  }

  function renderSingleImage(wrap, p) {
    const img = getEffectiveImage(p);
    if (img) {
      const path = mediaPath(img);
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
    const refs = getSlideRefs(p);
    refs.forEach((ref, idx) => {
      const slot = el('div', 'slide-slot');
      const head = el('div', 'slide-head');
      head.appendChild(el('span', 'slide-num', String(idx + 1)));
      const move = el('div', 'slide-move');
      const up = el('button', 'move-btn', '↑'); up.title = 'Move up'; up.disabled = idx === 0;
      up.onclick = (e) => { e.stopPropagation(); moveSlide(p, idx, -1); };
      const down = el('button', 'move-btn', '↓'); down.title = 'Move down'; down.disabled = idx === refs.length - 1;
      down.onclick = (e) => { e.stopPropagation(); moveSlide(p, idx, 1); };
      move.appendChild(up); move.appendChild(down);
      head.appendChild(move);
      slot.appendChild(head);

      const inner = el('div', 'slide-inner');
      const path = mediaPath(ref);
      if (isVideoFile(ref)) { const v = document.createElement('video'); v.src = path; v.muted = true; v.controls = true; v.preload = 'metadata'; inner.appendChild(v); }
      else { const im = document.createElement('img'); im.src = path; inner.appendChild(im); }
      slot.appendChild(inner);

      const actions = el('div', 'slide-actions');
      const change = el('button', 'swap-btn-sm', 'Change');
      change.onclick = (e) => { e.stopPropagation(); openPicker(ref2 => changeSlide(p, idx, ref2)); };
      actions.appendChild(change);
      const dl = el('button', 'swap-btn-sm', '⤓ Download');
      dl.onclick = (e) => {
        e.stopPropagation();
        const name = String(ref).startsWith('data:') ? (slugify(p.title) || 'post') + '-' + (idx + 1) + '.jpg' : String(ref).split('/').pop();
        downloadMedia(ref, name);
      };
      actions.appendChild(dl);
      if (refs.length > 1) {
        const rm = el('button', 'reset-btn-sm', 'Remove');
        rm.onclick = (e) => { e.stopPropagation(); removeSlide(p, idx); };
        actions.appendChild(rm);
      }
      slot.appendChild(actions);
      wrap.appendChild(slot);
    });

    const addRow = el('div', 'slide-add-row');
    const addUp = el('button', 'slide-add-btn', '+ Add photos');
    addUp.onclick = (e) => { e.stopPropagation(); uploadSlides(p); };
    addRow.appendChild(addUp);
    const addExisting = el('button', 'slide-add-btn ghost', 'Choose existing');
    addExisting.onclick = (e) => { e.stopPropagation(); openPicker(ref => addSlideRefs(p, [ref])); };
    addRow.appendChild(addExisting);
    wrap.appendChild(addRow);
  }

  function elInner(tag, cls, html) { const e = el(tag, cls); e.innerHTML = html; return e; }
  function mkBtn(txt, onClick, ghost) {
    const b = el('button', 'btn' + (ghost ? ' ghost' : ''), txt);
    b.onclick = onClick;
    return b;
  }
  function toast(msg) {
    const t = el('div', '', msg);
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:white;padding:10px 18px;border-radius:8px;font-size:13px;z-index:300;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1200);
  }
  function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('Copied')); }

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
    state.editingCaption = null;
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
    const resetBtn = $('#resetOrderBtn');
    if (resetBtn) resetBtn.onclick = () => {
      try { localStorage.removeItem(ORDER_KEY); } catch {}
      state.order = null; ensureOrder(); renderAll();
    };
  }

  /* IMAGE PICKER */
  function openPicker(callback) {
    state.pickerOpen = true;
    state.pickerCallback = callback;
    const pk = $('#picker');
    pk.classList.add('open');
    const body = $('#pickerBody');
    body.innerHTML = '';

    // Upload a new photo (returns to whatever opened the picker: slide change, + Add photo, editor…)
    const upRow = el('div', 'picker-upload');
    const upLabel = el('label', 'btn', '⤒ Upload new photo');
    const upInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    upInput.style.display = 'none';
    upInput.onchange = () => {
      const f = upInput.files[0]; if (!f) return;
      fileToDataURL(f, 1600, (durl) => { const cb = state.pickerCallback; closePicker(); if (cb) try { cb(durl); } catch (err) { console.error(err); } });
      upInput.value = '';
    };
    upLabel.appendChild(upInput);
    upRow.appendChild(upLabel);
    upRow.appendChild(el('span', 'picker-upload-hint', 'or choose an existing file below'));
    body.appendChild(upRow);

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

  /* ---------- POST EDITOR (create / edit user posts) ---------- */
  // Downscale an image File to a JPEG data URL so it fits in LocalStorage.
  function fileToDataURL(file, maxDim, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(canvas.toDataURL('image/jpeg', 0.85)); }
        catch { cb(reader.result); }
      };
      img.onerror = () => cb(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function parseHashtags(s) {
    return (s || '').split(/[\s,]+/).filter(Boolean).map(t => (t[0] === '#' ? t : '#' + t));
  }

  function openEditor(existing) {
    const editing = !!existing;
    // working copy of image refs (data URLs or existing filenames)
    let imgs = editing
      ? (existing.slides ? existing.slides.map(s => s.image) : (existing.image ? [existing.image] : []))
      : [];

    const body = $('#editorBody'); body.innerHTML = '';
    body.appendChild(el('h2', 'editor-title', editing ? 'Edit post' : 'New post'));

    function field(labelText, node) {
      const f = el('div', 'ed-field');
      f.appendChild(el('label', 'ed-label', labelText));
      f.appendChild(node);
      return f;
    }
    const titleIn = Object.assign(el('input', 'ed-input'), { value: editing ? (existing.title || '') : '', placeholder: 'e.g. HALIA — evening look' });
    const dayIn = Object.assign(el('input', 'ed-input'), { value: editing ? (existing.day || '') : '', placeholder: 'Date, e.g. 12 Aug' });

    const fmtSel = el('select', 'ed-input');
    [['static', 'Static (1 photo)'], ['carousel', 'Carousel (multiple photos)'], ['reel', 'Reel (video)']].forEach(([v, l]) => {
      const o = el('option', '', l); o.value = v; if (editing && existing.format === v) o.selected = true; fmtSel.appendChild(o);
    });
    const pillarSel = el('select', 'ed-input');
    Object.entries(state.data.pillars).forEach(([id, info]) => {
      const o = el('option', '', info.label); o.value = id; if (editing && existing.pillar === id) o.selected = true; pillarSel.appendChild(o);
    });
    const capIn = Object.assign(el('textarea', 'ed-input ed-textarea'), { value: editing ? (existing.caption || '') : '', placeholder: 'Caption text…' });
    const hashIn = Object.assign(el('input', 'ed-input'), { value: editing && existing.hashtags ? existing.hashtags.join(' ') : '', placeholder: '#kindsigma #kindsigmaua' });

    body.appendChild(field('Title', titleIn));
    const rowMeta = el('div', 'ed-row');
    rowMeta.appendChild(field('Date', dayIn));
    rowMeta.appendChild(field('Format', fmtSel));
    rowMeta.appendChild(field('Pillar', pillarSel));
    body.appendChild(rowMeta);

    // Images
    const imgField = el('div', 'ed-field');
    imgField.appendChild(el('label', 'ed-label', 'Images'));
    const preview = el('div', 'ed-previews');
    function renderPreviews() {
      preview.innerHTML = '';
      if (!imgs.length) { preview.appendChild(el('div', 'ed-empty', 'No images yet')); }
      imgs.forEach((ref, i) => {
        const cell = el('div', 'ed-thumb');
        if (isVideoFile(ref)) {
          const v = document.createElement('video'); v.src = mediaPath(ref); v.muted = true; cell.appendChild(v);
        } else {
          const im = document.createElement('img'); im.src = mediaPath(ref); cell.appendChild(im);
        }
        const rm = el('button', 'ed-thumb-x', '×');
        rm.onclick = () => { imgs.splice(i, 1); renderPreviews(); };
        cell.appendChild(rm);
        preview.appendChild(cell);
      });
    }
    renderPreviews();
    imgField.appendChild(preview);

    const upWrap = el('div', 'btn-row');
    const fileLabel = el('label', 'btn', 'Upload photo');
    const fileIn = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true });
    fileIn.style.display = 'none';
    fileIn.onchange = () => {
      const files = [...fileIn.files];
      let pending = files.length;
      files.forEach(f => fileToDataURL(f, 1280, (durl) => { imgs.push(durl); if (--pending === 0) renderPreviews(); }));
      fileIn.value = '';
    };
    fileLabel.appendChild(fileIn);
    upWrap.appendChild(fileLabel);
    const pickBtn = mkBtn('Choose existing', () => {
      openEditorPicker((file) => { imgs.push(file); renderPreviews(); });
    }, true);
    upWrap.appendChild(pickBtn);
    imgField.appendChild(upWrap);
    imgField.appendChild(el('div', 'ed-hint', 'Static/Reel use the 1st image. Carousel uses all. Add videos via "Choose existing".'));
    body.appendChild(imgField);

    body.appendChild(field('Caption', capIn));
    body.appendChild(field('Hashtags', hashIn));

    const actions = el('div', 'ed-actions');
    const save = mkBtn(editing ? 'Save changes' : 'Create post', () => {
      const fmt = fmtSel.value;
      const post = {
        id: editing ? existing.id : 'custom-' + Date.now(),
        order: editing ? existing.order : Date.now(),
        phase: 'custom', pillar: pillarSel.value,
        day: dayIn.value.trim(), format: fmt,
        title: titleIn.value.trim() || 'Untitled',
        productionRequired: false,
        caption: capIn.value, hashtags: parseHashtags(hashIn.value),
        custom: true,
      };
      if (fmt === 'carousel') post.slides = imgs.map((im, i) => ({ image: im, label: 'Slide ' + (i + 1) }));
      else post.image = imgs[0] || null;

      if (editing) {
        const idx = state.customPosts.findIndex(x => x.id === existing.id);
        if (idx >= 0) state.customPosts[idx] = post; else state.customPosts.push(post);
      } else {
        state.customPosts.push(post);
      }
      if (saveCustom()) { ensureOrder(); saveOrder(); closeEditor(); renderTabs(); renderAll(); openModal(post); }
    });
    actions.appendChild(save);
    actions.appendChild(mkBtn('Cancel', closeEditor, true));
    body.appendChild(actions);

    $('#editor').classList.add('open');
  }
  function closeEditor() { document.getElementById('editor').classList.remove('open'); }

  // Lightweight wrapper: use the existing image picker to return a filename to the editor.
  function openEditorPicker(cb) { openPicker(cb); }

  function bindEditor() {
    const btn = $('#newPostBtn');
    if (btn) btn.onclick = () => openEditor(null);
    $('#editorClose').onclick = (e) => { e.stopPropagation(); closeEditor(); };
    document.querySelector('#editor .modal-backdrop').onclick = closeEditor;
    document.getElementById('editor').addEventListener('click', (e) => { if (e.target.id === 'editor') closeEditor(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !state.pickerOpen && document.getElementById('editor').classList.contains('open')) closeEditor();
    });
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
