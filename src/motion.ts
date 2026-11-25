// Whether the person has asked their device for less motion. The CSS animations are
// already switched off for them by the global rule in ui.tsx; this is for the animations
// driven from script, which that rule can't reach.
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
