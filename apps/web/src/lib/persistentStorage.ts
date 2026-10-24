const ASKED_KEY = "layerling.persistentStorageAsked";

/**
 * Asks the browser once to keep this site's storage (designs, thumbnails, fonts) even when it is short of room
 * (Jürgen Keller, 24.10.2026). Without the request every browser may clear it first; Chrome and Edge decide on their
 * own, Firefox asks the person once, Safari grants it only to an installed web app. The answer is not needed: the
 * designs work either way. Asked once per browser, and only when there is a design to keep.
 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist || !navigator.storage.persisted) return;
    if (window.localStorage.getItem(ASKED_KEY)) return;
    window.localStorage.setItem(ASKED_KEY, "1");
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // Storage that cannot be asked is no reason to stop.
  }
}
