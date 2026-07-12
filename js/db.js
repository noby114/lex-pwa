// IndexedDB data layer for the lex PWA.
// Mirrors the SQLite schema/behavior from the Expo version 1:1 so the rest
// of the app (SM-2 scheduling, export/import, screens) can stay the same
// shape. IndexedDB has no foreign keys, so cascading deletes (word -> sense
// -> example, card -> reviewLog) are done manually here.

const DB_NAME = "lexdb";
const DB_VERSION = 1;
const DAILY_REVIEW_LIMIT_KEY = "dailyReviewLimit";
export const DEFAULT_DAILY_REVIEW_LIMIT = 40;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("word")) {
        const w = db.createObjectStore("word", { keyPath: "id", autoIncrement: true });
        w.createIndex("headword", "headword", { unique: true });
        w.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("sense")) {
        const s = db.createObjectStore("sense", { keyPath: "id", autoIncrement: true });
        s.createIndex("wordId", "wordId");
      }
      if (!db.objectStoreNames.contains("example")) {
        const e = db.createObjectStore("example", { keyPath: "id", autoIncrement: true });
        e.createIndex("wordId", "wordId");
        e.createIndex("senseId", "senseId");
      }
      if (!db.objectStoreNames.contains("card")) {
        const c = db.createObjectStore("card", { keyPath: "id", autoIncrement: true });
        c.createIndex("wordId", "wordId");
        c.createIndex("dueDate", "dueDate");
      }
      if (!db.objectStoreNames.contains("reviewLog")) {
        const r = db.createObjectStore("reviewLog", { keyPath: "id", autoIncrement: true });
        r.createIndex("cardId", "cardId");
        r.createIndex("reviewedAt", "reviewedAt");
      }
      if (!db.objectStoreNames.contains("setting")) {
        db.createObjectStore("setting", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqp(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    Promise.resolve(fn(t))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        try {
          t.abort();
        } catch (_) {}
        reject(err);
      });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("transaction aborted"));
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// word / sense / example
// ---------------------------------------------------------------------------

async function toWord(t, row) {
  const senseStore = t.objectStore("sense");
  const exampleStore = t.objectStore("example");
  const senses = await reqp(senseStore.index("wordId").getAll(row.id));
  senses.sort((a, b) => a.sortOrder - b.sortOrder);
  const examples = await reqp(exampleStore.index("wordId").getAll(row.id));
  return { ...row, senses, examples };
}

export async function quickAddWord(headword) {
  const trimmed = headword.trim();
  return tx(["word"], "readwrite", async (t) => {
    const store = t.objectStore("word");
    const existing = await reqp(store.index("headword").get(trimmed));
    if (existing) return existing;
    const id = await reqp(
      store.add({
        headword: trimmed,
        reading: null,
        phonetic: null,
        createdAt: new Date().toISOString(),
        dictionaryFetched: false,
        contentFilled: false,
      })
    );
    return { ...(await reqp(store.get(id))) };
  });
}

export async function bulkQuickAddWords(headwords) {
  await tx(["word"], "readwrite", async (t) => {
    const store = t.objectStore("word");
    const idx = store.index("headword");
    const now = new Date().toISOString();
    for (const raw of headwords) {
      const headword = raw.trim();
      if (!headword) continue;
      const existing = await reqp(idx.get(headword));
      if (existing) continue;
      store.add({
        headword,
        reading: null,
        phonetic: null,
        createdAt: now,
        dictionaryFetched: false,
        contentFilled: false,
      });
    }
  });
}

async function deleteWordCascade(t, wordId) {
  const senseStore = t.objectStore("sense");
  const exampleStore = t.objectStore("example");
  const cardStore = t.objectStore("card");
  const reviewLogStore = t.objectStore("reviewLog");
  const wordStore = t.objectStore("word");

  const senses = await reqp(senseStore.index("wordId").getAll(wordId));
  for (const s of senses) senseStore.delete(s.id);

  const examples = await reqp(exampleStore.index("wordId").getAll(wordId));
  for (const e of examples) exampleStore.delete(e.id);

  const cards = await reqp(cardStore.index("wordId").getAll(wordId));
  for (const c of cards) {
    const logs = await reqp(reviewLogStore.index("cardId").getAll(c.id));
    for (const l of logs) reviewLogStore.delete(l.id);
    cardStore.delete(c.id);
  }

  wordStore.delete(wordId);
}

export async function deleteWord(wordId) {
  await tx(["word", "sense", "example", "card", "reviewLog"], "readwrite", (t) =>
    deleteWordCascade(t, wordId)
  );
}

export async function deleteWords(wordIds) {
  if (wordIds.length === 0) return;
  await tx(["word", "sense", "example", "card", "reviewLog"], "readwrite", async (t) => {
    for (const id of wordIds) await deleteWordCascade(t, id);
  });
}

export async function deleteAllWords() {
  await tx(["word", "sense", "example", "card", "reviewLog"], "readwrite", async (t) => {
    const ids = await reqp(t.objectStore("word").getAllKeys());
    for (const id of ids) await deleteWordCascade(t, id);
  });
}

export async function saveDictionaryResult(wordId, data) {
  await tx(["word", "sense"], "readwrite", async (t) => {
    const wordStore = t.objectStore("word");
    const word = await reqp(wordStore.get(wordId));
    if (!word) return;
    word.phonetic = data.phonetic ?? null;
    word.dictionaryFetched = true;
    wordStore.put(word);

    const senseStore = t.objectStore("sense");
    data.senses.forEach((s, i) => {
      senseStore.add({
        wordId,
        pos: s.pos,
        meaningJa: "",
        phonetic: s.phonetic ?? null,
        sortOrder: i,
      });
    });
  });
}

export async function applyGeneratedContent(wordId, data) {
  await tx(["word", "sense", "example"], "readwrite", async (t) => {
    const wordStore = t.objectStore("word");
    const senseStore = t.objectStore("sense");
    const exampleStore = t.objectStore("example");

    const word = await reqp(wordStore.get(wordId));
    if (!word) return;
    if (data.reading) word.reading = data.reading;

    const existingSenses = (await reqp(senseStore.index("wordId").getAll(wordId))).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    let senseIds = [];
    if (existingSenses.length > 0) {
      for (let i = 0; i < existingSenses.length; i++) {
        const generated = data.senses[i];
        if (generated) {
          existingSenses[i].meaningJa = generated.meaningJa;
          senseStore.put(existingSenses[i]);
        }
        senseIds.push(existingSenses[i].id);
      }
    } else {
      for (let i = 0; i < data.senses.length; i++) {
        const s = data.senses[i];
        const id = await reqp(
          senseStore.add({
            wordId,
            pos: s.pos,
            meaningJa: s.meaningJa,
            phonetic: s.phonetic ?? null,
            sortOrder: i,
          })
        );
        senseIds.push(id);
      }
    }

    for (const ex of data.examples) {
      const senseId = senseIds[ex.senseIndex] ?? senseIds[0];
      if (!senseId) continue;
      exampleStore.add({
        wordId,
        senseId,
        english: ex.english,
        japanese: ex.japanese,
      });
    }

    word.contentFilled = true;
    wordStore.put(word);
  });

  await createDefaultCardsForWord(wordId);
}

export async function getUnprocessedWords() {
  return tx(["word", "sense", "example"], "readonly", async (t) => {
    const rows = (await reqp(t.objectStore("word").getAll())).filter((w) => !w.contentFilled);
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const words = [];
    for (const row of rows) words.push(await toWord(t, row));
    return words;
  });
}

export async function getWordsNeedingDictionaryLookup() {
  return tx(["word"], "readonly", async (t) => {
    const rows = (await reqp(t.objectStore("word").getAll())).filter((w) => !w.dictionaryFetched);
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows.map((r) => ({ ...r, senses: [], examples: [] }));
  });
}

export async function getWordWithDetails(wordId) {
  return tx(["word", "sense", "example"], "readonly", async (t) => {
    const row = await reqp(t.objectStore("word").get(wordId));
    if (!row) return null;
    return toWord(t, row);
  });
}

export async function listAllWords() {
  return tx(["word", "sense", "example"], "readonly", async (t) => {
    const rows = await reqp(t.objectStore("word").getAll());
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const words = [];
    for (const row of rows) words.push(await toWord(t, row));
    return words;
  });
}

export async function countWords() {
  return tx(["word"], "readonly", (t) => reqp(t.objectStore("word").count()));
}

export async function updateSenseMeaning(senseId, meaningJa) {
  await tx(["sense"], "readwrite", async (t) => {
    const store = t.objectStore("sense");
    const sense = await reqp(store.get(senseId));
    if (!sense) return;
    sense.meaningJa = meaningJa;
    store.put(sense);
  });
}

// ---------------------------------------------------------------------------
// card / SM-2 scheduling
// ---------------------------------------------------------------------------

import { newCardDefaults, reviewCard } from "./sm2.js";

const CARD_TYPES = ["en_to_ja", "ja_to_en", "cloze"];

export async function createDefaultCardsForWord(wordId) {
  await tx(["card"], "readwrite", async (t) => {
    const store = t.objectStore("card");
    const existing = await reqp(store.index("wordId").getAll(wordId));
    const existingTypes = new Set(existing.map((c) => c.cardType));
    const defaults = newCardDefaults();
    for (const cardType of CARD_TYPES) {
      if (existingTypes.has(cardType)) continue;
      store.add({
        wordId,
        cardType,
        nextExampleIndex: 0,
        dueDate: defaults.dueDate,
        intervalDays: defaults.intervalDays,
        easeFactor: defaults.easeFactor,
        repetitions: defaults.repetitions,
        lapses: defaults.lapses,
        lastReviewedAt: null,
      });
    }
  });
}

export async function getTodaysQueue(limit = 40) {
  return tx(["card"], "readonly", async (t) => {
    const all = await reqp(t.objectStore("card").getAll());
    const today = todayIso();
    const due = all
      .filter((c) => c.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, limit);
    return due.map((card) => ({ card, isNew: card.repetitions === 0 }));
  });
}

export async function recordReview(cardId, grade) {
  return tx(["card", "reviewLog"], "readwrite", async (t) => {
    const cardStore = t.objectStore("card");
    const row = await reqp(cardStore.get(cardId));
    if (!row) throw new Error("カードが見つかりません");

    const result = reviewCard(
      {
        intervalDays: row.intervalDays,
        easeFactor: row.easeFactor,
        repetitions: row.repetitions,
        lapses: row.lapses,
      },
      grade
    );

    const nowIso = new Date().toISOString();
    const intervalBefore = row.intervalDays;

    row.dueDate = result.dueDate;
    row.intervalDays = result.intervalDays;
    row.easeFactor = result.easeFactor;
    row.repetitions = result.repetitions;
    row.lapses = result.lapses;
    row.lastReviewedAt = nowIso;
    row.nextExampleIndex = row.nextExampleIndex + 1;
    cardStore.put(row);

    t.objectStore("reviewLog").add({
      cardId,
      reviewedAt: nowIso,
      grade,
      intervalBefore,
      intervalAfter: result.intervalDays,
    });

    return { ...row };
  });
}

function masteryTierForCard(card) {
  if (card.repetitions === 0) return "new";
  if (card.intervalDays < 7) return "learning";
  if (card.intervalDays < 21) return "reviewing";
  return "mastered";
}

export async function getMasteryBreakdown() {
  return tx(["card"], "readonly", async (t) => {
    const all = await reqp(t.objectStore("card").getAll());
    const rows = all.filter((c) => c.cardType === "en_to_ja");
    const breakdown = { new: 0, learning: 0, reviewing: 0, mastered: 0 };
    for (const row of rows) breakdown[masteryTierForCard(row)]++;
    return breakdown;
  });
}

export async function getMasteryTierByWord() {
  return tx(["card"], "readonly", async (t) => {
    const all = await reqp(t.objectStore("card").getAll());
    const rows = all.filter((c) => c.cardType === "en_to_ja");
    const map = {};
    for (const row of rows) map[row.wordId] = masteryTierForCard(row);
    return map;
  });
}

export async function getOverallStats() {
  return tx(["reviewLog"], "readonly", async (t) => {
    const all = await reqp(t.objectStore("reviewLog").getAll());
    const totalReviews = all.length;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = all.filter((r) => new Date(r.reviewedAt).getTime() >= cutoff);
    const passed = recent.filter((r) => r.grade !== "again").length;
    return {
      totalReviews,
      accuracy7d: recent.length > 0 ? passed / recent.length : 0,
    };
  });
}

export async function getTodaysReviewCount() {
  return tx(["card", "reviewLog"], "readonly", async (t) => {
    const today = todayIso();
    const cards = await reqp(t.objectStore("card").getAll());
    const due = cards.filter((c) => c.dueDate <= today).length;
    const logs = await reqp(t.objectStore("reviewLog").getAll());
    const done = logs.filter((l) => l.reviewedAt.slice(0, 10) === today).length;
    return { due, done };
  });
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export async function getDailyReviewLimit() {
  return tx(["setting"], "readonly", async (t) => {
    const row = await reqp(t.objectStore("setting").get(DAILY_REVIEW_LIMIT_KEY));
    if (!row) return DEFAULT_DAILY_REVIEW_LIMIT;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_REVIEW_LIMIT;
  });
}

export async function setDailyReviewLimit(limit) {
  await tx(["setting"], "readwrite", async (t) => {
    t.objectStore("setting").put({ key: DAILY_REVIEW_LIMIT_KEY, value: String(limit) });
  });
}

// ---------------------------------------------------------------------------
// full data export / import (backup) -- see js/backup.js for the UI wiring.
// Exists mainly to protect against iOS Safari's storage-eviction behavior
// for home-screen web apps that go unused for a while.
// ---------------------------------------------------------------------------

export async function exportAllData() {
  return tx(["word", "sense", "example", "card", "reviewLog", "setting"], "readonly", async (t) => {
    const dump = {};
    for (const name of ["word", "sense", "example", "card", "reviewLog", "setting"]) {
      dump[name] = await reqp(t.objectStore(name).getAll());
    }
    return { version: 1, exportedAt: new Date().toISOString(), stores: dump };
  });
}

export async function importAllData(payload) {
  if (!payload || typeof payload !== "object" || !payload.stores) {
    throw new Error("不正なバックアップファイルです");
  }
  await tx(["word", "sense", "example", "card", "reviewLog", "setting"], "readwrite", async (t) => {
    for (const name of ["word", "sense", "example", "card", "reviewLog", "setting"]) {
      const store = t.objectStore(name);
      await reqp(store.clear());
      const rows = payload.stores[name] ?? [];
      for (const row of rows) store.put(row);
    }
  });
}
