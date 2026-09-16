/**
 * Deterministic scoring helpers for the research prototype.
 * Final rubric weights/keys must follow expert validation before participant use.
 */

export function scoreRubric(responses, rubric) {
  return rubric.reduce((total, item) => {
    const value = Number(responses?.[item.id] ?? 0);
    return total + Math.max(0, Math.min(value, item.max));
  }, 0);
}

export function percentage(score, maximum) {
  if (!maximum) return 0;
  return Math.round((score / maximum) * 100);
}

export function normalizedGain(pre, post, maximum = 100) {
  const denominator = maximum - pre;
  if (denominator <= 0) return 0;
  return (post - pre) / denominator;
}
