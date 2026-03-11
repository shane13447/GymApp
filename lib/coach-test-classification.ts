export interface CoachTestClassificationInput {
  hasWarnings: boolean;
  semanticPassed: boolean;
  deterministicIntentPassed: boolean;
}

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
