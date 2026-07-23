/**
 * Injectable clock seam — every "today", schedule, and expiry decision
 * routes through now() so tests can drive time-based behavior.
 */
let _now: () => number = () => Date.now();

/** Current wall-clock ms (overridable in tests). */
export function now(): number {
  return _now();
}

/** Override the clock (tests only). Pass nothing to restore Date.now. */
export function setNow(fn?: () => number): void {
  _now = fn ?? (() => Date.now());
}
