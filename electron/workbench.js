/**
 * Workbench membership — which slices belong "on the bench."
 * Keep the filter in electron/app.html `isOnBench` in sync with this module.
 *
 * Board status is the source of truth for finished work. Leftover agent_*
 * fields on Done/Deferred cards must not keep them visible.
 */
export const BENCH_HIDDEN_STATUSES = new Set(['Done', 'Deferred']);

export function isOnBench(card) {
  if (!card || card.is_epic || card.is_initiative) return false;
  if (BENCH_HIDDEN_STATUSES.has(card.status)) return false;
  return Boolean(card.agent_status || card.status === 'Active');
}

export function benchCardsFrom(cards) {
  return (cards || []).filter(isOnBench);
}
