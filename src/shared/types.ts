export type Team = 'red' | 'blue';
export type Identity = Team | 'neutral' | 'danger';
export type Phase = 'lobby' | 'clue' | 'guessing' | 'gameEnd';

export type PublicPlayer = {
  id: string;
  name: string;
  role: 'host' | 'player';
  team: Team;
  connected: boolean;
};

export type PublicCard = {
  id: string;
  word: string;
  revealed: boolean;
  identity: Identity | null;
};

export type PublicEvent = {
  id: number;
  type: 'system' | 'clue' | 'guess' | 'turn' | 'gameEnd';
  text: string;
  at: number;
};

export type RoomState = {
  phase: Phase;
  round: number;
  hostId: string | null;
  players: PublicPlayer[];
  teams: {
    red: { captainId: string | null; targetCount: number; found: number };
    blue: { captainId: string | null; targetCount: number; found: number };
  };
  board: PublicCard[];
  activeTeam: Team;
  clue: { word: string; count: number } | null;
  guessesUsed: number;
  maxGuesses: number;
  winner: Team | null;
  loser: Team | null;
  endReason: 'targets' | 'danger' | null;
  notice: string | null;
  history: PublicEvent[];
  auditSeed: number | null;
};

export type CaptainMapPayload = {
  round: number;
  identities: Record<string, Identity>;
};
