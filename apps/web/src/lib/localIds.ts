let fallbackIdCounter = 0;

export function createLocalId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid}`;
  }

  fallbackIdCounter = (fallbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const counter = fallbackIdCounter.toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${counter}-${random}`;
}

/**
 * A fresh id for a part taken into or out of a group, kept readable: the
 * suffix a previous grouping or ungrouping added is dropped first, so opening
 * and closing a group again and again does not grow the id each time.
 */
export function derivedLocalId(sourceId: string, role: "group-child" | "ungroup" | "bore") {
  return createLocalId(`${localIdBase(sourceId)}-${role}`);
}

/** The id an object had before any grouping or ungrouping gave it a derived one. */
export function localIdBase(id: string) {
  return id.split(/-(?:group-child|ungroup|bore)-/)[0] || id;
}
