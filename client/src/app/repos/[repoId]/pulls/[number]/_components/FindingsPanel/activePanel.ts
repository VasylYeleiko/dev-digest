/* Which FindingsPanel owns the j/k/a/d keyboard shortcuts.
   Every expanded review run renders its own panel, and all of them listen on
   `window` — without a single owner one keypress accepted/dismissed the focused
   finding in EVERY open panel. The first panel to mount owns the keys; a click
   or focus inside another panel moves ownership there; when the owner unmounts
   (its run collapses), the next mounted panel takes over. */

import React from "react";

const mounted: symbol[] = [];
let owner: symbol | null = null;
const listeners = new Set<() => void>();

function setOwner(next: symbol | null) {
  if (owner === next) return;
  owner = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether this panel owns the shortcuts, plus a `claim` to take them. */
export function useShortcutOwner(): { active: boolean; claim: () => void } {
  const id = React.useRef<symbol>(Symbol("findings-panel"));
  const active = React.useSyncExternalStore(
    subscribe,
    () => owner === id.current,
    () => false,
  );

  React.useEffect(() => {
    const me = id.current;
    mounted.push(me);
    if (owner === null) setOwner(me);
    return () => {
      mounted.splice(mounted.indexOf(me), 1);
      if (owner === me) setOwner(mounted[0] ?? null);
    };
  }, []);

  const claim = React.useCallback(() => setOwner(id.current), []);
  return { active, claim };
}
