// Small shared HTML-string components, ported from the Expo version's
// src/components/*.tsx (Logo, MasteryBar, PosBadge).

export function logoHtml(size = 20) {
  return `
    <div class="logo-row">
      <svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 40 40">
        <rect x="6" y="6" width="10" height="28" fill="var(--accent)"></rect>
        <rect x="10" y="26" width="24" height="8" fill="var(--accent)"></rect>
        <rect x="20" y="6" width="8" height="8" fill="var(--accent)" transform="rotate(45 24 10)"></rect>
      </svg>
      <span class="logo-text">lex</span>
    </div>
  `;
}

const TIER_COLOR = {
  new: "var(--mastery-new)",
  learning: "var(--mastery-learning)",
  reviewing: "var(--mastery-reviewing)",
  mastered: "var(--mastery-mastered)",
};
export const TIER_LABEL = {
  new: "新規",
  learning: "学習中",
  reviewing: "定着",
  mastered: "マスター",
};

export function masteryBarHtml(counts) {
  const total = Math.max(1, counts.new + counts.learning + counts.reviewing + counts.mastered);
  const tiers = ["new", "learning", "reviewing", "mastered"];
  const track = tiers
    .map((t) => `<div style="flex:${counts[t] / total || 0.0001};background:${TIER_COLOR[t]}"></div>`)
    .join("");
  const legend = tiers
    .map(
      (t) =>
        `<div class="mastery-legend-item"><span class="mastery-dot" style="background:${TIER_COLOR[t]}"></span>${TIER_LABEL[t]} ${counts[t]}</div>`
    )
    .join("");
  return `<div class="mastery-track">${track}</div><div class="mastery-legend">${legend}</div>`;
}

export function posBadgeHtml(pos, extraSenseCount = 0) {
  const extra = extraSenseCount > 0 ? `<span class="pos-extra">+${extraSenseCount}</span>` : "";
  return `<span class="pos-badge">${escapeHtml(pos).slice(0, 1)}</span>${extra}`;
}

export function tierColor(tier) {
  return TIER_COLOR[tier] ?? TIER_COLOR.new;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
