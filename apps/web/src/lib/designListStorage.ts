/**
 * The list of designs on the start page lives in localStorage, which holds only a few megabytes. A card picture
 * kept as a data URL in that list is tens of kilobytes, so a browser with many designs filled it up, and the old
 * way round a full storage - take the list out, then write it again - lost the whole list when the second write
 * failed too (#656). The pictures now live in IndexedDB (designThumbnailStore), and the list is never taken out
 * before the new one is in.
 */

type ListedProject = { id: string; thumbnailUrl?: string | null };

/** A picture written into the page itself rather than fetched from an address. */
export function isInlineThumbnail(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("data:");
}

/** The list as it goes into localStorage: the same cards, without the pictures that live in IndexedDB. */
export function projectListForLocalStorage<T extends ListedProject>(projects: T[]): T[] {
  return projects.map((project) => (isInlineThumbnail(project.thumbnailUrl) ? { ...project, thumbnailUrl: null } : project));
}

/** Gives each card without a picture the one kept for it, if there is one. Unchanged cards stay the same object. */
export function withStoredThumbnails<T extends ListedProject>(projects: T[], thumbnails: ReadonlyMap<string, string>): T[] {
  let changed = false;
  const next = projects.map((project) => {
    if (project.thumbnailUrl) return project;
    const stored = thumbnails.get(project.id);
    if (!stored) return project;
    changed = true;
    return { ...project, thumbnailUrl: stored };
  });
  return changed ? next : projects;
}

/**
 * Writes the list, or reports that it could not. The old list stays where it is when the new one does not fit:
 * removing it first frees nothing a replacing write would not free anyway, and left nothing at all when the
 * write failed after it.
 */
export function writeProjectList(storage: Pick<Storage, "setItem">, key: string, serialized: string): boolean {
  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

type RecoveryCandidate = { id: string; name: string; createdAt: number; revision: number };

/**
 * Which lost designs get a card again. A backup brought back after the list was lost gives the same designs new
 * ids, so the same design can be there twice: one with a card and one without, or two without. A design counts as
 * the same when name and creation time match (as a restore decides it, #407); it comes back once, the newest.
 */
export function designsToRecover<T extends RecoveryCandidate>(listed: ReadonlyArray<{ name: string; createdAt: number }>, candidates: readonly T[]): T[] {
  const sameDesign = (design: { name: string; createdAt: number }) => `${design.createdAt}\u0000${design.name}`;
  const taken = new Set(listed.map(sameDesign));
  const newest = new Map<string, T>();
  for (const candidate of candidates) {
    const key = sameDesign(candidate);
    if (taken.has(key)) continue;
    const kept = newest.get(key);
    if (!kept || candidate.revision > kept.revision) newest.set(key, candidate);
  }
  return [...newest.values()];
}

/**
 * Set once the lost designs have been looked for in this browser. The list cannot be lost that way since 1.95.0, so
 * one look is enough; looking at every start brought back the old copy a restore had left behind each time the
 * restored one was deleted (#656).
 */
export const LOST_DESIGNS_RECOVERED_KEY = "layerling.lostDesignsRecovered";

/** The hidden copies of a design that is being deleted: same name and creation time, as designsToRecover counts them. */
export function hiddenCopiesOf(design: { name: string; createdAt: number }, candidates: ReadonlyArray<RecoveryCandidate>): string[] {
  return candidates.filter((candidate) => candidate.name === design.name && candidate.createdAt === design.createdAt).map((candidate) => candidate.id);
}

/** The designs whose shapes are still in IndexedDB although no card points to them any more. */
export function orphanedProjectIds(listedIds: Iterable<string>, storedIds: Iterable<string>): string[] {
  const listed = new Set(listedIds);
  return [...new Set(storedIds)].filter((id) => !listed.has(id));
}
