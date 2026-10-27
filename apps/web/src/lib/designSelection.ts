/**
 * Choosing several designs on the start page, to delete them together (#886). A key names one
 * design: one of this browser by its id, or one in the server folder by its file and folder, so
 * the two lists can share one selection. The functions never change the set they are given.
 */
export function localDesignKey(projectId: string) {
  return `l:${projectId}`;
}

export function serverDesignKey(sharedKey: string) {
  return `s:${sharedKey}`;
}

/** The selection with the key taken in, or taken out when it was in. */
export function toggleDesignSelection(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** What is left of a selection once only the designs still shown count: a design that was deleted, moved or filtered out drops out. */
export function keepShownSelection(selected: ReadonlySet<string>, shown: Iterable<string>): Set<string> {
  const available = new Set(shown);
  return new Set([...selected].filter((key) => available.has(key)));
}

/** Whether a selection and a list of shown keys differ, so the selection has to be trimmed. */
export function selectionHasStale(selected: ReadonlySet<string>, shown: Iterable<string>): boolean {
  const available = new Set(shown);
  for (const key of selected) if (!available.has(key)) return true;
  return false;
}
