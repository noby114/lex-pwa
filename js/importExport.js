// Claude export/import flow -- ported 1:1 from src/services/importExport.ts.
// See that file's original comments: POS hints from the dictionary API are
// a *minimum* set of senses, not a hard cap (the free dictionary API misses
// valid POS sometimes, e.g. "following" as preposition/conjunction), and
// katakana readings are intentionally not requested.

const BATCH_SIZE = 25;

export function buildExportPrompts(words) {
  const batches = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    batches.push(words.slice(i, i + BATCH_SIZE));
  }
  return batches.map((batch) => buildSinglePrompt(batch));
}

function buildSinglePrompt(words) {
  const wordList = words
    .map((w) => {
      const posHint =
        w.senses.length > 0 ? ` (品詞: ${w.senses.map((s) => s.pos).join("/")})` : "";
      return `- ${w.headword}${posHint}`;
    })
    .join("\n");

  return `英単語アプリ用のデータを生成してください。以下の単語それぞれについて、次のJSON形式の配列「のみ」を出力してください。説明文やコードブロック記法（\`\`\`）は付けないでください。

出力フォーマット:
[
  {
    "word": "見出し語",
    "senses": [
      { "pos": "品詞（名詞/動詞/形容詞/副詞/前置詞/接続詞/熟語/その他のいずれか）", "meaningJa": "日本語の意味", "phonetic": "任意。品詞で発音が変わる場合のみIPA表記" }
    ],
    "examples": [
      { "senseIndex": 0, "english": "例文（英語）", "japanese": "例文の日本語訳" }
    ]
  }
]

ルール:
- 各Senseにつき例文を2〜3個生成してください（品詞が複数あるSenseの多い単語は、その分だけ例文数も増えます）。
- 単語の後に「(品詞: ...)」と書かれている場合、そこに書かれた品詞は必ずSenseとして含めてください。ただし辞書データが不完全なことがあるため、その単語が実際には他の品詞でも一般的に使われる場合は、あなたの知識でSenseを追加してください（例: following は形容詞だけでなく前置詞・接続詞としても頻繁に使われるので、追加してください）。品詞の指定がない単語は、あなたが適切な品詞を判断してSenseを作ってください。
- close のように品詞によって意味が大きく異なる単語は、品詞ごとに例文がその意味を表すようにし、examplesのsenseIndexで対応するsenseを指定してください。
- カタカナ読みは不要です（発音記号と音声で代替するため）。出力に含めないでください。

対象単語:
${wordList}`;
}

export const VALID_POS = ["名詞", "動詞", "形容詞", "副詞", "前置詞", "接続詞", "熟語", "その他"];

export function parseImportPayload(raw) {
  const jsonText = extractJsonArray(raw);
  const failures = [];

  if (!jsonText) {
    return { successes: [], failures: [{ reason: "JSON配列が見つかりませんでした" }] };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { successes: [], failures: [{ reason: "JSONの解析に失敗しました" }] };
  }

  if (!Array.isArray(parsed)) {
    return { successes: [], failures: [{ reason: "配列形式ではありません" }] };
  }

  const successes = [];
  for (const item of parsed) {
    const result = validateItem(item);
    if ("error" in result) {
      failures.push({
        word: typeof item?.word === "string" ? item.word : undefined,
        reason: result.error,
      });
    } else {
      successes.push(result.value);
    }
  }

  return { successes, failures };
}

function extractJsonArray(raw) {
  const withoutFence = raw.replace(/```json|```/gi, "");
  const start = withoutFence.indexOf("[");
  const end = withoutFence.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  return withoutFence.slice(start, end + 1);
}

function validateItem(item) {
  if (typeof item !== "object" || item === null) {
    return { error: "不正な形式の項目です" };
  }
  if (typeof item.word !== "string" || item.word.trim() === "") {
    return { error: "word が欠けています" };
  }
  if (!Array.isArray(item.senses) || item.senses.length === 0) {
    return { error: "senses が欠けています" };
  }

  const senses = [];
  for (const s of item.senses) {
    if (typeof s !== "object" || s === null || typeof s.pos !== "string" || typeof s.meaningJa !== "string") {
      return { error: "senses の形式が不正です" };
    }
    const pos = VALID_POS.includes(s.pos) ? s.pos : "その他";
    senses.push({
      pos,
      meaningJa: s.meaningJa,
      phonetic: typeof s.phonetic === "string" ? s.phonetic : undefined,
    });
  }

  const examples = [];
  if (Array.isArray(item.examples)) {
    for (const e of item.examples) {
      if (typeof e === "object" && e !== null && typeof e.english === "string" && typeof e.japanese === "string") {
        examples.push({
          senseIndex: typeof e.senseIndex === "number" ? e.senseIndex : 0,
          english: e.english,
          japanese: e.japanese,
        });
      }
    }
  }

  return {
    value: {
      word: item.word,
      reading: typeof item.reading === "string" ? item.reading : undefined,
      senses,
      examples,
    },
  };
}
