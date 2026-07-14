// Text-to-speech via the browser's built-in Web Speech API
// (speechSynthesis) -- this IS the same voice engine as iOS's built-in
// text-to-speech (Settings > Accessibility > Spoken Content), so any voice
// the user has downloaded there (including the higher-quality
// "Enhanced"/"Premium" ones) is already available here; this file just adds
// a way to pick which installed voice to actually use. No API key, no
// network dependency, works offline once the OS voice is installed. On iOS
// Safari this only works when triggered directly from a user tap.

import { getPreferredVoiceURI, setPreferredVoiceURI as persistPreferredVoiceURI } from "./db.js";

let cachedVoice = null;
// In-memory cache of the user's chosen voice URI, loaded once via initTts().
// speak() itself must stay fully synchronous with no awaited work before it
// calls speechSynthesis.speak() -- iOS Safari only allows that call while
// it's still tied to the original tap, and an intervening IndexedDB read
// would silently break it, the same bug we hit with the clipboard copy.
let preferredVoiceURI = null;

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  if (preferredVoiceURI) {
    const preferred = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (preferred) return preferred;
  }
  return (
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    voices[0]
  );
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickVoice();
  };
}

// Call once at app startup (see app.js). Loads the saved voice preference
// into memory so speak() can read it synchronously afterwards.
export async function initTts() {
  try {
    preferredVoiceURI = await getPreferredVoiceURI();
  } catch {
    preferredVoiceURI = null;
  }
  cachedVoice = pickVoice();
}

// For the voice-picker UI in the account screen. speechSynthesis.getVoices()
// is sometimes empty until the async "voiceschanged" event fires (a known
// browser quirk), so this waits for that -- it's only used to populate a
// <select>, not to actually speak, so being async here is fine.
export async function listEnglishVoices() {
  const immediate = window.speechSynthesis.getVoices();
  if (immediate.length > 0) return immediate.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en")));
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1000);
  });
}

export function getPreferredVoiceURICached() {
  return preferredVoiceURI;
}

export async function setPreferredVoice(uri) {
  preferredVoiceURI = uri || null;
  cachedVoice = pickVoice();
  await persistPreferredVoiceURI(preferredVoiceURI);
}

export function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.pitch = 1.0;
  utterance.rate = 1.0;
  if (!cachedVoice) cachedVoice = pickVoice();
  if (cachedVoice) utterance.voice = cachedVoice;
  window.speechSynthesis.speak(utterance);
}
