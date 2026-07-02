// assets/js/ai-personalizer-full.js
// Full local personalization + per-page expansion + interactive model widget.
// Consent-first; owner-only hidden mode via localStorage key 'ai:owner_token'.
// No external network calls. Everything stored locally (localStorage).

(function () {
  'use strict';

  // ======= CONFIG =======
  const KEYS = {
    CONSENT: 'ai:consent',
    EVENTS: 'ai:events',
    DAILY: 'ai:daily',
    OWNER: 'ai:owner_token',
  };

  // Per-page rules (pattern -> prefs). Pattern is tested case-insensitively against path.
  // Adjust thresholds/lookback as you wish.
  const RULES = [
    { pattern: 'contact', threshold: 2, lookbackDays: 30, prefs: { accent: '#1d4ed8', cardLift: 14, lineHeight: 1.68, expandSelector: '.container' } },
    { pattern: 'research', threshold: 2, lookbackDays: 30, prefs: { accent: '#16a34a', cardLift: 10, lineHeight: 1.65, expandSelector: '.container' } },
    { pattern: 'publications|publication|paper|arxiv', threshold: 2, lookbackDays: 45, prefs: { accent: '#7c3aed', cardLift: 16, lineHeight: 1.6, expandSelector: '.container' } }
  ];
  // Default fallback
  const DEFAULT_RULE = { threshold: 3, lookbackDays: 30, prefs: { accent: '#2563eb', cardLift: 8, lineHeight: 1.7 } };

  const MAX_EVENTS = 2000;

  // ======= UTIL =======
  function safeGet(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (e) { return fallback; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore quota */ }
  }
  function exists(key) {
    try { return localStorage.getItem(key) !== null; } catch (e) { return false; }
  }
  function now() { return Date.now(); }
  function todayKey() { return new Date().toISOString().slice(0,10); }

  // Owner mode detection
  const ownerMode = exists(KEYS.OWNER);

  // ======= EVENT STORAGE & DAILY SUMMARY =======
  function pushEvent(evt) {
    const arr = safeGet(KEYS.EVENTS, []);
    arr.push(evt);
    if (arr.length > MAX_EVENTS) arr.splice(0, arr.length - MAX_EVENTS);
    safeSet(KEYS.EVENTS, arr);

    // update daily summary
    const day = todayKey();
    const daily = safeGet(KEYS.DAILY, {});
    daily[day] = daily[day] || { views:0, timeMs:0, clicks:0, pages: {} };
    if (evt.type === 'pageview') daily[day].views++;
    if (evt.type === 'click') daily[day].clicks++;
    if (evt.type === 'time') daily[day].timeMs += evt.duration || 0;
    if (evt.page) daily[day].pages[evt.page] = (daily[day].pages[evt.page] || 0) + 1;
    // prune to last 365 days
    const keys = Object.keys(daily).sort().slice(-365);
    const pruned = {};
    keys.forEach(k => pruned[k] = daily[k]);
    safeSet(KEYS.DAILY, pruned);
  }

  // ======= CONSENT UI =======
  function consentGiven() {
    const c = safeGet(KEYS.CONSENT, null);
    return ownerMode || (c && c.granted === true);
  }

  function showConsentBannerIfNeeded() {
    if (ownerMode) return; // owner bypass
    if (safeGet(KEYS.CONSENT, null) !== null) return;
    const bar = document.createElement('div');
    bar.id = 'ai-consent-bar';
    bar.style.position = 'fixed';
    bar.style.left = '12px';
    bar.style.right = '12px';
    bar.style.bottom = '16px';
    bar.style.zIndex = '9999';
    bar.style.background = 'rgba(15,23,42,0.92)';
    bar.style.color = '#fff';
    bar.style.padding = '10px 14px';
    bar.style.borderRadius = '10px';
    bar.style.boxShadow = '0 8px 32px rgba(2,6,23,0.3)';
    bar.style.fontFamily = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
    bar.style.fontSize = '13px';
    bar.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between">
        <div style="flex:1">
          <strong style="display:block;margin-bottom:6px">Local personalization</strong>
          This site can adapt presentation locally on your device for returning visitors. No data leaves your browser. Accept to enable local improvements.
        </div>
        <div style="flex-shrink:0;display:flex;gap:8px">
          <button id="ai-consent-accept" style="background:var(--accent,#2563eb);color:#fff;border:none;padding:8px 10px;border-radius:8px;cursor:pointer">Accept</button>
          <button id="ai-consent-decline" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 10px;border-radius:8px;cursor:pointer">Decline</button>
        </div>
      </div>`;
    document.body.appendChild(bar);
    document.getElementById('ai-consent-accept').addEventListener('click', () => {
      safeSet(KEYS.CONSENT, { granted: true, ts: now() });
      bar.remove();
      startCollection();
    });
    document.getElementById('ai-consent-decline').addEventListener('click', () => {
      safeSet(KEYS.CONSENT, { granted: false, ts: now() });
      bar.remove();
    });
  }

  // ======= INSTRUMENTATION =======
  function instrumentPage() {
    const page = (location.pathname === '/' ? 'index.html' : location.pathname.replace(/^\//,''));
    pushEvent({ type: 'pageview', page: page, ts: now() });

    // clicks
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target.closest && ev.target.closest('a,button');
        if (!t) return;
        const tag = t.tagName.toLowerCase();
        const href = tag === 'a' ? (t.getAttribute('href') || '') : '';
        pushEvent({ type: 'click', page: page, ts: now(), target: tag, href: href });
      } catch (e) {}
    }, true);

    // time on page
    let start = now();
    function recordTime() {
      const duration = Math.max(0, now() - start);
      pushEvent({ type: 'time', page: page, ts: now(), duration });
      start = now();
    }
    const heartbeat = setInterval(recordTime, 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) recordTime();
      else start = now();
    });
    window.addEventListener('beforeunload', () => recordTime());
  }

  function startCollection() {
    try { instrumentPage(); } catch (e) { console.error(e); }
  }

  // ======= PER-PAGE DECISION & APPLY PREFS =======
  function countVisitsForPage(pageId, lookbackDays) {
    const daily = safeGet(KEYS.DAILY, {});
    if (!daily || typeof daily !== 'object') return 0;
    const days = Object.keys(daily).sort().reverse().slice(0, lookbackDays);
    let count = 0;
    for (const d of days) {
      const entry = daily[d];
      if (!entry || !entry.pages) continue;
      for (const p of Object.keys(entry.pages)) {
        if (p.toLowerCase().includes(pageId.toLowerCase())) count += (entry.pages[p] || 0);
      }
    }
    // fallback to simple counts in EVENTS if daily has nothing
    if (count === 0) {
      const evs = safeGet(KEYS.EVENTS, []);
      for (const e of evs) if (e.type === 'pageview' && e.page && e.page.toLowerCase().includes(pageId.toLowerCase())) count++;
    }
    return count;
  }

  function decidePrefs(pageId) {
    for (const r of RULES) {
      try {
        const re = new RegExp(r.pattern, 'i');
        if (re.test(pageId)) {
          const visits = countVisitsForPage(pageId, r.lookbackDays);
          if (visits >= (r.threshold || 1)) return r.prefs;
          return null;
        }
      } catch (e) { continue; }
    }
    // fallback default
    const visits = countVisitsForPage(pageId, DEFAULT_RULE.lookbackDays);
    if (visits >= DEFAULT_RULE.threshold) return DEFAULT_RULE.prefs;
    return null;
  }

  function applyPrefs(prefs) {
    if (!prefs) return;
    if (prefs.accent) document.documentElement.style.setProperty('--accent', prefs.accent);
    if (typeof prefs.lineHeight !== 'undefined') document.documentElement.style.setProperty('--line-height', prefs.lineHeight);
    if (typeof prefs.cardLift !== 'undefined') document.documentElement.style.setProperty('--card-lift', (prefs.cardLift||8) + 'px');
    document.documentElement.classList.add('page-enhanced');
    if (prefs.expandSelector) {
      const el = document.querySelector(prefs.expandSelector);
      if (el) el.classList.add('enhanced-expand');
    }
  }

  // Reveal any elements that were marked and hidden
  function revealMarked() {
    document.querySelectorAll('[data-enhance]').forEach(el => {
      // element should be initially hidden via CSS (opacity:0/transform). We add class to reveal.
      el.classList.add('enhanced-reveal');
      // if element has data-expand attribute, add a class to expand it
      if (el.dataset.expand === 'true') el.classList.add('enhanced-expand-target');
    });
  }

  // ======= INTERACTIVE MODEL WIDGET =======
  // A small, embeddable SVG/DOM widget that draws nodes and edges and is draggable.
  // Models are small sets of nodes/edges defined here. You can add more models.
  const MODELS = {
    'quantum-geometry': {
      title: 'Quantum Geometry (concept map)',
      nodes: [
        { id: 'A', label: 'C*-Algebras', x: -80, y: -10 },
        { id: 'B', label: 'Classical Core', x: 60, y: -30 },
        { id: 'C', label: 'Quantum Modality', x: -20, y: 70 },
        { id: 'D', label: 'Cohesive ∞-Topos', x: 120, y: 40 },
        { id: 'E', label: 'Transparent Learners', x: 0, y: 160 }
      ],
      edges: [
        ['A','C'], ['B','C'], ['C','E'], ['A','D'], ['D','E']
      ]
    },
    'research-timeline': {
      title: 'Research Timeline (interactive)',
      nodes: [
        { id:'T1', label: 'Model' , x:-120, y:0},
        { id:'T2', label: 'Obstruction' , x:0, y:0},
        { id:'T3', label: 'Resolution' , x:120, y:0}
      ],
      edges: [['T1','T2'], ['T2','T3']]
    }
  };

  function createModelButton(el, modelName) {
    const btn = document.createElement('button');
    btn.textContent = 'Open model';
    btn.className = 'ai-model-btn';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => openModelModal(modelName));
    el.appendChild(btn);
  }

  function openModelModal(name) {
    const model = MODELS[name];
    if (!model) return;
    // create modal
    const modal = document.createElement('div');
    modal.className = 'ai-model-modal';
    modal.innerHTML = `
      <div class="ai-model-content">
        <button class="ai-model-close" aria-label="Close">✕</button>
        <h3>${escapeHtml(model.title)}</h3>
        <div class="ai-model-canvas" role="img" aria-label="${escapeHtml(model.title)}"></div>
        <div style="margin-top:8px"><small>Drag nodes to inspect relationships. Close to dismiss.</small></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.ai-model-close').addEventListener('click', () => modal.remove());
    const canvas = modal.querySelector('.ai-model-canvas');
    // create SVG
    initSimpleGraph(canvas, model);
  }

  // Simple interactive graph (no external libs). Draggable nodes and basic spring layout.
  function initSimpleGraph(container, model) {
    const W = Math.min(window.innerWidth - 120, 760);
    const H = Math.min(window.innerHeight - 200, 520);
    const ns = 'http://www.w3.org/2000/svg';
    container.innerHTML = '';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    container.appendChild(svg);

    // map nodes
    const nodes = model.nodes.map(n => ({...n, x: (W/2)+(n.x||0), y: (H/2)+(n.y||0), vx:0, vy:0}));
    const nodeById = {};
    nodes.forEach(n => nodeById[n.id] = n);

    // create edges
    const edges = model.edges.map(e => ({ source: nodeById[e[0]], target: nodeById[e[1]] }));

    // draw edges
    const edgeEls = edges.map(() => document.createElementNS(ns,'line'));
    edgeEls.forEach((ln, i) => {
      ln.setAttribute('stroke', 'rgba(15,23,42,0.12)');
      ln.setAttribute('stroke-width', '2');
      svg.appendChild(ln);
    });

    // draw nodes
    const gNodes = nodes.map(() => document.createElementNS(ns,'g'));
    gNodes.forEach(g => svg.appendChild(g));
    const circleEls = nodes.map((n, i) => {
      const g = gNodes[i];
      const c = document.createElementNS(ns,'circle');
      c.setAttribute('r', 22);
      c.setAttribute('fill', 'white');
      c.setAttribute('stroke', 'var(--accent,#2563eb)');
      c.setAttribute('stroke-width', '2');
      g.appendChild(c);
      const t = document.createElementNS(ns,'text');
      t.setAttribute('x', 0);
      t.setAttribute('y', 40);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '12');
      t.setAttribute('fill', 'rgba(2,6,23,0.8)');
      t.textContent = n.label;
      g.appendChild(t);
      return g;
    });

    // drag handling
    nodes.forEach((n, i) => {
      let dragging = false;
      let offset = {x:0,y:0};
      const g = gNodes[i];
      function start(e) {
        dragging = true;
        const p = getEventPos(e);
        offset.x = n.x - p.x; offset.y = n.y - p.y;
      }
      function move(e) {
        if (!dragging) return;
        const p = getEventPos(e);
        n.x = p.x + offset.x; n.y = p.y + offset.y;
        n.vx = 0; n.vy = 0;
      }
      function end() { dragging = false; }
      g.addEventListener('mousedown', start);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      // touch
      g.addEventListener('touchstart', (ev)=>{ ev.preventDefault(); start(ev.touches[0]); }, { passive:false });
      window.addEventListener('touchmove', (ev)=>{ if (ev.touches && ev.touches[0]) move(ev.touches[0]); }, { passive:false });
      window.addEventListener('touchend', end);
    });

    function getEventPos(e) {
      return { x: e.clientX - svg.getBoundingClientRect().left, y: e.clientY - svg.getBoundingClientRect().top };
    }

    // simple layout / physics loop
    function tick() {
      // attractive spring along edges
      for (const ed of edges) {
        const s = ed.source, t = ed.target;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
        const desired = 140;
        const k = 0.02;
        const fx = k * (dist - desired) * (dx / dist);
        const fy = k * (dist - desired) * (dy / dist);
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      }
      // repulsion
      for (let i=0;i<nodes.length;i++){
        for (let j=i+1;j<nodes.length;j++){
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx*dx + dy*dy;
          if (d2 < 1) d2 = 1;
          const force = 1200 / d2;
          a.vx -= force * dx; a.vy -= force * dy;
          b.vx += force * dx; b.vy += force * dy;
        }
      }
      // integrate
      for (const n of nodes) {
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        // boundaries
        n.x = Math.max(30, Math.min(W-30, n.x));
        n.y = Math.max(30, Math.min(H-30, n.y));
      }
      // render edges & nodes
      edges.forEach((ed, i) => {
        edgeEls[i].setAttribute('x1', ed.source.x);
        edgeEls[i].setAttribute('y1', ed.source.y);
        edgeEls[i].setAttribute('x2', ed.target.x);
        edgeEls[i].setAttribute('y2', ed.target.y);
      });
      gNodes.forEach((g, i) => {
        g.setAttribute('transform', `translate(${nodes[i].x},${nodes[i].y})`);
      });
      raf = requestAnimationFrame(tick);
    }
    let raf = requestAnimationFrame(tick);
    // stop animation when modal removed
    const observer = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        cancelAnimationFrame(raf);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // simple escaping
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // Create model buttons on elements with data-model
  function attachModelButtons() {
    document.querySelectorAll('[data-model]').forEach(el => {
      const name = el.dataset.model;
      // avoid creating duplicate button
      if (el.querySelector('.ai-model-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'ai-model-btn';
      btn.type = 'button';
      btn.textContent = 'View model';
      btn.addEventListener('click', () => openModelModal(name));
      // place button in top-right of the marked element (or append)
      btn.style.marginLeft = '8px';
      el.appendChild(btn);
    });
  }

  // ======= INITIALIZATION =======
  function init() {
    if (!consentGiven()) {
      showConsentBannerIfNeeded();
    } else {
      startCollection();
    }
    // After DOM ready, decide on current page
    const pageId = (location.pathname === '/' ? 'index.html' : location.pathname.replace(/^\//,''));
    const prefs = decidePrefs(pageId);
    if (prefs) applyPrefs(prefs);
    // Reveal any user-marked enhancement areas (data-enhance)
    revealMarked();
    // Attach model buttons
    attachModelButtons();
    // If owner-mode, enable debug overlay on Ctrl+Shift+A
    if (ownerMode) {
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') toggleDebugOverlay();
      });
    } else {
      // still allow debug if explicit key present in storage (user granted)
      if (exists('ai:debug_allowed')) {
        window.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') toggleDebugOverlay();
        });
      }
    }
  }

  // debug overlay
  function toggleDebugOverlay() {
    if (!ownerMode && !exists('ai:debug_allowed')) return;
    let dbg = document.getElementById('ai-debug-overlay');
    if (dbg) { dbg.remove(); return; }
    dbg = document.createElement('div');
    dbg.id = 'ai-debug-overlay';
    dbg.style = 'position:fixed;right:12px;top:12px;z-index:99999;background:rgba(2,6,23,0.95);color:#fff;padding:12px;border-radius:10px;max-width:420px;font-size:12px;';
    const evs = safeGet(KEYS.EVENTS, []).slice(-100).reverse();
    const daily = safeGet(KEYS.DAILY, {});
    dbg.innerHTML = `<div style="font-weight:600;margin-bottom:8px">Owner local view</div>
      <div style="max-height:300px;overflow:auto"><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify({ events: evs.slice(0,40), daily }, null, 2))}</pre></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="ai-debug-export" style="background:var(--accent);border:none;color:#fff;padding:6px 8px;border-radius:8px">Export</button>
        <button id="ai-debug-clear" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 8px;border-radius:8px">Clear</button>
        <button id="ai-debug-close" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 8px;border-radius:8px">Close</button>
      </div>`;
    document.body.appendChild(dbg);
    document.getElementById('ai-debug-export').addEventListener('click', () => {
      const data = { events: safeGet(KEYS.EVENTS, []), daily: safeGet(KEYS.DAILY, {}), prefs: safeGet(KEYS.PREFS, {}) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'ai-local-data.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    document.getElementById('ai-debug-clear').addEventListener('click', () => {
      localStorage.removeItem(KEYS.EVENTS); localStorage.removeItem(KEYS.DAILY); localStorage.removeItem(KEYS.PREFS); localStorage.removeItem(KEYS.CONSENT); localStorage.removeItem(KEYS.OWNER); dbg.remove(); location.reload();
    });
    document.getElementById('ai-debug-close').addEventListener('click', () => dbg.remove());
  }

  // run when DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
