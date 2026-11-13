// The shared hover tooltip (#planner-tooltip) hides on its anchor's pointerout / focusout. A re-render
// that removes the hovered element (equipping a slate from the inventory list, any innerHTML rewrite)
// fires neither, so the tooltip stayed on screen. This watch hides it once its anchor has left the
// document, after any DOM change (MutationObserver), on the next pointer move, and when a dialog that
// holds the anchor or the tooltip closes. A legitimately hovered tooltip keeps working: a connected
// anchor is never touched, and the newly rendered element under the pointer shows its own on the next move.

/** True when a tooltip is shown for an anchor that is no longer in the document. */
export function tooltipAnchorDetached(anchor) {
  return Boolean(anchor) && anchor.isConnected === false;
}

/** True when a closing dialog holds the tooltip's anchor or the tooltip itself. */
export function dialogHoldsTooltip(dialog, anchor, tooltip) {
  if (!dialog || typeof dialog.contains !== "function") return false;
  return Boolean((anchor && dialog.contains(anchor)) || (tooltip && dialog.contains(tooltip)));
}

/**
 * Install the watch. `getAnchor()` returns the current anchor (null while hidden), `getTooltip()` the
 * tooltip element, `hide()` hides it. Returns a disconnect function.
 */
export function installTooltipAnchorWatch({ doc = globalThis.document, getAnchor, getTooltip, hide, MutationObserverImpl = globalThis.MutationObserver }) {
  const check = () => { if (tooltipAnchorDetached(getAnchor())) hide(); };
  let observer = null;
  if (typeof MutationObserverImpl === "function" && doc?.documentElement) {
    observer = new MutationObserverImpl(() => { if (getAnchor()) check(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }
  const onClose = (event) => {
    const anchor = getAnchor();
    if (anchor && dialogHoldsTooltip(event.target, anchor, getTooltip())) hide();
  };
  doc?.addEventListener?.("pointermove", check, true);
  doc?.addEventListener?.("close", onClose, true);
  return () => {
    observer?.disconnect();
    doc?.removeEventListener?.("pointermove", check, true);
    doc?.removeEventListener?.("close", onClose, true);
  };
}
