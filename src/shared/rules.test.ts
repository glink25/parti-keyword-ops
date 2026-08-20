import { describe, expect, it } from 'vitest';
import { mulberry32, resolutionForGuess, shuffled, validateClue } from './rules';

describe('clue validation', () => {
  it('allows count=1 and rejects board duplicates / invalid tokens', () => {
    expect(validateClue('星河', 1, ['灯塔', '轨道'])).toBeNull();
    expect(validateClue('灯塔', 1, ['灯塔', '轨道'])).toMatch(/桌面词/);
    expect(validateClue('two words', 2, [])).toMatch(/token/);
    expect(validateClue('123', 2, [])).toMatch(/纯数字/);
  });
});

describe('guess resolution', () => {
  it('danger immediately awards the other team', () => {
    expect(resolutionForGuess('red', 'danger')).toEqual({ continueTurn: false, winner: 'blue', loser: 'red', reason: 'danger' });
  });
  it('own target continues while neutral/opponent stop', () => {
    expect(resolutionForGuess('red', 'red').continueTurn).toBe(true);
    expect(resolutionForGuess('red', 'blue').continueTurn).toBe(false);
    expect(resolutionForGuess('red', 'neutral').continueTurn).toBe(false);
  });
});

describe('seeded shuffle', () => {
  it('is reproducible for audit', () => {
    const a = shuffled([1, 2, 3, 4, 5], mulberry32(42));
    const b = shuffled([1, 2, 3, 4, 5], mulberry32(42));
    expect(a).toEqual(b);
  });
});
