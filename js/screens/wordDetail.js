import { getWordWithDetails, updateSenseMeaning, deleteWord } from "../db.js";
import { speak } from "../tts.js";
import { navigate, goBack } from "../router.js";
import { escapeHtml } from "../components.js";
import { icon } from "../icons.js";

export async function render(container, { param }) {
  const wordId = Number(param);
  container.innerHTML = `<div class="scroll top-safe"><div class="empty-text">読み込み中…</div></div>`;

  const word = await getWordWithDetails(wordId);
  if (!word) {
    container.innerHTML = `<div class="scroll top-safe"><div class="empty-text">単語が見つかりません。</div></div>`;
    return;
  }

  function draw() {
    container.innerHTML = `
      <div class="scroll top-safe">
        <div class="word-detail-header">
          <button class="icon-btn" id="back-btn">${icon("chevron-back", { size: 22 })}</button>
          <h1 class="word-detail-headword">${escapeHtml(word.headword)}</h1>
          <button class="icon-btn accent" id="speak-word">${icon("play", { color: "var(--accent)", size: 20 })}</button>
          <div style="flex:1"></div>
          <button class="icon-btn danger" id="delete-word">${icon("trash", { color: "var(--danger)", size: 20 })}</button>
        </div>
        <div class="word-detail-reading">${escapeHtml(word.reading ? `${word.reading} ・ ` : "")}${escapeHtml(word.phonetic ?? "")}</div>

        ${
          word.senses.length === 0
            ? `<div class="empty-text">まだ意味・例文が登録されていません。「追加」タブでエクスポート／インポートしてください。</div>`
            : word.senses
                .map(
                  (sense) => `
                <div class="sense-card" data-sense-id="${sense.id}">
                  <div class="sense-header">
                    <span class="pos-tag">${escapeHtml(sense.pos)}</span>
                    <span class="phonetic-small">${escapeHtml(sense.phonetic ?? "")}</span>
                  </div>
                  <div class="sense-meaning-holder"></div>
                  ${word.examples
                    .filter((e) => e.senseId === sense.id)
                    .map(
                      (e) => `
                    <div class="example-box">
                      <div class="example-row">
                        <button class="icon-btn accent" data-speak="${escapeHtml(e.english)}" style="padding:0">${icon("play", { color: "var(--accent)", size: 14 })}</button>
                        <span class="example-en">${escapeHtml(e.english)}</span>
                      </div>
                      <div class="example-ja">${escapeHtml(e.japanese)}</div>
                    </div>`
                    )
                    .join("")}
                </div>`
                )
                .join("")
        }
      </div>
    `;

    container.querySelector("#back-btn").addEventListener("click", () => goBack());
    container.querySelector("#speak-word").addEventListener("click", () => speak(word.headword));
    container.querySelector("#delete-word").addEventListener("click", async () => {
      if (
        !confirm(
          `「${word.headword}」を削除しますか？\n関連する学習カード・履歴もすべて削除されます。この操作は取り消せません。`
        )
      )
        return;
      await deleteWord(word.id);
      goBack();
    });
    container.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", () => speak(btn.dataset.speak));
    });

    container.querySelectorAll(".sense-card").forEach((card) => {
      const senseId = Number(card.dataset.senseId);
      const sense = word.senses.find((s) => s.id === senseId);
      const holder = card.querySelector(".sense-meaning-holder");
      renderMeaning(holder, sense);
    });
  }

  function renderMeaning(holder, sense) {
    holder.innerHTML = `<div class="meaning-text" id="meaning-display">${
      escapeHtml(sense.meaningJa) || "（タップして入力）"
    }</div>`;
    holder.querySelector("#meaning-display").addEventListener("click", () => {
      holder.innerHTML = `
        <textarea class="edit-input textarea-input" style="min-height:60px">${escapeHtml(sense.meaningJa)}</textarea>
        <button class="btn" style="width:auto;padding:0 16px;height:34px" id="save-meaning">保存</button>
      `;
      const textarea = holder.querySelector("textarea");
      textarea.focus();
      holder.querySelector("#save-meaning").addEventListener("click", async () => {
        sense.meaningJa = textarea.value;
        await updateSenseMeaning(sense.id, textarea.value);
        renderMeaning(holder, sense);
      });
    });
  }

  draw();
}
