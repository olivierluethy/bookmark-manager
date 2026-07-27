export type SelectionState = { selectedIds: Set<string>; anchorId: string | null };
export type ClickModifiers = { shift: boolean; meta: boolean };

/**
 * PURE. Anchor-plus-set model, shaped so Milestone 2 can drag a whole
 * selection without reworking it.
 */
export function applyClick(
  state: SelectionState,
  id: string,
  orderedIds: string[],
  mods: ClickModifiers,
): SelectionState {
  if (mods.meta) {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next, anchorId: id };
  }

  if (mods.shift && state.anchorId) {
    const from = orderedIds.indexOf(state.anchorId);
    const to = orderedIds.indexOf(id);
    // A missing anchor or target means the list changed under us; fall back
    // to a plain selection rather than selecting a wrong range.
    if (from === -1 || to === -1) return { selectedIds: new Set([id]), anchorId: id };
    const [start, end] = from <= to ? [from, to] : [to, from];
    return {
      selectedIds: new Set(orderedIds.slice(start, end + 1)),
      // The anchor stays put so successive shift-clicks re-range from it.
      anchorId: state.anchorId,
    };
  }

  return { selectedIds: new Set([id]), anchorId: id };
}
