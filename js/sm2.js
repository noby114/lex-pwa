// SM-2 spaced repetition scheduling. Ported 1:1 from the Expo version's
// src/services/sm2.ts (see that file's comments for the grade->quality
// mapping rationale).

const GRADE_QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };
const MIN_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toIsoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function reviewCard(card, grade, now = new Date()) {
  const quality = GRADE_QUALITY[grade];
  let { intervalDays, easeFactor, repetitions, lapses } = card;

  if (quality < 3) {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;

  const dueDate = toIsoDateOnly(addDays(now, intervalDays));

  return {
    intervalDays,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    lapses,
    dueDate,
  };
}

export function newCardDefaults() {
  return {
    intervalDays: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    lapses: 0,
    dueDate: toIsoDateOnly(new Date()),
  };
}
