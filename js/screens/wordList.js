import { listAllWords, deleteWords, getMasteryTierByWord } from "../db.js";
import { navigate } from "../router.js";
import { logoHtml, posBadgeHtml, tierColor, TIER_LABEL, escapeHtml } from "../components.js";
import { icon } from "../icons.js";

let selectMode = false;
let selectedIds = new Set();

export async function render(container) {
  selectMode = false;
  selectedIds = new Set();

  container.innerHTML = `
    <div class="top-safe" style="padding:0 var(--sp-xl)">
      <div class="header-row" style="margin-bottom:var(--sp-lg)">
        ${logoHtml()}
        <div style="flex:1"></div>
        <button class="icon-btn accent" id="select-toggle" style="font-size:14px;font-weight:500;color:var(--accent);background:none">選択</button>
      </div>
      <h1 class="title" style="margin-bottom:0">単語一覧</h1>
      <div class="subtitle" id="subtitle">左の色は習熟度（新規／学習中／定着／マスター）</div>
    </div>
    <div style="padding:0 var(--sp-xl)" id="list"></div>
    <div id="bottom-bar-holder"></div>
  `;

  const [words, tiers] = await Promise.all([listAllWords(), getMasteryTierByWord()]);

  function draw() {
    const toggleBtn = container.querySelector("#select-toggle");
    toggleBtn.textContent = selectMode ? "キャンセル" : "選択";
    container.querySelector("#subtitle").textContent = selectMode
      ? "削除したい単語をタップして選択してください"
      : "左の色は習熟度（新規／学習中／定着／マスター）";

    const listEl = container.querySelector("#list");
    if (words.length === 0) {
      listEl.innerHTML = `<div class="empty-text">まだ単語がありません。</div>`;
    } else {
      listEl.innerHTML = words
        .map((w) => {
          const tier = tiers[w.id] ?? "new";
          const primary = w.senses[0];
          const selected = selectedIds.has(w.id);
          return `
            <button class="word-row ${selected ? "selected" : ""}" data-id="${w.id}" style="width:100%;cursor:pointer">
              ${selectMode ? icon(selected ? "check-circle" : "circle", { color: selected ? "var(--accent)" : "var(--text-muted)", size: 20 }) : ""}
              <div class="stripe" style="background:${tierColor(tier)}"></div>
              <div style="flex:1;text-align:left">
                <div class="word-line">
                  <span class="word-head">${escapeHtml(w.headword)}</span>
                  ${primary ? posBadgeHtml(primary.pos, w.senses.length - 1) : ""}
                </div>
                <div class="word-meaning">${escapeHtml(primary?.meaningJa ?? "（未処理）")}</div>
              </div>
              ${!selectMode ? `<span class="tier-label" style="color:${tierColor(tier)}">${TIER_LABEL[tier]}</span>` : ""}
            </button>`;
        })
        .join("");

      listEl.querySelectorAll("button[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.id);
          if (selectMode) {
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            draw();
          } else {
            navigate(`word/${id}`);
          }
        });
      });
    }

    const bottomHolder = container.querySelector("#bottom-bar-holder");
    if (selectMode && selectedIds.size > 0) {
      bottomHolder.innerHTML = `
        <div class="bottom-bar">
          <span>${selectedIds.size}件を選択中</span>
          <button class="btn btn-danger" id="delete-selected" style="width:auto;padding:0 16px">${icon("trash", { color: "#fff", size: 16 })}削除</button>
        </div>`;
      bottomHolder.querySelector("#delete-selected").addEventListener("click", async () => {
        const count = selectedIds.size;
        if (!confirm(`${count}件の単語を削除しますか？\n関連する学習カード・履歴もすべて削除されます。この操作は取り消せません。`)) {
          return;
        }
        await deleteWords(Array.from(selectedIds));
        render(container);
      });
    } else {
      bottomHolder.innerHTML = "";
    }
  }

  container.querySelector("#select-toggle").addEventListener("click", () => {
    selectMode = !selectMode;
    selectedIds = new Set();
    draw();
  });

  draw();
}
