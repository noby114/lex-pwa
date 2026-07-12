import { getMasteryBreakdown, getTodaysReviewCount, countWords, listAllWords } from "../db.js";
import { navigate } from "../router.js";
import { icon } from "../icons.js";
import { logoHtml, masteryBarHtml, escapeHtml } from "../components.js";

export async function render(container) {
  container.innerHTML = `
    <div class="scroll top-safe">
      <div class="header-row">
        ${logoHtml()}
        <div class="streak-pill">${icon("flame", { color: "var(--warning)" })}<span id="streak">0</span></div>
      </div>

      <button class="hero" id="hero-btn">
        <div>
          <div class="hero-label">TODAY'S REVIEW</div>
          <div class="hero-number"><span id="due-count">0</span><span class="hero-suffix">件</span></div>
        </div>
        <div class="play-circle">${icon("play", { color: "#fff" })}</div>
      </button>

      <div class="progress-row">
        <div class="ring" id="progress-ring"></div>
        <div class="progress-text" id="progress-text">今日 0/0 完了</div>
        <div class="total-words-text" id="total-words-text">総単語 0</div>
      </div>

      <div class="card">
        <div class="section-label">MASTERY</div>
        <div id="mastery-holder"></div>
      </div>

      <div class="section-label">RECENT</div>
      <div id="recent-list"></div>
    </div>
  `;

  container.querySelector("#hero-btn").addEventListener("click", () => navigate("study"));

  const [reviewCount, wordCount, words, mastery] = await Promise.all([
    getTodaysReviewCount(),
    countWords(),
    listAllWords(),
    getMasteryBreakdown(),
  ]);

  container.querySelector("#due-count").textContent = reviewCount.due;
  container.querySelector("#progress-text").textContent = `今日 ${reviewCount.done}/${
    reviewCount.done + reviewCount.due
  } 完了`;
  container.querySelector("#total-words-text").textContent = `総単語 ${wordCount}`;

  const pct = reviewCount.due > 0 ? Math.round((reviewCount.done / (reviewCount.done + reviewCount.due)) * 100) : 100;
  container.querySelector("#progress-ring").style.background = `conic-gradient(var(--accent) ${pct}%, var(--border) 0)`;

  container.querySelector("#mastery-holder").innerHTML = masteryBarHtml(mastery);

  const recent = words.slice(0, 3);
  const recentEl = container.querySelector("#recent-list");
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-text">まだ単語がありません。「追加」タブから登録しましょう。</div>`;
  } else {
    recentEl.innerHTML = recent
      .map(
        (w) => `
        <button class="row" data-id="${w.id}" style="cursor:pointer">
          <div style="text-align:left">
            <div class="word-head">${escapeHtml(w.headword)}</div>
            <div class="word-meaning">${escapeHtml(w.phonetic ?? "―")} ${
          w.senses[0] ? `・ ${escapeHtml(w.senses[0].pos)}` : ""
        }</div>
          </div>
          ${icon("play", { color: "var(--accent)", size: 17 })}
        </button>`
      )
      .join("");
    recentEl.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(`word/${btn.dataset.id}`));
    });
  }
}
