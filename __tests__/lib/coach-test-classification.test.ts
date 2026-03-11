import { classifyCoachTestSuccess } from '@/lib/coach-test-classification';

describe('classifyCoachTestSuccess', () => {
  it('fails when deterministic intent fails even if validation and semantic pass', () => {
    const result = classifyCoachTestSuccess({
      hasWarnings: false,
      semanticPassed: true,
      deterministicIntentPassed: false,
    });

    expect(result).toBe(false);
  });

  it('passes when deterministic intent passes and other checks pass', () => {
    const result = classifyCoachTestSuccess({
      hasWarnings: false,
      semanticPassed: true,
      deterministicIntentPassed: true,
    });

    expect(result).toBe(true);
  });

  it('fails when validation has warnings even if semantic and deterministic intent pass', () => {
    const result = classifyCoachTestSuccess({
      hasWarnings: true,
      semanticPassed: true,
      deterministicIntentPassed: true,
    });

    expect(result).toBe(false);
  });
});
