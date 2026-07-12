// Text-to-speech via the browser's built-in Web Speech API
// (speechSynthesis). No API key, no network dependency, works offline once
// the OS voice is installed. On iOS Safari this only works when triggered
// directly from a user tap (e.g. a click handler) -- calling it from a
// background timer/promise chain without a user gesture will silently fail.

let voicesReady = false;
let cachedVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    voices[0]
  );
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesReady = true;
    cachedVoice = pickVoice();
  };
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
