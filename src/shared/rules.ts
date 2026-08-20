import type { Identity, Team } from './types';

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

export function validateClue(wordValue: unknown, countValue: unknown, unrevealedWords: string[]): string | null {
  if (typeof wordValue !== 'string') return '提示词不能为空';
  const word = wordValue.trim();
  if (!word) return '提示词不能为空';
  if (word.length > 12) return '提示词最多 12 个字符';
  if (/\s/u.test(word)) return '提示词必须是单个 token';
  if (/^\d+$/u.test(word)) return '提示词不能是纯数字';
  if (!Number.isInteger(countValue) || Number(countValue) < 1 || Number(countValue) > 9) {
    return '提示数量必须为 1 到 9';
  }
  const normalized = word.toLocaleLowerCase();
  if (unrevealedWords.some((candidate) => candidate.trim().toLocaleLowerCase() === normalized)) {
    return '提示词不能与尚未揭示的桌面词相同';
  }
  return null;
}

export function resolutionForGuess(activeTeam: Team, identity: Identity) {
  if (identity === 'danger') {
    return { continueTurn: false, winner: otherTeam(activeTeam), loser: activeTeam, reason: 'danger' as const };
  }
  if (identity === 'neutral') {
    return { continueTurn: false, winner: null, loser: null, reason: null };
  }
  if (identity !== activeTeam) {
    return { continueTurn: false, winner: null, loser: null, reason: null };
  }
  return { continueTurn: true, winner: null, loser: null, reason: null };
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next]!, result[index]!];
  }
  return result;
}
