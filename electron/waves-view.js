/**
 * Kando Waves view — an epic's story slices as stacked, segmented bars grouped
 * into delivery waves. Hover a segment to preview the slice and light up the
 * rest of its wave.
 *
 * Exposed surface: window.renderWavesView, window.destroyWavesView
 * Requires electron/epic-waves.js (globalThis.KandoEpicWaves).
 */
(function () {
  'use strict';

  const STATUS_META = {
    Done: { label: 'Shipped', color: 'var(--done-c)', rank: 0 },
    Active: { label: 'Active', color: 'var(--accent)', rank: 1 },
    Blocked: { label: 'Blocked', color: '#b84233', rank: 2 },
    Prioritized: { label: 'Prioritized', color: '#b4a050', rank: 3 },
    Backlog: { label: 'Backlog', color: '#8a7f72', rank: 4 },
    Deferred: { label: 'Deferred', color: '#7a6f62', rank: 5 },
  };
  const LEGEND_ORDER = ['Done', 'Active', 'Prioritized', 'Backlog', 'Blocked', 'Deferred'];
  const UNSCHEDULED = 'unscheduled';

  const AGENT_LABELS = {
    in_progress: 'Agent working',
    blocked: 'Agent blocked',
    needs_review: 'Needs review',
    idle: 'Agent idle',
  };

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'waves-view-styles';
    style.textContent = `
      .wv-shell {
        --wa: var(--waves-accent, var(--accent));
        min-height: calc(100vh - var(--header-h));
        background: var(--bg);
        color: var(--text-1);
        font-family: var(--font);
      }
      .wv-toolbar {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        padding: 10px 20px;
        border-bottom: 1px solid var(--border-md);
        background: var(--toolbar-bg);
      }
      .wv-toolbar-title {
        font-size: var(--fs-xs);
        font-weight: 800;
        color: var(--wa);
        text-transform: uppercase;
        letter-spacing: .14em;
      }
      .wv-select {
        max-width: 420px;
        min-width: 220px;
        padding: 6px 28px 6px 10px;
        font: inherit;
        font-size: var(--fs-sm);
        font-weight: 600;
        color: var(--text-1);
        background: var(--surface);
        border: 1px solid var(--border-md);
        border-radius: var(--r-md);
        cursor: pointer;
      }
      .wv-select:focus-visible { outline: 2px solid var(--wa); outline-offset: 1px; }
      .wv-open-epic {
        font: inherit;
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--text-2);
        background: none;
        border: 1px solid var(--border-md);
        border-radius: var(--r-md);
        padding: 5px 10px;
        cursor: pointer;
      }
      .wv-open-epic:hover { color: var(--wa); border-color: var(--wa); }
      .wv-legend {
        margin-left: auto;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        font-size: var(--fs-xs);
        color: var(--text-3);
      }
      .wv-legend-item { display: inline-flex; align-items: center; gap: 5px; }
      .wv-legend-swatch {
        width: 14px;
        height: 10px;
        border-radius: 2px;
        border: 1px solid color-mix(in srgb, var(--seg) 70%, transparent);
      }

      .wv-body { max-width: 1120px; margin: 0 auto; padding: 28px 28px 80px; }
      .wv-head { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; margin-bottom: 22px; }
      .wv-head-main { flex: 1 1 360px; min-width: 0; }
      .wv-eyebrow {
        font-size: var(--fs-xs);
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: var(--text-3);
        margin-bottom: 4px;
      }
      .wv-title { font-size: 24px; font-weight: 700; line-height: 1.2; margin: 0; letter-spacing: -.01em; }
      .wv-stats { display: flex; gap: 22px; }
      .wv-stat { display: flex; flex-direction: column; }
      .wv-stat-num { font-size: 26px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
      .wv-stat-label {
        margin-top: 4px;
        font-size: var(--fs-xs);
        color: var(--text-3);
        text-transform: uppercase;
        letter-spacing: .1em;
      }
      .wv-note {
        margin: 0 0 22px;
        padding: 10px 14px;
        font-size: var(--fs-sm);
        line-height: var(--lh-body);
        color: var(--text-2);
        background: var(--accent-subtle);
        border: 1px dashed var(--border-md);
        border-radius: var(--r-md);
      }
      .wv-note code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: .92em;
        padding: 1px 5px;
        background: var(--accent-light);
        border-radius: var(--r-xs);
      }

      .wv-section-label {
        font-size: var(--fs-xs);
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: var(--text-3);
        margin: 0 0 10px;
      }

      .wv-overview { margin-bottom: 34px; }
      .wv-overview-bar { display: flex; gap: 14px; align-items: flex-start; }
      .wv-group { flex: 0 0 auto; min-width: 0; }
      .wv-group-segs { display: flex; gap: 3px; height: 30px; }
      .wv-group-label {
        margin-top: 7px;
        padding-top: 5px;
        border-top: 2px solid var(--border-md);
        font-size: var(--fs-xs);
        font-weight: 700;
        color: var(--text-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color .12s, border-color .12s;
      }
      .wv-group.is-lit .wv-group-label { color: var(--wa); border-top-color: var(--wa); }

      .wv-rows { display: flex; flex-direction: column; gap: 10px; }
      .wv-row {
        display: grid;
        grid-template-columns: 150px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid transparent;
        border-radius: var(--r-lg);
        transition: background .12s, border-color .12s;
      }
      .wv-row.is-lit { background: var(--accent-subtle); border-color: var(--border-md); }
      .wv-row-head { min-width: 0; }
      .wv-row-name { font-size: var(--fs-md); font-weight: 700; }
      .wv-row-sub { margin-top: 2px; font-size: var(--fs-xs); color: var(--text-3); font-variant-numeric: tabular-nums; }
      .wv-row-tag {
        display: inline-block;
        margin-top: 5px;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: var(--text-3);
        border: 1px solid var(--border-md);
        border-radius: 999px;
      }
      .wv-row-bar { display: flex; gap: 3px; height: 38px; min-width: 0; }
      .wv-row-unscheduled .wv-row-name { color: var(--text-2); font-weight: 600; }

      .wv-seg {
        --seg: var(--text-3);
        position: relative;
        flex: 1 1 0;
        min-width: 6px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        overflow: hidden;
        font: inherit;
        font-size: var(--fs-xs);
        font-weight: 600;
        text-align: left;
        white-space: nowrap;
        color: var(--text-1);
        border: 1px solid color-mix(in srgb, var(--seg) 70%, transparent);
        border-radius: var(--r-sm);
        cursor: pointer;
        transition: opacity .12s, transform .12s, box-shadow .12s;
      }
      .wv-seg > span { overflow: hidden; text-overflow: ellipsis; }
      .wv-group-segs .wv-seg { padding: 0; }
      .wv-seg, .wv-legend-swatch { background: color-mix(in srgb, var(--seg) 22%, transparent); }
      .wv-seg[data-status="Done"], .wv-legend-swatch[data-status="Done"] { --seg: var(--done-c); }
      .wv-seg[data-status="Active"], .wv-legend-swatch[data-status="Active"] { --seg: var(--accent); }
      .wv-seg[data-status="Blocked"], .wv-legend-swatch[data-status="Blocked"] { --seg: #b84233; }
      .wv-seg[data-status="Prioritized"], .wv-legend-swatch[data-status="Prioritized"] { --seg: #b4a050; }
      .wv-seg[data-status="Backlog"], .wv-legend-swatch[data-status="Backlog"] { --seg: #8a7f72; }
      .wv-seg[data-status="Deferred"], .wv-legend-swatch[data-status="Deferred"] { --seg: #7a6f62; }
      .wv-seg[data-status="Done"], .wv-seg[data-status="Active"], .wv-seg[data-status="Blocked"],
      .wv-legend-swatch[data-status="Done"], .wv-legend-swatch[data-status="Active"], .wv-legend-swatch[data-status="Blocked"] { background: var(--seg); }
      .wv-seg[data-status="Done"], .wv-seg[data-status="Active"], .wv-seg[data-status="Blocked"] { color: #fff; }
      .wv-seg[data-status="Prioritized"], .wv-legend-swatch[data-status="Prioritized"] { background: color-mix(in srgb, var(--seg) 55%, transparent); }
      .wv-seg[data-status="Deferred"], .wv-legend-swatch[data-status="Deferred"] {
        background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--seg) 35%, transparent) 0 4px, transparent 4px 8px);
      }
      .wv-seg:focus-visible { outline: 2px solid var(--text-1); outline-offset: 2px; }

      .wv-hovering .wv-seg:not(.is-lit) { opacity: .28; }
      .wv-hovering .wv-seg.is-lit { opacity: 1; }
      .wv-seg.is-active {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(10,8,5,.28);
        z-index: 2;
      }

      .wv-popover {
        position: fixed;
        z-index: 1000;
        width: 330px;
        max-width: calc(100vw - 24px);
        padding: 14px 16px 12px;
        font-family: var(--font);
        color: var(--text-1);
        background: var(--surface);
        border: 1px solid var(--border-md);
        border-radius: var(--r-xl);
        box-shadow: var(--shadow-modal);
        pointer-events: none;
        opacity: 0;
        transition: opacity .1s;
      }
      .wv-popover.is-open { opacity: 1; }
      .wv-pop-kicker {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: var(--text-3);
      }
      .wv-pop-title { margin: 4px 0 6px; font-size: var(--fs-md); font-weight: 700; line-height: var(--lh-tight); }
      .wv-pop-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
      .wv-pill {
        padding: 2px 8px;
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--text-2);
        background: var(--surface-sub);
        border: 1px solid var(--border);
        border-radius: 999px;
      }
      .wv-pill-status { color: var(--pill, var(--text-2)); border-color: color-mix(in srgb, var(--pill, var(--text-3)) 45%, transparent); }
      .wv-pop-summary {
        margin: 0;
        font-size: var(--fs-sm);
        line-height: var(--lh-body);
        color: var(--text-2);
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .wv-pop-line { margin-top: 8px; font-size: var(--fs-xs); color: var(--text-3); line-height: var(--lh-body); }
      .wv-pop-line strong { color: var(--text-2); font-weight: 600; }
      .wv-pop-wave { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-md); }
      .wv-pop-wave-label {
        margin-bottom: 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: var(--wa);
      }
      .wv-pop-sibling {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 2px 0;
        font-size: var(--fs-sm);
        color: var(--text-2);
      }
      .wv-pop-sibling.is-self { color: var(--text-1); font-weight: 700; }
      .wv-pop-sibling-dot { flex: none; width: 8px; height: 8px; border-radius: 2px; background: var(--dot); }
      .wv-pop-sibling-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wv-pop-more { padding-top: 2px; font-size: var(--fs-xs); color: var(--text-3); }
      .wv-pop-hint { margin-top: 10px; font-size: 10px; color: var(--text-3); letter-spacing: .04em; }

      .wv-empty { padding: 80px 20px; text-align: center; color: var(--text-3); font-size: var(--fs-sm); line-height: var(--lh-body); }

      @media (max-width: 720px) {
        .wv-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
        .wv-legend { margin-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusMeta(status) {
    return STATUS_META[status] || { label: status || 'Unknown', color: 'var(--text-3)', rank: 9 };
  }

  function waveName(key) {
    return key === UNSCHEDULED ? 'Unscheduled' : `Wave ${key}`;
  }

  function sortSlices(slices) {
    return slices.slice().sort((a, b) => {
      const d = statusMeta(a.status).rank - statusMeta(b.status).rank;
      if (d !== 0) return d;
      const o = (a.order ?? Infinity) - (b.order ?? Infinity);
      if (o !== 0 && Number.isFinite(o)) return o;
      return String(a.title || a.id).localeCompare(String(b.title || b.id));
    });
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many || one + 's'}`;
  }

  function buildModel(epic) {
    const slices = epic.slices || [];
    const calc = globalThis.KandoEpicWaves.computeEpicWaves(slices);
    const groups = calc.waves.map((w) => ({
      key: String(w.number),
      slices: sortSlices(w.slices),
      derived: w.slices.every((s) => calc.bySlice[s.id]?.source === 'derived'),
    }));
    if (calc.unscheduled.length) {
      groups.push({ key: UNSCHEDULED, slices: sortSlices(calc.unscheduled), derived: false });
    }
    const waveOf = {};
    for (const g of groups) for (const s of g.slices) waveOf[s.id] = g.key;
    const shipped = slices.filter((s) => s.status === 'Done').length;
    return { calc, groups, waveOf, shipped, total: slices.length };
  }

  function segmentHtml(slice, groupKey, { label }) {
    const meta = statusMeta(slice.status);
    return `<button type="button" class="wv-seg" data-id="${esc(slice.id)}" data-wave="${esc(groupKey)}" data-status="${esc(slice.status)}" aria-label="${esc(`${slice.title || slice.id} — ${meta.label}, ${waveName(groupKey)}`)}">${
      label ? `<span>${esc(slice.title || slice.id)}</span>` : ''
    }</button>`;
  }

  function noteHtml(model) {
    if (!model.total) return '';
    if (model.calc.mode === 'none') {
      return `<p class="wv-note">No waves are planned for this epic yet. Add <code>wave: 1</code> (or 2, 3 …) to each slice's frontmatter, or list slice links under a <code>## Dependencies</code> heading and waves will be worked out from the order they depend on each other.</p>`;
    }
    if (model.calc.mode === 'derived') {
      return `<p class="wv-note">Waves are derived from each slice's <code>## Dependencies</code>: a slice lands one wave after the latest slice it depends on. Add <code>wave:</code> to a slice's frontmatter to set it yourself.</p>`;
    }
    return '';
  }

  function render(root, payload, opts) {
    const epics = (payload && payload.epics) || [];
    if (!epics.length) {
      root.innerHTML = `<div class="wv-shell"><div class="wv-empty">No epics in this vault yet.<br>Waves show an epic's story slices once one exists.</div></div>`;
      return;
    }
    const selected = epics.find((e) => e.id === opts.selectedEpicId) || epics[0];
    const model = buildModel(selected);
    const maxCount = Math.max(1, ...model.groups.map((g) => g.slices.length));

    const byInitiative = new Map();
    for (const e of epics) {
      const k = e.initiativeTitle || 'No initiative';
      if (!byInitiative.has(k)) byInitiative.set(k, []);
      byInitiative.get(k).push(e);
    }
    const selectHtml = Array.from(byInitiative.entries())
      .map(
        ([init, list]) =>
          `<optgroup label="${esc(init)}">${list
            .map((e) => {
              const done = e.slices.filter((s) => s.status === 'Done').length;
              return `<option value="${esc(e.id)}"${e.id === selected.id ? ' selected' : ''}>${esc(e.title)} (${done}/${e.slices.length})</option>`;
            })
            .join('')}</optgroup>`
      )
      .join('');

    const legendStatuses = LEGEND_ORDER.filter((s) => selected.slices.some((x) => x.status === s));
    const legend = legendStatuses
      .map(
        (s) =>
          `<span class="wv-legend-item"><span class="wv-legend-swatch" data-status="${esc(s)}"></span>${esc(statusMeta(s).label)}</span>`
      )
      .join('');

    const scheduledWaves = model.groups.filter((g) => g.key !== UNSCHEDULED).length;
    const gapPx = 14;
    const gapTotal = Math.max(0, model.groups.length - 1) * gapPx;

    const overview = model.groups
      .map(
        (g) => `<div class="wv-group" data-wave="${esc(g.key)}" style="flex-basis:calc((100% - ${gapTotal}px) * ${g.slices.length} / ${model.total})">
          <div class="wv-group-segs">${g.slices.map((s) => segmentHtml(s, g.key, { label: false })).join('')}</div>
          <div class="wv-group-label" title="${esc(waveName(g.key))}">${g.key === UNSCHEDULED ? 'TBD' : `W${esc(g.key)}`}</div>
        </div>`
      )
      .join('');

    const rows = model.groups
      .map((g) => {
        const done = g.slices.filter((s) => s.status === 'Done').length;
        const pct = (g.slices.length / maxCount) * 100;
        return `<div class="wv-row${g.key === UNSCHEDULED ? ' wv-row-unscheduled' : ''}" data-wave="${esc(g.key)}">
          <div class="wv-row-head">
            <div class="wv-row-name">${esc(waveName(g.key))}</div>
            <div class="wv-row-sub">${plural(g.slices.length, 'slice')} · ${done} shipped</div>
            ${g.derived ? '<span class="wv-row-tag" title="Worked out from slice dependencies">from deps</span>' : ''}
          </div>
          <div class="wv-row-bar" style="width:${pct}%;min-width:min(100%,${g.slices.length * 14}px)">${g.slices
            .map((s) => segmentHtml(s, g.key, { label: true }))
            .join('')}</div>
        </div>`;
      })
      .join('');

    const body = model.total
      ? `<section class="wv-overview" aria-label="Whole epic">
           <h3 class="wv-section-label">Whole epic — one block per slice</h3>
           <div class="wv-overview-bar">${overview}</div>
         </section>
         <section aria-label="Waves">
           <h3 class="wv-section-label">Waves</h3>
           <div class="wv-rows">${rows}</div>
         </section>`
      : `<div class="wv-empty">This epic has no story slices yet.</div>`;

    root.innerHTML = `<div class="wv-shell">
      <div class="wv-toolbar">
        <span class="wv-toolbar-title">Waves</span>
        <select class="wv-select" id="wv-epic-select" aria-label="Epic">${selectHtml}</select>
        <button type="button" class="wv-open-epic" id="wv-open-epic">Open epic</button>
        <div class="wv-legend" aria-label="Status legend">${legend}</div>
      </div>
      <div class="wv-body">
        <div class="wv-head">
          <div class="wv-head-main">
            <div class="wv-eyebrow">${esc(selected.initiativeTitle || 'Epic')}</div>
            <h2 class="wv-title">${esc(selected.title)}</h2>
          </div>
          <div class="wv-stats">
            <div class="wv-stat"><span class="wv-stat-num">${model.total}</span><span class="wv-stat-label">${model.total === 1 ? 'Slice' : 'Slices'}</span></div>
            <div class="wv-stat"><span class="wv-stat-num">${scheduledWaves}</span><span class="wv-stat-label">${scheduledWaves === 1 ? 'Wave' : 'Waves'}</span></div>
            <div class="wv-stat"><span class="wv-stat-num">${model.shipped}</span><span class="wv-stat-label">Shipped</span></div>
          </div>
        </div>
        ${noteHtml(model)}
        ${body}
      </div>
    </div>`;

    wire(root, selected, model, opts);
  }

  function popoverHtml(slice, model, selected) {
    const key = model.waveOf[slice.id];
    const group = model.groups.find((g) => g.key === key);
    const meta = statusMeta(slice.status);
    const pills = [`<span class="wv-pill wv-pill-status" style="--pill:${meta.color}">${esc(meta.label)}</span>`];
    if (slice.ac && slice.ac.total) {
      pills.push(`<span class="wv-pill">✓ ${slice.ac.done}/${slice.ac.total} criteria</span>`);
    }
    if (slice.agentStatus) {
      pills.push(`<span class="wv-pill">${esc(AGENT_LABELS[slice.agentStatus] || slice.agentStatus)}</span>`);
    }

    const titleOf = (id) => selected.slices.find((s) => s.id === id)?.title || id;
    const deps = (slice.deps || []).filter((d) => selected.slices.some((s) => s.id === d));
    const lines = [];
    if (deps.length) {
      lines.push(`<div class="wv-pop-line"><strong>Depends on</strong> ${deps.map((d) => esc(titleOf(d))).join(', ')}</div>`);
    }
    if (slice.agentNext) {
      lines.push(`<div class="wv-pop-line"><strong>Next</strong> ${esc(slice.agentNext)}</div>`);
    }

    const MAX = 8;
    const siblings = group.slices;
    const shown = siblings.slice(0, MAX);
    if (!shown.some((s) => s.id === slice.id)) shown[shown.length - 1] = slice;
    const siblingHtml = shown
      .map(
        (s) => `<div class="wv-pop-sibling${s.id === slice.id ? ' is-self' : ''}">
          <span class="wv-pop-sibling-dot" style="--dot:${statusMeta(s.status).color}"></span>
          <span class="wv-pop-sibling-name">${esc(s.title || s.id)}</span>
        </div>`
      )
      .join('');
    const more = siblings.length - shown.length;

    return `<div class="wv-pop-kicker">${esc(waveName(key))}${group.derived ? ' · from deps' : ''}</div>
      <div class="wv-pop-title">${esc(slice.title || slice.id)}</div>
      <div class="wv-pop-pills">${pills.join('')}</div>
      <p class="wv-pop-summary">${esc(slice.summary || 'No summary yet.')}</p>
      ${lines.join('')}
      <div class="wv-pop-wave">
        <div class="wv-pop-wave-label">${key === UNSCHEDULED ? 'Also unscheduled' : `In ${esc(waveName(key))}`} · ${plural(siblings.length, 'slice')}</div>
        ${siblingHtml}
        ${more > 0 ? `<div class="wv-pop-more">+${more} more</div>` : ''}
      </div>
      <div class="wv-pop-hint">Click to open</div>`;
  }

  function wire(root, selected, model, opts) {
    const shell = root.querySelector('.wv-shell');
    const sliceById = new Map(selected.slices.map((s) => [s.id, s]));
    const popover = document.createElement('div');
    popover.className = 'wv-popover';
    popover.setAttribute('role', 'tooltip');
    document.body.appendChild(popover);

    let activeSeg = null;

    function setLit(waveKey) {
      shell.classList.toggle('wv-hovering', waveKey != null);
      shell.querySelectorAll('[data-wave]').forEach((el) => {
        el.classList.toggle('is-lit', waveKey != null && el.dataset.wave === waveKey);
      });
    }

    function placePopover(seg) {
      const r = seg.getBoundingClientRect();
      const w = popover.offsetWidth;
      const h = popover.offsetHeight;
      const margin = 12;
      let top = r.bottom + 10;
      if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - h - 10);
      const left = Math.min(
        Math.max(margin, r.left + r.width / 2 - w / 2),
        window.innerWidth - w - margin
      );
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }

    function show(seg) {
      const slice = sliceById.get(seg.dataset.id);
      if (!slice) return;
      if (activeSeg) activeSeg.classList.remove('is-active');
      shell.querySelectorAll('.wv-seg.is-active').forEach((el) => el.classList.remove('is-active'));
      activeSeg = seg;
      shell.querySelectorAll(`.wv-seg[data-id="${CSS.escape(slice.id)}"]`).forEach((el) => el.classList.add('is-active'));
      setLit(seg.dataset.wave);
      popover.innerHTML = popoverHtml(slice, model, selected);
      popover.classList.add('is-open');
      placePopover(seg);
    }

    function hide() {
      activeSeg = null;
      shell.querySelectorAll('.wv-seg.is-active').forEach((el) => el.classList.remove('is-active'));
      popover.classList.remove('is-open');
      setLit(null);
    }

    shell.querySelectorAll('.wv-seg').forEach((seg) => {
      seg.addEventListener('mouseenter', () => show(seg));
      seg.addEventListener('mouseleave', hide);
      seg.addEventListener('focus', () => show(seg));
      seg.addEventListener('blur', hide);
      seg.addEventListener('click', () => {
        hide();
        if (opts.onOpenCard) opts.onOpenCard(seg.dataset.id);
      });
    });

    shell.querySelectorAll('.wv-row-head').forEach((head) => {
      const key = head.closest('.wv-row').dataset.wave;
      head.addEventListener('mouseenter', () => setLit(key));
      head.addEventListener('mouseleave', () => setLit(null));
    });

    const onKey = (e) => {
      if (e.key === 'Escape') hide();
    };
    const onScroll = () => hide();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);

    shell.querySelector('#wv-epic-select')?.addEventListener('change', (e) => {
      if (opts.onSelectEpic) opts.onSelectEpic(e.target.value);
    });
    shell.querySelector('#wv-open-epic')?.addEventListener('click', () => {
      if (opts.onOpenCard) opts.onOpenCard(selected.id);
    });

    root._wavesInstance = {
      cleanup() {
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScroll, true);
        popover.remove();
      },
    };
  }

  function destroyInstance(root) {
    if (!root) return;
    if (root._wavesInstance) {
      root._wavesInstance.cleanup();
      root._wavesInstance = null;
    }
    root.innerHTML = '';
  }

  /**
   * @param {HTMLElement} root
   * @param {{ epics: Array<{ id, title, initiativeTitle, slices: Array<{ id, title, status, wave, deps, summary, ac, order, agentStatus, agentNext }> }> }} payload
   * @param {{ accentColor?: string, selectedEpicId?: string, onSelectEpic?: Function, onOpenCard?: Function }} [opts]
   */
  function renderWavesView(root, payload, opts = {}) {
    if (!root) return;
    injectStyles();
    if (root._wavesInstance) {
      root._wavesInstance.cleanup();
      root._wavesInstance = null;
    }
    if (opts.accentColor) root.style.setProperty('--waves-accent', opts.accentColor);
    else root.style.removeProperty('--waves-accent');
    render(root, payload, opts);
  }

  window.renderWavesView = renderWavesView;
  window.destroyWavesView = destroyInstance;
})();
