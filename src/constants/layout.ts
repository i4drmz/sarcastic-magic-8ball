/**
 * Fallback bounds for the Home hero banner, which otherwise flexes to fill
 * whatever space is left after the other Home sections lay out. Keeping a
 * min/max here avoids it collapsing to nothing or growing unbounded on very
 * short/tall screens, without pinning it to one aggressive fixed height.
 */
export const HERO_MIN_HEIGHT = 160;
export const HERO_MAX_HEIGHT = 300;

export const SCREEN_HORIZONTAL_PADDING = 20;

export const BOTTOM_TAB_BAR_HEIGHT = 78;
