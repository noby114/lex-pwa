import { quickAddWord, saveDictionaryResult, getUnprocessedWords, applyGeneratedContent } from "../db.js";
import { lookupWord } from "../dictionaryApi.js";
import { buildExportPrompts, parseImportPayload } from "../importExport.js";
import { logoHtml, escapeHtml } from "../components.js";
import { icon } from "../icons.js";

let tab = "quickAdd";

export async function render(container) {
  container.innerHTML = `
    <div class="scroll top-safe">
      <div class="header-row">${logoHtml()}</div>
      <h1 class="title">単語を登録</h1>

      <div class="tabs-inline" id="tabs">
        <button data-tab="quickAdd">クイック追加</button>
        <button data-tab="export">エクスポート</button>
        <button data-tab="import">インポート</button>
      </div>

      <div id="tab-content"></div>

      <div class="section-label" id="unprocessed-label">未処理（0）</div>
      <div id="unprocessed-list"></div>
    </div>
  `;

  container.querySelectorAll("#tabs button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tab = btn.dataset.tab;
      renderTabContent(container);
      await refreshUnprocessed(container);
    });
  });

  renderTabContent(container);
  await refreshUnprocessed(container);
}

function renderTabContent(container) {
  container.querySelectorAll("#tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  const holder = container.querySelector("#tab-content");

  if (tab === "quickAdd") {
    holder.innerHTML = `
      <div class="input-row">
        <input class="text-input" id="quick-input" placeholder="単語をタイプ" autocapitalize="off" autocorrect="off" />
        <button class="btn" style="width:64px" id="quick-add-btn">追加</button>
      </div>
    `;
    const input = holder.querySelector("#quick-input");
    const submit = async () => {
      const headword = input.value.trim();
      if (!headword) return;
      input.value = "";
      const word = await quickAddWord(headword);
      const lookup = await lookupWord(headword);
      if (lookup.found) {
        await saveDictionaryResult(word.id, { phonetic: lookup.phonetic, senses: lookup.senses });
      }
      await refreshUnprocessed(container);
    };
    holder.querySelector("#quick-add-btn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  } else if (tab === "export") {
    holder.innerHTML = `
      <button class="btn" id="export-btn">${icon("copy", { color: "#fff", size: 16 })}<span id="export-label">未処理単語をプロンプト付きでコピー</span></button>
    `;
    holder.querySelector("#export-btn").addEventListener("click", async () => {
      const unprocessed = await getUnprocessedWords();
      if (unprocessed.length === 0) return;
      const prompts = buildExportPrompts(unprocessed);
      await copyToClipboard(prompts[0]);
      alert(
        prompts.length > 1
          ? `${unprocessed.length}語を${prompts.length}バッチに分割しました。まず1バッチ目（最大25語）をコピーしました。Claudeに貼り付けて実行してください。`
          : "コピーしました。Claude（アプリ／claude.ai）に貼り付けて実行してください。"
      );
    });
  } else if (tab === "import") {
    holder.innerHTML = `
      <button class="btn" id="import-btn" style="margin-bottom:12px">インポート</button>
      <div id="import-result" class="result-text"></div>
      <textarea class="textarea-input" id="import-text" placeholder="Claudeが出力したJSONをここに貼り付け" autocapitalize="off" autocorrect="off"></textarea>
    `;
    holder.querySelector("#import-btn").addEventListener("click", async () => {
      const textarea = holder.querySelector("#import-text");
      const result = parseImportPayload(textarea.value);
      const unprocessed = await getUnprocessedWords();
      let appliedCount = 0;
      for (const success of result.successes) {
        const match = unprocessed.find((w) => w.headword.toLowerCase() === success.word.toLowerCase());
        if (!match) {
          result.failures.push({ word: success.word, reason: "対応する未処理単語が見つかりません" });
          continue;
        }
        await applyGeneratedContent(match.id, {
          reading: success.reading,
          senses: success.senses,
          examples: success.examples,
        });
        appliedCount++;
      }
      const resultEl = holder.querySelector("#import-result");
      resultEl.textContent =
        `${appliedCount}語を登録しました。` +
        (result.failures.length > 0
          ? ` ${result.failures.length}語は失敗（${result.failures.map((f) => f.word ?? "不明").join(", ")}）。手動編集してください。`
          : "");
      textarea.value = "";
      await refreshUnprocessed(document.getElementById("screen"));
    });
  }
}

async function refreshUnprocessed(container) {
  const unprocessed = await getUnprocessedWords();
  container.querySelector("#unprocessed-label").textContent = `未処理（${unprocessed.length}）`;
  const listEl = container.querySelector("#unprocessed-list");
  if (unprocessed.length === 0) {
    listEl.innerHTML = `<div class="empty-text">未処理の単語はありません。</div>`;
  } else {
    listEl.innerHTML = unprocessed
      .map(
        (w) => `
        <div class="list row">
          <span>${escapeHtml(w.headword)}</span>
          <span class="row-value">未処理</span>
        </div>`
      )
      .join("");
  }
  // also refresh the export tab's live count if it's showing
  const exportLabel = container.querySelector("#export-label");
  if (exportLabel) {
    exportLabel.textContent = `未処理単語（${unprocessed.length}件）をプロンプト付きでコピー`;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Fallback for browsers/contexts where the async Clipboard API is
    // unavailable (e.g. non-HTTPS): a hidden textarea + execCommand.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      ta.remove();
    }
  }
}
