import { countWords } from "../db.js";
import { getMasteryBreakdown, getOverallStats } from "../db.js";
import { logoHtml, masteryBarHtml } from "../components.js";

export async function render(container) {
  container.innerHTML = `
    <div class="scroll top-safe">
      ${logoHtml()}
      <h1 class="title">統計</h1>

      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-label">正答率(7日)</div>
          <div class="stat-value" id="accuracy">0%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">累計復習</div>
          <div class="stat-value" id="total-reviews">0</div>
        </div>
      </div>

      <div class="card">
        <div class="section-label" id="mastery-label">MASTERY・0語</div>
        <div id="mastery-holder"></div>
      </div>

      <div class="note-text">
        カードタイプ別の正答率や週間ヒートマップ、苦手な単語（Leech）の一覧は、ある程度の学習履歴がたまってから追加予定です。
      </div>
    </div>
  `;

  const [words, stats, mastery] = await Promise.all([countWords(), getOverallStats(), getMasteryBreakdown()]);
  container.querySelector("#accuracy").textContent = `${Math.round(stats.accuracy7d * 100)}%`;
  container.querySelector("#total-reviews").textContent = stats.totalReviews.toLocaleString();
  container.querySelector("#mastery-label").textContent = `MASTERY・${words}語`;
  container.querySelector("#mastery-holder").innerHTML = masteryBarHtml(mastery);
}
