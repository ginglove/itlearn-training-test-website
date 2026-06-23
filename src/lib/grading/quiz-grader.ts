// ── Quiz Auto-Grading Engine (RSD Section 7.1) ────────────────────────────────
// Implements partial-credit formula with incorrect-selection penalty

interface GradingInput {
  selectedOptionIds: string[];
  correctOptionIds: string[];
  totalPoints: number;
}

interface GradingResult {
  score: number;
  maxPoints: number;
  correctSelected: number;
  totalCorrect: number;
  hasIncorrectSelection: boolean;
}

/**
 * Grade a quiz question using the partial credit algorithm from the RSD:
 *
 * Score = Points × (Correct Student Options / Total Correct Options)
 *
 * Rules:
 * 1. Partial credit based on fraction of correct options identified
 * 2. If ANY incorrect option is selected → 0 points
 * 3. Must select at least one option to earn points
 */
export function gradeQuizQuestion(input: GradingInput): GradingResult {
  const { selectedOptionIds, correctOptionIds, totalPoints } = input;

  if (selectedOptionIds.length === 0) {
    return {
      score: 0,
      maxPoints: totalPoints,
      correctSelected: 0,
      totalCorrect: correctOptionIds.length,
      hasIncorrectSelection: false,
    };
  }

  const correctSet = new Set(correctOptionIds);

  // Check for any incorrect selections
  const hasIncorrectSelection = selectedOptionIds.some(
    (id) => !correctSet.has(id)
  );

  if (hasIncorrectSelection) {
    return {
      score: 0,
      maxPoints: totalPoints,
      correctSelected: 0,
      totalCorrect: correctOptionIds.length,
      hasIncorrectSelection: true,
    };
  }

  // Count correct selections
  const correctSelected = selectedOptionIds.filter((id) =>
    correctSet.has(id)
  ).length;
  const totalCorrect = correctOptionIds.length;

  // Partial credit formula
  const score =
    totalCorrect > 0
      ? parseFloat((totalPoints * (correctSelected / totalCorrect)).toFixed(2))
      : 0;

  return {
    score,
    maxPoints: totalPoints,
    correctSelected,
    totalCorrect,
    hasIncorrectSelection: false,
  };
}
