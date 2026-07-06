// Shared helpers for live quiz sessions

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Arrange questions in the session's frozen play order. Sessions created
 * before question_order existed have an empty order and keep the given
 * (sort-order) sequence.
 */
export function orderByQuestionOrder<T extends { id: string }>(
  items: T[],
  questionOrder: string[] | null | undefined
): T[] {
  if (!questionOrder || questionOrder.length === 0) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = questionOrder.map((id) => byId.get(id)).filter((q): q is T => Boolean(q));
  // Questions added to the exam after session creation play at the end
  const inOrder = new Set(questionOrder);
  return [...ordered, ...items.filter((item) => !inOrder.has(item.id))];
}

/** Small deterministic string hash (FNV-1a). */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically shuffle answer options per student: the same student
 * always sees the same order for a question, but different students see
 * different orders.
 */
export function shuffleOptionsForStudent<T extends { id: string }>(
  options: T[],
  studentId: string,
  questionId: string
): T[] {
  return [...options].sort(
    (a, b) =>
      hashString(`${studentId}:${questionId}:${a.id}`) -
      hashString(`${studentId}:${questionId}:${b.id}`)
  );
}
