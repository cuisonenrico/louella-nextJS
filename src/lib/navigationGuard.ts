/**
 * App-wide hook point for "you have unsaved changes" prompts.
 *
 * The App Router has no API to block a client navigation, and the sidebar and
 * logout navigate with `router.push`/`router.replace` rather than `<Link>`, so
 * a page with unsaved edits registers a blocker here and every app-level
 * navigation goes through `guardNavigation`. At most one blocker is active: the
 * page currently on screen.
 */
type Blocker = (proceed: () => void) => void;

let blocker: Blocker | null = null;

export function setNavigationBlocker(next: Blocker | null) {
  blocker = next;
}

/** Runs `proceed` now, or hands it to the active blocker to confirm first. */
export function guardNavigation(proceed: () => void) {
  if (blocker) blocker(proceed);
  else proceed();
}
