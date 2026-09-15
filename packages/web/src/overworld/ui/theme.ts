/**
 * Design tokens for the "pro designed" overlay redesign (wave4-full-vision.md §B). Named and
 * valued 1:1 with the Figma design system's variable collections
 * (https://www.figma.com/design/Max8E6fAzoFZhV0sWCISMg — Color/Primitives, Color/Semantic,
 * Spacing, Radius) so this file is the code side of that system, not a separate palette. Every
 * value here traces back to the ORIGINAL live palette OverlayShell.tsx already used — nothing
 * invented, only reorganized into reusable tokens plus the two real additions the Figma pass
 * made (a second shadow layer for depth, an accent-line color reuse of the existing button
 * border). No new dependency — plain TS constants, matching this app's existing inline-style
 * convention (CLAUDE.md: "don't add dependencies casually").
 */

export const color = {
  scrim: "rgba(6, 7, 16, 0.6)",
  panelBg: "#1b1d3a",
  panelBorder: "#4a4d7a",
  headerBg: "#2a2d5c",
  footerBg: "#181a35",
  footerBorder: "#33356b",
  textTitle: "#f4f1ff",
  textBody: "#e7e5ff",
  fieldBg: "#12142a",
  fieldBorder: "#3a3d70",
  buttonBg: "#3d4080",
  buttonBorder: "#5a5db0",
  buttonText: "#f4f1ff",
  dangerBg: "#7a2d3d",
  dangerBorder: "#c0596e",
  /** The list-row divider used identically across every overlay's catalog/list — confirmed by
   *  grep across the whole `overworld/ui` directory before adding this token: the exact same
   *  `"1px solid #2a2c55"` value, independently hand-typed 24+ times across 14 files. One
   *  shared token so it can't drift between overlays again. */
  divider: "#2a2c55",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

/** Two-layer drop shadow (Figma effect style "Panel/Depth") — replaces the old single flat
 *  hard-offset shadow with real depth: a tight contact shadow plus a soft ambient one. */
export const panelShadow = "0 8px 0 rgba(0,0,0,0.35), 0 16px 24px -4px rgba(0,0,0,0.5), 0 0 0 1px #0c0e1f inset";
