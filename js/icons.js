// Minimal hand-rolled icon set (no external icon font / CDN dependency, so
// the PWA keeps working fully offline). Each icon is a small inline SVG
// path; call icon(name, {size, color}) to get an HTML string.

const PATHS = {
  home: "M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3z",
  add: "M12 5v14M5 12h14",
  list: "M4 6h16M4 12h16M4 18h16",
  chart: "M4 20V10M10 20V4M16 20v-7M4 20h16",
  person: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.5-4 5-6 8-6s6.5 2 8 6",
  play: "M6 4l14 8-14 8z",
  close: "M5 5l14 14M19 5L5 19",
  "chevron-down": "M5 8l7 7 7-7",
  "chevron-forward": "M8 5l7 7-7 7",
  "chevron-back": "M16 5l-7 7 7 7",
  "check-circle": "M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6",
  circle: "M12 21a9 9 0 100-18 9 9 0 000 18z",
  trash: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13",
  copy: "M8 8h11v11H8zM5 15V4h11v3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 8v.01",
  flame: "M12 3c1 3-3 4-3 8a3 3 0 006 0c0-1-1-2-1-3 2 1 4 3 4 6a6 6 0 11-12 0c0-4 3-6 6-11z",
  upload: "M12 20V9M7 13l5-5 5 5M5 4h14",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
};

export function icon(name, { size = 20, color = "currentColor" } = {}) {
  const d = PATHS[name] ?? PATHS.circle;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
    name === "circle" || name === "check-circle"
      ? `<path d="${d}"/>`
      : `<path d="${d}"/>`
  }</svg>`;
}
