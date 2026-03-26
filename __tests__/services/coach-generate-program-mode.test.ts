import { CoachMode } from '@/types';

describe('Coach generate program mode contract', () => {
  it('exposes generate program mode', () => {
    expect(CoachMode.GenerateProgram).toBe('generate_program');
  });
});
