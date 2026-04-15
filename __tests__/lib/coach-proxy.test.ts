/**
 * Tests for coach proxy pure utilities extracted from Coach.tsx.
 * Verifies response parsing, URL resolution, and edge-case handling.
 */

import { extractProxyResponseText, resolveProxyUrlFromCandidates } from '@/lib/coach-proxy';

describe('extractProxyResponseText', () => {
  it('returns empty string for empty input', () => {
    expect(extractProxyResponseText('')).toBe('');
    expect(extractProxyResponseText('   ')).toBe('');
  });

  it('returns trimmed raw string for non-JSON text', () => {
    expect(extractProxyResponseText('hello world')).toBe('hello world');
  });

  it('parses a JSON string value', () => {
    const input = JSON.stringify('parsed response');
    expect(extractProxyResponseText(input)).toBe('parsed response');
  });

  it('extracts from response field', () => {
    const input = JSON.stringify({ response: 'from response key' });
    expect(extractProxyResponseText(input)).toBe('from response key');
  });

  it('stringifies object responses for operation-contract payloads', () => {
    const payload = { version: 1, operations: [{ id: 'op_1', type: 'modify_weight' }] };
    const input = JSON.stringify({ response: payload });

    expect(extractProxyResponseText(input)).toBe(JSON.stringify(payload));
  });

  it('extracts from content field', () => {
    const input = JSON.stringify({ content: 'from content key' });
    expect(extractProxyResponseText(input)).toBe('from content key');
  });

  it('extracts from output field', () => {
    const input = JSON.stringify({ output: 'from output key' });
    expect(extractProxyResponseText(input)).toBe('from output key');
  });

  it('extracts from text field', () => {
    const input = JSON.stringify({ text: 'from text key' });
    expect(extractProxyResponseText(input)).toBe('from text key');
  });

  it('extracts from message.content field', () => {
    const input = JSON.stringify({ message: { content: 'from message.content' } });
    expect(extractProxyResponseText(input)).toBe('from message.content');
  });

  it('extracts from choices[0].text field', () => {
    const input = JSON.stringify({ choices: [{ text: 'from choice text' }] });
    expect(extractProxyResponseText(input)).toBe('from choice text');
  });

  it('extracts from choices[0].message.content field', () => {
    const input = JSON.stringify({ choices: [{ message: { content: 'from choice message' } }] });
    expect(extractProxyResponseText(input)).toBe('from choice message');
  });

  it('falls back to trimmed body for unrecognized JSON shapes', () => {
    const input = JSON.stringify({ unknown: 'field' });
    expect(extractProxyResponseText(input)).toBe(input.trim());
  });

  it('handles non-string JSON values in known fields gracefully', () => {
    const input = JSON.stringify({ response: 42 });
    expect(extractProxyResponseText(input)).toBe(input.trim());
  });

  it('handles null JSON gracefully', () => {
    expect(extractProxyResponseText(JSON.stringify(null))).toBe('null');
  });

  it('handles numeric JSON gracefully', () => {
    expect(extractProxyResponseText(JSON.stringify(123))).toBe('123');
  });

  it('prioritizes response over content field', () => {
    const input = JSON.stringify({ response: 'winner', content: 'loser' });
    expect(extractProxyResponseText(input)).toBe('winner');
  });

  it('prioritizes content over choices when both present', () => {
    const input = JSON.stringify({ content: 'from content', choices: [{ text: 'from choices' }] });
    expect(extractProxyResponseText(input)).toBe('from content');
  });
});

describe('resolveProxyUrlFromCandidates', () => {
  it('returns empty string when no candidates are provided', () => {
    expect(resolveProxyUrlFromCandidates([])).toBe('');
  });

  it('returns first valid string candidate', () => {
    const candidates = [undefined, '  https://example.com/proxy  ', null, 'https://fallback.com'];
    expect(resolveProxyUrlFromCandidates(candidates)).toBe('https://example.com/proxy');
  });

  it('skips non-string candidates', () => {
    const candidates = [null, undefined, 42, true, 'https://valid.com'];
    expect(resolveProxyUrlFromCandidates(candidates)).toBe('https://valid.com');
  });

  it('skips empty or whitespace-only strings', () => {
    const candidates = ['', '   ', 'https://valid.com'];
    expect(resolveProxyUrlFromCandidates(candidates)).toBe('https://valid.com');
  });

  it('returns empty string when all candidates are invalid', () => {
    const candidates = [null, undefined, '', '   ', 42];
    expect(resolveProxyUrlFromCandidates(candidates)).toBe('');
  });

  it('trims whitespace from valid URLs', () => {
    const candidates = ['  https://coach.example.com/api  '];
    expect(resolveProxyUrlFromCandidates(candidates)).toBe('https://coach.example.com/api');
  });
});
