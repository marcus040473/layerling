/*
 * "Ask before closing the tab" (a setting, off by default) puts the browser's own "Leave site?" question in the way of
 * a closed or reloaded tab. A reload layerling starts itself - after "Save and reload" for a new version - must not
 * run into it, so those places release the guard first.
 */
let released = false;

export function releaseLeaveGuard() {
  released = true;
}

export function leaveGuardReleased() {
  return released;
}
