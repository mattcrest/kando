/**
 * Kando Atlas view — entity mind-map with roadmap weather.
 * Domain clusters, relation edges, card-driven entity highlighting.
 * Exposed surface: window.renderAtlasView, window.destroyAtlasView
 */
(function () {
  'use strict';

  const PHI = (1 + Math.sqrt(5)) / 2;
  const ENTITY_R = 42;
  const NODE_GAP = 18;
  const DOMAIN_ORBIT = 300;
  const MARGIN = 80;

  const SIGNAL_KINDS = new Set(['channel', 'job']);

  const KIND_ICONS = {
    core: '<circle cx="8" cy="8" r="4.5"/>',
    supporting: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>',
    channel: '<path d="M 8 2.2 C 5.6 2.2 4.4 4 4.4 6 C 4.4 8.8 3.2 9.6 3.2 10.4 L 12.8 10.4 C 12.8 9.6 11.6 8.8 11.6 6 C 11.6 4 10.4 2.2 8 2.2 Z"/>',
    job: '<circle cx="8" cy="8" r="5.5"/><path d="M 8 5.2 L 8 8 L 10.2 9.2"/>',
  };

  const WEATHER_LABEL = {
    active: 'In motion',
    prioritized: 'Charted next',
    backlog: 'On the horizon',
    settled: 'Settled ground',
    empty: 'Quiet',
  };

  const CARD_STATUS_ORDER = ['Active', 'Prioritized', 'Backlog', 'Done', 'Blocked', 'Deferred'];

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'atlas-view-styles';
    style.textContent = `
      .atlas-shell {
        --aa: var(--atlas-accent, var(--accent));
        display: flex;
        flex-direction: column;
        height: calc(100vh - var(--header-h));
        background: var(--bg);
        overflow: hidden;
      }
      .atlas-toolbar {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        padding: 10px 20px;
        border-bottom: 1px solid var(--border-md);
        background: var(--toolbar-bg);
        flex-shrink: 0;
      }
      .atlas-toolbar-title {
        font-size: var(--fs-xs);
        font-weight: 800;
        color: var(--aa);
        text-transform: uppercase;
        letter-spacing: .14em;
      }
      .atlas-toolbar-title::after {
        content: 'map';
        margin-left: 7px;
        font-weight: 500;
        letter-spacing: .18em;
        color: var(--text-3);
      }
      .atlas-filter-group {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-wrap: wrap;
        padding-left: 14px;
        border-left: 1px solid var(--border-md);
      }
      .atlas-filter-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--text-3);
        text-transform: uppercase;
        letter-spacing: .12em;
        margin-right: 5px;
      }
      .atlas-filter-btn {
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-3);
        font-size: 10px;
        font-weight: 700;
        padding: 4px 9px;
        cursor: pointer;
        letter-spacing: .07em;
        text-transform: uppercase;
        border-radius: 99px;
        transition: all .14s;
        font-family: var(--font);
      }
      .atlas-filter-btn:hover { color: var(--text-1); border-color: var(--border-md); }
      .atlas-filter-btn.active {
        background: color-mix(in srgb, var(--aa) 14%, transparent);
        border-color: color-mix(in srgb, var(--aa) 45%, transparent);
        color: var(--text-1);
      }
      .atlas-filter-btn.signals-toggle.active {
        background: var(--aa);
        border-color: var(--aa);
        color: var(--bg);
      }
      .atlas-body {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .atlas-weather-rail {
        width: 248px;
        flex-shrink: 0;
        border-right: 1px solid var(--border-md);
        background: var(--surface);
        overflow-y: auto;
        padding: 14px 12px 20px;
      }
      .atlas-rail-heading {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .14em;
        color: var(--text-3);
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border-md);
      }
      .atlas-rail-hint {
        font-size: 10px;
        color: var(--text-3);
        line-height: 1.45;
        margin-bottom: 12px;
      }
      .atlas-rail-group { margin-bottom: 12px; }
      .atlas-rail-status {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: var(--text-3);
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .atlas-rail-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .atlas-rail-status-dot.st-active { background: var(--aa); box-shadow: 0 0 4px var(--aa); }
      .atlas-rail-status-dot.st-prioritized { background: color-mix(in srgb, var(--aa) 70%, var(--surface)); }
      .atlas-rail-status-dot.st-backlog { border: 1.2px dashed var(--text-3); background: transparent; }
      .atlas-rail-card {
        display: block;
        width: 100%;
        text-align: left;
        border: 1px solid var(--border-md);
        background: var(--bg);
        color: var(--text-1);
        font-family: var(--font);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
        padding: 7px 9px;
        border-radius: var(--r-sm, 6px);
        cursor: pointer;
        margin-bottom: 4px;
        transition: all .12s;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .atlas-rail-card:hover {
        border-color: var(--aa);
        background: color-mix(in srgb, var(--aa) 8%, var(--bg));
      }
      .atlas-rail-card.selected {
        background: var(--aa);
        border-color: var(--aa);
        color: var(--bg);
      }
      .atlas-main {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        position: relative;
      }
      .atlas-canvas-wrap {
        flex: 1;
        min-width: 0;
        cursor: grab;
        overflow: hidden;
        position: relative;
        background:
          radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in srgb, var(--aa) 6%, transparent), transparent 65%),
          radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-3) 12%, transparent) 1px, transparent 0),
          var(--bg);
        background-size: auto, 28px 28px, auto;
      }
      .atlas-canvas-wrap::after {
        content: '';
        position: absolute; inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 100px color-mix(in srgb, var(--bg) 65%, transparent);
      }
      .atlas-canvas-wrap.panning { cursor: grabbing; }
      .atlas-canvas-wrap svg { display: block; width: 100%; height: 100%; user-select: none; }
      .atlas-domain-hull {
        fill: color-mix(in srgb, var(--surface) 50%, transparent);
        stroke: var(--border);
        stroke-width: 1;
      }
      .atlas-domain-hull.alt { fill: color-mix(in srgb, var(--surface) 30%, transparent); }
      .atlas-domain-label {
        font-family: var(--font);
        font-size: 11px;
        font-weight: 800;
        fill: var(--text-2);
        text-transform: uppercase;
        letter-spacing: .2em;
        text-anchor: middle;
      }
      .atlas-relation {
        fill: none;
        stroke: color-mix(in srgb, var(--text-3) 50%, transparent);
        stroke-width: 1.5;
        transition: opacity .18s;
      }
      .atlas-relation.dimmed { opacity: .1; }
      .atlas-relation.kind-notifies {
        stroke: color-mix(in srgb, var(--aa) 70%, transparent);
        stroke-dasharray: 7 6;
        animation: atlas-flow 1.4s linear infinite;
      }
      @keyframes atlas-flow { to { stroke-dashoffset: -13; } }
      .atlas-relation.kind-flows-into { stroke-width: 1.8; }
      .atlas-relation.kind-owns { stroke-dasharray: 4 5; }
      .atlas-entity { cursor: pointer; }
      .atlas-entity .entity-inner {
        transform-box: fill-box;
        transform-origin: center;
        transition: transform .16s cubic-bezier(.34,1.4,.5,1), filter .16s;
      }
      .atlas-entity:hover .entity-inner {
        transform: scale(1.06);
        filter: drop-shadow(0 4px 16px color-mix(in srgb, var(--aa) 25%, rgba(0,0,0,.3)));
      }
      .atlas-entity.dimmed { opacity: .14; }
      .atlas-entity.dimmed:hover .entity-inner { transform: none; filter: none; }
      .atlas-entity.highlighted .entity-base {
        stroke: var(--aa);
        stroke-width: 2.5;
        filter: drop-shadow(0 0 14px color-mix(in srgb, var(--aa) 55%, transparent));
      }
      .atlas-entity.selected .entity-base {
        stroke: var(--aa);
        stroke-width: 2.5;
        filter: drop-shadow(0 0 12px color-mix(in srgb, var(--aa) 45%, transparent));
      }
      .entity-base {
        fill: var(--surface);
        stroke: var(--border-md);
        stroke-width: 1.5;
      }
      .entity-icon {
        stroke: var(--text-3);
        stroke-width: 1.3;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .entity-label {
        font-family: var(--font);
        font-size: 11px;
        font-weight: 600;
        fill: var(--text-1);
        text-anchor: middle;
        pointer-events: none;
      }
      .entity-count-bg { fill: var(--aa); }
      .entity-count {
        font-family: var(--font);
        font-size: 9px;
        font-weight: 800;
        fill: var(--bg);
        text-anchor: middle;
        dominant-baseline: central;
        pointer-events: none;
      }
      .entity-check {
        stroke: var(--text-3);
        stroke-width: 1.6;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .atlas-entity.w-active .entity-base {
        fill: color-mix(in srgb, var(--aa) 16%, var(--surface));
        stroke: var(--aa);
      }
      .atlas-entity.w-active .entity-icon { stroke: var(--aa); }
      .entity-beacon {
        fill: none;
        stroke: var(--aa);
        stroke-width: 1.5;
        transform-box: fill-box;
        transform-origin: center;
        animation: atlas-beacon 2.2s ease-out infinite;
      }
      @keyframes atlas-beacon {
        0%   { transform: scale(1); opacity: .75; }
        70%  { transform: scale(1.2); opacity: 0; }
        100% { transform: scale(1.2); opacity: 0; }
      }
      .atlas-entity.w-prioritized .entity-base {
        fill: color-mix(in srgb, var(--aa) 8%, var(--surface));
        stroke: color-mix(in srgb, var(--aa) 55%, var(--border-md));
      }
      .entity-ants {
        fill: none;
        stroke: var(--aa);
        stroke-width: 1.4;
        stroke-dasharray: 5 5;
        animation: atlas-ants 9s linear infinite;
      }
      @keyframes atlas-ants { to { stroke-dashoffset: -100; } }
      .atlas-entity.w-backlog .entity-base {
        fill: color-mix(in srgb, var(--surface) 45%, transparent);
        stroke-dasharray: 5 4;
        stroke: color-mix(in srgb, var(--text-3) 70%, transparent);
      }
      .atlas-entity.w-empty .entity-base {
        fill: color-mix(in srgb, var(--surface) 60%, transparent);
        stroke: var(--border);
      }
      .atlas-entity.w-empty .entity-label { fill: var(--text-2); }
      .atlas-world.entering .atlas-entity .entity-inner {
        animation: atlas-arrive .5s cubic-bezier(.22,1,.36,1) both;
        animation-delay: calc(var(--i) * 24ms);
      }
      .atlas-world.entering .atlas-relation {
        animation: atlas-edge-in .6s ease both;
        animation-delay: calc(var(--i) * 24ms + 200ms);
      }
      @keyframes atlas-arrive {
        from { opacity: 0; transform: scale(.88); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes atlas-edge-in { from { opacity: 0; } }
      .atlas-legend {
        position: absolute;
        left: 14px;
        bottom: 12px;
        display: flex;
        gap: 12px;
        padding: 6px 12px;
        border-radius: 99px;
        background: color-mix(in srgb, var(--surface) 88%, transparent);
        border: 1px solid var(--border-md);
        backdrop-filter: blur(6px);
        pointer-events: none;
        z-index: 3;
      }
      .atlas-legend-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 8.5px;
        font-weight: 700;
        color: var(--text-3);
        text-transform: uppercase;
        letter-spacing: .1em;
      }
      .atlas-legend-swatch { width: 12px; height: 9px; border-radius: 3px; }
      .atlas-legend-swatch.sw-active {
        background: color-mix(in srgb, var(--aa) 30%, var(--surface));
        border: 1.2px solid var(--aa);
      }
      .atlas-legend-swatch.sw-prioritized {
        border: 1.2px dashed var(--aa);
        background: transparent;
      }
      .atlas-legend-swatch.sw-settled {
        border: 1.2px solid var(--border-md);
        background: var(--surface);
      }
      .atlas-tooltip {
        position: absolute;
        max-width: 280px;
        padding: 7px 11px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--text-1) 94%, transparent);
        color: var(--bg);
        font-family: var(--font);
        font-size: 11.5px;
        font-weight: 600;
        line-height: 1.35;
        pointer-events: none;
        z-index: 4;
        opacity: 0;
        transform: translate(-50%, 4px);
        transition: opacity .14s, transform .14s;
        box-shadow: 0 4px 18px rgba(0,0,0,.25);
      }
      .atlas-tooltip.show { opacity: 1; transform: translate(-50%, 0); }
      .atlas-tooltip::after {
        content: '';
        position: absolute;
        left: 50%; top: 100%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: color-mix(in srgb, var(--text-1) 94%, transparent);
      }
      .atlas-zoomctl {
        position: absolute;
        right: 14px;
        bottom: 12px;
        display: flex;
        flex-direction: column;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border-md);
        background: color-mix(in srgb, var(--surface) 92%, transparent);
        z-index: 3;
      }
      .atlas-zoomctl button {
        border: none;
        background: transparent;
        color: var(--text-2);
        width: 30px;
        height: 28px;
        font-size: 14px;
        cursor: pointer;
        font-family: var(--font);
      }
      .atlas-zoomctl button:hover { background: color-mix(in srgb, var(--aa) 14%, transparent); color: var(--text-1); }
      .atlas-zoomctl button + button { border-top: 1px solid var(--border); }
      .atlas-panel {
        width: 300px;
        flex-shrink: 0;
        border-left: 1px solid var(--border-md);
        background: var(--surface);
        overflow-y: auto;
        padding: 18px 18px 24px;
        display: none;
      }
      .atlas-panel.open { display: block; }
      .atlas-panel-empty {
        font-size: var(--fs-sm);
        color: var(--text-3);
        padding: 20px 6px;
        text-align: center;
        line-height: 1.5;
      }
      .atlas-panel-kicker {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 8px;
      }
      .atlas-panel-kicker svg { width: 14px; height: 14px; stroke: var(--aa); stroke-width: 1.4; fill: none; }
      .atlas-panel-domain {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .14em;
        color: var(--aa);
      }
      .atlas-panel-weather {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: var(--text-3);
        margin-left: auto;
      }
      .atlas-panel-title {
        font-size: 17px;
        font-weight: 700;
        color: var(--text-1);
        margin-bottom: 8px;
        line-height: 1.25;
      }
      .atlas-panel-desc {
        font-size: var(--fs-sm);
        color: var(--text-2);
        line-height: 1.5;
        margin-bottom: 14px;
      }
      .atlas-cards-heading {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .14em;
        color: var(--text-3);
        margin-bottom: 8px;
        padding-bottom: 5px;
        border-bottom: 1px solid var(--border-md);
      }
      .atlas-status-group { margin-bottom: 10px; }
      .atlas-status-label {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: var(--text-3);
        margin-bottom: 4px;
      }
      .atlas-card-chip {
        display: block;
        width: 100%;
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 9px;
        border-radius: var(--r-sm, 6px);
        border: 1px solid var(--border-md);
        background: var(--bg);
        color: var(--text-1);
        cursor: pointer;
        margin-bottom: 4px;
        font-family: var(--font);
        transition: all .12s;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .atlas-card-chip:hover { border-color: var(--aa); }
      .atlas-card-chip.selected { background: var(--aa); border-color: var(--aa); color: var(--bg); }
    `;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function computeWeather(cards) {
    if (!cards || cards.length === 0) return 'empty';
    if (cards.some((c) => c.status === 'Active' || c.agent_status === 'in_progress')) return 'active';
    if (cards.some((c) => c.status === 'Prioritized')) return 'prioritized';
    if (cards.every((c) => c.status === 'Backlog')) return 'backlog';
    if (cards.every((c) => c.status === 'Done')) return 'settled';
    return 'settled';
  }

  function buildCardToEntities(atlas) {
    const map = {};
    for (const [cardId, entityIds] of Object.entries(atlas.cardMapping || {})) {
      map[cardId] = entityIds || [];
    }
    return map;
  }

  function collectRailCards(entityCards, atlas) {
    const seen = new Set();
    const cards = [];
    for (const entity of atlas.entities || []) {
      for (const c of entityCards[entity.id] || []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        cards.push(c);
      }
    }
    const groups = {};
    for (const c of cards) {
      const st = c.status || 'Backlog';
      if (!groups[st]) groups[st] = [];
      groups[st].push(c);
    }
    return CARD_STATUS_ORDER.filter((s) => groups[s]?.length).map((s) => ({
      status: s,
      cards: groups[s],
    }));
  }

  function layoutMindMap(atlas) {
    const domains = atlas.domains || [];
    const entities = atlas.entities || [];
    const byDomain = {};
    for (const d of domains) byDomain[d.id] = [];
    for (const e of entities) {
      if (!byDomain[e.domain]) byDomain[e.domain] = [];
      byDomain[e.domain].push(e);
    }

    const centerX = 520;
    const centerY = 420;
    const domainCenters = {};
    const n = Math.max(domains.length, 1);
    domains.forEach((d, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      domainCenters[d.id] = {
        x: centerX + DOMAIN_ORBIT * Math.cos(angle),
        y: centerY + DOMAIN_ORBIT * Math.sin(angle),
      };
    });

    const positions = {};
    for (const d of domains) {
      const ents = byDomain[d.id] || [];
      const cx = domainCenters[d.id].x;
      const cy = domainCenters[d.id].y;
      ents.forEach((e, i) => {
        const angle = i * ((2 * Math.PI) / PHI);
        const radius = 38 + i * 24;
        positions[e.id] = {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
          domain: d.id,
          r: ENTITY_R,
        };
      });
    }

    const ids = Object.keys(positions);
    const minDist = ENTITY_R * 2 + NODE_GAP;
    for (let iter = 0; iter < 70; iter++) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = positions[ids[i]];
          const b = positions[ids[j]];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
      for (const e of entities) {
        const p = positions[e.id];
        const c = domainCenters[e.domain];
        if (!p || !c) continue;
        p.x += (c.x - p.x) * 0.035;
        p.y += (c.y - p.y) * 0.035;
      }
    }

    const domainLayouts = domains.map((d, idx) => {
      const pts = (byDomain[d.id] || []).map((e) => positions[e.id]).filter(Boolean);
      const cx0 = domainCenters[d.id].x;
      const cy0 = domainCenters[d.id].y;
      if (!pts.length) {
        return { id: d.id, label: d.label, index: idx, cx: cx0, cy: cy0, rx: 90, ry: 70 };
      }
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        id: d.id,
        label: d.label,
        index: idx,
        cx: (Math.min(...xs) + Math.max(...xs)) / 2,
        cy: (Math.min(...ys) + Math.max(...ys)) / 2,
        rx: (Math.max(...xs) - Math.min(...xs)) / 2 + ENTITY_R + 32,
        ry: (Math.max(...ys) - Math.min(...ys)) / 2 + ENTITY_R + 32,
      };
    });

    const allPts = Object.values(positions);
    let minX = Math.min(...allPts.map((p) => p.x)) - ENTITY_R - MARGIN;
    let maxX = Math.max(...allPts.map((p) => p.x)) + ENTITY_R + MARGIN;
    let minY = Math.min(...allPts.map((p) => p.y)) - ENTITY_R - MARGIN;
    let maxY = Math.max(...allPts.map((p) => p.y)) + ENTITY_R + MARGIN;
    for (const dl of domainLayouts) {
      minX = Math.min(minX, dl.cx - dl.rx - 20);
      maxX = Math.max(maxX, dl.cx + dl.rx + 20);
      minY = Math.min(minY, dl.cy - dl.ry - 28);
      maxY = Math.max(maxY, dl.cy + dl.ry + 20);
    }

    const offsetX = -minX;
    const offsetY = -minY;
    for (const id of ids) {
      positions[id].x += offsetX;
      positions[id].y += offsetY;
    }
    for (const dl of domainLayouts) {
      dl.cx += offsetX;
      dl.cy += offsetY;
    }

    return {
      positions,
      domainLayouts,
      contentW: maxX - minX,
      contentH: maxY - minY,
    };
  }

  function relationPath(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const fx = from.x + nx * from.r;
    const fy = from.y + ny * from.r;
    const tx = to.x - nx * to.r;
    const ty = to.y - ny * to.r;
    const bend = Math.min(60, dist * 0.25);
    const c1x = fx + (-ny * bend);
    const c1y = fy + (nx * bend);
    const c2x = tx + (-ny * bend);
    const c2y = ty + (nx * bend);
    return `M ${fx} ${fy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
  }

  function truncateLabel(text, maxLen) {
    const s = String(text || '');
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1).trimEnd() + '…';
  }

  function groupCardsByStatus(cards) {
    const groups = {};
    for (const c of cards || []) {
      const st = c.status || 'Backlog';
      if (!groups[st]) groups[st] = [];
      groups[st].push(c);
    }
    return CARD_STATUS_ORDER.filter((s) => groups[s]?.length).map((s) => ({
      status: s,
      cards: groups[s],
    }));
  }

  function destroyInstance(rootEl) {
    const inst = rootEl?._atlasInstance;
    if (!inst) return;
    if (inst.cleanup) inst.cleanup();
    delete rootEl._atlasInstance;
  }

  function renderAtlasView(rootEl, payload, options) {
    if (!rootEl) return;
    injectStyles();
    destroyInstance(rootEl);

    const atlas = payload.atlas;
    const entityCards = payload.entityCards || {};
    const accentColor = options?.accentColor || null;
    if (accentColor) rootEl.style.setProperty('--atlas-accent', accentColor);

    const entityById = Object.fromEntries((atlas.entities || []).map((e) => [e.id, e]));
    const domainById = Object.fromEntries((atlas.domains || []).map((d) => [d.id, d]));
    const cardToEntities = buildCardToEntities(atlas);
    const layout = layoutMindMap(atlas);

    const state = {
      selectedEntityId: null,
      selectedCardId: null,
      domainFilter: new Set((atlas.domains || []).map((d) => d.id)),
      signalsOnly: false,
      pan: { x: 0, y: 0 },
      zoom: 1,
      isPanning: false,
      panStart: null,
      hasEntered: false,
    };

    rootEl.innerHTML = `
      <div class="atlas-shell">
        <div class="atlas-toolbar" id="atlas-toolbar"></div>
        <div class="atlas-body">
          <aside class="atlas-weather-rail" id="atlas-rail"></aside>
          <div class="atlas-main">
            <div class="atlas-canvas-wrap" id="atlas-canvas-wrap">
              <svg id="atlas-svg" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <marker id="atlas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0.5 0.8 L 7.2 4 L 0.5 7.2" fill="none" stroke="color-mix(in srgb, var(--text-3) 60%, transparent)" stroke-width="1.3" stroke-linecap="round"/>
                  </marker>
                  <marker id="atlas-arrow-accent" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0.5 0.8 L 7.2 4 L 0.5 7.2" fill="none" stroke="var(--atlas-accent, var(--accent))" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>
                  </marker>
                </defs>
                <g class="atlas-world entering" id="atlas-world"></g>
              </svg>
              <div class="atlas-legend">
                <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-active"></span>In motion</span>
                <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-prioritized"></span>Next</span>
                <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-settled"></span>Settled</span>
              </div>
              <div class="atlas-tooltip" id="atlas-tooltip"></div>
              <div class="atlas-zoomctl">
                <button type="button" id="atlas-zoom-in" title="Zoom in">+</button>
                <button type="button" id="atlas-zoom-out" title="Zoom out">−</button>
                <button type="button" id="atlas-zoom-fit" title="Fit">⌖</button>
              </div>
            </div>
            <aside class="atlas-panel" id="atlas-panel">
              <div class="atlas-panel-empty">Click an entity to inspect roadmap weather, or select a card from the rail to trace what it touches.</div>
            </aside>
          </div>
        </div>
      </div>`;

    const toolbar = rootEl.querySelector('#atlas-toolbar');
    const rail = rootEl.querySelector('#atlas-rail');
    const canvasWrap = rootEl.querySelector('#atlas-canvas-wrap');
    const svg = rootEl.querySelector('#atlas-svg');
    const world = rootEl.querySelector('#atlas-world');
    const panel = rootEl.querySelector('#atlas-panel');
    const tooltip = rootEl.querySelector('#atlas-tooltip');

    function hideTooltip() {
      tooltip.classList.remove('show');
    }

    function showEntityTooltip(node) {
      const id = node.dataset.entity;
      const entity = entityById[id];
      if (!entity) return;
      const label = entity.description ? `${entity.label} — ${entity.description}` : entity.label;
      const nodeRect = node.getBoundingClientRect();
      const wrapRect = canvasWrap.getBoundingClientRect();
      tooltip.textContent = label;
      tooltip.style.left = `${nodeRect.left + nodeRect.width / 2 - wrapRect.left}px`;
      tooltip.style.bottom = `${wrapRect.bottom - nodeRect.top + 8}px`;
      tooltip.style.top = 'auto';
      tooltip.classList.add('show');
    }

    function buildToolbar() {
      const domainBtns = (atlas.domains || [])
        .map(
          (d) =>
            `<button type="button" class="atlas-filter-btn${state.domainFilter.has(d.id) ? ' active' : ''}" data-domain="${d.id}">${esc(d.label)}</button>`
        )
        .join('');
      toolbar.innerHTML = `
        <span class="atlas-toolbar-title">${esc(atlas.title || 'Atlas')}</span>
        <div class="atlas-filter-group">
          <span class="atlas-filter-label">Domain</span>${domainBtns}
        </div>
        <div class="atlas-filter-group">
          <button type="button" class="atlas-filter-btn signals-toggle${state.signalsOnly ? ' active' : ''}" id="atlas-signals-toggle">Signals</button>
        </div>`;

      toolbar.querySelectorAll('[data-domain]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.domain;
          if (state.domainFilter.has(id)) state.domainFilter.delete(id);
          else state.domainFilter.add(id);
          if (state.domainFilter.size === 0) (atlas.domains || []).forEach((d) => state.domainFilter.add(d.id));
          buildToolbar();
          renderScene();
        });
      });
      toolbar.querySelector('#atlas-signals-toggle')?.addEventListener('click', () => {
        state.signalsOnly = !state.signalsOnly;
        buildToolbar();
        renderScene();
      });
    }

    function buildRail() {
      const groups = collectRailCards(entityCards, atlas);
      const showStatuses = new Set(['Active', 'Prioritized', 'Backlog']);
      const filtered = groups.filter((g) => showStatuses.has(g.status));
      let html = `
        <div class="atlas-rail-heading">Roadmap weather</div>
        <div class="atlas-rail-hint">Select a card to trace every entity it touches on the map.</div>`;
      if (!filtered.length) {
        html += '<div class="atlas-panel-empty" style="padding:8px 0">No in-flight roadmap cards mapped yet.</div>';
      } else {
        html += filtered
          .map(
            (g) => `
          <div class="atlas-rail-group">
            <div class="atlas-rail-status">
              <span class="atlas-rail-status-dot st-${esc(g.status.toLowerCase())}"></span>${esc(g.status)}
            </div>
            ${g.cards
              .map(
                (c) =>
                  `<button type="button" class="atlas-rail-card${state.selectedCardId === c.id ? ' selected' : ''}" data-card="${esc(c.id)}" title="${esc(c.title)}">${esc(truncateLabel(c.title, 36))}</button>`
              )
              .join('')}
          </div>`
          )
          .join('');
      }
      rail.innerHTML = html;
      rail.querySelectorAll('.atlas-rail-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cardId = btn.dataset.card;
          state.selectedCardId = state.selectedCardId === cardId ? null : cardId;
          state.selectedEntityId = null;
          panel.classList.remove('open');
          panel.innerHTML =
            '<div class="atlas-panel-empty">Click an entity to inspect roadmap weather, or select a card from the rail to trace what it touches.</div>';
          buildRail();
          renderScene();
        });
      });
    }

    function entityVisible(entity) {
      if (!state.domainFilter.has(entity.domain)) return false;
      if (state.signalsOnly && !SIGNAL_KINDS.has(entity.kind)) return false;
      return true;
    }

    function entityDimmed(entity) {
      if (!entityVisible(entity)) return true;
      if (state.selectedCardId) {
        const touched = (cardToEntities[state.selectedCardId] || []).includes(entity.id);
        return !touched;
      }
      return false;
    }

    function relationDimmed(rel) {
      const from = entityById[rel.from];
      const to = entityById[rel.to];
      if (!from || !to) return true;
      if (state.signalsOnly) {
        const signalRel = rel.kind === 'notifies' || SIGNAL_KINDS.has(from.kind) || SIGNAL_KINDS.has(to.kind);
        if (!signalRel) return true;
      }
      if (state.selectedCardId) {
        const touchedIds = new Set(cardToEntities[state.selectedCardId] || []);
        return !(touchedIds.has(from.id) || touchedIds.has(to.id));
      }
      return entityDimmed(from) && entityDimmed(to);
    }

    function applyViewBox() {
      const { contentW, contentH } = layout;
      const rect = canvasWrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const baseScale = Math.max(0.45, Math.min(rect.width / contentW, rect.height / contentH, 1.05));
      const scale = baseScale * state.zoom;
      const vw = rect.width / scale;
      const vh = rect.height / scale;
      const vx = (contentW - vw) / 2 + state.pan.x;
      const vy = (contentH - vh) / 2 + state.pan.y;
      svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    }

    function entityMarkup(entity, idx) {
      const pos = layout.positions[entity.id];
      if (!pos) return '';
      const cards = entityCards[entity.id] || [];
      const weather = computeWeather(cards);
      const dim = entityDimmed(entity);
      const selected = state.selectedEntityId === entity.id;
      const highlighted =
        state.selectedCardId && (cardToEntities[state.selectedCardId] || []).includes(entity.id);

      const classes = ['atlas-entity', `w-${weather}`];
      if (dim) classes.push('dimmed');
      if (selected) classes.push('selected');
      if (highlighted) classes.push('highlighted');

      const label = truncateLabel(entity.label, 16);
      const truncated = label.endsWith('…');
      const icon = KIND_ICONS[entity.kind] || KIND_ICONS.core;

      let inner = '';
      if (weather === 'active') {
        inner += `<circle class="entity-beacon" cx="${pos.x}" cy="${pos.y}" r="${pos.r + 6}"/>`;
      }
      inner += `<circle class="entity-base" cx="${pos.x}" cy="${pos.y}" r="${pos.r}"/>`;
      if (weather === 'prioritized') {
        inner += `<circle class="entity-ants" cx="${pos.x}" cy="${pos.y}" r="${pos.r + 4}"/>`;
      }
      inner += `<g class="entity-icon" transform="translate(${pos.x - 8} ${pos.y - 10})">${icon}</g>`;
      inner += `<text class="entity-label" x="${pos.x}" y="${pos.y + pos.r + 16}">${esc(label)}</text>`;
      if (cards.length > 0) {
        inner += `<circle class="entity-count-bg" cx="${pos.x + pos.r - 4}" cy="${pos.y - pos.r + 6}" r="8"/>`;
        inner += `<text class="entity-count" x="${pos.x + pos.r - 4}" y="${pos.y - pos.r + 6}">${cards.length}</text>`;
      }
      if (weather === 'settled') {
        inner += `<path class="entity-check" d="M ${pos.x + pos.r - 14} ${pos.y + pos.r - 8} l 3 3 6 -7"/>`;
      }

      return `<g class="${classes.join(' ')}" data-entity="${esc(entity.id)}"${truncated ? ` data-full-label="${esc(entity.label)}"` : ''} style="--i:${idx}">
        <g class="entity-inner">${inner}</g>
      </g>`;
    }

    function renderScene() {
      const parts = [];

      for (const dl of layout.domainLayouts) {
        parts.push(
          `<ellipse class="atlas-domain-hull${dl.index % 2 ? ' alt' : ''}" cx="${dl.cx}" cy="${dl.cy}" rx="${dl.rx}" ry="${dl.ry}"/>`,
          `<text class="atlas-domain-label" x="${dl.cx}" y="${dl.cy - dl.ry + 18}">${esc(dl.label)}</text>`
        );
      }

      let relIdx = 0;
      for (const rel of atlas.relations || []) {
        const from = layout.positions[rel.from];
        const to = layout.positions[rel.to];
        if (!from || !to) continue;
        const dim = relationDimmed(rel);
        const kind = rel.kind || 'references';
        const accent = kind === 'notifies';
        parts.push(
          `<path class="atlas-relation kind-${esc(kind)}${dim ? ' dimmed' : ''}" d="${relationPath(from, to)}" marker-end="url(#${accent ? 'atlas-arrow-accent' : 'atlas-arrow'})" style="--i:${relIdx}"/>`
        );
        relIdx += 1;
      }

      let nodeIdx = 0;
      for (const entity of atlas.entities || []) {
        parts.push(entityMarkup(entity, nodeIdx));
        nodeIdx += 1;
      }

      world.innerHTML = parts.join('\n');

      if (state.hasEntered) world.classList.remove('entering');
      else {
        state.hasEntered = true;
        setTimeout(() => world.classList.remove('entering'), nodeIdx * 24 + 900);
      }

      world.querySelectorAll('.atlas-entity').forEach((node) => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedEntityId = node.dataset.entity;
          state.selectedCardId = null;
          hideTooltip();
          buildRail();
          renderScene();
          renderPanel(state.selectedEntityId);
        });
        node.addEventListener('mouseenter', () => {
          if (node.dataset.fullLabel) {
            const nodeRect = node.getBoundingClientRect();
            const wrapRect = canvasWrap.getBoundingClientRect();
            tooltip.textContent = node.dataset.fullLabel;
            tooltip.style.left = `${nodeRect.left + nodeRect.width / 2 - wrapRect.left}px`;
            tooltip.style.bottom = `${wrapRect.bottom - nodeRect.top + 8}px`;
            tooltip.style.top = 'auto';
            tooltip.classList.add('show');
          } else {
            showEntityTooltip(node);
          }
        });
        node.addEventListener('mouseleave', hideTooltip);
      });
    }

    function renderPanel(entityId) {
      const entity = entityById[entityId];
      if (!entity) {
        panel.classList.remove('open');
        return;
      }
      panel.classList.add('open');
      const cards = entityCards[entityId] || [];
      const weather = computeWeather(cards);
      const groups = groupCardsByStatus(cards);
      const domain = domainById[entity.domain];

      let cardsHtml = '';
      if (!groups.length) {
        cardsHtml =
          '<div class="atlas-panel-empty" style="padding:10px 0">No roadmap cards mapped to this entity.</div>';
      } else {
        cardsHtml = groups
          .map(
            (g) => `
          <div class="atlas-status-group">
            <div class="atlas-status-label">${esc(g.status)}</div>
            ${g.cards
              .map(
                (c) =>
                  `<button type="button" class="atlas-card-chip${state.selectedCardId === c.id ? ' selected' : ''}" data-card="${esc(c.id)}" title="${esc(c.title)}">${esc(truncateLabel(c.title, 42))}</button>`
              )
              .join('')}
          </div>`
          )
          .join('');
      }

      panel.innerHTML = `
        <div class="atlas-panel-kicker">
          <svg viewBox="0 0 16 16">${KIND_ICONS[entity.kind] || KIND_ICONS.core}</svg>
          <span class="atlas-panel-domain">${esc(domain?.label || entity.domain)}</span>
          <span class="atlas-panel-weather">${esc(WEATHER_LABEL[weather] || '')}</span>
        </div>
        <div class="atlas-panel-title">${esc(entity.label)}</div>
        ${entity.description ? `<div class="atlas-panel-desc">${esc(entity.description)}</div>` : ''}
        <div class="atlas-cards-heading">Roadmap cards</div>
        ${cardsHtml}`;

      panel.querySelectorAll('.atlas-card-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const cardId = chip.dataset.card;
          state.selectedCardId = state.selectedCardId === cardId ? null : cardId;
          buildRail();
          renderScene();
          renderPanel(entityId);
        });
      });
    }

    function clearSelection() {
      state.selectedEntityId = null;
      state.selectedCardId = null;
      panel.classList.remove('open');
      panel.innerHTML =
        '<div class="atlas-panel-empty">Click an entity to inspect roadmap weather, or select a card from the rail to trace what it touches.</div>';
      buildRail();
      renderScene();
    }

    function onWheel(e) {
      e.preventDefault();
      hideTooltip();
      state.zoom = Math.min(3, Math.max(0.35, state.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      applyViewBox();
    }

    function onPointerDown(e) {
      if (e.target.closest('.atlas-entity') || e.target.closest('.atlas-zoomctl')) return;
      hideTooltip();
      state.isPanning = true;
      state.panStart = { x: e.clientX, y: e.clientY, panX: state.pan.x, panY: state.pan.y };
      canvasWrap.classList.add('panning');
    }

    function onPointerMove(e) {
      if (!state.isPanning || !state.panStart) return;
      const rect = canvasWrap.getBoundingClientRect();
      const { contentW, contentH } = layout;
      const baseScale = Math.max(0.45, Math.min(rect.width / contentW, rect.height / contentH, 1.05));
      const scale = baseScale * state.zoom;
      state.pan.x = state.panStart.panX - (e.clientX - state.panStart.x) / scale;
      state.pan.y = state.panStart.panY - (e.clientY - state.panStart.y) / scale;
      applyViewBox();
    }

    function onPointerUp() {
      state.isPanning = false;
      state.panStart = null;
      canvasWrap.classList.remove('panning');
    }

    canvasWrap.addEventListener('wheel', onWheel, { passive: false });
    canvasWrap.addEventListener('mousedown', onPointerDown);
    canvasWrap.addEventListener('click', (e) => {
      if (!e.target.closest('.atlas-entity') && !e.target.closest('.atlas-zoomctl')) clearSelection();
    });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    rootEl.querySelector('#atlas-zoom-in')?.addEventListener('click', () => {
      state.zoom = Math.min(3, state.zoom * 1.2);
      applyViewBox();
    });
    rootEl.querySelector('#atlas-zoom-out')?.addEventListener('click', () => {
      state.zoom = Math.max(0.35, state.zoom / 1.2);
      applyViewBox();
    });
    rootEl.querySelector('#atlas-zoom-fit')?.addEventListener('click', () => {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      applyViewBox();
    });

    const onResize = () => applyViewBox();
    window.addEventListener('resize', onResize);

    buildToolbar();
    buildRail();
    renderScene();
    applyViewBox();

    rootEl._atlasInstance = {
      cleanup() {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('resize', onResize);
        canvasWrap.removeEventListener('wheel', onWheel);
      },
    };
  }

  window.renderAtlasView = renderAtlasView;
  window.destroyAtlasView = destroyInstance;
})();
