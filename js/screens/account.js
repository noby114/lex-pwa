import {
  bulkQuickAddWords,
  getUnprocessedWords,
  getWordsNeedingDictionaryLookup,
  saveDictionaryResult,
  deleteAllWords,
  getDailyReviewLimit,
  setDailyReviewLimit,
} from "../db.js";
import { lookupWord } from "../dictionaryApi.js";
import { downloadBackup, restoreBackupFromFile } from "../backup.js";
import { logoHtml, escapeHtml } from "../components.js";
import { icon } from "../icons.js";
import { listEnglishVoices, getPreferredVoiceURICached, setPreferredVoice, speak } from "../tts.js";

const FETCH_CONCURRENCY = 8;
const REVIEW_LIMIT_OPTIONS = [20, 40, 60, 100, 9999];

function formatLimit(n) {
  return n >= 9999 ? "無制限" : `${n}件`;
}

let presetWordsCache = null;
async function getPresetWords() {
  if (!presetWordsCache) {
    const res = await fetch("data/toeicPresetWords.json");
    presetWordsCache = await res.json();
  }
  return presetWordsCache;
}

export async function render(container) {
  const reviewLimit = await getDailyReviewLimit();
  const presetWords = await getPresetWords();

  container.innerHTML = `
    <div class="scroll top-safe">
      ${logoHtml()}
      <h1 class="title">アカウント</h1>

      <div class="notice-box">
        <div class="notice-text">
          このアプリのデータはすべてこの端末（このブラウザ）の中だけに保存されます。パソコンなどの別端末とは同期されません。
        </div>
      </div>

      <div class="section-label">学習設定</div>
      <div class="card">
        <div style="font-size:13px;color:var(--text-primary);margin-bottom:10px">1日の復習件数の上限</div>
        <div class="chip-row" id="limit-row">
          ${REVIEW_LIMIT_OPTIONS.map(
            (limit) =>
              `<button class="chip ${limit === reviewLimit ? "active" : ""}" data-limit="${limit}">${formatLimit(limit)}</button>`
          ).join("")}
        </div>
      </div>

      <div class="list">
        <button class="row" id="load-preset-btn">
          <span class="row-left">${icon("download", { color: "var(--text-secondary)", size: 18 })}<span id="preset-label">TOEIC頻出単語プリセットを読み込む（${presetWords.length}語）</span></span>
          ${icon("chevron-forward", { color: "var(--text-muted)", size: 16 })}
        </button>
      </div>

      <div class="section-label">読み上げ音声</div>
      <div class="notice-box">
        <div class="notice-text">
          読み上げにはiPhone本体の音声合成機能を使っています。iPhoneの「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」から英語の音声を高品質（Enhanced／Premium）でダウンロードすると、ここで選べるようになり、例文の読み上げの質が上がります。
        </div>
      </div>
      <div class="card" id="voice-card">
        <div style="font-size:13px;color:var(--text-primary);margin-bottom:10px" id="voice-loading">音声一覧を読み込み中…</div>
      </div>

      <div class="section-label">バックアップ</div>
      <div class="notice-box">
        <div class="notice-text">
          スマホのブラウザに保存されたデータは、しばらくアプリを開かないと消えてしまう場合があります（iOSの仕様）。時々バックアップを保存しておくことをおすすめします。
        </div>
      </div>
      <div class="list">
        <button class="row" id="backup-btn">
          <span class="row-left">${icon("upload", { color: "var(--text-secondary)", size: 18 })}バックアップをファイルに保存</span>
        </button>
        <button class="row" id="restore-btn">
          <span class="row-left">${icon("download", { color: "var(--text-secondary)", size: 18 })}ファイルから復元</span>
        </button>
        <input type="file" id="restore-file" accept="application/json" style="display:none" />
        <div class="row">
          <span class="row-left">${icon("info", { color: "var(--text-secondary)", size: 18 })}バージョン</span>
          <span class="row-value">0.1.0 (PWA)</span>
        </div>
      </div>

      <div class="section-label">危険な操作</div>
      <div class="list">
        <button class="row" id="reset-all-btn">
          <span class="row-left" style="color:var(--danger)">${icon("trash", { color: "var(--danger)", size: 18 })}すべての単語を削除</span>
        </button>
      </div>
    </div>
  `;

  renderVoicePicker(container);

  container.querySelectorAll("#limit-row .chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      const limit = Number(chip.dataset.limit);
      await setDailyReviewLimit(limit);
      container.querySelectorAll("#limit-row .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  container.querySelector("#load-preset-btn").addEventListener("click", () => handleLoadPreset(container));
  container.querySelector("#backup-btn").addEventListener("click", () => downloadBackup());
  container.querySelector("#restore-btn").addEventListener("click", () => {
    container.querySelector("#restore-file").click();
  });
  container.querySelector("#restore-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("復元すると、現在このアプリに保存されているデータはすべて上書きされます。よろしいですか？")) {
      e.target.value = "";
      return;
    }
    try {
      await restoreBackupFromFile(file);
      alert("復元しました。");
      location.reload();
    } catch (err) {
      alert("復元に失敗しました。ファイルが壊れているか、対応していない形式です。");
    }
    e.target.value = "";
  });
  container.querySelector("#reset-all-btn").addEventListener("click", async () => {
    if (
      !confirm(
        "すべての単語を削除しますか？\n登録済みの単語・意味・例文・学習履歴がすべて削除されます。この操作は取り消せません。"
      )
    )
      return;
    await deleteAllWords();
    alert("削除しました。");
  });
}

async function renderVoicePicker(container) {
  const card = container.querySelector("#voice-card");
  if (!card) return;
  card.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">音声一覧を読み込み中…</div>`;
  const voices = await listEnglishVoices();
  // The container may have been re-rendered (user navigated away and the
  // screen was torn down) while we were waiting on voices -- bail if so.
  if (!container.isConnected || !container.querySelector("#voice-card")) return;

  if (voices.length === 0) {
    // iOS Safari (especially running as a home-screen PWA) sometimes just
    // never reports any voices on a given page load -- there's no reliable
    // fix from the web-app side, so offer a manual retry rather than leaving
    // a dead end.
    card.innerHTML = `
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">音声一覧を読み込めませんでした。少し待ってから再試行してみてください。</div>
      <button class="btn-outline" id="voice-retry-btn" style="width:100%">再試行</button>
    `;
    card.querySelector("#voice-retry-btn").addEventListener("click", () => renderVoicePicker(container));
    return;
  }

  const current = getPreferredVoiceURICached();
  card.innerHTML = `
    <div style="font-size:13px;color:var(--text-primary);margin-bottom:10px">読み上げに使う声</div>
    <div class="input-row" style="margin-bottom:0">
      <select class="text-input" id="voice-select">
        ${voices
          .map(
            (v) =>
              `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === current ? "selected" : ""}>${escapeHtml(v.name)}${v.localService ? "" : "（オンライン）"}</option>`
          )
          .join("")}
      </select>
      <button class="btn" style="width:64px" id="voice-test-btn">${icon("play", { color: "#fff", size: 16 })}</button>
    </div>
  `;

  card.querySelector("#voice-select").addEventListener("change", async (e) => {
    await setPreferredVoice(e.target.value);
    speak("This is what this voice sounds like.");
  });
  card.querySelector("#voice-test-btn").addEventListener("click", () => {
    speak("This is what this voice sounds like.");
  });
}

async function runDictionaryLookups(onProgress) {
  const targets = await getWordsNeedingDictionaryLookup();
  if (targets.length === 0) return;
  onProgress(0, targets.length);

  let fetchCursor = 0;
  let savedCount = 0;
  const pending = [];
  let fetchesDone = false;

  async function fetchWorker() {
    while (fetchCursor < targets.length) {
      const word = targets[fetchCursor];
      fetchCursor++;
      const lookup = await lookupWord(word.headword);
      if (lookup.found) {
        pending.push({ id: word.id, phonetic: lookup.phonetic, senses: lookup.senses });
      }
    }
  }

  async function saveWorker() {
    while (!fetchesDone || pending.length > 0) {
      const next = pending.shift();
      if (!next) {
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      await saveDictionaryResult(next.id, { phonetic: next.phonetic, senses: next.senses });
      savedCount++;
      if (savedCount % 10 === 0 || savedCount === targets.length) {
        onProgress(savedCount, targets.length);
      }
    }
  }

  const fetchPromise = Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => fetchWorker())).then(() => {
    fetchesDone = true;
  });
  await Promise.all([fetchPromise, saveWorker()]);
}

async function handleLoadPreset(container) {
  const btn = container.querySelector("#load-preset-btn");
  const label = container.querySelector("#preset-label");
  const presetWords = await getPresetWords();
  btn.disabled = true;
  try {
    label.textContent = "読み込み中…";
    await bulkQuickAddWords(presetWords);
    await runDictionaryLookups((done, total) => {
      label.textContent = `辞書情報を取得中… (${done}/${total})`;
    });
    const unprocessed = await getUnprocessedWords();
    alert(
      `${presetWords.length}語を追加し、読み／発音記号／品詞を取得しました。「追加」タブのエクスポート／インポートで意味・例文を生成してください。未処理: ${unprocessed.length}語`
    );
  } finally {
    btn.disabled = false;
    label.textContent = `TOEIC頻出単語プリセットを読み込む（${presetWords.length}語）`;
  }
}
