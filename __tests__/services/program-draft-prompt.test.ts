import { buildProgramDraftSystemPrompt } from '@/services/coach/program-draft-prompt';

describe('buildProgramDraftSystemPrompt', () => {
  it('enforces json-only output and no extra keys in system prompt', () => {
    const prompt = buildProgramDraftSystemPrompt();

    expect(prompt).toContain('JSON only');
    expect(prompt).toContain('No markdown, no prose, no extra keys');
    expect(prompt).toContain('Do not include markdown code fences');
  });
});
