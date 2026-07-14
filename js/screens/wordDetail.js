import {
  getWordWithDetails,
  updateSenseMeaning,
  updateWordHeadword,
  updateWordReading,
  updateSensePos,
  updateSensePhonetic,
  addSense,
  deleteSense,
  updateExample,
  addExample,
  deleteExample,
  deleteWord,
} from "../db.js";
import { speak } from "../tts.js";
import { navigate, goBack } from "../router.js";
import { escapeHtml } from "../components.js";
import { icon } from "../icons.js";
import { VALID_POS } from "../importExport.js";

export async function render(container, { param }) {
  const wordId = Number(param);
  container.innerHTML = `<div class="scroll top-safe"><div class="empty-text">読み込み中…</div></div>`;

  let word = await getWordWithDetails(wordId);
  if (!word) {
    container.innerHTML = `<div class="scroll top-safe"><div class="empty-text">単語が見つかりません。</div></div>`;
    return;
  }

  async function reload() {
    word = await getWordWithDetails(wordId);
    draw();
  }

  function draw() {
    container.innerHTML = `
      <div class="scroll top-safe">
        <div class="word-detail-header">
          <button class="icon-btn" id="back-btn">${icon("chevron-back", { size: 22 })}</button>
          <h1 class="word-detail-headword" id="headword-display">${escapeHtml(word.headword)}</h1>
          <button class="icon-btn accent" id="speak-word">${icon("play", { color: "var(--accent)", size: 20 })}</button>
          <div style="flex:1"></div>
          <button class="icon-btn danger" id="delete-word">${icon("trash", { color: "var(--danger)", size: 20 })}</button>
        </div>
        <div class="word-detail-reading" id="reading-display">${escapeHtml(word.reading ? `${word.reading} ・ ` : "")}${escapeHtml(word.phonetic ?? "")}${word.reading || word.phonetic ? "" : "（タップして読みを追加）"}</div>

        ${
          word.senses.length === 0
            ? `<div class="empty-text">まだ意味・例文が登録されていません。「追加」タブでエクスポート／インポートしてください。</div>`
            : word.senses
                .map(
                  (sense) => `
                <div class="sense-card" data-sense-id="${sense.id}">
                  <div class="sense-header">
                    <span class="pos-tag" data-edit="pos">${escapeHtml(sense.pos)}</span>
                    <span class="phonetic-small" data-edit="phonetic">${escapeHtml(sense.phonetic ?? "")}${sense.phonetic ? "" : "（発音）"}</span>
                    <div style="flex:1"></div>
                    <button class="icon-btn danger" data-delete-sense="${sense.id}" style="padding:2px">${icon("trash", { color: "var(--danger)", size: 14 })}</button>
                  </div>
                  <div class="sense-meaning-holder"></div>
                  ${word.examples
                    .filter((e) => e.senseId === sense.id)
                    .map(
                      (e) => `
                    <div class="example-box" data-example-id="${e.id}">
                      <div class="example-edit-holder"></div>
                    </div>`
                    )
                    .join("")}
                  <button class="btn-outline" data-add-example="${sense.id}" style="width:100%;height:34px;font-size:12px;margin-top:8px;border-radius:8px;">+ 例文を追加</button>
                </div>`
                )
                .join("")
        }
        <button class="btn-outline" id="add-sense-btn" style="width:100%;margin-top:4px;">+ 品詞・意味を追加</button>
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

    container.querySelector("#headword-display").addEventListener("click", () => {
      const el = container.querySelector("#headword-display");
      el.outerHTML = `<input class="edit-input" id="headword-input" style="font-size:22px;margin-bottom:0" value="${escapeHtml(word.headword)}" />`;
      const input = container.querySelector("#headword-input");
      input.focus();
      input.select();
      const commit = async () => {
        const value = input.value.trim();
        if (!value || value === word.headword) {
          draw();
          return;
        }
        try {
          await updateWordHeadword(word.id, value);
          await reload();
        } catch (err) {
          alert(err.message ?? "更新に失敗しました");
          draw();
        }
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    });

    container.querySelector("#reading-display").addEventListener("click", () => {
      const el = container.querySelector("#reading-display");
      el.outerHTML = `<input class="edit-input" id="reading-input" placeholder="読み（任意）" value="${escapeHtml(word.reading ?? "")}" />`;
      const input = container.querySelector("#reading-input");
      input.focus();
      const commit = async () => {
        await updateWordReading(word.id, input.value);
        await reload();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    });

    container.querySelectorAll(".sense-card").forEach((card) => {
      const senseId = Number(card.dataset.senseId);
      const sense = word.senses.find((s) => s.id === senseId);

      const holder = card.querySelector(".sense-meaning-holder");
      renderMeaning(holder, sense);

      card.querySelector('[data-edit="pos"]').addEventListener("click", (e) => {
        const span = e.currentTarget;
        span.outerHTML = `<select class="pos-select" id="pos-select-${senseId}">${VALID_POS.map(
          (p) => `<option value="${p}" ${p === sense.pos ? "selected" : ""}>${p}</option>`
        ).join("")}</select>`;
        const select = card.querySelector(`#pos-select-${senseId}`);
        select.focus();
        select.addEventListener("change", async () => {
          await updateSensePos(senseId, select.value);
          await reload();
        });
        select.addEventListener("blur", () => draw());
      });

      card.querySelector('[data-edit="phonetic"]').addEventListener("click", (e) => {
        const span = e.currentTarget;
        span.outerHTML = `<input class="phonetic-input" id="phonetic-input-${senseId}" placeholder="/例: rɪˈkɔːrd/" value="${escapeHtml(sense.phonetic ?? "")}" />`;
        const input = card.querySelector(`#phonetic-input-${senseId}`);
        input.focus();
        const commit = async () => {
          await updateSensePhonetic(senseId, input.value);
          await reload();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") input.blur();
        });
      });

      card.querySelector(`[data-delete-sense="${senseId}"]`).addEventListener("click", async () => {
        if (!confirm("この品詞・意味と、紐づく例文をすべて削除しますか？")) return;
        await deleteSense(senseId);
        await reload();
      });

      word.examples
        .filter((e) => e.senseId === senseId)
        .forEach((example) => {
          const box = card.querySelector(`.example-box[data-example-id="${example.id}"] .example-edit-holder`);
          renderExample(box, example);
        });

      card.querySelector(`[data-add-example="${senseId}"]`).addEventListener("click", () => {
        const box = document.createElement("div");
        box.className = "example-box";
        card.insertBefore(box, card.querySelector(`[data-add-example="${senseId}"]`));
        const holder2 = document.createElement("div");
        box.appendChild(holder2);
        renderExampleEditForm(holder2, { english: "", japanese: "" }, async (english, japanese) => {
          if (!english.trim() || !japanese.trim()) {
            box.remove();
            return;
          }
          await addExample(word.id, senseId, { english, japanese });
          await reload();
        });
      });
    });

    container.querySelector("#add-sense-btn").addEventListener("click", () => {
      renderNewSenseForm();
    });
  }

  function renderNewSenseForm() {
    const scroll = container.querySelector(".scroll");
    const wrapper = document.createElement("div");
    wrapper.className = "sense-card";
    wrapper.innerHTML = `
      <select class="pos-select" id="new-sense-pos">${VALID_POS.map((p) => `<option value="${p}">${p}</option>`).join("")}</select>
      <textarea class="edit-input textarea-input" id="new-sense-meaning" style="min-height:50px;margin-top:8px" placeholder="日本語の意味"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" style="height:36px" id="new-sense-save">追加</button>
        <button class="btn-outline" style="height:36px" id="new-sense-cancel">キャンセル</button>
      </div>
    `;
    const addBtn = container.querySelector("#add-sense-btn");
    scroll.insertBefore(wrapper, addBtn);
    wrapper.querySelector("#new-sense-cancel").addEventListener("click", () => wrapper.remove());
    wrapper.querySelector("#new-sense-save").addEventListener("click", async () => {
      const pos = wrapper.querySelector("#new-sense-pos").value;
      const meaningJa = wrapper.querySelector("#new-sense-meaning").value.trim();
      if (!meaningJa) return;
      await addSense(word.id, { pos, meaningJa });
      await reload();
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

  function renderExample(holder, example) {
    holder.innerHTML = `
      <div class="example-row">
        <button class="icon-btn accent" data-speak style="padding:0">${icon("play", { color: "var(--accent)", size: 14 })}</button>
        <span class="example-en" id="example-en-${example.id}">${escapeHtml(example.english)}</span>
        <button class="icon-btn danger" id="delete-example-${example.id}" style="padding:2px">${icon("trash", { color: "var(--danger)", size: 12 })}</button>
      </div>
      <div class="example-ja" id="example-ja-${example.id}">${escapeHtml(example.japanese)}</div>
    `;
    holder.querySelector("[data-speak]").addEventListener("click", () => speak(example.english));
    holder.querySelector(`#delete-example-${example.id}`).addEventListener("click", async () => {
      if (!confirm("この例文を削除しますか？")) return;
      await deleteExample(example.id);
      await reload();
    });
    const startEdit = () => {
      renderExampleEditForm(holder, example, async (english, japanese) => {
        example.english = english;
        example.japanese = japanese;
        await updateExample(example.id, { english, japanese });
        renderExample(holder, example);
      });
    };
    holder.querySelector(`#example-en-${example.id}`).addEventListener("click", startEdit);
    holder.querySelector(`#example-ja-${example.id}`).addEventListener("click", startEdit);
  }

  function renderExampleEditForm(holder, example, onSave) {
    holder.innerHTML = `
      <textarea class="edit-input textarea-input" id="edit-en" style="min-height:40px" placeholder="英語の例文">${escapeHtml(example.english)}</textarea>
      <textarea class="edit-input textarea-input" id="edit-ja" style="min-height:40px" placeholder="日本語訳">${escapeHtml(example.japanese)}</textarea>
      <button class="btn" style="width:auto;padding:0 16px;height:34px" id="save-example">保存</button>
    `;
    holder.querySelector("#edit-en").focus();
    holder.querySelector("#save-example").addEventListener("click", async () => {
      const english = holder.querySelector("#edit-en").value.trim();
      const japanese = holder.querySelector("#edit-ja").value.trim();
      await onSave(english, japanese);
    });
  }

  draw();
}
