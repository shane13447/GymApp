export interface CoachTestClassificationInput {
  hasWarnings: boolean;
  semanticPassed: boolean;
  deterministicIntentPassed: boolean;
}

/**
 * Classifies whether a coach test run should be considered a success.
 *
 * A run only passes when there are no warnings and both the semantic and
 * deterministic-intent checks passed.
 *
 * @param {CoachTestClassificationInput} input - Flags from the test run.
 * @returns {boolean} `true` when the run is a success, otherwise `false`.
 */
export const classifyCoachTestSuccess = ({
  hasWarnings,
  semanticPassed,
  deterministicIntentPassed,
}: CoachTestClassificationInput): boolean => {
  if (hasWarnings) {
    return false;
  }

  return semanticPassed && deterministicIntentPassed;
};
