// assets/js/ai-personalizer-full.js
// Complete local personalization + interactive models. Dry-academic quips.
// No external network requests. Owner-only hidden mode available (localStorage key 'ai:owner_token').

(function(){
  'use strict';

  const KEYS = {
    CONSENT: 'ai:consent',
    EVENTS: 'ai:events',
    DAILY: 'ai:daily',
    OWNER: 'ai:owner_token',
    PREFS: 'ai:prefs',
    THEME: 'site:theme'
  };
  const MAX_EVENTS = 3000;
  const ownerMode = (() => { try { return localStorage.getItem(KEYS.OWNER) !== null } catch(e){ return false } })();

  // dry-academic quips
  const QUIPS = [
    "Proofs tidy the mind; diagrams tidy the argument.",
    "A compact lemma saves many marginal notes.",
    "We prefer clear counterexamples to clever obscurity.",
    "Compose structures, decompose problems, repeat.",
    "If a picture helps, it's already doing the proof's job."
  ];

  // MODELS
  const MODELS = {
    'quantum-geometry': {
      title: 'Quantum Geometry',
      nodes: [
        {id:'A',label:'C*-Algebras',x:-80,y:-10},
        {id:'B',label:'Classical Core',x:60,y:-30},
        {id:'C',label:'Quantum Modality',x:-20,y:70},
        {id:'D',label:'Cohesive ∞-Topos',x:120,y:40},
        {id:'E',label:'Transparent Learners',x:0,y:160}
      ],
      edges: [['A','C'],['B','C'],['C','E'],['A','D'],['D','E']]
    },
    'research-timeline': {
      title: 'Research Timeline',
      nodes: [{id:'T1',label:'Model',x:-120,y:0},{id:'T2',label:'Obstruction',x:0,y:0},{id:'T3',label:'Resolution',x:120,y:0}],
      edges: [['T1','T2'],['T2','T3']]
    }
  };

  // helpers
  function safeGet(k, fallback){ try{ return JSON.parse(localStorage.getItem(k) || 'null') || fallback }catch(e){ return fallback } }
  function safeSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} }
  function now(){ return Date.now() }
  function todayKey(){ return new Date().toISOString().slice(0,10) }

  // events
  function pushEvent(evt){
    const evs = safeGet(KEYS.EVENTS, []);
    evs.push(evt);
    if(evs.length > MAX_EVENTS) evs.splice(0, evs.length - MAX_EVENTS);
    safeSet(KEYS.EVENTS, evs);

    const day = todayKey();
    const daily = safeGet(KEYS.DAILY, {});
    daily[day] = daily[day] || {views:0, timeMs:0, clicks:0, pages:{}};
    if(evt.type === 'pageview') daily[day].views++;
    if(evt.type === 'click') daily[day].clicks++;
    if(evt.type === 'time') daily[day].timeMs += evt.duration || 0;
    if(evt.page) daily[day].pages[evt.page] = (daily[day].pages[evt.page]||0) + 1;
    const keys = Object.keys(daily).sort().slice(-365);
    const pruned = {}; keys.forEach(k => pruned[k] = daily[k]);
    safeSet(KEYS.DAILY, pruned);
  }

  // consent UI
  function consentGiven(){ const c = safeGet(KEYS.CONSENT, null); return ownerMode || (c && c.granted === true) }
  function showConsent(){
    if(ownerMode) return;
    if(safeGet(KEYS.CONSENT, null) !== null) return;
    const bar = document.createElement('div'); bar.id = 'ai-consent-bar';
    bar.style.display = 'flex'; bar.style.alignItems = 'center'; bar.style.justifyContent = 'space-between';
    bar.innerHTML = `<div style="flex:1"><strong>Local personalization</strong> — this site adapts presentation locally on your device. No data leaves your browser.</div>
      <div style="display:flex;gap:8px"><button id="ai-consent-accept" style="background:var(--accent);color:#fff;padding:8px 10px;border-radius:8px;border:none">Accept</button><button id="ai-consent-decline" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#fff">Decline</button></div>`;
    document.body.appendChild(bar);
    document.getElementById('ai-consent-accept').addEventListener('click', ()=>{ safeSet(KEYS.CONSENT,{granted:true,ts:now()}); bar.remove(); startCollection(); });
    document.getElementById('ai-consent-decline').addEventListener('click', ()=>{ safeSet(KEYS.CONSENT,{granted:false,ts:now()}); bar.remove(); });
  }

  // instrumentation
  function instrumentPage(){
    const page = (location.pathname === '/')? 'index.html' : location.pathname.replace(/^\//,'');
    pushEvent({type:'pageview', page: page, ts: now()});
    document.addEventListener('click', (ev)=> {
      try {
        const t = ev.target.closest && ev.target.closest('a,button');
        if(!t) return;
        const tag = t.tagName.toLowerCase(); const href = tag === 'a' ? (t.getAttribute('href')||'') : '';
        pushEvent({type:'click', page: page, ts: now(), target: tag, href: href});
      } catch(e){}
    }, true);
    let start = now();
    function recordTime(){ const duration = Math.max(0, now() - start); pushEvent({type:'time', page: page, ts: now(), duration}); start = now(); }
    const hb = setInterval(recordTime, 30000);
    document.addEventListener('visibilitychange', ()=> { if(document.hidden) recordTime(); else start = now(); });
    window.addEventListener('beforeunload', ()=> recordTime());
  }
  function startCollection(){ try{ instrumentPage() }catch(e){ console.error(e) } }

  // personalization decision
  function countVisits(pageId, days){
    const daily = safeGet(KEYS.DAILY, {});
    if(!daily || typeof daily !== 'object') return 0;
    const keys = Object.keys(daily).sort().reverse().slice(0, days);
    let count = 0;
    keys.forEach(k => {
      const entry = daily[k];
      if(!entry || !entry.pages) return;
      Object.keys(entry.pages).forEach(p => { if(p.toLowerCase().includes(pageId.toLowerCase())) count += entry.pages[p]||0; });
    });
    if(count === 0){
      const evs = safeGet(KEYS.EVENTS, []);
      evs.forEach(e => { if(e.type === 'pageview' && e.page && e.page.toLowerCase().includes(pageId.toLowerCase())) count++; });
    }
    return count;
  }

  function decidePrefs(pageId){
    const rules = [
      {match: /contact/i, threshold: 2, days: 30, prefs: { accent: '#233a8a', cardLift: 16, lineHeight: 1.66 } },
      {match: /research/i, threshold: 2, days: 30, prefs: { accent: '#1652f0', cardLift: 12, lineHeight: 1.64 } },
      {match: /publications|paper|arxiv/i, threshold: 2, days: 45, prefs: { accent: '#5b3bd6', cardLift: 18, lineHeight: 1.6 } }
    ];
    for(const r of rules){
      if(r.match.test(pageId)){
        const visits = countVisits(pageId, r.days);
        if(visits >= r.threshold) return r.prefs;
        return null;
      }
    }
    const visits = countVisits(pageId, 30);
    if(visits >= 3) return { accent: '#233a8a', cardLift: 10, lineHeight: 1.68 };
    return null;
  }

  function applyPrefs(prefs){
    if(!prefs) return;
    safeSet(KEYS.PREFS, prefs);
    if(prefs.accent) document.documentElement.style.setProperty('--accent', prefs.accent);
    if(typeof prefs.lineHeight !== 'undefined') document.documentElement.style.setProperty('--line-height', prefs.lineHeight);
    if(typeof prefs.cardLift !== 'undefined') document.documentElement.style.setProperty('--card-lift', (prefs.cardLift||10) + 'px');
    document.documentElement.classList.add('page-enhanced');
  }

  function revealEnhancements(){ document.querySelectorAll('[data-enhance]').forEach(el => el.classList.add('enhanced-reveal')); }

  // quip rotate
  function displayQuip(){
    const el = document.getElementById('hero-quip'); if(!el) return;
    const idx = Math.floor((Date.now()/1000) % QUIPS.length);
    el.textContent = QUIPS[idx];
  }

  // model modal & graph
  function openModelModal(name){
    const model = MODELS[name]; if(!model) return;
    const modal = document.createElement('div'); modal.className = 'ai-model-modal';
    modal.innerHTML = `<div class="ai-model-content" role="dialog" aria-label="${escapeHtml(model.title)}">
      <button class="ai-model-close" aria-label="Close">✕</button>
      <h3>${escapeHtml(model.title)}</h3>
      <div class="ai-model-canvas" role="img" aria-label="${escapeHtml(model.title)}"></div>
      <div style="margin-top:8px"><small>Drag nodes to inspect relations.</small></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.ai-model-close').addEventListener('click', ()=> modal.remove());
    initSimpleGraph(modal.querySelector('.ai-model-canvas'), model);
  }

  function initSimpleGraph(container, model){
    const W = Math.min(window.innerWidth - 120, 760);
    const H = Math.min(window.innerHeight - 200, 520);
    const ns = 'http://www.w3.org/2000/svg';
    container.innerHTML = '';
    const svg = document.createElementNS(ns,'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.maxWidth='100%'; svg.style.height='auto';
    container.appendChild(svg);

    const nodes = model.nodes.map(n => ({...n, x:(W/2)+(n.x||0), y:(H/2)+(n.y||0), vx:0, vy:0}));
    const idMap = {}; nodes.forEach(n=> idMap[n.id] = n);
    const edges = model.edges.map(e => ({ source: idMap[e[0]], target: idMap[e[1]] }));

    const edgeEls = edges.map(()=> document.createElementNS(ns,'line')); edgeEls.forEach((ln,i)=>{ ln.setAttribute('stroke','rgba(7,18,34,0.12)'); ln.setAttribute('stroke-width','2'); svg.appendChild(ln); });
    const gNodes = nodes.map(()=> document.createElementNS(ns,'g')); gNodes.forEach(g=> svg.appendChild(g));

    gNodes.forEach((g,i)=>{
      const c = document.createElementNS(ns,'circle'); c.setAttribute('r','22'); c.setAttribute('fill','white'); c.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#233a8a'); c.setAttribute('stroke-width','2');
      const t = document.createElementNS(ns,'text'); t.setAttribute('x','0'); t.setAttribute('y','40'); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','12'); t.setAttribute('fill','rgba(2,6,23,0.85)'); t.textContent = nodes[i].label;
      g.appendChild(c); g.appendChild(t);
    });

    nodes.forEach((n,i)=>{
      let dragging=false, offset={x:0,y:0};
      const g = gNodes[i];
      function start(e){ dragging=true; const p = getEventPos(e, svg); offset.x = n.x - p.x; offset.y = n.y - p.y; }
      function move(e){ if(!dragging) return; const p = getEventPos(e, svg); n.x = p.x + offset.x; n.y = p.y + offset.y; n.vx = 0; n.vy = 0; }
      function end(){ dragging=false; }
      g.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
      g.addEventListener('touchstart', (ev)=>{ ev.preventDefault(); start(ev.touches[0]); }, { passive:false });
      window.addEventListener('touchmove', (ev)=>{ if(ev.touches && ev.touches[0]) move(ev.touches[0]); }, { passive:false });
      window.addEventListener('touchend', end);
    });

    function getEventPos(e, svgEl){ const r = svgEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    function tick(){
      // springs
      for(const ed of edges){
        const s = ed.source, t = ed.target; const dx = t.x - s.x, dy = t.y - s.y; const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy)); const desired = 140; const k = 0.02;
        const fx = k*(dist - desired)*(dx/dist), fy = k*(dist - desired)*(dy/dist);
        s.vx += fx; s.vy += fy; t.vx -= fx; t.vy -= fy;
      }
      // repulsion
      for(let i=0;i<nodes.length;i++){ for(let j=i+1;j<nodes.length;j++){ const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx*dx + dy*dy; if(d2 < 1) d2 = 1; const force = 1200 / d2; a.vx -= force*dx; a.vy -= force*dy; b.vx += force*dx; b.vy += force*dy; } }
      for(const n of nodes){ n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy; n.x = Math.max(30, Math.min(W-30, n.x)); n.y = Math.max(30, Math.min(H-30, n.y)); }
      edges.forEach((ed,i)=>{ edgeEls[i].setAttribute('x1', ed.source.x); edgeEls[i].setAttribute('y1', ed.source.y); edgeEls[i].setAttribute('x2', ed.target.x); edgeEls[i].setAttribute('y2', ed.target.y); });
      gNodes.forEach((g,i)=> g.setAttribute('transform', `translate(${nodes[i].x},${nodes[i].y})`));
      raf = requestAnimationFrame(tick);
    }
    let raf = requestAnimationFrame(tick);
    const obs = new MutationObserver(()=>{ if(!document.body.contains(container)) { cancelAnimationFrame(raf); obs.disconnect(); }});
    obs.observe(document.body, { childList:true, subtree:true });
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // attach model buttons in markup
  function attachModelButtons(){
    document.querySelectorAll('[data-model]').forEach(el=>{
      // if element already has a model button, skip
      if(el.querySelector('.ai-model-btn') || el.querySelector('.model-btn')) return;
      const name = el.dataset.model;
      const btn = document.createElement('button'); btn.className = 'ai-model-btn'; btn.type = 'button'; btn.textContent = 'View model';
      btn.addEventListener('click', ()=> openModelModal(name));
      el.appendChild(btn);
    });
    // also wire any elements with class "model-btn" (for markup that already has a button)
    document.querySelectorAll('.model-btn').forEach(b => {
      if(b.dataset.model) b.addEventListener('click', ()=> openModelModal(b.dataset.model));
    });
  }

  // debug overlay (owner-only)
  function toggleDebugOverlay(){
    if(!ownerMode && !safeGet('ai:debug_allowed', false)) return;
    let dbg = document.getElementById('ai-debug-overlay'); if(dbg){ dbg.remove(); return; }
    dbg = document.createElement('div'); dbg.id = 'ai-debug-overlay';
    const evs = safeGet(KEYS.EVENTS, []).slice(-100).reverse(); const daily = safeGet(KEYS.DAILY, {});
    dbg.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Owner local view</div><div style="max-height:300px;overflow:auto"><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify({events: evs.slice(0,40), daily}, null, 2))}</pre></div><div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end"><button id="ai-debug-export" style="background:var(--accent);color:#fff;border:none;padding:6px 8px;border-radius:8px">Export</button><button id="ai-debug-clear" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 8px;border-radius:8px">Clear</button></div>`;
    document.body.appendChild(dbg);
    document.getElementById('ai-debug-export').addEventListener('click', ()=>{
      const data = { events: safeGet(KEYS.EVENTS, []), daily: safeGet(KEYS.DAILY, {}), prefs: safeGet(KEYS.PREFS, {}) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ai-local-data.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    document.getElementById('ai-debug-clear').addEventListener('click', ()=> {
      localStorage.removeItem(KEYS.EVENTS); localStorage.removeItem(KEYS.DAILY); localStorage.removeItem(KEYS.PREFS); localStorage.removeItem(KEYS.CONSENT); localStorage.removeItem(KEYS.OWNER); location.reload();
    });
  }

  // init
  function init(){
    // theme
    try {
      const saved = localStorage.getItem(KEYS.THEME);
      if(saved) document.documentElement.setAttribute('data-theme', saved);
      else document.documentElement.setAttribute('data-theme', window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.getElementById('theme-toggle')?.addEventListener('click', ()=>{
        const cur = document.documentElement.getAttribute('data-theme') || 'light'; const nxt = cur === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nxt); try{ localStorage.setItem(KEYS.THEME, nxt); }catch(e){}
      });
    }catch(e){}

    // quip
    displayQuip();
    // consent & collection
    if(consentGiven()) startCollection(); else showConsent();
    // personalization apply
    const pageId = (location.pathname === '/') ? 'index.html' : location.pathname.replace(/^\//,'');
    const prefs = decidePrefs(pageId);
    if(prefs) applyPrefs(prefs);
    // reveal & attach models
    revealEnhancements();
    attachModelButtons();
    // debug overlay trigger
    window.addEventListener('keydown', (e)=>{ if(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') toggleDebugOverlay(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // expose for console/testing
  window.__aiLocal = { openModelModal, pushEvent, safeGet, safeSet, decidePrefs, applyPrefs };

})();
