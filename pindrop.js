/* Prototype feedback pins.
   Activate with ?pd=1 (or legacy ?fb=1) for the session. Click "Add note",
   click the page, type, save. */
(function () {
  'use strict';
  if (window.pindrop) return;

  function storage(name) {
    try { return window[name] || null; } catch (e) { return null; }
  }
  function lsGet(k) {
    var s = storage('localStorage');
    try { return s ? s.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    var s = storage('localStorage');
    try { if (s) s.setItem(k, v); } catch (e) {}
  }
  function lsRemove(k) {
    var s = storage('localStorage');
    try { if (s) s.removeItem(k); } catch (e) {}
  }
  function lsLength() {
    var s = storage('localStorage');
    try { return s ? s.length : 0; } catch (e) { return 0; }
  }
  function lsKey(i) {
    var s = storage('localStorage');
    try { return s ? s.key(i) : null; } catch (e) { return null; }
  }
  function ssGet(k) {
    var s = storage('sessionStorage');
    try { return s ? s.getItem(k) : null; } catch (e) { return null; }
  }
  function ssSet(k, v) {
    var s = storage('sessionStorage');
    try { if (s) s.setItem(k, v); } catch (e) {}
  }
  function ssRemove(k) {
    var s = storage('sessionStorage');
    try { if (s) s.removeItem(k); } catch (e) {}
  }

  function migrateLegacy() {
    try {
      var moves = [], i, k;
      for (i = 0; i < lsLength(); i++) {
        k = lsKey(i);
        if (!k) continue;
        if (k.indexOf('zp-fb:') === 0) moves.push([k, 'pd:' + k.slice(6)]);
        else if (k.indexOf('zp-fb-v:') === 0) moves.push([k, 'pd-v:' + k.slice(8)]);
        else if (k.indexOf('zp-fb-q:') === 0) moves.push([k, 'pd-q:' + k.slice(8)]);
        else if (k === 'zp-fb-who') moves.push([k, 'pd-who']);
      }
      moves.forEach(function (m) {
        if (lsGet(m[1]) == null) lsSet(m[1], lsGet(m[0]));
        lsRemove(m[0]);
      });
    } catch (e) {}
  }
  migrateLegacy();

  function keyFor() { return 'pd:' + location.pathname + location.hash; }
  var KEY = keyFor();
  var qs = new URLSearchParams(location.search);
  var queryArmed = qs.has('pd') || qs.has('fb');
  if (queryArmed) ssSet('pd-on', '1');

  var pins = [], adding = false, layer = null, bar = null, nEl = null, addBtn = null, copyAllBtn = null, verdictEl = null, pop = null;

  function pinId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function normPin(p) {
    if (!p || typeof p !== 'object') return null;
    if (!p.v) { p.v = 1; if (p.ver == null) p.ver = 0; }
    if (!p.id) p.id = pinId();
    return p;
  }
  function pageVer() {
    var m = document.querySelector('meta[name="pd-version"]');
    if (m && +m.getAttribute('content') > 0) return +m.getAttribute('content');
    var s = document.querySelector('.stamp');
    if (s) { var mt = (s.textContent || '').match(/\bv(\d+)\b/); if (mt) return +mt[1]; }
    return 0;
  }
  function whoName() { return lsGet('pd-who') || ''; }
  function ctxNow() { return { path: location.pathname, hash: location.hash, date: today(), pageVer: pageVer(), who: whoName() }; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function vKey() { return 'pd-v:' + location.pathname; }
  function getVerdicts() { try { return JSON.parse(lsGet(vKey()) || '{}') || {}; } catch (e) { return {}; } }
  function setVerdict(hash, val) {
    var v = getVerdicts();
    if (val) v[hash] = val; else delete v[hash];
    if (Object.keys(v).length) lsSet(vKey(), JSON.stringify(v)); else lsRemove(vKey());
  }
  function qKey() { return 'pd-q:' + location.pathname + location.hash; }
  function loadQuestions() { try { return JSON.parse(lsGet(qKey()) || '[]') || []; } catch (e) { return []; } }
  function saveAnswer(id, text) {
    var qs = loadQuestions();
    for (var i = 0; i < qs.length; i++) if (qs[i].id === id) { qs[i].answer = text; qs[i].answeredT = Date.now(); }
    lsSet(qKey(), JSON.stringify(qs));
  }
  function allQuestions() {
    var base = 'pd-q:' + location.pathname, out = {};
    for (var i = 0; i < lsLength(); i++) {
      var k = lsKey(i);
      if (k === base || (k && k.indexOf(base + '#') === 0)) {
        var arr; try { arr = JSON.parse(lsGet(k) || '[]'); } catch (e) { arr = []; }
        if (arr && arr.length) out[k.slice(base.length) || '(page)'] = arr;
      }
    }
    return out;
  }

  function loadPins() {
    try { pins = (JSON.parse(lsGet(KEY) || '[]') || []).map(normPin).filter(Boolean); }
    catch (e) { pins = []; }
  }
  function syncKey() { var k = keyFor(); if (k !== KEY) { KEY = k; loadPins(); } }
  function save() { lsSet(KEY, JSON.stringify(pins)); }

  function nearText(x, y) {
    if (layer) layer.style.pointerEvents = 'none';
    var el = document.elementFromPoint(x - window.scrollX, y - window.scrollY);
    if (layer) layer.style.pointerEvents = '';
    while (el && el !== document.body) {
      var t = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (t && t.length >= 3) return t.slice(0, 48);
      el = el.parentElement;
    }
    return '';
  }

  function captureState() {
    var parts = [];
    var groups = document.querySelectorAll('[data-pd-state]');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!g.getClientRects().length) continue;
      var active = g.querySelector('[aria-pressed="true"],[aria-selected="true"],[data-active="true"]');
      if (!active) continue;
      var val = (active.getAttribute('aria-label') || active.textContent || '').trim().replace(/\s+/g, ' ');
      if (val) parts.push(g.getAttribute('data-pd-state') + ': ' + val);
    }
    return parts.join(' · ');
  }

  function cleanText(el) {
    var label = el.labels && el.labels.length ? el.labels[0].textContent : '';
    return ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || label || '')
      .trim().replace(/\s+/g, ' ');
  }
  function isVisible(el) { return !!(el && el.getClientRects && el.getClientRects().length); }
  function optionSelected(el) {
    return el.getAttribute('aria-pressed') === 'true' ||
      el.getAttribute('aria-selected') === 'true' ||
      el.getAttribute('data-active') === 'true' ||
      !!el.checked || !!el.selected;
  }
  function optionId(el, label) {
    return el.getAttribute('data-pd-value') || el.value || el.id ||
      label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function stateOptions(group) {
    var found = group.querySelectorAll(
      '[data-pd-value],button,[role="option"],[role="tab"],input,select option,[aria-pressed],[aria-selected],[data-active]');
    var out = [], seen = {};
    for (var i = 0; i < found.length; i++) {
      var label = cleanText(found[i]);
      if (!label) continue;
      var id = optionId(found[i], label);
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({ id: id, label: label, selectedAtExport: optionSelected(found[i]) });
    }
    return out;
  }
  function stateScope(group) {
    var scoped = group.closest && group.closest('[id]');
    return scoped ? '#' + scoped.id : location.hash || '(page)';
  }
  function stateCatalog() {
    var groups = document.querySelectorAll('[data-pd-state]'), out = [];
    for (var i = 0; i < groups.length; i++) {
      out.push({
        id: 'state-' + (i + 1),
        label: groups[i].getAttribute('data-pd-state') || '',
        selector: cssPath(groups[i]),
        scope: stateScope(groups[i]),
        visibleAtExport: isVisible(groups[i]),
        options: stateOptions(groups[i])
      });
    }
    return out;
  }
  function capturePinContext() {
    var catalog = stateCatalog(), states = [];
    for (var i = 0; i < catalog.length; i++) {
      if (!catalog[i].visibleAtExport) continue;
      var selected = [];
      for (var j = 0; j < catalog[i].options.length; j++) {
        var option = catalog[i].options[j];
        if (option.selectedAtExport) selected.push({ id: option.id, label: option.label });
      }
      if (selected.length) states.push({
        stateId: catalog[i].id,
        label: catalog[i].label,
        selected: selected
      });
    }
    return {
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      states: states
    };
  }

  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 6) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) { parts.unshift('#' + el.id); return parts.join(' > '); }
      var tag = el.tagName.toLowerCase(), seg = tag, p = el.parentElement;
      if (p && p.querySelectorAll(':scope > ' + tag).length > 1) {
        var n = 1, sib = el;
        while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) n++;
        seg = tag + ':nth-of-type(' + n + ')';
      }
      parts.unshift(seg);
      el = p;
    }
    return parts.join(' > ');
  }
  function anchorAt(pageX, pageY) {
    if (layer) layer.style.pointerEvents = 'none';
    var el = document.elementFromPoint(pageX - window.scrollX, pageY - window.scrollY);
    if (layer) layer.style.pointerEvents = '';
    if (!el || el === document.body || (el.closest && el.closest('.pd-bar,.pd-form,[data-pindrop]'))) return null;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var sel = cssPath(el);
    var hit = null; try { hit = document.querySelector(sel); } catch (e) {}
    if (!sel || hit !== el) return null;
    return {
      sel: sel,
      ox: Math.min(1, Math.max(0, (pageX - window.scrollX - r.left) / r.width)),
      oy: Math.min(1, Math.max(0, (pageY - window.scrollY - r.top) / r.height))
    };
  }
  function pinXY(p) {
    if (p.anchor && p.anchor.sel) {
      var el = null; try { el = document.querySelector(p.anchor.sel); } catch (e) {}
      if (el && el.getClientRects().length) {
        var r = el.getBoundingClientRect();
        return {
          x: r.left + window.scrollX + p.anchor.ox * r.width,
          y: r.top + window.scrollY + p.anchor.oy * r.height,
          anchored: true
        };
      }
    }
    return { x: null, y: p.y, anchored: false };
  }

  function render() {
    if (!layer || !nEl) return;
    layer.innerHTML = '';
    var pv = pageVer();
    pins.forEach(function (p, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'pd-pin';
      d.textContent = i + 1;
      d.title = p.note + (p.state ? ' — [' + p.state + ']' : '') + ' (click to remove)';
      if (!p.resolved && p.ver > 0 && pv > 0 && p.ver < pv) {
        d.classList.add('pd-stale');
        d.title = p.note + ' — from v' + p.ver + ' (page is v' + pv + ')';
      }
      if (p.resolved) {
        d.classList.add('pd-done');
        d.title = p.note + ' — resolved in v' + p.resolved.ver;
      }
      var xy = pinXY(p);
      d.style.left = xy.anchored ? (xy.x + 'px') : (p.xr * 100) + '%';
      d.style.top = xy.y + 'px';
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        openPinPop(p, i);
      });
      layer.appendChild(d);
    });
    var qs = loadQuestions();
    qs.forEach(function (q, i) {
      var qp = questionPin(q);
      var xy = pinXY(qp);
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'pd-pin pd-q' + (q.answer ? ' pd-q-done' : '');
      d.textContent = 'Q' + (i + 1);
      d.title = q.q;
      d.style.left = xy.anchored ? (xy.x + 'px') : (qp.xr * 100) + '%';
      d.style.top = xy.y + 'px';
      d.addEventListener('click', function (e) { e.stopPropagation(); openQuestionPop(q); });
      layer.appendChild(d);
    });
    nEl.textContent = pins.length + (pins.length === 1 ? ' note' : ' notes') + (qs.length ? ' · ' + qs.length + ' Q' : '');
    if (copyAllBtn) {
      var qBuckets = allQuestions();
      var tot = feedbackTotal(allBuckets(), qBuckets);
      copyAllBtn.style.display = tot > 0 ? '' : 'none';
    }
    paintVerdict();
  }

  function form(x, y) {
    var f = document.createElement('div');
    f.className = 'pd-form';
    f.style.left = Math.min(x, window.scrollX + window.innerWidth - 290) + 'px';
    f.style.top = (y + 10) + 'px';
    f.innerHTML = (lsGet('pd-who') === null ? '<input class="pd-who" placeholder="Your name (optional)" maxlength="24">' : '') +
      '<textarea placeholder="What should change here?"></textarea>' +
      '<div class="r"><button type="button" class="c">Cancel</button><button type="button" class="p">Save note</button></div>';
    document.body.appendChild(f);
    var ta = f.querySelector('textarea');
    ta.focus();
    f.querySelector('.c').addEventListener('click', function () { f.remove(); });
    f.querySelector('.p').addEventListener('click', function () {
      var note = ta.value.trim();
      if (note) {
        syncKey();
        var wEl = f.querySelector('.pd-who');
        if (wEl) lsSet('pd-who', wEl.value.trim());
        pins.push(normPin({
          v: 2, id: pinId(), t: Date.now(),
          xr: x / document.documentElement.scrollWidth, y: y, near: nearText(x, y),
          note: note, w: window.innerWidth, state: captureState(), ver: pageVer(),
          who: whoName() || undefined, anchor: anchorAt(x, y), context: capturePinContext()
        }));
        save(); render();
      }
      f.remove();
    });
  }

  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function popShell(p) {
    closePop();
    var xy = pinXY(p);
    var x = xy.anchored ? xy.x : p.xr * document.documentElement.scrollWidth;
    pop = document.createElement('div');
    pop.className = 'pd-form';
    pop.style.left = Math.min(x, window.scrollX + window.innerWidth - 290) + 'px';
    pop.style.top = (xy.y + 14) + 'px';
    document.body.appendChild(pop);
    return pop;
  }
  function openPinPop(p, i) {
    var el = popShell(p), pv = pageVer(), meta = [];
    if (p.ver > 0) meta.push('v' + p.ver + (pv > p.ver ? ' — page is v' + pv : ''));
    if (p.who) meta.push(p.who);
    if (p.state) meta.push(p.state);
    if (p.resolved) {
      el.innerHTML = '<div class="pd-meta">' + esc(meta.join(' · ')) + '</div>' +
        '<p class="pd-note">' + esc(p.note) + '</p>' +
        '<p class="pd-meta">✓ Resolved in v' + p.resolved.ver + (p.resolved.note ? ': ' + esc(p.resolved.note) : '') + '</p>' +
        '<div class="r"><button type="button" class="dismiss">Dismiss</button><button type="button" class="c">Close</button></div>';
      el.querySelector('.dismiss').addEventListener('click', function () { pins.splice(i, 1); save(); render(); closePop(); });
      el.querySelector('.c').addEventListener('click', closePop);
      return;
    }
    el.innerHTML = '<div class="pd-meta">' + esc(meta.join(' · ')) + '</div>' +
      '<p class="pd-note">' + esc(p.note) + '</p>' +
      '<div class="r"><button type="button" class="del">Delete</button>' +
      '<button type="button" class="c">Close</button><button type="button" class="p e">Edit</button></div>';
    el.querySelector('.del').addEventListener('click', function () { pins.splice(i, 1); save(); render(); closePop(); });
    el.querySelector('.c').addEventListener('click', closePop);
    el.querySelector('.e').addEventListener('click', function () {
      var noteEl = el.querySelector('.pd-note');
      if (!noteEl) return;
      var ta = document.createElement('textarea'); ta.value = p.note;
      noteEl.replaceWith(ta); ta.focus();
      var btn = el.querySelector('.e'); btn.textContent = 'Save';
      btn.addEventListener('click', function () {
        var t = ta.value.trim();
        if (t) { p.note = t; save(); render(); }
        closePop();
      }, { once: true });
    }, { once: true });
  }
  function questionPin(q) {
    return {
      anchor: q.sel ? { sel: q.sel, ox: .5, oy: .5 } : null,
      xr: q.xr || .5,
      y: q.y || 200
    };
  }
  function openQuestionPop(q) {
    var el = popShell(questionPin(q));
    el.innerHTML = '<p class="pd-note">' + esc(q.q) + '</p>' +
      '<textarea></textarea>' +
      '<div class="r"><button type="button" class="c">Close</button><button type="button" class="p saveq">Save answer</button></div>';
    var ta = el.querySelector('textarea');
    ta.value = q.answer || '';
    ta.focus();
    el.querySelector('.c').addEventListener('click', closePop);
    el.querySelector('.saveq').addEventListener('click', function () {
      saveAnswer(q.id, ta.value.trim());
      render();
      closePop();
    });
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function fmtPin(p, i, ctx) {
    ctx = ctx || { pageVer: 0, who: '' };
    var s = (i + 1) + '. ';
    if (p.resolved) s += '✓ RESOLVED in v' + p.resolved.ver + (p.resolved.note ? ' (' + p.resolved.note + ')' : '') + ' — ';
    s += '[' + Math.round(p.xr * 100) + '% across, ' + p.y + 'px down, viewport ' + p.w + 'px' +
      (p.near ? ', near "' + p.near + '"' : '');
    if (!p.resolved && p.ver > 0) s += ', v' + p.ver + (ctx.pageVer > 0 && p.ver < ctx.pageVer ? ' — STALE' : '');
    s += ']' + (p.state ? ' {' + p.state + '}' : '') + ' ' + p.note;
    if (p.who && p.who !== ctx.who) s += ' (who: ' + p.who + ')';
    return s;
  }
  function fmtQuestion(q, i) {
    return 'Q' + (i + 1) + '. ' + (q.near ? '[near "' + q.near + '"] ' : '') + q.q + ' → ' +
      (q.answer ? 'A: ' + q.answer : '(unanswered)');
  }
  function buildCopy(pinsIn, questions, ctx) {
    var head = 'Design feedback · ' + ctx.path + ctx.hash + ' · ' + ctx.date + (ctx.pageVer > 0 ? ' · page v' + ctx.pageVer : '');
    if (ctx.who) head += '\nReviewer: ' + ctx.who;
    var v = getVerdicts()[ctx.hash];
    if (v) head += '\nVerdict: ' + ctx.hash + ' ' + cap(v);
    var out = head + '\n' + pinsIn.map(function (p, i) { return fmtPin(p, i, ctx); }).join('\n');
    questions.forEach(function (q, i) { out += '\n' + fmtQuestion(q, i); });
    return out;
  }
  function buildCopyAll(buckets, verdicts, questionsByVariant, ctx) {
    var head = 'Design feedback (all variants) · ' + ctx.path + ' · ' + ctx.date + (ctx.pageVer > 0 ? ' · page v' + ctx.pageVer : '');
    if (ctx.who) head += '\nReviewer: ' + ctx.who;
    var vks = Object.keys(verdicts).sort();
    if (vks.length) head += '\nVerdicts: ' + vks.map(function (k) { return k + ' ' + cap(verdicts[k]); }).join(' · ');
    var names = {};
    buckets.forEach(function (b) { names[b.variant] = 1; });
    Object.keys(questionsByVariant).forEach(function (k) { if ((questionsByVariant[k] || []).length) names[k] = 1; });
    var sorted = Object.keys(names).sort(function (a, b) {
      if (a === '(page)') return -1;
      if (b === '(page)') return 1;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return head + sorted.map(function (name) {
      var b = null, j;
      for (j = 0; j < buckets.length; j++) if (buckets[j].variant === name) b = buckets[j];
      var sec = '\n\n== ' + name + ' ==';
      if (b) sec += '\n' + b.pins.map(function (p, i) { return fmtPin(p, i, ctx); }).join('\n');
      (questionsByVariant[name] || []).forEach(function (q, i) { sec += '\n' + fmtQuestion(q, i); });
      return sec;
    }).join('');
  }
  function waUrl(text) {
    var prefix = 'https://wa.me/?text=', mark = '\n…(truncated — use Copy all)';
    if ((prefix + encodeURIComponent(text)).length <= 6000) return prefix + encodeURIComponent(text);
    var lines = text.split('\n');
    while (lines.length > 1 && (prefix + encodeURIComponent(lines.join('\n') + mark)).length > 6000) lines.pop();
    return prefix + encodeURIComponent(lines.join('\n') + mark);
  }
  function feedbackTotal(buckets, qsAll) {
    return buckets.reduce(function (n, b) { return n + b.pins.length; }, 0) +
      Object.keys(qsAll).reduce(function (n, k) { return n + qsAll[k].length; }, 0);
  }
  function writeOut(out, okLabel) {
    (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject()).then(
      function () { nEl.textContent = okLabel; setTimeout(render, 1200); },
      function () { prompt('Copy your feedback:', out); }
    );
  }

  function allBuckets() {
    var base = 'pd:' + location.pathname, out = [];
    for (var i = 0; i < lsLength(); i++) {
      var k = lsKey(i);
      if (k === base || (k && k.indexOf(base + '#') === 0)) {
        var arr; try { arr = (JSON.parse(lsGet(k) || '[]') || []).map(normPin).filter(Boolean); } catch (e) { arr = []; }
        if (arr && arr.length) out.push({ variant: k.slice(base.length) || '(page)', pins: arr });
      }
    }
    out.sort(function (a, b) {
      if (a.variant === '(page)') return -1;
      if (b.variant === '(page)') return 1;
      return a.variant < b.variant ? -1 : (a.variant > b.variant ? 1 : 0);
    });
    return out;
  }

  function mediaMatches(query) {
    try { return !!(window.matchMedia && window.matchMedia(query).matches); } catch (e) { return false; }
  }
  function browserInfo() {
    var ua = navigator.userAgent || '', name = '', version = '', match;
    if ((match = ua.match(/Edg\/([\d.]+)/))) { name = 'Edge'; version = match[1]; }
    else if ((match = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/))) { name = 'Chrome'; version = match[1]; }
    else if ((match = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/))) { name = 'Firefox'; version = match[1]; }
    else if (/Safari\//.test(ua) && (match = ua.match(/Version\/([\d.]+)/))) { name = 'Safari'; version = match[1]; }
    var data = navigator.userAgentData, brands = [];
    if (data && data.brands) {
      for (var i = 0; i < data.brands.length; i++) {
        brands.push({ brand: data.brands[i].brand, version: data.brands[i].version });
      }
    }
    return {
      name: name,
      version: version,
      userAgent: ua,
      brands: brands,
      mobile: data && typeof data.mobile === 'boolean' ? data.mobile : /Mobi|Android|iPhone|iPad/i.test(ua)
    };
  }
  function captureEnvironment() {
    var root = document.documentElement || {}, screenInfo = window.screen || {};
    var orientation = screenInfo.orientation || {};
    var uaData = navigator.userAgentData || {};
    var languages = navigator.languages ? Array.prototype.slice.call(navigator.languages) : [];
    var points = navigator.maxTouchPoints || 0;
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: root.scrollWidth || 0,
        scrollHeight: root.scrollHeight || 0
      },
      screen: {
        width: screenInfo.width == null ? null : screenInfo.width,
        height: screenInfo.height == null ? null : screenInfo.height,
        availWidth: screenInfo.availWidth == null ? null : screenInfo.availWidth,
        availHeight: screenInfo.availHeight == null ? null : screenInfo.availHeight,
        orientationType: orientation.type || null,
        orientationAngle: orientation.angle == null ? null : orientation.angle
      },
      display: {
        devicePixelRatio: window.devicePixelRatio || 1,
        colorScheme: mediaMatches('(prefers-color-scheme: dark)') ? 'dark' : 'light',
        reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)')
      },
      browser: browserInfo(),
      system: {
        platform: navigator.platform || '',
        uaPlatform: uaData.platform || '',
        language: navigator.language || '',
        languages: languages,
        touch: points > 0 || 'ontouchstart' in window,
        maxTouchPoints: points
      }
    };
  }
  function reviewId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function buildReviewPacket() {
    var buckets = allBuckets(), questions = allQuestions(), verdicts = getVerdicts();
    var pinsOut = {};
    for (var i = 0; i < buckets.length; i++) pinsOut[buckets[i].variant] = buckets[i].pins;
    return {
      format: 'pindrop-review',
      formatVersion: 1,
      reviewId: reviewId(),
      exportedAt: new Date().toISOString(),
      reviewer: whoName(),
      page: {
        url: location.href,
        title: document.title || '',
        version: pageVer(),
        pathname: location.pathname,
        query: location.search,
        hash: location.hash
      },
      environment: captureEnvironment(),
      stateCatalog: stateCatalog(),
      pins: pinsOut,
      verdicts: verdicts,
      questions: questions,
      summary: buildCopyAll(buckets, verdicts, questions, ctxNow())
    };
  }
  function reviewFilename(packet) {
    var host = (location.hostname || 'page').replace(/[^a-z0-9.-]+/gi, '-');
    return 'pindrop-' + host + '-' + packet.exportedAt.slice(0, 10) + '-' + packet.reviewId + '.json';
  }
  function reviewFile(packet) {
    return new File([JSON.stringify(packet, null, 2)], reviewFilename(packet), { type: 'application/json' });
  }
  function downloadReview(packet) {
    var file = reviewFile(packet);
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    return file;
  }
  function openSummary(text) {
    var url = waUrl(text);
    var win = window.open(url, '_blank');
    if (!win) location.href = url;
  }
  function shareReview(packet) {
    var file = reviewFile(packet), canShare = false;
    try {
      canShare = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {}
    if (canShare) {
      return navigator.share({ text: packet.summary, files: [file] }).then(
        function () { return { mode: 'native' }; },
        function (error) {
          if (error && error.name === 'AbortError') return { mode: 'cancelled' };
          return { mode: 'error', error: error };
        }
      );
    }
    try {
      downloadReview(packet);
      openSummary(packet.summary);
      return Promise.resolve({ mode: 'fallback' });
    } catch (error) {
      return Promise.resolve({ mode: 'error', error: error });
    }
  }
  function packetStats(packet) {
    var notes = 0, unanswered = 0, variants = {};
    Object.keys(packet.pins).forEach(function (key) {
      notes += packet.pins[key].length;
      if (packet.pins[key].length) variants[key] = true;
    });
    Object.keys(packet.questions).forEach(function (key) {
      for (var i = 0; i < packet.questions[key].length; i++) {
        if (!packet.questions[key][i].answer) unanswered++;
      }
      if (packet.questions[key].length) variants[key] = true;
    });
    Object.keys(packet.verdicts).forEach(function (key) { variants[key] = true; });
    return { notes: notes, unanswered: unanswered, variants: Object.keys(variants).length };
  }
  function openFinish() {
    closePop();
    var old = document.querySelector('.pd-finish');
    if (old) old.remove();
    var packet = buildReviewPacket(), stats = packetStats(packet);
    var sheet = document.createElement('div');
    sheet.className = 'pd-form pd-finish';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Finish review');
    sheet.innerHTML = '<h2>Finish review</h2>' +
      '<p class="pd-note">' + stats.notes + (stats.notes === 1 ? ' note' : ' notes') +
      ' across ' + stats.variants + (stats.variants === 1 ? ' variant' : ' variants') + '</p>' +
      '<p class="pd-meta">' + stats.unanswered + (stats.unanswered === 1 ? ' unanswered question' : ' unanswered questions') +
      ' · Full page URL included</p>' +
      '<div class="r pd-finish-actions"><button type="button" class="pd-close-finish">Close</button>' +
      '<button type="button" class="pd-send-summary">Send summary</button>' +
      '<button type="button" class="pd-download-review">Download packet</button>' +
      '<button type="button" class="p pd-share-review">Share review</button></div>' +
      '<p class="pd-meta pd-finish-status" aria-live="polite"></p>';
    document.body.appendChild(sheet);
    sheet.style.bottom = (24 + (bar && bar.getBoundingClientRect ? bar.getBoundingClientRect().height : 0)) + 'px';
    var status = sheet.querySelector('.pd-finish-status');
    sheet.querySelector('.pd-close-finish').addEventListener('click', function () { sheet.remove(); });
    sheet.querySelector('.pd-send-summary').addEventListener('click', function () { openSummary(packet.summary); });
    sheet.querySelector('.pd-download-review').addEventListener('click', function () {
      try { downloadReview(packet); status.textContent = 'Packet downloaded'; }
      catch (e) { status.textContent = 'Could not download packet'; }
    });
    sheet.querySelector('.pd-share-review').addEventListener('click', function () {
      shareReview(packet).then(function (result) {
        if (result.mode === 'native') status.textContent = 'Review shared';
        else if (result.mode === 'cancelled') status.textContent = '';
        else if (result.mode === 'fallback') status.textContent = 'Packet downloaded · attach it to your message';
        else status.textContent = 'Could not share · use Download packet and Send summary';
      });
    });
  }

  function armed() {
    return !!(queryArmed || ssGet('pd-on') || lsGet(keyFor()) ||
      lsGet('pd-q:' + location.pathname + location.hash));
  }

  function build() {
    if (bar) return;
    var css = document.createElement('style');
    css.textContent =
      '.pd-bar{position:fixed;right:16px;bottom:16px;z-index:99990;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;' +
      'max-width:calc(100vw - 32px);background:#221F1B;color:#FCFAF7;border-radius:22px;padding:8px 10px 8px 16px;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;' +
      'box-shadow:0 12px 40px -12px rgba(0,0,0,.5)}' +
      '.pd-bar button{font:700 12px/1 ui-sans-serif,system-ui,sans-serif;border:0;border-radius:999px;padding:8px 12px;cursor:pointer;' +
      'background:#3a352f;color:#FCFAF7}' +
      '.pd-bar button.pd-add{background:#A82D46;color:#fff}' +
      '.pd-bar button.pd-add[data-on="1"]{outline:2px solid #fff}' +
      '.pd-verdict{display:flex;gap:4px}' +
      '.pd-verdict button{padding:6px 9px}' +
      '.pd-verdict button[data-on="1"]{background:#A82D46;color:#fff}' +
      '.pd-bar button:focus-visible{outline:2.5px solid #E5798C;outline-offset:2px}' +
      'body.pd-aim{cursor:crosshair}' +
      '.pd-pin{position:absolute;z-index:99980;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;' +
      'background:#A82D46;color:#fff;border:2px solid #fff;display:grid;place-items:center;' +
      'font:800 11px/1 ui-sans-serif,system-ui,sans-serif;box-shadow:0 4px 14px -4px rgba(0,0,0,.5);cursor:pointer}' +
      '.pd-pin.pd-stale{background:#FCFAF7;color:#8a8378;border-color:#8a8378}' +
      '.pd-pin.pd-done{background:#2E7D4F}' +
      '.pd-pin.pd-q{background:#2C5FA8;width:auto;min-width:24px;border-radius:12px;padding:0 4px}' +
      '.pd-pin.pd-q.pd-q-done{background:#FCFAF7;color:#2C5FA8;border-color:#2C5FA8}' +
      '.pd-form{position:absolute;z-index:99991;width:min(260px,80vw);background:#FCFAF7;color:#221F1B;border:1px solid #E7E0D6;' +
      'border-radius:12px;padding:10px;box-shadow:0 18px 50px -18px rgba(0,0,0,.45);font:400 13px/1.4 ui-sans-serif,system-ui,sans-serif}' +
      '.pd-form textarea{width:100%;box-sizing:border-box;min-height:64px;border:1px solid #E7E0D6;border-radius:8px;padding:7px;' +
      'font:inherit;resize:vertical;background:#fff;color:#221F1B}' +
      '.pd-form input{width:100%;box-sizing:border-box;border:1px solid #E7E0D6;border-radius:8px;padding:7px;margin-bottom:7px;' +
      'font:inherit;background:#fff;color:#221F1B}' +
      '.pd-form .r{display:flex;gap:6px;justify-content:flex-end;margin-top:7px}' +
      '.pd-form button{font:700 12px/1 ui-sans-serif,system-ui,sans-serif;border:0;border-radius:8px;padding:7px 11px;cursor:pointer;background:#F1EBE2;color:#221F1B}' +
      '.pd-finish{position:fixed;left:auto;right:16px;top:auto;bottom:72px;width:min(330px,calc(100vw - 32px));box-sizing:border-box}' +
      '.pd-finish h2{font:800 16px/1.2 ui-sans-serif,system-ui,sans-serif;margin:0 0 8px}' +
      '.pd-finish .pd-finish-actions{flex-wrap:wrap}' +
      '.pd-meta{font:600 11px/1.3 ui-sans-serif,system-ui,sans-serif;color:#8a8378;margin-bottom:4px}' +
      '.pd-note{margin:0 0 8px}' +
      '.pd-form .del{background:#F1EBE2;color:#A82D46}' +
      '.pd-form button.p{background:#A82D46;color:#fff}';
    document.head.appendChild(css);

    layer = document.createElement('div');
    layer.setAttribute('data-pindrop', '');
    document.body.appendChild(layer);

    bar = document.createElement('div');
    bar.className = 'pd-bar';
    bar.innerHTML = '<span class="pd-n"></span>' +
      '<span class="pd-verdict"><button type="button" data-vv="winner">Win</button><button type="button" data-vv="kill">Kill</button><button type="button" data-vv="meh">Meh</button></span>' +
      '<button type="button" class="pd-add">+ Add note</button>' +
      '<button type="button" class="pd-copy">Copy</button>' +
      '<button type="button" class="pd-copyall">Copy all</button>' +
      '<button type="button" class="pd-finish-btn">Finish review</button>' +
      '<button type="button" class="pd-send">Send</button>' +
      '<button type="button" class="pd-clear">Clear</button>' +
      '<button type="button" class="pd-x" aria-label="Hide feedback bar">✕</button>';
    document.body.appendChild(bar);
    nEl = bar.querySelector('.pd-n');
    addBtn = bar.querySelector('.pd-add');
    copyAllBtn = bar.querySelector('.pd-copyall');
    verdictEl = bar.querySelector('.pd-verdict');

    addBtn.addEventListener('click', function () {
      adding = !adding;
      addBtn.dataset.on = adding ? '1' : '';
      document.body.classList.toggle('pd-aim', adding);
    });
    verdictEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-vv]');
      if (!btn || !/^#[a-z0-9]{1,8}$/i.test(location.hash)) return;
      var active = btn.getAttribute('data-on') === '1';
      setVerdict(location.hash, active ? null : btn.getAttribute('data-vv'));
      paintVerdict();
    });

    document.addEventListener('click', function (e) {
      if (!adding) return;
      if (bar.contains(e.target) || e.target.closest('.pd-form,.pd-pin')) return;
      e.preventDefault(); e.stopPropagation();
      adding = false; addBtn.dataset.on = ''; document.body.classList.remove('pd-aim');
      form(e.pageX, e.pageY);
    }, true);
    document.addEventListener('click', function (e) {
      if (pop && !e.target.closest('.pd-form,.pd-pin')) closePop();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePop();
    });

    bar.querySelector('.pd-copy').addEventListener('click', function () {
      syncKey();
      writeOut(buildCopy(pins, loadQuestions(), ctxNow()), 'Copied!');
    });

    bar.querySelector('.pd-copyall').addEventListener('click', function () {
      var buckets = allBuckets();
      var qsAll = allQuestions();
      var total = feedbackTotal(buckets, qsAll);
      if (!total) { nEl.textContent = 'No notes yet'; setTimeout(render, 1400); return; }
      writeOut(buildCopyAll(buckets, getVerdicts(), qsAll, ctxNow()), 'Copied all ' + total + '!');
    });

    bar.querySelector('.pd-finish-btn').addEventListener('click', openFinish);

    bar.querySelector('.pd-send').addEventListener('click', function () {
      var buckets = allBuckets();
      var qsAll = allQuestions();
      var total = feedbackTotal(buckets, qsAll);
      if (!total) { nEl.textContent = 'No notes yet'; setTimeout(render, 1400); return; }
      var u = waUrl(buildCopyAll(buckets, getVerdicts(), qsAll, ctxNow()));
      var win = window.open(u, '_blank');
      if (!win) location.href = u;
    });

    bar.querySelector('.pd-clear').addEventListener('click', function () {
      if (pins.length && confirm('Clear all ' + pins.length + ' notes on this page?')) { pins = []; save(); render(); }
    });

    bar.querySelector('.pd-x').addEventListener('click', function () {
      ssRemove('pd-on');
      if (bar) bar.remove();
      if (layer) layer.remove();
      bar = layer = nEl = addBtn = copyAllBtn = verdictEl = null;
      api.mounted = false;
      document.body.classList.remove('pd-aim');
    });

    window.addEventListener('hashchange', function () { KEY = keyFor(); loadPins(); render(); paintVerdict(); });
    loadPins();
    render();
  }

  function mount() {
    if (api.mounted) return;
    api.mounted = true;
    ssSet('pd-on', '1');
    build();
  }

  function paintVerdict() {
    if (!verdictEl) return;
    var ok = /^#[a-z0-9]{1,8}$/i.test(location.hash);
    verdictEl.style.display = ok ? '' : 'none';
    var v = getVerdicts()[location.hash] || '';
    Array.prototype.forEach.call(verdictEl.querySelectorAll('[data-vv]'), function (btn) {
      btn.dataset.on = btn.getAttribute('data-vv') === v ? '1' : '';
    });
  }

  var api = { version: '2.1.0', mounted: false, mount: mount, buildReviewPacket: buildReviewPacket };
  window.pindrop = api;
  if (window.__PINDROP_TEST__) window.PINDROP = {
    keyFor: keyFor,
    fmtPin: fmtPin,
    allBuckets: allBuckets,
    migrateLegacy: migrateLegacy,
    normPin: normPin,
    pinId: pinId,
    pageVer: pageVer,
    ctxNow: ctxNow,
    buildCopy: buildCopy,
    buildCopyAll: buildCopyAll,
    waUrl: waUrl,
    cap: cap,
    esc: esc,
    whoName: whoName,
    getVerdicts: getVerdicts,
    setVerdict: setVerdict,
    loadQuestions: loadQuestions,
    allQuestions: allQuestions,
    saveAnswer: saveAnswer,
    stateCatalog: stateCatalog,
    capturePinContext: capturePinContext,
    captureEnvironment: captureEnvironment,
    buildReviewPacket: buildReviewPacket,
    reviewFilename: reviewFilename,
    reviewFile: reviewFile,
    downloadReview: downloadReview,
    shareReview: shareReview,
    cssPath: cssPath,
    anchorAt: anchorAt,
    pinXY: pinXY
  };

  function bootUp() { if (armed()) mount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUp);
  else bootUp();
})();
