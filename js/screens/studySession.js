import { getTodaysQueue, recordReview, getWordWithDetails, getDailyReviewLimit } from "../db.js";
import { speak } from "../tts.js";
import { navigate, goBack } from "../router.js";
import { escapeHtml } from "../components.js";
import { icon } from "../icons.js";

const TYPE_LABEL = { en_to_ja: "英→日", ja_to_en: "日→英", cloze: "穴埋め" };

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function render(container) {
  container.innerHTML = `<div class="study-screen"><div class="empty-text">読み込み中…</div></div>`;

  const limit = await getDailyReviewLimit();
  const queue = await getTodaysQueue(limit);
  const wordCache = new Map();
  const introWordIds = new Set();
  const cardItems = [];
  const introItems = [];

  for (const { card, isNew } of queue) {
    let word = wordCache.get(card.wordId);
    if (!word) {
      word = await getWordWithDetails(card.wordId);
      if (!word) continue;
      wordCache.set(card.wordId, word);
    }
    if (isNew && !introWordIds.has(word.id)) {
      introWordIds.add(word.id);
      introItems.push({ kind: "intro", word });
    }
    cardItems.push({ kind: "card", card, word });
  }

  const items = [...introItems, ...shuffle(cardItems)];
  let index = 0;
  let revealed = false;

  function goNext() {
    revealed = false;
    index++;
    draw();
  }

  async function handleGrade(grade) {
    const current = items[index];
    if (!current || current.kind !== "card") return;
    await recordReview(current.card.id, grade);
    goNext();
  }

  function draw() {
    if (index >= items.length) {
      container.innerHTML = `
        <div class="done-screen">
          ${icon("check-circle", { color: "var(--success)", size: 48 })}
          <div class="done-title">今日の学習おつかれさまでした</div>
          <button class="btn" id="done-back" style="width:auto;padding:0 24px">ホームに戻る</button>
        </div>
      `;
      container.querySelector("#done-back").addEventListener("click", () => navigate("home"));
      return;
    }

    const current = items[index];

    if (current.kind === "intro") {
      const word = current.word;
      container.innerHTML = `
        <div class="study-screen">
          <div class="study-top-row">
            <button class="icon-btn" id="close-btn">${icon("close", { size: 22 })}</button>
            <div class="study-progress">${index + 1} / ${items.length}</div>
            <div class="study-badge">新規学習</div>
          </div>
          <div class="study-center">
            <h2 class="study-headword">${escapeHtml(word.headword)}</h2>
            <div class="study-phonetic">${escapeHtml(word.reading ? `${word.reading} ・ ` : "")}${escapeHtml(word.phonetic ?? "")}</div>
            ${word.senses
              .map((sense) => {
                const example = word.examples.find((e) => e.senseId === sense.id);
                return `
                <div class="study-intro-sense">
                  <div class="study-intro-pos">${escapeHtml(sense.pos)}</div>
                  <div class="study-intro-meaning">${escapeHtml(sense.meaningJa)}</div>
                  ${
                    example
                      ? `<div class="study-intro-example-row">
                          <button class="icon-btn accent" data-speak="${escapeHtml(example.english)}" style="padding:0">${icon("play", { color: "var(--accent)", size: 14 })}</button>
                          <div>
                            <div class="study-intro-example">${escapeHtml(example.english)}</div>
                            <div class="study-intro-example-ja">${escapeHtml(example.japanese)}</div>
                          </div>
                        </div>`
                      : ""
                  }
                </div>`;
              })
              .join("")}
          </div>
          <button class="btn" id="speak-headword">発音を聞く</button>
          <button class="btn" id="next-btn" style="margin-top:8px">次へ</button>
        </div>
      `;
      container.querySelector("#close-btn").addEventListener("click", () => goBack());
      container.querySelector("#speak-headword").addEventListener("click", () => speak(word.headword));
      container.querySelector("#next-btn").addEventListener("click", goNext);
      container.querySelectorAll("[data-speak]").forEach((btn) => btn.addEventListener("click", () => speak(btn.dataset.speak)));
      return;
    }

    // card
    const { card, word } = current;
    const representativeSense = word.senses[0];

    container.innerHTML = `
      <div class="study-screen">
        <div class="study-top-row">
          <button class="icon-btn" id="close-btn">${icon("close", { size: 22 })}</button>
          <div class="study-progress">${index + 1} / ${items.length}</div>
          <div class="study-badge">${TYPE_LABEL[card.cardType]}</div>
        </div>
        <div class="study-center" id="card-body"></div>
        <div id="grade-holder"></div>
      </div>
    `;
    container.querySelector("#close-btn").addEventListener("click", () => goBack());

    const cardBody = container.querySelector("#card-body");
    if (card.cardType === "en_to_ja") {
      cardBody.innerHTML = enToJaHtml(word, representativeSense, revealed);
    } else if (card.cardType === "ja_to_en") {
      cardBody.innerHTML = jaToEnHtml(word, representativeSense, revealed);
    } else {
      cardBody.innerHTML = clozeHtml(word, card, revealed);
    }
    wireSpeakButtons(cardBody);

    if (!revealed) {
      const revealBtn = document.createElement("button");
      revealBtn.className = "study-reveal";
      revealBtn.innerHTML = `${icon("chevron-down", { color: "var(--text-muted)", size: 18 })}<span class="study-reveal-hint">タップして答えを表示</span>`;
      revealBtn.addEventListener("click", () => {
        revealed = true;
        draw();
      });
      cardBody.appendChild(revealBtn);
    }

    const gradeHolder = container.querySelector("#grade-holder");
    if (revealed) {
      gradeHolder.innerHTML = `
        <div class="grade-row">
          <button class="grade-btn grade-again" data-grade="again">もう一度</button>
          <button class="grade-btn grade-hard" data-grade="hard">難しい</button>
          <button class="grade-btn grade-good" data-grade="good">普通</button>
          <button class="grade-btn grade-easy" data-grade="easy">簡単</button>
        </div>
      `;
      gradeHolder.querySelectorAll("[data-grade]").forEach((btn) => {
        btn.addEventListener("click", () => handleGrade(btn.dataset.grade));
      });
    } else {
      gradeHolder.innerHTML = "";
    }
  }

  function wireSpeakButtons(root) {
    root.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", () => speak(btn.dataset.speak));
    });
  }

  draw();
}

function enToJaHtml(word, sense, revealed) {
  const example = word.examples.find((e) => e.senseId === sense?.id) ?? word.examples[0];
  return `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div class="word-detail-header" style="justify-content:center;margin-bottom:6px">
        <span class="study-headword">${escapeHtml(word.headword)}</span>
        <button class="icon-btn accent" data-speak="${escapeHtml(word.headword)}">${icon("play", { color: "var(--accent)", size: 18 })}</button>
      </div>
      <div class="study-phonetic">${escapeHtml(sense?.phonetic ?? word.phonetic ?? "")} ${sense ? `・ ${escapeHtml(sense.pos)}` : ""}</div>
      ${
        revealed && sense
          ? `<div class="study-answer-block">
              <div class="study-meaning-prompt" style="margin-bottom:14px;font-weight:500;font-size:17px">${escapeHtml(sense.meaningJa)}</div>
              ${
                example
                  ? `<div class="study-example-box">
                      <div class="study-example-row">
                        <button class="icon-btn accent" data-speak="${escapeHtml(example.english)}" style="padding:0">${icon("play", { color: "var(--accent)", size: 14 })}</button>
                        <span class="study-example-en">${escapeHtml(example.english)}</span>
                      </div>
                      <div class="study-example-ja">${escapeHtml(example.japanese)}</div>
                    </div>`
                  : ""
              }
            </div>`
          : ""
      }
    </div>
  `;
}

function jaToEnHtml(word, sense, revealed) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div class="study-meaning-prompt">${escapeHtml(sense?.meaningJa ?? "")}</div>
      ${
        revealed
          ? `<div class="word-detail-header" style="justify-content:center">
              <span class="study-headword">${escapeHtml(word.headword)}</span>
              <button class="icon-btn accent" data-speak="${escapeHtml(word.headword)}">${icon("play", { color: "var(--accent)", size: 18 })}</button>
            </div>`
          : ""
      }
    </div>
  `;
}

function clozeHtml(word, card, revealed) {
  const examples = word.examples;
  if (examples.length === 0) {
    return `<div class="study-meaning-prompt">（例文が未登録です）</div>`;
  }
  const example = examples[card.nextExampleIndex % examples.length];
  const sense = word.senses.find((s) => s.id === example.senseId);
  const re = new RegExp(escapeRegExp(word.headword), "i");
  const blanked = example.english.replace(re, "＿＿＿＿");

  if (!revealed) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div class="study-cloze">${escapeHtml(blanked)}</div>
        <div class="study-hint">ヒント：${escapeHtml(sense?.meaningJa ?? "")}</div>
      </div>
    `;
  }

  const parts = example.english.split(new RegExp(`(${escapeRegExp(word.headword)})`, "i"));
  const highlighted = parts
    .map((part) =>
      part.toLowerCase() === word.headword.toLowerCase()
        ? `<span style="color:var(--accent);font-weight:500">${escapeHtml(part)}</span>`
        : escapeHtml(part)
    )
    .join("");

  return `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div class="word-detail-header" style="justify-content:center">
        <button class="icon-btn accent" data-speak="${escapeHtml(example.english)}" style="padding:0">${icon("play", { color: "var(--accent)", size: 16 })}</button>
        <span class="study-cloze">${highlighted}</span>
      </div>
      <div class="study-example-ja" style="margin-top:8px">${escapeHtml(example.japanese)}</div>
    </div>
  `;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
