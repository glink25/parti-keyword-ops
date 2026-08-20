import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const temp = `${process.cwd()}/.worker-test.mjs`;
const source = readFileSync(`${process.cwd()}/dist/room.worker.js`, 'utf8')
  .replace("import { defineRoom } from \"@parti/worker-sdk\";", 'const defineRoom = (definition) => definition;')
  .replace("import { defineRoom } from '@parti/worker-sdk';", 'const defineRoom = (definition) => definition;');
writeFileSync(temp, source);
const room = (await import(`${pathToFileURL(temp).href}?v=${Date.now()}`)).default;

const players = [
  { id: 'p1', name: 'A', role: 'host' },
  { id: 'p2', name: 'B', role: 'player' },
  { id: 'p3', name: 'C', role: 'player' },
  { id: 'p4', name: 'D', role: 'player' },
];
let now = 1000;
const sent = [];
const broadcasts = [];
const ctx = {
  state: room.initialState(), players, host: players[0],
  now: () => ++now,
  random: (() => { let value = 0.123456; return () => (value = (value * 9301 + 49297) % 233280) / 233280; })(),
  send: (playerId, event, payload) => sent.push({ playerId, event, payload }),
  broadcast: (event, payload) => broadcasts.push({ event, payload }),
  log: () => {},
};
for (const player of players) room.onJoin(ctx, player);
assert.equal(ctx.state.players.length, 4);
assert.equal(ctx.state.teams.red.captainId, 'p1');
assert.equal(ctx.state.teams.blue.captainId, 'p2');
room.actions['game:start'](ctx, { player: players[0], payload: null });
assert.equal(ctx.state.board.length, 25);
assert.equal(ctx.state.board.every((card) => card.identity === null), true, 'unrevealed identities must not enter public state');
assert.equal(ctx.state.auditSeed, null, 'seed stays secret before game end');

const active = ctx.state.activeTeam;
const captainId = ctx.state.teams[active].captainId;
const captain = players.find((p) => p.id === captainId);
const agent = players.find((p) => ctx.state.players.find((x) => x.id === p.id)?.team === active && p.id !== captainId);
const intel = sent.find((item) => item.playerId === captainId && item.event === 'keywordOps:captainMap')?.payload;
assert.ok(captain && agent && intel);
const ids = intel.identities;

room.actions.submitClue(ctx, { player: captain, payload: { word: '协同', count: 1 } });
assert.equal(ctx.state.maxGuesses, 2);
const ownCards = ctx.state.board.filter((card) => ids[card.id] === active).slice(0, 2);
assert.equal(ownCards.length, 2);
room.actions.guessWord(ctx, { player: agent, payload: { cardId: ownCards[0].id } });
assert.equal(ctx.state.phase, 'guessing');
assert.equal(ctx.state.guessesUsed, 1);
room.actions.guessWord(ctx, { player: agent, payload: { cardId: ownCards[1].id } });
assert.equal(ctx.state.phase, 'clue', 'second correct guess at count=1 reaches count+1 ceiling and ends turn');

const nextTeam = ctx.state.activeTeam;
const nextCaptainId = ctx.state.teams[nextTeam].captainId;
const nextCaptain = players.find((p) => p.id === nextCaptainId);
const nextAgent = players.find((p) => ctx.state.players.find((x) => x.id === p.id)?.team === nextTeam && p.id !== nextCaptainId);
const nextIntel = sent.findLast((item) => item.playerId === nextCaptainId && item.event === 'keywordOps:captainMap')?.payload ??
  sent.find((item) => item.playerId === nextCaptainId && item.event === 'keywordOps:captainMap')?.payload;
assert.ok(nextCaptain && nextAgent && nextIntel);
room.actions.submitClue(ctx, { player: nextCaptain, payload: { word: '边缘', count: 2 } });
const neutral = ctx.state.board.find((card) => !card.revealed && nextIntel.identities[card.id] === 'neutral');
assert.ok(neutral);
room.actions.guessWord(ctx, { player: nextAgent, payload: { cardId: neutral.id } });
assert.equal(ctx.state.phase, 'clue', 'neutral ends turn immediately');
assert.notEqual(ctx.state.activeTeam, nextTeam);

// Force an opponent-last-target boundary, then reveal one opponent card.
const team = ctx.state.activeTeam;
const capId = ctx.state.teams[team].captainId;
const cap = players.find((p) => p.id === capId);
const ag = players.find((p) => ctx.state.players.find((x) => x.id === p.id)?.team === team && p.id !== capId);
const capIntel = sent.find((item) => item.playerId === capId && item.event === 'keywordOps:captainMap')?.payload;
assert.ok(cap && ag && capIntel);
const opponent = team === 'red' ? 'blue' : 'red';
ctx.state.teams[opponent].found = ctx.state.teams[opponent].targetCount - 1;
room.actions.submitClue(ctx, { player: cap, payload: { word: '终点', count: 3 } });
const oppCard = ctx.state.board.find((card) => !card.revealed && capIntel.identities[card.id] === opponent);
assert.ok(oppCard);
room.actions.guessWord(ctx, { player: ag, payload: { cardId: oppCard.id } });
assert.equal(ctx.state.phase, 'gameEnd');
assert.equal(ctx.state.winner, opponent, 'revealing opponent final target awards opponent immediately');
assert.notEqual(ctx.state.auditSeed, null);
assert.equal(ctx.state.board.every((card) => card.identity !== null), true, 'full map is public only after game end');

room.actions.rematch(ctx, { player: players[0], payload: null });
const dangerTeam = ctx.state.activeTeam;
const dangerCapId = ctx.state.teams[dangerTeam].captainId;
const dangerCap = players.find((p) => p.id === dangerCapId);
const dangerAgent = players.find((p) => ctx.state.players.find((x) => x.id === p.id)?.team === dangerTeam && p.id !== dangerCapId);
const dangerIntel = sent.findLast((item) => item.playerId === dangerCapId && item.event === 'keywordOps:captainMap')?.payload;
assert.ok(dangerCap && dangerAgent && dangerIntel);
room.actions.submitClue(ctx, { player: dangerCap, payload: { word: '警戒', count: 9 } });
const danger = ctx.state.board.find((card) => dangerIntel.identities[card.id] === 'danger');
assert.ok(danger);
room.actions.guessWord(ctx, { player: dangerAgent, payload: { cardId: danger.id } });
assert.equal(ctx.state.phase, 'gameEnd');
assert.equal(ctx.state.loser, dangerTeam);
assert.equal(ctx.state.endReason, 'danger');
assert.equal(broadcasts.at(-1)?.event, 'keywordOps:gameEnd');

rmSync(temp, { force: true });
console.log('worker integration tests passed');
