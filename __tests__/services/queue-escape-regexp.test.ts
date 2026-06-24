import { escapeRegExp } from '@/services/queue/analysis';

/**
 * Regression coverage for the shared regex-escape helper used to embed
 * dynamic keyword/alias strings inside `\b...\b` matchers.
 *
 * A previously-divergent inline escape used a malformed character class
 * (`[.*+?^${}()|[\\]\\]`) that closed early and therefore did NOT escape `]`
 * or `\`. This locks in that every metacharacter is escaped so the produced
 * RegExp matches the literal string rather than acting as a pattern.
 */
describe('services/queue/analysis escapeRegExp', () => {
  it('escapes every standard regex metacharacter, including ] and \\', () => {
    const metachars = '.*+?^${}()|[]\\';
    const escaped = escapeRegExp(metachars);

    // A regex built from the escaped string must match the literal metachars,
    // and only that literal string.
    const re = new RegExp(`^${escaped}$`);
    expect(re.test(metachars)).toBe(true);
  });

  it('treats metacharacters as literals (no pattern behavior leaks through)', () => {
    // "a." escaped should NOT match "ab" (the "." must be literal).
    const re = new RegExp(`\\b${escapeRegExp('a.')}`, 'i');
    expect(re.test('ab')).toBe(false);
    expect(re.test('a.')).toBe(true);
  });

  it('escapes brackets and backslashes that the old buggy class missed', () => {
    expect(escapeRegExp(']')).toBe('\\]');
    expect(escapeRegExp('\\')).toBe('\\\\');
    expect(escapeRegExp('a[b]c')).toBe('a\\[b\\]c');
  });

  it('leaves plain alphanumeric input unchanged', () => {
    expect(escapeRegExp('chest')).toBe('chest');
    expect(escapeRegExp('upper body')).toBe('upper body');
  });
});
