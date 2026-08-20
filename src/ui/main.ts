import './style.css';
import type { CaptainMapPayload, Identity, RoomState, Team } from '../shared/types';

declare const parti: {
  playerId: string | null;
  getState(): unknown;
  onState(handler: (state: unknown) => void): () => void;
  onEvent(event: string, handler: (payload: unknown) => void): () => void;
  action(action: string, payload?: unknown): Promise<{ ok: true }>;
  ready(): void;
  leave(): void;
  exposeToAgent?: (describe: (state: unknown) => unknown) => void;
};

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: RoomState | null = null;
let captainMap: Record<string, Identity> | null = null;
let captainMapRound = 0;
let toastTimer = 0;

app.innerHTML = `
  <main class="game-shell">
    <section class="topbar">
      <div><div class="eyebrow">PARTI ROOM</div><h1>Keyword Ops</h1></div>
      <div id="turnBadge" class="turn-badge">等待中</div>
    </section>
    <section class="status-row">
      <div id="teamSummary" class="team-summary"></div>
      <div id="notice" class="notice"></div>
    </section>
    <section id="lobby" class="panel lobby hidden"></section>
    <section id="game" class="game hidden">
      <div class="clue-panel"><div id="clueDisplay" class="clue-display"></div><div id="controls" class="controls"></div></div>
      <div id="board" class="board" aria-label="关键词棋盘"></div>
      <aside id="history" class="history"></aside>
    </section>
    <div id="toast" class="toast hidden" role="status"></div>
  </main>`;

const lobbyEl = document.querySelector<HTMLElement>('#lobby')!;
const gameEl = document.querySelector<HTMLElement>('#game')!;
const boardEl = document.querySelector<HTMLElement>('#board')!;
const historyEl = document.querySelector<HTMLElement>('#history')!;
const controlsEl = document.querySelector<HTMLElement>('#controls')!;
const clueDisplayEl = document.querySelector<HTMLElement>('#clueDisplay')!;
const teamSummaryEl = document.querySelector<HTMLElement>('#teamSummary')!;
const noticeEl = document.querySelector<HTMLElement>('#notice')!;
const turnBadgeEl = document.querySelector<HTMLElement>('#turnBadge')!;
const toastEl = document.querySelector<HTMLElement>('#toast')!;

function esc(value: string) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
  return value.replace(/[&<>'"]/g, (char) => map[char] || char);
}
function teamLabel(team: Team) { return team === 'red' ? '红队' : '蓝队'; }
function showToast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), 2200);
}
function myPlayer() {
  if (!state) return null;
  return state.players.find((player) => player.id === parti.playerId) || null;
}
function isCaptain(team?: Team) {
  if (!state || !parti.playerId) return false;
  const me = myPlayer();
  const target = team || (me ? me.team : undefined);
  return !!target && state.teams[target].captainId === parti.playerId;
}

function renderLobby() {
  if (!state) return;
  const current = state;
  lobbyEl.classList.remove('hidden');
  gameEl.classList.add('hidden');
  const me = myPlayer();
  const isHost = current.hostId === parti.playerId;
  const players = current.players.map((player) => {
    const captain = current.teams[player.team].captainId === player.id;
    return `<article class="player-card ${player.team}">
      <div><strong>${esc(player.name)}</strong>${player.id === parti.playerId ? '<span class="you">你</span>' : ''}</div>
      <div class="player-meta">${captain ? '★ Captain' : 'Field Agent'} · ${teamLabel(player.team)}</div>
      ${player.id === parti.playerId ? `<div class="segmented"><button data-action="set-team" data-team="red" ${player.team === 'red' ? 'disabled' : ''}>红队</button><button data-action="set-team" data-team="blue" ${player.team === 'blue' ? 'disabled' : ''}>蓝队</button></div>` : ''}
      ${isHost ? `<button class="small" data-action="make-captain" data-team="${player.team}" data-player="${player.id}" ${captain ? 'disabled' : ''}>设为 ${teamLabel(player.team)} Captain</button>` : ''}
    </article>`;
  }).join('');
  lobbyEl.innerHTML = `<div class="lobby-head"><div><h2>行动编组</h2><p>每队至少 2 人，并指定 1 名 Captain。</p></div>${isHost ? '<button class="primary" data-action="start">开始任务</button>' : '<span class="waiting">等待房主开始</span>'}</div><div class="players-grid">${players || '<p>等待玩家加入…</p>'}</div>${me ? `<p class="hint">你当前属于 <strong>${teamLabel(me.team)}</strong>。</p>` : ''}`;
}
function renderTeamSummary() {
  if (!state) return;
  teamSummaryEl.innerHTML = `<span class="score red"><b>红</b> ${state.teams.red.found}/${state.teams.red.targetCount}</span><span class="score blue"><b>蓝</b> ${state.teams.blue.found}/${state.teams.blue.targetCount}</span>`;
}
function renderBoard() {
  if (!state) return;
  const current = state;
  const me = myPlayer();
  const canGuess = current.phase === 'guessing' && !!me && me.team === current.activeTeam && !isCaptain(current.activeTeam);
  boardEl.innerHTML = current.board.map((card) => {
    const secret = !card.revealed && isCaptain() && captainMapRound === current.round && captainMap ? captainMap[card.id] : null;
    const identity = card.identity || secret;
    const className = identity ? `identity-${identity}` : '';
    const badge = secret && !card.revealed ? '<span class="intel">INTEL</span>' : '';
    return `<button class="word-card ${className} ${card.revealed ? 'revealed' : ''}" data-card="${card.id}" ${!canGuess || card.revealed ? 'disabled' : ''}>${badge}<span>${esc(card.word)}</span></button>`;
  }).join('');
}
function renderControls() {
  if (!state) return;
  const me = myPlayer();
  if (state.phase === 'gameEnd') {
    const won = !!me && me.team === state.winner;
    controlsEl.innerHTML = `<div class="end-card ${won ? 'win' : 'lose'}"><strong>${state.winner ? teamLabel(state.winner) : ''}${won ? ' · 任务成功' : ' · 对局结束'}</strong><span>${state.endReason === 'danger' ? '危险词触发' : '目标全部确认'} · Seed ${state.auditSeed === null ? '—' : state.auditSeed}</span>${state.hostId === parti.playerId ? '<button class="primary" data-action="rematch">再来一局</button>' : ''}</div>`;
    return;
  }
  if (state.phase === 'clue') {
    if (isCaptain(state.activeTeam)) {
      controlsEl.innerHTML = `<form id="clueForm" class="clue-form"><input id="clueWord" maxlength="12" autocomplete="off" placeholder="单个提示词" aria-label="提示词" /><select id="clueCount" aria-label="提示数量">${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select><button class="primary" type="submit">发送提示</button></form>`;
    } else controlsEl.innerHTML = `<div class="waiting">等待 ${teamLabel(state.activeTeam)} Captain 给出提示…</div>`;
    return;
  }
  if (state.phase === 'guessing') {
    if (me && me.team === state.activeTeam && !isCaptain(state.activeTeam)) controlsEl.innerHTML = `<div class="guess-controls"><span>已猜 ${state.guessesUsed}/${state.maxGuesses}</span><button data-action="end-turn" ${state.guessesUsed < 1 ? 'disabled' : ''}>结束回合</button></div>`;
    else controlsEl.innerHTML = `<div class="waiting">${teamLabel(state.activeTeam)}正在行动 · ${state.guessesUsed}/${state.maxGuesses}</div>`;
  }
}
function renderGame() {
  if (!state) return;
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  clueDisplayEl.innerHTML = state.clue ? `<span class="clue-word">${esc(state.clue.word)}</span><span class="clue-count">${state.clue.count}</span>` : '<span class="clue-placeholder">等待提示</span>';
  renderControls();
  renderBoard();
  historyEl.innerHTML = `<h3>行动记录</h3>${state.history.slice().reverse().slice(0, 10).map((entry) => `<div class="history-item">${esc(entry.text)}</div>`).join('')}`;
}
function render(next: RoomState) {
  state = next;
  if (captainMapRound !== next.round) captainMap = null;
  noticeEl.textContent = next.notice || '';
  renderTeamSummary();
  turnBadgeEl.textContent = next.phase === 'lobby' ? '行动编组' : next.phase === 'gameEnd' ? '任务结束' : `${teamLabel(next.activeTeam)} · ${next.phase === 'clue' ? '提示' : '猜词'}`;
  turnBadgeEl.className = `turn-badge ${next.phase !== 'lobby' && next.phase !== 'gameEnd' ? next.activeTeam : ''}`;
  if (next.phase === 'lobby') renderLobby(); else renderGame();
}

app.addEventListener('click', (event) => {
  const origin = event.target as HTMLElement | null;
  const target = origin ? origin.closest<HTMLElement>('[data-action], [data-card]') : null;
  if (!target || !state) return;
  const cardId = target.dataset.card;
  if (cardId) { void parti.action('guessWord', { cardId }); return; }
  switch (target.dataset.action) {
    case 'set-team': void parti.action('lobby:setTeam', { team: target.dataset.team }); break;
    case 'make-captain': void parti.action('lobby:setCaptain', { team: target.dataset.team, playerId: target.dataset.player }); break;
    case 'start': void parti.action('game:start'); break;
    case 'end-turn': void parti.action('endTurn'); break;
    case 'rematch': void parti.action('rematch'); break;
  }
});
app.addEventListener('submit', (event) => {
  const origin = event.target as HTMLElement | null;
  if (!origin || origin.id !== 'clueForm') return;
  event.preventDefault();
  const wordInput = document.querySelector<HTMLInputElement>('#clueWord');
  const countInput = document.querySelector<HTMLSelectElement>('#clueCount');
  const word = (wordInput ? wordInput.value : '').trim();
  const count = Number(countInput ? countInput.value : 1);
  void parti.action('submitClue', { word, count });
});
parti.onEvent('keywordOps:captainMap', (payload) => {
  const data = payload as CaptainMapPayload;
  captainMap = data.identities;
  captainMapRound = data.round;
  if (state) renderBoard();
});
parti.onEvent('keywordOps:error', (payload) => {
  const data = payload as { message?: unknown } | null;
  showToast(String(data && data.message !== undefined ? data.message : '操作无效'));
});
parti.onEvent('keywordOps:gameEnd', () => showToast('任务结束，身份图已公开'));
parti.onState((next) => render(next as RoomState));

if (parti.exposeToAgent) {
  parti.exposeToAgent((raw) => {
    const current = raw as RoomState;
    const me = current.players.find((player) => player.id === parti.playerId) || null;
    return {
      game: 'Keyword Ops：两队根据 Captain 的单词+数字提示猜 5×5 关键词。',
      phase: current.phase,
      yourTeam: me ? me.team : null,
      yourRole: me && current.teams[me.team].captainId === me.id ? 'captain' : 'field-agent',
      activeTeam: current.activeTeam,
      clue: current.clue,
      guessesUsed: current.guessesUsed,
      maxGuesses: current.maxGuesses,
      board: current.board.map((card) => ({ id: card.id, word: card.word, revealed: card.revealed, identity: card.identity })),
      availableActions: current.phase === 'clue' ? ['submitClue'] : current.phase === 'guessing' ? ['guessWord', 'endTurn'] : [],
    };
  });
}

parti.ready();
