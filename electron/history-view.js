/**
 * Kando History view — vault git commit log with search and PR-merge highlighting.
 * Exposed surface: window.renderHistoryView, window.destroyHistoryView
 */
(function () {
  'use strict';

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'history-view-styles';
    style.textContent = `
      .history-shell {
        --ha: var(--history-accent, var(--accent));
        display: flex;
        flex-direction: column;
        height: calc(100vh - var(--header-h));
        background: var(--bg);
        overflow: hidden;
      }
      .history-toolbar {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 20px;
        border-bottom: 1px solid var(--border-md);
        background: var(--toolbar-bg);
        flex-shrink: 0;
      }
      .history-toolbar-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--fs-xs);
        font-weight: 800;
        color: var(--ha);
        text-transform: uppercase;
        letter-spacing: .14em;
        flex-shrink: 0;
      }
      .history-toolbar-branch {
        font-family: 'SFMono-Regular', monospace;
        font-size: 10px;
        font-weight: 600;
        color: var(--text-3);
        text-transform: none;
        letter-spacing: 0;
        background: var(--surface-sub);
        border: 1px solid var(--border-md);
        padding: 1px 7px;
        border-radius: 99px;
      }
      .history-search {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        max-width: 380px;
        position: relative;
      }
      .history-search-icon {
        position: absolute;
        left: 10px;
        color: var(--text-3);
        pointer-events: none;
        display: flex;
      }
      .history-search-input {
        width: 100%;
        padding: 6px 10px 6px 30px;
        border: 1px solid var(--border);
        border-radius: var(--r-sm);
        background: var(--surface);
        color: var(--text-1);
        font-family: var(--font);
        font-size: var(--fs-sm);
        outline: none;
        transition: border-color .15s;
      }
      .history-search-input:focus { border-color: var(--ha); }
      .history-search-input::placeholder { color: var(--text-3); }
      .history-count {
        margin-left: auto;
        font-size: var(--fs-xs);
        color: var(--text-3);
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .history-list {
        flex: 1;
        overflow-y: auto;
        padding-bottom: 60px;
      }
      .history-group-label {
        position: sticky;
        top: 0;
        z-index: 2;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .12em;
        color: var(--text-3);
        background: var(--bg);
        padding: 16px 22px 6px;
      }
      .history-row {
        border-bottom: 1px solid var(--border);
        cursor: pointer;
        transition: background .12s;
      }
      .history-row:hover { background: var(--surface); }
      .history-row.expanded { background: var(--surface); }
      .history-row-main {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 22px;
      }
      .history-row-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--text-3);
        flex-shrink: 0;
        margin-top: 6px;
      }
      .history-row-dot.dot-merge {
        background: var(--ha);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ha) 18%, transparent);
      }
      .history-row-body { flex: 1; min-width: 0; }
      .history-row-subject-line {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .history-row-subject {
        font-size: var(--fs-base);
        font-weight: 600;
        color: var(--text-1);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
      .history-pr-badge, .history-merge-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 800;
        padding: 2px 8px 2px 6px;
        border-radius: 99px;
        background: color-mix(in srgb, var(--ha) 14%, transparent);
        color: var(--ha);
        flex-shrink: 0;
        white-space: nowrap;
        text-decoration: none;
        border: 1px solid transparent;
      }
      a.history-pr-badge { cursor: pointer; transition: all .12s; }
      a.history-pr-badge:hover {
        background: var(--ha);
        color: var(--accent-selected-text, var(--bg));
      }
      .history-row-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--fs-xs);
        color: var(--text-3);
        margin-top: 3px;
        flex-wrap: wrap;
      }
      .history-row-hash {
        font-family: 'SFMono-Regular', monospace;
        font-size: 10px;
      }
      .history-file-chip {
        font-size: 10px;
        font-weight: 600;
        color: var(--text-3);
        background: var(--surface-sub);
        border: 1px solid var(--border-md);
        padding: 0 6px;
        border-radius: 99px;
      }
      .history-row-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0;
        transition: opacity .12s;
        flex-shrink: 0;
      }
      .history-row:hover .history-row-actions,
      .history-row.expanded .history-row-actions { opacity: 1; }
      .history-row-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--text-3);
        text-decoration: none;
        padding: 5px;
        border-radius: var(--r-sm);
        border: 1px solid var(--border-md);
        transition: all .12s;
      }
      .history-row-link:hover { color: var(--ha); border-color: var(--ha); }
      .history-row-expanded {
        padding: 0 22px 16px 41px;
      }
      .history-expanded-message {
        font-size: var(--fs-sm);
        color: var(--text-2);
        line-height: var(--lh-body);
        white-space: pre-wrap;
        margin-bottom: 10px;
      }
      .history-expanded-hash {
        font-family: 'SFMono-Regular', monospace;
        font-size: 10px;
        color: var(--text-3);
        margin-bottom: 10px;
      }
      .history-expanded-files {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 220px;
        overflow-y: auto;
      }
      .history-expanded-files li {
        font-family: 'SFMono-Regular', monospace;
        font-size: 11px;
        color: var(--text-2);
        padding: 2px 0;
      }
      .history-expanded-empty {
        font-size: var(--fs-sm);
        color: var(--text-3);
        font-style: italic;
      }
      .history-empty {
        padding: 70px 20px;
        text-align: center;
        color: var(--text-3);
        font-size: var(--fs-sm);
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

  function mergeIcon() {
    return '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="4" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M4 6v4M6 4h2a4 4 0 0 1 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }

  function externalIcon() {
    return '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 4H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2M9 3h4v4M13 3 7 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function searchIcon() {
    return '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M10 10L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 45) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(day / 365);
    return `${yr}y ago`;
  }

  function fullTimestamp(iso) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dateGroupLabel(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'This week';
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month';
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, { month: 'long', year: sameYear ? undefined : 'numeric' });
  }

  function matchesSearch(commit, needle) {
    if (!needle) return true;
    if (commit.subject.toLowerCase().includes(needle)) return true;
    if (commit.body && commit.body.toLowerCase().includes(needle)) return true;
    if (commit.authorName.toLowerCase().includes(needle)) return true;
    if (commit.hash.startsWith(needle) || commit.shortHash.startsWith(needle)) return true;
    if (commit.mergeInfo && String(commit.mergeInfo.prNumber).includes(needle)) return true;
    if (commit.files.some((f) => f.toLowerCase().includes(needle))) return true;
    return false;
  }

  function destroyInstance(rootEl) {
    const inst = rootEl?._historyInstance;
    if (!inst) return;
    if (inst.cleanup) inst.cleanup();
    delete rootEl._historyInstance;
  }

  function renderHistoryView(rootEl, payload, options) {
    if (!rootEl) return;
    injectStyles();
    destroyInstance(rootEl);

    const accentColor = options?.accentColor || null;
    if (accentColor) rootEl.style.setProperty('--history-accent', accentColor);

    const commits = payload.commits || [];
    const repoWebUrl = payload.repoWebUrl || null;
    const branch = payload.branch || null;

    const state = { search: '', expandedHash: null };

    rootEl.innerHTML = `
      <div class="history-shell">
        <div class="history-toolbar">
          <div class="history-toolbar-title">History${branch ? `<span class="history-toolbar-branch">${esc(branch)}</span>` : ''}</div>
          <div class="history-search">
            <span class="history-search-icon">${searchIcon()}</span>
            <input type="text" class="history-search-input" placeholder="Search commits, files, authors…" autocomplete="off" aria-label="Search history">
          </div>
          <div class="history-count" id="history-count"></div>
        </div>
        <div class="history-list" id="history-list"></div>
      </div>
    `;

    const listEl = rootEl.querySelector('#history-list');
    const countEl = rootEl.querySelector('#history-count');
    const searchInput = rootEl.querySelector('.history-search-input');

    function renderRow(c) {
      const expanded = state.expandedHash === c.hash;
      const isMergeish = !!c.mergeInfo;
      const prUrl = c.mergeInfo && repoWebUrl ? `${repoWebUrl}/pull/${c.mergeInfo.prNumber}` : null;
      const commitUrl = repoWebUrl ? `${repoWebUrl}/commit/${c.hash}` : null;

      let badge = '';
      if (c.mergeInfo) {
        badge = prUrl
          ? `<a class="history-pr-badge" href="${esc(prUrl)}" target="_blank" rel="noopener" title="Open PR #${c.mergeInfo.prNumber} on GitHub" onclick="event.stopPropagation()">${mergeIcon()}PR #${c.mergeInfo.prNumber}</a>`
          : `<span class="history-pr-badge" title="Merged via PR #${c.mergeInfo.prNumber}">${mergeIcon()}PR #${c.mergeInfo.prNumber}</span>`;
      } else if (c.isMerge) {
        badge = `<span class="history-merge-badge">${mergeIcon()}merge</span>`;
      }

      const fileCount = c.files.length;
      const fileChip = fileCount
        ? `<span class="history-file-chip">${fileCount} file${fileCount === 1 ? '' : 's'}</span>`
        : '';

      return `
        <div class="history-row ${isMergeish ? 'is-merge' : ''} ${expanded ? 'expanded' : ''}" data-hash="${esc(c.hash)}">
          <div class="history-row-main">
            <span class="history-row-dot ${isMergeish ? 'dot-merge' : ''}"></span>
            <div class="history-row-body">
              <div class="history-row-subject-line">
                <span class="history-row-subject">${esc(c.mergeInfo ? c.mergeInfo.title : c.subject)}</span>
                ${badge}
              </div>
              <div class="history-row-meta">
                <span class="history-row-author">${esc(c.authorName)}</span>
                <span>·</span>
                <span class="history-row-time" title="${esc(fullTimestamp(c.date))}">${esc(timeAgo(c.date))}</span>
                <span>·</span>
                <span class="history-row-hash">${esc(c.shortHash)}</span>
                ${fileChip}
              </div>
            </div>
            <div class="history-row-actions">
              ${commitUrl ? `<a class="history-row-link" href="${esc(commitUrl)}" target="_blank" rel="noopener" title="View commit on GitHub" onclick="event.stopPropagation()">${externalIcon()}</a>` : ''}
            </div>
          </div>
          ${expanded ? renderExpanded(c) : ''}
        </div>
      `;
    }

    function renderExpanded(c) {
      const files = c.files.length
        ? `<ul class="history-expanded-files">${c.files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
        : `<div class="history-expanded-empty">No file changes recorded${c.isMerge ? ' for this merge commit' : ''}.</div>`;
      const bodyBlock = c.body ? `<div class="history-expanded-message">${esc(c.body)}</div>` : '';
      return `
        <div class="history-row-expanded">
          ${bodyBlock}
          <div class="history-expanded-hash">${esc(c.hash)}</div>
          ${files}
        </div>
      `;
    }

    function render() {
      const needle = state.search.trim().toLowerCase();
      const filtered = commits.filter((c) => matchesSearch(c, needle));

      countEl.textContent = needle
        ? `${filtered.length} of ${commits.length} commit${commits.length === 1 ? '' : 's'}`
        : `${commits.length} commit${commits.length === 1 ? '' : 's'}`;

      if (!commits.length) {
        listEl.innerHTML = '<div class="history-empty">No commits yet.</div>';
        return;
      }
      if (!filtered.length) {
        listEl.innerHTML = `<div class="history-empty">No commits match “${esc(state.search.trim())}”.</div>`;
        return;
      }

      let html = '';
      let lastGroup = null;
      for (const c of filtered) {
        const group = dateGroupLabel(c.date);
        if (group !== lastGroup) {
          html += `<div class="history-group-label">${esc(group)}</div>`;
          lastGroup = group;
        }
        html += renderRow(c);
      }
      listEl.innerHTML = html;

      listEl.querySelectorAll('.history-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          const hash = row.dataset.hash;
          state.expandedHash = state.expandedHash === hash ? null : hash;
          render();
        });
      });
    }

    function onSearchInput(e) {
      state.search = e.target.value;
      render();
    }
    searchInput.addEventListener('input', onSearchInput);

    render();

    rootEl._historyInstance = {
      cleanup() {
        searchInput.removeEventListener('input', onSearchInput);
      },
    };
  }

  window.renderHistoryView = renderHistoryView;
  window.destroyHistoryView = destroyInstance;
})();
