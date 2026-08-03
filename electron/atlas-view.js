/**
 * Kando Atlas view — journey-first SVG product map with roadmap weather.
 * Visual direction: "cartographer's chart" — lane bands as map regions,
 * moments as substantial plotted stations, roadmap weather as light + motion.
 * Exposed surface: window.renderAtlasView, window.destroyAtlasView
 */
(function () {
  'use strict';

  const NODE_W = 148;
  const NODE_H = 58;
  const NODE_R = 12;
  const PILL_W = 158;
  const PILL_H = 40;
  const PILL_R = 20;
  const STEP = NODE_W + 46;
  const LANE_PAD_X = 28;
  const LANE_PAD_TOP = 46;
  const LANE_PAD_BOTTOM = 24;
  const CHANNEL_GAP = 34;
  const LANE_GAP = 26;
  const MARGIN = 36;

  const KINDS = ['screen', 'pos', 'admin', 'notify', 'job', 'payment', 'decision'];
  const CHANNEL_KINDS = new Set(['notify', 'job']);

  /* 16x16 stroke icons, drawn at 1.4px */
  const KIND_ICONS = {
    screen: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.8"/><line x1="1.5" y1="5.8" x2="14.5" y2="5.8"/><circle cx="3.6" cy="4.2" r=".2"/>',
    pos: '<rect x="3" y="1.5" width="10" height="13" rx="1.8"/><line x1="5.4" y1="4.4" x2="10.6" y2="4.4"/><circle cx="6" cy="8" r=".3"/><circle cx="10" cy="8" r=".3"/><circle cx="6" cy="11" r=".3"/><circle cx="10" cy="11" r=".3"/>',
    admin: '<circle cx="8" cy="5" r="2.6"/><path d="M 2.8 14 C 2.8 10.8 5 9.2 8 9.2 C 11 9.2 13.2 10.8 13.2 14"/>',
    notify: '<path d="M 8 1.8 C 5.4 1.8 4 3.8 4 6.2 C 4 9.4 2.6 10.4 2.6 11.4 L 13.4 11.4 C 13.4 10.4 12 9.4 12 6.2 C 12 3.8 10.6 1.8 8 1.8 Z"/><path d="M 6.4 13.4 C 6.7 14.2 7.3 14.6 8 14.6 C 8.7 14.6 9.3 14.2 9.6 13.4"/>',
    job: '<circle cx="8" cy="8" r="6.2"/><path d="M 8 4.6 L 8 8 L 10.6 9.6"/>',
    payment: '<rect x="1.5" y="3.5" width="13" height="9.5" rx="1.6"/><line x1="1.5" y1="6.6" x2="14.5" y2="6.6"/><line x1="4" y1="10.4" x2="7" y2="10.4"/>',
    decision: '<path d="M 8 1.6 L 14.4 8 L 8 14.4 L 1.6 8 Z"/>',
  };

  const WEATHER_LABEL = {
    active: 'In motion',
    prioritized: 'Charted next',
    backlog: 'On the horizon',
    settled: 'Settled ground',
    empty: 'Quiet',
  };

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

      /* ---------- toolbar ---------- */
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
        content: 'atlas';
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
      .atlas-filter-btn.notifications-toggle.active {
        background: var(--aa);
        border-color: var(--aa);
        color: var(--bg);
      }

      /* ---------- canvas ---------- */
      .atlas-main { display: flex; flex: 1; min-height: 0; position: relative; }
      .atlas-canvas-wrap {
        flex: 1;
        min-width: 0;
        cursor: grab;
        overflow: hidden;
        position: relative;
        background:
          radial-gradient(ellipse 90% 70% at 20% 0%, color-mix(in srgb, var(--aa) 5%, transparent), transparent 60%),
          radial-gradient(ellipse 80% 60% at 90% 100%, color-mix(in srgb, var(--aa) 4%, transparent), transparent 55%),
          radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-3) 14%, transparent) 1px, transparent 0),
          var(--bg);
        background-size: auto, auto, 26px 26px, auto;
      }
      .atlas-canvas-wrap::after {
        content: '';
        position: absolute; inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 90px color-mix(in srgb, var(--bg) 70%, transparent);
      }
      .atlas-canvas-wrap.panning { cursor: grabbing; }
      .atlas-canvas-wrap svg { display: block; width: 100%; height: 100%; user-select: none; }

      /* contour rings */
      .atlas-contour { fill: none; stroke: var(--text-3); opacity: .045; stroke-width: 1; }

      /* lane bands */
      .atlas-lane-band {
        fill: color-mix(in srgb, var(--surface) 55%, transparent);
        stroke: var(--border);
        rx: 18;
      }
      .atlas-lane-band.alt { fill: color-mix(in srgb, var(--surface) 30%, transparent); }
      .atlas-lane-name {
        font-family: var(--font);
        font-size: 12px;
        font-weight: 800;
        fill: var(--text-2);
        text-transform: uppercase;
        letter-spacing: .22em;
      }
      .atlas-lane-index {
        font-family: var(--font);
        font-size: 10px;
        font-weight: 600;
        fill: color-mix(in srgb, var(--aa) 75%, var(--text-3));
        letter-spacing: .1em;
      }
      .atlas-lane-rule { stroke: var(--border-md); stroke-width: 1; opacity: .6; }
      .atlas-channel-tag {
        font-family: var(--font);
        font-size: 8.5px;
        font-weight: 700;
        fill: var(--text-3);
        text-transform: uppercase;
        letter-spacing: .16em;
        opacity: .8;
      }

      /* ---------- edges ---------- */
      .atlas-edge {
        fill: none;
        stroke: color-mix(in srgb, var(--text-3) 55%, transparent);
        stroke-width: 1.6;
        transition: opacity .18s;
      }
      .atlas-edge.dimmed { opacity: .12; }
      .atlas-edge.kind-or { stroke-dasharray: 2 5; stroke-linecap: round; }
      .atlas-edge.kind-fails { stroke: color-mix(in srgb, #c05b3c 75%, var(--text-3)); stroke-dasharray: 7 4; }
      .atlas-edge.kind-notifies,
      .atlas-edge.kind-triggers {
        stroke: color-mix(in srgb, var(--aa) 72%, transparent);
        stroke-width: 1.7;
        stroke-dasharray: 7 6;
        animation: atlas-flow 1.4s linear infinite;
      }
      @keyframes atlas-flow { to { stroke-dashoffset: -13; } }
      .atlas-edge-chip-bg {
        fill: var(--bg);
        stroke: var(--border-md);
        rx: 8;
      }
      .atlas-edge-chip {
        font-family: var(--font);
        font-size: 8.5px;
        font-weight: 800;
        fill: var(--text-3);
        text-anchor: middle;
        dominant-baseline: central;
        text-transform: uppercase;
        letter-spacing: .1em;
        pointer-events: none;
      }
      .atlas-edge-chip.fails { fill: color-mix(in srgb, #c05b3c 85%, var(--text-2)); }

      /* ---------- nodes ---------- */
      .atlas-node { cursor: pointer; }
      .atlas-node .node-inner {
        transform-box: fill-box;
        transform-origin: center;
        transition: transform .16s cubic-bezier(.34,1.4,.5,1), filter .16s;
      }
      .atlas-node:hover .node-inner {
        transform: scale(1.045);
        filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--aa) 22%, rgba(0,0,0,.28)));
      }
      .atlas-node.dimmed { opacity: .25; }
      .atlas-node.dimmed:hover .node-inner { transform: none; filter: none; }
      .atlas-node.highlighted .node-base {
        stroke: var(--aa);
        stroke-width: 2;
        filter: drop-shadow(0 0 10px color-mix(in srgb, var(--aa) 55%, transparent));
      }
      .atlas-node.selected .node-base {
        stroke: var(--aa);
        stroke-width: 2.2;
        filter: drop-shadow(0 0 12px color-mix(in srgb, var(--aa) 45%, transparent));
      }

      .node-base {
        fill: var(--surface);
        stroke: var(--border-md);
        stroke-width: 1.4;
        transition: stroke .15s, filter .2s;
      }
      .node-label {
        font-family: var(--font);
        font-size: 11.5px;
        font-weight: 600;
        fill: var(--text-1);
        pointer-events: none;
      }
      .node-icon { stroke: var(--text-3); stroke-width: 1.4; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .node-count-bg { fill: var(--aa); }
      .node-count {
        font-family: var(--font);
        font-size: 9.5px;
        font-weight: 800;
        fill: var(--bg);
        text-anchor: middle;
        dominant-baseline: central;
        pointer-events: none;
      }
      .node-check { stroke: var(--text-3); stroke-width: 1.7; fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: .85; }

      /* weather: active — glowing beacon */
      .atlas-node.w-active .node-base {
        fill: color-mix(in srgb, var(--aa) 16%, var(--surface));
        stroke: var(--aa);
        stroke-width: 1.7;
      }
      .atlas-node.w-active .node-icon { stroke: var(--aa); }
      .atlas-node.w-active .node-label { font-weight: 700; }
      .node-beacon {
        fill: none;
        stroke: var(--aa);
        stroke-width: 1.6;
        transform-box: fill-box;
        transform-origin: center;
        animation: atlas-beacon 2.2s ease-out infinite;
      }
      @keyframes atlas-beacon {
        0%   { transform: scale(1); opacity: .75; }
        70%  { transform: scale(1.16); opacity: 0; }
        100% { transform: scale(1.16); opacity: 0; }
      }
      .node-live-dot { fill: var(--aa); }
      .node-live-dot-ring {
        fill: none; stroke: var(--aa); stroke-width: 1.4;
        transform-box: fill-box; transform-origin: center;
        animation: atlas-beacon 2.2s ease-out infinite;
      }

      /* weather: prioritized — marching ants */
      .atlas-node.w-prioritized .node-base {
        fill: color-mix(in srgb, var(--aa) 7%, var(--surface));
        stroke: color-mix(in srgb, var(--aa) 55%, var(--border-md));
      }
      .atlas-node.w-prioritized .node-icon { stroke: color-mix(in srgb, var(--aa) 80%, var(--text-3)); }
      .node-ants {
        fill: none;
        stroke: var(--aa);
        stroke-width: 1.5;
        stroke-dasharray: 5 5;
        opacity: .85;
        animation: atlas-ants 9s linear infinite;
      }
      @keyframes atlas-ants { to { stroke-dashoffset: -100; } }

      /* weather: backlog — pencilled in */
      .atlas-node.w-backlog .node-base {
        fill: color-mix(in srgb, var(--surface) 45%, transparent);
        stroke-dasharray: 5 4;
        stroke: color-mix(in srgb, var(--text-3) 70%, transparent);
      }
      .atlas-node.w-backlog .node-label { fill: var(--text-2); }
      .atlas-node.w-backlog .node-count-bg { fill: var(--text-3); }

      /* weather: empty — quiet terrain */
      .atlas-node.w-empty .node-base {
        fill: color-mix(in srgb, var(--surface) 62%, transparent);
        stroke: var(--border);
      }
      .atlas-node.w-empty .node-label { fill: var(--text-2); }
      .atlas-node.w-empty .node-icon { opacity: .65; }

      /* entrance choreography (first render only) */
      .atlas-world.entering .atlas-node .node-inner {
        animation: atlas-arrive .5s cubic-bezier(.22,1,.36,1) both;
        animation-delay: calc(var(--i) * 28ms);
      }
      .atlas-world.entering .atlas-edge {
        animation: atlas-edge-in .7s ease both;
        animation-delay: calc(var(--i) * 28ms + 240ms);
      }
      .atlas-world.entering .atlas-lane-band,
      .atlas-world.entering .atlas-lane-name,
      .atlas-world.entering .atlas-lane-index,
      .atlas-world.entering .atlas-channel-tag {
        animation: atlas-edge-in .6s ease both;
      }
      @keyframes atlas-arrive {
        from { opacity: 0; transform: translateY(10px) scale(.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes atlas-edge-in { from { opacity: 0; } }

      /* ---------- overlays ---------- */
      .atlas-legend {
        position: absolute;
        left: 16px;
        bottom: 14px;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 7px 14px;
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
        gap: 6px;
        font-size: 9px;
        font-weight: 700;
        color: var(--text-3);
        text-transform: uppercase;
        letter-spacing: .1em;
        white-space: nowrap;
      }
      .atlas-legend-swatch { width: 14px; height: 10px; border-radius: 3px; flex-shrink: 0; }
      .atlas-legend-swatch.sw-active {
        background: color-mix(in srgb, var(--aa) 30%, var(--surface));
        border: 1.4px solid var(--aa);
        box-shadow: 0 0 6px color-mix(in srgb, var(--aa) 55%, transparent);
      }
      .atlas-legend-swatch.sw-prioritized {
        background: color-mix(in srgb, var(--aa) 10%, var(--surface));
        border: 1.4px dashed var(--aa);
      }
      .atlas-legend-swatch.sw-backlog {
        background: transparent;
        border: 1.4px dashed color-mix(in srgb, var(--text-3) 75%, transparent);
      }
      .atlas-legend-swatch.sw-settled {
        background: var(--surface);
        border: 1.4px solid var(--border-md);
      }

      .atlas-tooltip {
        position: absolute;
        max-width: 260px;
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
        transition: opacity .14s ease, transform .14s ease;
        box-shadow: 0 4px 18px rgba(0,0,0,.25);
        white-space: normal;
      }
      .atlas-tooltip.show { opacity: 1; transform: translate(-50%, 0); }
      .atlas-tooltip::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 100%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: color-mix(in srgb, var(--text-1) 94%, transparent);
      }

      .atlas-zoomctl {
        position: absolute;
        right: 16px;
        bottom: 14px;
        display: flex;
        flex-direction: column;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border-md);
        background: color-mix(in srgb, var(--surface) 92%, transparent);
        backdrop-filter: blur(6px);
        z-index: 3;
      }
      .atlas-zoomctl button {
        border: none;
        background: transparent;
        color: var(--text-2);
        width: 30px;
        height: 28px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--font);
        transition: all .12s;
        line-height: 1;
      }
      .atlas-zoomctl button:hover { background: color-mix(in srgb, var(--aa) 14%, transparent); color: var(--text-1); }
      .atlas-zoomctl button + button { border-top: 1px solid var(--border); }

      /* ---------- side panel ---------- */
      .atlas-panel {
        width: 316px;
        flex-shrink: 0;
        border-left: 1px solid var(--border-md);
        background: var(--surface);
        overflow-y: auto;
        padding: 20px 20px 28px;
        display: none;
        animation: atlas-panel-in .22s cubic-bezier(.22,1,.36,1);
      }
      .atlas-panel.open { display: block; }
      @keyframes atlas-panel-in { from { opacity: 0; transform: translateX(10px); } }
      .atlas-panel-empty {
        font-size: var(--fs-sm);
        color: var(--text-3);
        padding: 24px 8px;
        text-align: center;
        line-height: 1.5;
      }
      .atlas-panel-kicker {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 8px;
      }
      .atlas-panel-kicker svg { width: 14px; height: 14px; stroke: var(--aa); stroke-width: 1.4; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .atlas-panel-kind {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .16em;
        color: var(--aa);
      }
      .atlas-panel-weather {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .12em;
        color: var(--text-3);
        margin-left: auto;
      }
      .atlas-panel-title {
        font-size: 17px;
        font-weight: 700;
        color: var(--text-1);
        margin-bottom: 14px;
        line-height: 1.25;
        letter-spacing: -.01em;
      }
      .atlas-meta-block {
        font-size: var(--fs-sm);
        color: var(--text-2);
        margin: 0 0 14px;
        line-height: 1.5;
        border-left: 2px solid color-mix(in srgb, var(--aa) 40%, transparent);
        padding-left: 10px;
      }
      .atlas-meta-block dt {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: var(--text-3);
        margin-top: 7px;
      }
      .atlas-meta-block dt:first-child { margin-top: 0; }
      .atlas-meta-block dd { margin: 1px 0 0; }
      .atlas-cards-section { margin-top: 18px; }
      .atlas-cards-heading {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .14em;
        color: var(--text-3);
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border-md);
      }
      .atlas-status-group { margin-bottom: 12px; }
      .atlas-status-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 9px;
        font-weight: 800;
        color: var(--text-3);
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: .1em;
      }
      .atlas-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .atlas-status-dot.st-active { background: var(--aa); box-shadow: 0 0 5px var(--aa); }
      .atlas-status-dot.st-prioritized { background: color-mix(in srgb, var(--aa) 70%, var(--surface)); }
      .atlas-status-dot.st-backlog { background: transparent; border: 1.4px dashed var(--text-3); }
      .atlas-status-dot.st-done { background: var(--text-3); }
      .atlas-status-dot.st-blocked { background: #c05b3c; }
      .atlas-status-dot.st-deferred { background: transparent; border: 1.4px solid var(--text-3); }
      .atlas-card-chips { display: flex; flex-direction: column; gap: 4px; }
      .atlas-card-chip {
        font-size: 11px;
        font-weight: 600;
        padding: 7px 10px;
        border-radius: var(--r-sm, 6px);
        border: 1px solid var(--border-md);
        background: var(--bg);
        color: var(--text-1);
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: all .12s;
        font-family: var(--font);
      }
      .atlas-card-chip:hover {
        border-color: var(--aa);
        background: color-mix(in srgb, var(--aa) 8%, var(--bg));
        transform: translateX(2px);
      }
      .atlas-card-chip.selected {
        background: var(--aa);
        border-color: var(--aa);
        color: var(--bg);
      }
      .atlas-panel-hint {
        margin-top: 16px;
        font-size: 10px;
        color: var(--text-3);
        line-height: 1.5;
        font-style: italic;
      }
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

  function momentActorLane(moment, actors) {
    if (moment.journey?.lane) return moment.journey.lane;
    return moment.actors?.[0] || actors[0]?.id || 'default';
  }

  function wrapLabel(text, maxChars, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const candidate = cur ? cur + ' ' + w : w;
      if (candidate.length <= maxChars) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        cur = w;
        if (lines.length === maxLines - 1) break;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    const used = lines.join(' ').length;
    const full = words.join(' ').length;
    if (used < full && lines.length) {
      let last = lines[lines.length - 1];
      if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1).trimEnd();
      lines[lines.length - 1] = last + '…';
    }
    return lines.length ? lines : ['—'];
  }

  function layoutAtlas(atlas) {
    const actors = atlas.actors || [];
    const actorOrder = actors.map((a) => a.id);
    const actorLabels = Object.fromEntries(actors.map((a) => [a.id, a.label || a.id]));

    const lanes = {};
    for (const actorId of actorOrder) lanes[actorId] = { main: [], channel: [] };

    for (const moment of atlas.moments || []) {
      const laneId = momentActorLane(moment, actors);
      if (!lanes[laneId]) lanes[laneId] = { main: [], channel: [] };
      const bucket = CHANNEL_KINDS.has(moment.kind) ? 'channel' : 'main';
      lanes[laneId][bucket].push(moment);
    }

    const laneIds = actorOrder.length ? actorOrder : Object.keys(lanes);

    /* content width: widest lane */
    let maxCount = 1;
    for (const id of laneIds) {
      const l = lanes[id] || { main: [], channel: [] };
      maxCount = Math.max(maxCount, l.main.length, l.channel.length);
    }
    const bandW = LANE_PAD_X * 2 + maxCount * STEP - (STEP - NODE_W);

    const positions = {};
    const laneLayouts = [];
    let y = MARGIN;
    let laneIdx = 0;

    for (const actorId of laneIds) {
      const lane = lanes[actorId] || { main: [], channel: [] };
      lane.main.sort((a, b) => (a.journey?.order ?? 0) - (b.journey?.order ?? 0));
      lane.channel.sort((a, b) => (a.journey?.order ?? 0) - (b.journey?.order ?? 0));
      const hasChannel = lane.channel.length > 0;

      const bandH =
        LANE_PAD_TOP + NODE_H + (hasChannel ? CHANNEL_GAP + PILL_H : 0) + LANE_PAD_BOTTOM;

      const mainCY = y + LANE_PAD_TOP + NODE_H / 2;
      const chanCY = y + LANE_PAD_TOP + NODE_H + CHANNEL_GAP + PILL_H / 2;

      lane.main.forEach((m, i) => {
        positions[m.id] = {
          x: MARGIN + LANE_PAD_X + i * STEP + NODE_W / 2,
          y: mainCY,
          track: 'main',
          lane: actorId,
          w: NODE_W,
          h: NODE_H,
        };
      });
      lane.channel.forEach((m, i) => {
        positions[m.id] = {
          x: MARGIN + LANE_PAD_X + i * STEP + NODE_W / 2,
          y: chanCY,
          track: 'channel',
          lane: actorId,
          w: PILL_W,
          h: PILL_H,
        };
      });

      laneLayouts.push({
        actorId,
        label: actorLabels[actorId] || actorId,
        index: laneIdx,
        y,
        height: bandH,
        width: bandW,
        hasChannel,
        channelY: hasChannel ? y + LANE_PAD_TOP + NODE_H + CHANNEL_GAP / 2 : null,
      });
      y += bandH + LANE_GAP;
      laneIdx += 1;
    }

    const contentW = MARGIN * 2 + bandW;
    const contentH = y - LANE_GAP + MARGIN;
    return { positions, laneLayouts, contentW, contentH };
  }

  /* edge anchored at node borders, not centers */
  function edgeGeometry(from, to) {
    const sameRow = Math.abs(from.y - to.y) < 4;
    if (sameRow) {
      const dir = to.x >= from.x ? 1 : -1;
      const fx = from.x + (dir * from.w) / 2;
      const tx = to.x - (dir * to.w) / 2;
      const midBend = Math.min(28, Math.abs(tx - fx) * 0.4);
      return {
        path: `M ${fx} ${from.y} C ${fx + dir * midBend} ${from.y}, ${tx - dir * midBend} ${to.y}, ${tx} ${to.y}`,
        mid: { x: (fx + tx) / 2, y: from.y },
      };
    }
    const goingDown = to.y > from.y;
    const fy = from.y + (goingDown ? from.h / 2 : -from.h / 2);
    const ty = to.y + (goingDown ? -to.h / 2 : to.h / 2);
    const vspan = Math.abs(ty - fy);
    const bend = Math.min(90, vspan * 0.5);
    return {
      path: `M ${from.x} ${fy} C ${from.x} ${fy + (goingDown ? bend : -bend)}, ${to.x} ${ty - (goingDown ? bend : -bend)}, ${to.x} ${ty}`,
      mid: { x: (from.x + to.x) / 2, y: (fy + ty) / 2 },
    };
  }

  function truncateLabel(text, maxLen) {
    const s = String(text || '');
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1).trimEnd() + '…';
  }

  function groupCardsByStatus(cards) {
    const order = ['Active', 'Prioritized', 'Backlog', 'Done', 'Blocked', 'Deferred'];
    const groups = {};
    for (const c of cards || []) {
      const st = c.status || 'Backlog';
      if (!groups[st]) groups[st] = [];
      groups[st].push(c);
    }
    return order.filter((s) => groups[s]?.length).map((s) => ({ status: s, cards: groups[s] }));
  }

  function invertCardMapping(atlas) {
    const inv = {};
    const mapping = atlas.prototypeCardMapping || {};
    for (const [cardId, momentIds] of Object.entries(mapping)) {
      for (const mid of momentIds || []) {
        if (!inv[mid]) inv[mid] = [];
        inv[mid].push(cardId);
      }
    }
    return inv;
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
    const momentCards = payload.momentCards || {};
    const accentColor = options?.accentColor || null;
    if (accentColor) rootEl.style.setProperty('--atlas-accent', accentColor);

    const state = {
      selectedMomentId: null,
      highlightedCardId: null,
      kindFilter: new Set(KINDS),
      actorFilter: new Set((atlas.actors || []).map((a) => a.id)),
      notificationsOnly: false,
      pan: { x: 0, y: 0 },
      zoom: 1,
      isPanning: false,
      panStart: null,
      hasEntered: false,
    };

    const layout = layoutAtlas(atlas);
    const cardToMoments = invertCardMapping(atlas);
    const momentById = Object.fromEntries((atlas.moments || []).map((m) => [m.id, m]));

    rootEl.innerHTML = `
      <div class="atlas-shell">
        <div class="atlas-toolbar" id="atlas-toolbar"></div>
        <div class="atlas-main">
          <div class="atlas-canvas-wrap" id="atlas-canvas-wrap">
            <svg id="atlas-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="atlas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0.5 0.8 L 7.2 4 L 0.5 7.2" fill="none" stroke="color-mix(in srgb, var(--text-3) 65%, transparent)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </marker>
                <marker id="atlas-arrow-accent" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0.5 0.8 L 7.2 4 L 0.5 7.2" fill="none" stroke="var(--atlas-accent, var(--accent))" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
                </marker>
              </defs>
              <g class="atlas-world entering" id="atlas-world"></g>
            </svg>
            <div class="atlas-legend">
              <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-active"></span>In motion</span>
              <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-prioritized"></span>Charted next</span>
              <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-backlog"></span>Horizon</span>
              <span class="atlas-legend-item"><span class="atlas-legend-swatch sw-settled"></span>Settled</span>
            </div>
            <div class="atlas-tooltip" id="atlas-tooltip"></div>
            <div class="atlas-zoomctl">
              <button type="button" id="atlas-zoom-in" title="Zoom in">+</button>
              <button type="button" id="atlas-zoom-out" title="Zoom out">−</button>
              <button type="button" id="atlas-zoom-fit" title="Fit to view">⌖</button>
            </div>
          </div>
          <aside class="atlas-panel" id="atlas-panel">
            <div class="atlas-panel-empty">Click a moment to inspect roadmap weather and linked cards.</div>
          </aside>
        </div>
      </div>`;

    const toolbar = rootEl.querySelector('#atlas-toolbar');
    const canvasWrap = rootEl.querySelector('#atlas-canvas-wrap');
    const svg = rootEl.querySelector('#atlas-svg');
    const world = rootEl.querySelector('#atlas-world');
    const panel = rootEl.querySelector('#atlas-panel');
    const tooltip = rootEl.querySelector('#atlas-tooltip');

    function showTooltip(node) {
      const label = node.dataset.fullLabel;
      if (!label || node.classList.contains('dimmed')) return;
      const nodeRect = node.getBoundingClientRect();
      const wrapRect = canvasWrap.getBoundingClientRect();
      tooltip.textContent = label;
      tooltip.style.left = `${nodeRect.left + nodeRect.width / 2 - wrapRect.left}px`;
      tooltip.style.bottom = `${wrapRect.bottom - nodeRect.top + 9}px`;
      tooltip.style.top = 'auto';
      tooltip.classList.add('show');
    }

    function hideTooltip() {
      tooltip.classList.remove('show');
    }

    function buildToolbar() {
      const kindBtns = KINDS.map(
        (k) =>
          `<button type="button" class="atlas-filter-btn${state.kindFilter.has(k) ? ' active' : ''}" data-kind="${k}">${k}</button>`
      ).join('');
      const actorBtns = (atlas.actors || [])
        .map(
          (a) =>
            `<button type="button" class="atlas-filter-btn${state.actorFilter.has(a.id) ? ' active' : ''}" data-actor="${a.id}">${esc(a.label)}</button>`
        )
        .join('');

      toolbar.innerHTML = `
        <span class="atlas-toolbar-title">${esc(atlas.title || 'Atlas')}</span>
        <div class="atlas-filter-group">
          <span class="atlas-filter-label">Lane</span>${actorBtns}
        </div>
        <div class="atlas-filter-group">
          <span class="atlas-filter-label">Kind</span>${kindBtns}
        </div>
        <div class="atlas-filter-group">
          <button type="button" class="atlas-filter-btn notifications-toggle${state.notificationsOnly ? ' active' : ''}" id="atlas-notify-toggle">Signals</button>
        </div>`;

      toolbar.querySelectorAll('[data-kind]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.kind;
          if (state.kindFilter.has(k)) state.kindFilter.delete(k);
          else state.kindFilter.add(k);
          if (state.kindFilter.size === 0) KINDS.forEach((x) => state.kindFilter.add(x));
          buildToolbar();
          renderScene();
        });
      });
      toolbar.querySelectorAll('[data-actor]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.actor;
          if (state.actorFilter.has(a)) state.actorFilter.delete(a);
          else state.actorFilter.add(a);
          if (state.actorFilter.size === 0) (atlas.actors || []).forEach((x) => state.actorFilter.add(x.id));
          buildToolbar();
          renderScene();
        });
      });
      toolbar.querySelector('#atlas-notify-toggle')?.addEventListener('click', () => {
        state.notificationsOnly = !state.notificationsOnly;
        buildToolbar();
        renderScene();
      });
    }

    function momentVisible(moment) {
      if (!state.actorFilter.has(momentActorLane(moment, atlas.actors))) return false;
      if (!state.kindFilter.has(moment.kind)) return false;
      return true;
    }

    function momentDimmed(moment) {
      if (state.notificationsOnly && !CHANNEL_KINDS.has(moment.kind)) return true;
      if (state.highlightedCardId) {
        const touches = (cardToMoments[moment.id] || []).includes(state.highlightedCardId);
        return !touches;
      }
      return false;
    }

    function edgeDimmed(edge) {
      const from = momentById[edge.from];
      const to = momentById[edge.to];
      if (!from || !to) return true;
      if (state.notificationsOnly) {
        const channelEdge = CHANNEL_KINDS.has(from.kind) || CHANNEL_KINDS.has(to.kind)
          || edge.kind === 'notifies' || edge.kind === 'triggers';
        if (!channelEdge) return true;
      }
      if (state.highlightedCardId) {
        const fromTouch = (cardToMoments[from.id] || []).includes(state.highlightedCardId);
        const toTouch = (cardToMoments[to.id] || []).includes(state.highlightedCardId);
        return !(fromTouch || toTouch);
      }
      return momentDimmed(from) && momentDimmed(to);
    }

    function applyViewBox() {
      const { contentW, contentH } = layout;
      const rect = canvasWrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const baseScale = Math.max(
        0.5,
        Math.min(rect.width / contentW, rect.height / contentH, 1.1)
      );
      const scale = baseScale * state.zoom;
      const vw = rect.width / scale;
      const vh = rect.height / scale;
      const vx = (contentW - vw) / 2 + state.pan.x;
      const vy = (contentH - vh) / 2 + state.pan.y;
      svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    }

    function nodeMarkup(moment, idx) {
      const pos = layout.positions[moment.id];
      const cards = momentCards[moment.id] || [];
      const weather = computeWeather(cards);
      const dim = momentDimmed(moment) || !momentVisible(moment);
      const selected = state.selectedMomentId === moment.id;
      const highlighted =
        state.highlightedCardId && (cardToMoments[moment.id] || []).includes(state.highlightedCardId);
      const isPill = pos.track === 'channel';
      const w = pos.w;
      const h = pos.h;
      const r = isPill ? PILL_R : NODE_R;
      const x0 = pos.x - w / 2;
      const y0 = pos.y - h / 2;

      const classes = ['atlas-node', `w-${weather}`];
      if (dim) classes.push('dimmed');
      if (selected) classes.push('selected');
      if (highlighted) classes.push('highlighted');

      const maxCharsPre = isPill ? 18 : 16;
      const linesPre = wrapLabel(moment.label, maxCharsPre, isPill ? 1 : 2);
      const isTruncated = linesPre[linesPre.length - 1].endsWith('…');

      const parts = [];
      parts.push(
        `<g class="${classes.join(' ')}" data-moment="${esc(moment.id)}"${isTruncated ? ` data-full-label="${esc(moment.label)}"` : ''} style="--i:${idx}">`
      );
      parts.push(`<g class="node-inner">`);

      if (weather === 'active') {
        parts.push(
          `<rect class="node-beacon" x="${x0 - 4}" y="${y0 - 4}" width="${w + 8}" height="${h + 8}" rx="${r + 4}"/>`
        );
      }

      parts.push(
        `<rect class="node-base" x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}"/>`
      );

      if (weather === 'prioritized') {
        parts.push(
          `<rect class="node-ants" x="${x0 - 3.5}" y="${y0 - 3.5}" width="${w + 7}" height="${h + 7}" rx="${r + 3.5}"/>`
        );
      }

      /* kind icon */
      const icon = KIND_ICONS[moment.kind] || KIND_ICONS.screen;
      const iconX = x0 + (isPill ? 13 : 12);
      const iconY = pos.y - 8;
      parts.push(`<g class="node-icon" transform="translate(${iconX} ${iconY})">${icon}</g>`);

      /* label */
      const textX = iconX + 24;
      const lines = linesPre;
      const lineH = 13.5;
      const textY0 = pos.y - ((lines.length - 1) * lineH) / 2 + 4;
      const labelTspans = lines
        .map((ln, i) => `<tspan x="${textX}" y="${textY0 + i * lineH}">${esc(ln)}</tspan>`)
        .join('');
      parts.push(`<text class="node-label">${labelTspans}</text>`);

      /* card count badge */
      if (cards.length > 0) {
        const bx = x0 + w - 2;
        const by = y0 + 2;
        parts.push(
          `<circle class="node-count-bg" cx="${bx}" cy="${by}" r="8.5"/>`,
          `<text class="node-count" x="${bx}" y="${by}">${cards.length}</text>`
        );
      }

      /* settled check */
      if (weather === 'settled') {
        const cx = x0 + w - 14;
        const cy = y0 + h - 12;
        parts.push(
          `<path class="node-check" d="M ${cx - 3.5} ${cy} L ${cx - 1} ${cy + 2.6} L ${cx + 3.8} ${cy - 3}"/>`
        );
      }

      /* active live dot */
      if (weather === 'active') {
        const dx = x0 + w - 13;
        const dy = y0 + h - 12;
        parts.push(
          `<circle class="node-live-dot" cx="${dx}" cy="${dy}" r="3"/>`,
          `<circle class="node-live-dot-ring" cx="${dx}" cy="${dy}" r="5"/>`
        );
      }

      parts.push(`</g></g>`);
      return parts.join('');
    }

    function renderScene() {
      const parts = [];
      const { contentW, contentH } = layout;

      /* topographic contours — quiet cartographic texture */
      const ccx = contentW * 0.72;
      const ccy = contentH * 0.3;
      for (let i = 1; i <= 5; i++) {
        parts.push(
          `<circle class="atlas-contour" cx="${ccx}" cy="${ccy}" r="${i * 170}"/>`
        );
      }
      parts.push(
        `<circle class="atlas-contour" cx="${contentW * 0.12}" cy="${contentH * 0.88}" r="220"/>`,
        `<circle class="atlas-contour" cx="${contentW * 0.12}" cy="${contentH * 0.88}" r="340"/>`
      );

      /* lane bands */
      for (const lane of layout.laneLayouts) {
        parts.push(
          `<rect class="atlas-lane-band${lane.index % 2 ? ' alt' : ''}" x="${MARGIN}" y="${lane.y}" width="${lane.width}" height="${lane.height}" rx="18"/>`,
          `<text class="atlas-lane-index" x="${MARGIN + LANE_PAD_X}" y="${lane.y + 24}">${String(lane.index + 1).padStart(2, '0')}</text>`,
          `<text class="atlas-lane-name" x="${MARGIN + LANE_PAD_X + 26}" y="${lane.y + 24}">${esc(lane.label)}</text>`,
          `<line class="atlas-lane-rule" x1="${MARGIN + LANE_PAD_X + 26 + lane.label.length * 11 + 16}" y1="${lane.y + 20}" x2="${MARGIN + lane.width - LANE_PAD_X}" y2="${lane.y + 20}"/>`
        );
        if (lane.hasChannel) {
          parts.push(
            `<line class="atlas-lane-rule" x1="${MARGIN + LANE_PAD_X}" y1="${lane.channelY}" x2="${MARGIN + lane.width - LANE_PAD_X}" y2="${lane.channelY}" stroke-dasharray="3 7" opacity=".35"/>`,
            `<text class="atlas-channel-tag" x="${MARGIN + lane.width - LANE_PAD_X}" y="${lane.channelY - 5}" text-anchor="end">Signals &amp; jobs</text>`
          );
        }
      }

      /* edges */
      let edgeIdx = 0;
      for (const edge of atlas.edges || []) {
        const from = layout.positions[edge.from];
        const to = layout.positions[edge.to];
        if (!from || !to) continue;
        const dim = edgeDimmed(edge);
        const kind = edge.kind || 'then';
        const accent = kind === 'notifies' || kind === 'triggers';
        const marker = accent ? 'atlas-arrow-accent' : 'atlas-arrow';
        const geo = edgeGeometry(from, to);
        parts.push(
          `<path class="atlas-edge kind-${esc(kind)}${dim ? ' dimmed' : ''}" d="${geo.path}" marker-end="url(#${marker})" style="--i:${edgeIdx}"/>`
        );
        if (kind === 'or' || kind === 'fails') {
          const label = kind === 'or' ? 'or' : 'fails';
          const cw = label.length * 7 + 12;
          parts.push(
            `<rect class="atlas-edge-chip-bg${dim ? ' dimmed' : ''}" x="${geo.mid.x - cw / 2}" y="${geo.mid.y - 8}" width="${cw}" height="16" rx="8"${dim ? ' opacity=".07"' : ''}/>`,
            `<text class="atlas-edge-chip ${kind === 'fails' ? 'fails' : ''}" x="${geo.mid.x}" y="${geo.mid.y}"${dim ? ' opacity=".07"' : ''}>${label}</text>`
          );
        }
        edgeIdx += 1;
      }

      /* nodes */
      let nodeIdx = 0;
      for (const moment of atlas.moments || []) {
        if (!layout.positions[moment.id]) continue;
        parts.push(nodeMarkup(moment, nodeIdx));
        nodeIdx += 1;
      }

      world.innerHTML = parts.join('\n');

      if (state.hasEntered) {
        world.classList.remove('entering');
      } else {
        state.hasEntered = true;
        setTimeout(() => world.classList.remove('entering'), nodeIdx * 28 + 1100);
      }

      world.querySelectorAll('.atlas-node').forEach((node) => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = node.dataset.moment;
          state.selectedMomentId = id;
          state.highlightedCardId = null;
          hideTooltip();
          renderScene();
          renderPanel(id);
        });
        node.addEventListener('mouseenter', () => showTooltip(node));
        node.addEventListener('mouseleave', hideTooltip);
      });
    }

    function renderPanel(momentId) {
      const moment = momentById[momentId];
      if (!moment) {
        panel.classList.remove('open');
        return;
      }
      panel.classList.add('open');
      const cards = momentCards[momentId] || [];
      const weather = computeWeather(cards);
      const groups = groupCardsByStatus(cards);

      let metaHtml = '';
      const meta = moment.meta || {};
      if (meta.channel || meta.trigger || meta.schedule) {
        metaHtml += `<dl class="atlas-meta-block">`;
        if (meta.channel) metaHtml += `<dt>Channel</dt><dd>${esc(meta.channel)}</dd>`;
        if (meta.trigger) metaHtml += `<dt>Trigger</dt><dd>${esc(meta.trigger)}</dd>`;
        if (meta.schedule) metaHtml += `<dt>Schedule</dt><dd><code>${esc(meta.schedule)}</code></dd>`;
        metaHtml += `</dl>`;
      }

      let cardsHtml = '';
      if (!groups.length) {
        cardsHtml =
          '<div class="atlas-panel-empty" style="padding:12px 0">No roadmap cards mapped to this moment — settled ground.</div>';
      } else {
        cardsHtml = groups
          .map(
            (g) => `
          <div class="atlas-status-group">
            <div class="atlas-status-label"><span class="atlas-status-dot st-${esc(g.status.toLowerCase())}"></span>${esc(g.status)}</div>
            <div class="atlas-card-chips">
              ${g.cards
                .map(
                  (c) =>
                    `<button type="button" class="atlas-card-chip${state.highlightedCardId === c.id ? ' selected' : ''}" data-card="${esc(c.id)}" title="${esc(c.title)}">${esc(truncateLabel(c.title, 40))}</button>`
                )
                .join('')}
            </div>
          </div>`
          )
          .join('');
      }

      panel.innerHTML = `
        <div class="atlas-panel-kicker">
          <svg viewBox="0 0 16 16">${KIND_ICONS[moment.kind] || KIND_ICONS.screen}</svg>
          <span class="atlas-panel-kind">${esc(moment.kind)}</span>
          <span class="atlas-panel-weather">${esc(WEATHER_LABEL[weather] || '')}</span>
        </div>
        <div class="atlas-panel-title">${esc(moment.label)}</div>
        ${metaHtml}
        <div class="atlas-cards-section">
          <div class="atlas-cards-heading">Roadmap weather</div>
          ${cardsHtml}
        </div>
        ${groups.length ? '<div class="atlas-panel-hint">Select a card to trace every moment it touches across the map.</div>' : ''}`;

      panel.querySelectorAll('.atlas-card-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const cardId = chip.dataset.card;
          state.highlightedCardId = state.highlightedCardId === cardId ? null : cardId;
          renderScene();
          renderPanel(momentId);
        });
      });
    }

    function clearSelection() {
      state.selectedMomentId = null;
      state.highlightedCardId = null;
      panel.classList.remove('open');
      panel.innerHTML =
        '<div class="atlas-panel-empty">Click a moment to inspect roadmap weather and linked cards.</div>';
      renderScene();
    }

    function onWheel(e) {
      e.preventDefault();
      hideTooltip();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      state.zoom = Math.min(3, Math.max(0.4, state.zoom * delta));
      applyViewBox();
    }

    function onPointerDown(e) {
      if (e.target.closest('.atlas-node') || e.target.closest('.atlas-zoomctl')) return;
      hideTooltip();
      state.isPanning = true;
      state.panStart = { x: e.clientX, y: e.clientY, panX: state.pan.x, panY: state.pan.y };
      canvasWrap.classList.add('panning');
    }

    function onPointerMove(e) {
      if (!state.isPanning || !state.panStart) return;
      const rect = canvasWrap.getBoundingClientRect();
      const { contentW, contentH } = layout;
      const baseScale = Math.max(
        0.5,
        Math.min(rect.width / contentW, rect.height / contentH, 1.1)
      );
      const scale = baseScale * state.zoom;
      const dx = (e.clientX - state.panStart.x) / scale;
      const dy = (e.clientY - state.panStart.y) / scale;
      state.pan.x = state.panStart.panX - dx;
      state.pan.y = state.panStart.panY - dy;
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
      if (!e.target.closest('.atlas-node') && !e.target.closest('.atlas-zoomctl')) clearSelection();
    });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    rootEl.querySelector('#atlas-zoom-in')?.addEventListener('click', () => {
      state.zoom = Math.min(3, state.zoom * 1.2);
      applyViewBox();
    });
    rootEl.querySelector('#atlas-zoom-out')?.addEventListener('click', () => {
      state.zoom = Math.max(0.4, state.zoom / 1.2);
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
