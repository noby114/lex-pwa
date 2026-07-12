// Free, keyless dictionary lookup -- ported 1:1 from src/services/dictionaryApi.ts.
// Called directly from the browser; the API allows CORS from any origin.

const POS_MAP = {
  noun: "名詞",
  verb: "動詞",
  adjective: "形容詞",
  adverb: "副詞",
  preposition: "前置詞",
  conjunction: "接続詞",
  idiom: "熟語",
};

function mapPos(raw) {
  return POS_MAP[raw.toLowerCase()] ?? "その他";
}

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";

export async function lookupWord(headword) {
  try {
    const response = await fetch(API_BASE + encodeURIComponent(headword.trim()));
    if (!response.ok) return { found: false, senses: [] };
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return { found: false, senses: [] };

    const entry = data[0];
    const phonetic =
      entry.phonetic ?? entry.phonetics?.find((p) => !!p.text)?.text ?? undefined;

    const seen = new Set();
    const senses = [];
    for (const d of data) {
      for (const meaning of d.meanings ?? []) {
        const pos = mapPos(meaning.partOfSpeech);
        if (!seen.has(pos)) {
          seen.add(pos);
          senses.push({ pos });
        }
      }
    }

    return { found: true, phonetic, senses };
  } catch (err) {
    return { found: false, senses: [] };
  }
}
