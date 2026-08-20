const app = document.querySelector('#app');
let state = null;
let captainMap = null;
let captainMapRound = 0;
let toastTimer = 0;
let rulesOpen = false;
app.innerHTML = `
  <canvas id="ambientCanvas" class="ambient-canvas" aria-hidden="true"></canvas>
  <div class="world-grid" aria-hidden="true"></div>
  <main class="command-shell">
    <header class="command-header">
      <div class="brand-lockup"><div class="brand-mark"><span></span><span></span><span></span></div><div><div class="eyebrow">PARTI // SIGNAL COMMAND</div><h1>KEYWORD OPS</h1><p class="tagline">双队词语情报对抗协议</p></div></div>
      <div class="header-actions"><button class="ghost-button" data-action="toggle-rules">规则手册</button><div id="turnBadge" class="turn-badge"><span class="status-dot"></span>等待部署</div></div>
    </header>
    <section class="mission-strip"><div id="teamSummary" class="team-summary"></div><div class="mission-message"><span class="mission-label">COMMAND</span><span id="notice">正在建立安全频道…</span></div></section>
    <section id="lobby" class="lobby-view hidden"></section>
    <section id="game" class="battlefield hidden">
      <aside class="left-hud panel-frame"><div class="panel-kicker">MISSION BRIEF</div><div id="missionBrief" class="mission-brief"></div><button class="rules-callout" data-action="toggle-rules"><span>?</span><div><b>第一次执行任务？</b><small>打开规则与身份说明</small></div></button></aside>
      <section class="board-stage panel-frame"><div class="stage-head"><div><div class="panel-kicker">LIVE INTELLIGENCE</div><div id="clueDisplay" class="clue-display"></div></div><div id="controls" class="controls"></div></div><div class="board-wrap"><div id="board" class="board" aria-label="关键词情报棋盘"></div></div></section>
      <aside class="right-hud panel-frame"><div class="panel-kicker">FIELD LOG</div><div id="history" class="history"></div></aside>
    </section>
    <div id="rulesOverlay" class="rules-overlay hidden" aria-hidden="true"><div class="rules-backdrop" data-action="toggle-rules"></div><article class="rules-manual" role="dialog" aria-modal="true" aria-label="Keyword Ops 游戏规则"><header><div><div class="panel-kicker">OPERATION MANUAL</div><h2>游戏规则</h2></div><button class="close-button" data-action="toggle-rules" aria-label="关闭规则">×</button></header><div class="rule-grid">
      <section><span class="rule-index">01</span><h3>任务目标</h3><p>4–10 名玩家分成红蓝两队。率先找出己方全部目标词的一队获胜。</p></section>
      <section><span class="rule-index">02</span><h3>角色分工</h3><p>每队 1 名 Captain，其余为 Field Agents。Captain 能看到全部隐藏身份；队员只能看到已经揭示的身份。</p></section>
      <section><span class="rule-index">03</span><h3>发送提示</h3><p>当前队 Captain 给出一个单独的提示词和 1–9 的数字。提示词不能等于任何尚未揭示的桌面词，也不能是纯数字。</p></section>
      <section><span class="rule-index">04</span><h3>猜测次数</h3><p>队员根据提示点击关键词。最多可猜“提示数字 + 1”次；至少猜过 1 次后可以主动结束回合。</p></section>
      <section><span class="rule-index red-rule">05</span><h3>揭示结果</h3><p><b>己方目标：</b>继续猜。<br><b>中立词：</b>立即结束回合。<br><b>对方目标：</b>为对方计分并结束回合。</p></section>
      <section><span class="rule-index danger-rule">06</span><h3>危险词</h3><p>任何队伍猜中危险词都会立即失败，对手立刻获胜。危险判定优先于其他结算。</p></section>
    </div><footer><span>情报守则：Captain 不要通过语气、动作或额外信息泄露隐藏身份。</span><button class="primary" data-action="toggle-rules">接受任务</button></footer></article></div>
    <div id="toast" class="toast hidden" role="status"></div>
  </main>`;
const lobbyEl = document.querySelector('#lobby');
const gameEl = document.querySelector('#game');
const boardEl = document.querySelector('#board');
const historyEl = document.querySelector('#history');
const controlsEl = document.querySelector('#controls');
const clueDisplayEl = document.querySelector('#clueDisplay');
const teamSummaryEl = document.querySelector('#teamSummary');
const missionBriefEl = document.querySelector('#missionBrief');
const noticeEl = document.querySelector('#notice');
const turnBadgeEl = document.querySelector('#turnBadge');
const rulesOverlayEl = document.querySelector('#rulesOverlay');
const toastEl = document.querySelector('#toast');
function esc(value) { const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }; return value.replace(/[&<>'"]/g, (char) => map[char] || char); }
function teamLabel(team) { return team === 'red' ? '红队' : '蓝队'; }
function phaseLabel(phase) { if (phase === 'lobby') return '部署阶段'; if (phase === 'clue') return '等待提示'; if (phase === 'guessing') return '执行猜测'; return '任务结束'; }
function showToast(message) { toastEl.textContent = message; toastEl.classList.remove('hidden'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), 2200); }
function myPlayer() { if (!state) return null; return state.players.find((player) => player.id === parti.playerId) || null; }
function isCaptain(team) { if (!state || !parti.playerId) return false; const me = myPlayer(); const target = team || (me ? me.team : undefined); return !!target && state.teams[target].captainId === parti.playerId; }
function setRules(open) { rulesOpen = open; rulesOverlayEl.classList.toggle('hidden', !rulesOpen); rulesOverlayEl.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true'); }
function renderTeamSummary() {
  if (!state) return;
  const red = state.teams.red, blue = state.teams.blue;
  const redPct = Math.round((red.found / Math.max(1, red.targetCount)) * 100), bluePct = Math.round((blue.found / Math.max(1, blue.targetCount)) * 100);
  teamSummaryEl.innerHTML = `<div class="team-meter red"><div class="team-meter-head"><span>RED CELL</span><b>${red.found}<i>/</i>${red.targetCount}</b></div><div class="meter-track"><span style="width:${redPct}%"></span></div></div><div class="versus">VS</div><div class="team-meter blue"><div class="team-meter-head"><span>BLUE CELL</span><b>${blue.found}<i>/</i>${blue.targetCount}</b></div><div class="meter-track"><span style="width:${bluePct}%"></span></div></div>`;
}
function agentCard(player, isHost) {
  if (!state) return '';
  const captain = state.teams[player.team].captainId === player.id, self = player.id === parti.playerId;
  return `<article class="agent-card ${player.team} ${captain ? 'captain' : ''}"><div class="agent-sigil">${captain ? '★' : '◆'}</div><div class="agent-info"><strong>${esc(player.name)}</strong><span>${captain ? 'CAPTAIN // 情报指挥' : 'FIELD AGENT // 行动队员'}${self ? ' · YOU' : ''}</span></div><div class="agent-actions">${self ? `<div class="team-switch"><button data-action="set-team" data-team="red" ${player.team === 'red' ? 'disabled' : ''}>RED</button><button data-action="set-team" data-team="blue" ${player.team === 'blue' ? 'disabled' : ''}>BLUE</button></div>` : ''}${isHost ? `<button class="assign-button" data-action="make-captain" data-team="${player.team}" data-player="${player.id}" ${captain ? 'disabled' : ''}>设为 Captain</button>` : ''}</div></article>`;
}
function renderLobby() {
  if (!state) return;
  const current = state, isHost = current.hostId === parti.playerId;
  const redPlayers = current.players.filter((player) => player.team === 'red').map((player) => agentCard(player, isHost)).join('');
  const bluePlayers = current.players.filter((player) => player.team === 'blue').map((player) => agentCard(player, isHost)).join('');
  lobbyEl.classList.remove('hidden'); gameEl.classList.add('hidden');
  lobbyEl.innerHTML = `<div class="lobby-hero panel-frame"><div><div class="panel-kicker">PRE-MISSION DEPLOYMENT</div><h2>部署行动小组</h2><p>两个小组都至少需要 2 名成员，并各指定 1 名 Captain。</p></div><div class="launch-zone">${isHost ? '<button class="launch-button" data-action="start"><span>▶</span><b>开始任务</b><small>INITIATE OPERATION</small></button>' : '<div class="waiting-pulse"><span></span>等待房主授权行动</div>'}</div></div><div class="squad-grid"><section class="squad-panel red panel-frame"><header><span class="squad-code">RED CELL</span><b>${current.players.filter((p) => p.team === 'red').length} AGENTS</b></header><div class="agent-list">${redPlayers || '<div class="empty-slot">等待红队成员加入</div>'}</div></section><section class="squad-panel blue panel-frame"><header><span class="squad-code">BLUE CELL</span><b>${current.players.filter((p) => p.team === 'blue').length} AGENTS</b></header><div class="agent-list">${bluePlayers || '<div class="empty-slot">等待蓝队成员加入</div>'}</div></section></div><div class="lobby-footer panel-frame"><div><span class="footer-icon">◎</span><p><b>核心规则</b><br>Captain 给出“一个词 + 数字”，队员在 25 张情报卡中找出己方目标。</p></div><button class="ghost-button" data-action="toggle-rules">查看完整规则</button></div>`;
}
function renderMissionBrief() {
  if (!state) return;
  const me = myPlayer(), role = me ? (isCaptain(me.team) ? 'CAPTAIN' : 'FIELD AGENT') : 'OBSERVER', clueText = state.clue ? `${esc(state.clue.word)} // ${state.clue.count}` : '等待新的加密提示';
  missionBriefEl.innerHTML = `<div class="brief-block"><span>YOUR CELL</span><strong class="${me ? me.team : ''}">${me ? teamLabel(me.team) : '观察者'}</strong></div><div class="brief-block"><span>ROLE</span><strong>${role}</strong></div><div class="brief-block"><span>ACTIVE CELL</span><strong class="${state.activeTeam}">${teamLabel(state.activeTeam)}</strong></div><div class="brief-block clue-mini"><span>CLUE</span><strong>${clueText}</strong></div>${state.phase === 'guessing' ? `<div class="attempt-meter"><span>猜测额度</span><div><b>${state.guessesUsed}</b><i>/</i>${state.maxGuesses}</div></div>` : ''}`;
}
function renderBoard() {
  if (!state) return;
  const current = state, me = myPlayer(), canGuess = current.phase === 'guessing' && !!me && me.team === current.activeTeam && !isCaptain(current.activeTeam);
  boardEl.innerHTML = current.board.map((card, index) => {
    const secret = !card.revealed && isCaptain() && captainMapRound === current.round && captainMap ? captainMap[card.id] : null;
    const identity = card.identity || secret, identityClass = identity ? `identity-${identity}` : '', intel = secret && !card.revealed ? '<span class="intel-tag">CAPTAIN INTEL</span>' : '', revealed = card.revealed ? '<span class="reveal-mark">CONFIRMED</span>' : '';
    return `<button class="intel-card ${identityClass} ${card.revealed ? 'revealed' : ''}" data-card="${card.id}" ${!canGuess || card.revealed ? 'disabled' : ''} style="--card-index:${index}"><span class="card-corner">${String(index + 1).padStart(2, '0')}</span>${intel}${revealed}<span class="word">${esc(card.word)}</span><span class="card-scan"></span></button>`;
  }).join('');
}
function renderControls() {
  if (!state) return;
  const me = myPlayer();
  if (state.phase === 'gameEnd') { const won = !!me && me.team === state.winner; controlsEl.innerHTML = `<div class="end-state ${won ? 'win' : 'lose'}"><div><span>OPERATION COMPLETE</span><b>${state.winner ? teamLabel(state.winner) : ''}${won ? ' 胜利' : ' 完成任务'}</b><small>${state.endReason === 'danger' ? '危险词触发' : '目标全部确认'} · Seed ${state.auditSeed === null ? '—' : state.auditSeed}</small></div>${state.hostId === parti.playerId ? '<button class="primary" data-action="rematch">重新部署</button>' : ''}</div>`; return; }
  if (state.phase === 'clue') { if (isCaptain(state.activeTeam)) controlsEl.innerHTML = `<form id="clueForm" class="clue-form"><label><span>CLUE WORD</span><input id="clueWord" maxlength="12" autocomplete="off" placeholder="输入单个提示词" aria-label="提示词"></label><label class="count-field"><span>COUNT</span><select id="clueCount" aria-label="提示数量">${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select></label><button class="transmit-button" type="submit"><span>↗</span>发送情报</button></form>`; else controlsEl.innerHTML = `<div class="standby"><span class="signal-bars"><i></i><i></i><i></i></span><div><b>等待加密提示</b><small>${teamLabel(state.activeTeam)} Captain 正在分析情报</small></div></div>`; return; }
  if (state.phase === 'guessing') { if (me && me.team === state.activeTeam && !isCaptain(state.activeTeam)) controlsEl.innerHTML = `<div class="guess-controls"><div><span>ACTIVE WINDOW</span><b>${state.guessesUsed} / ${state.maxGuesses}</b></div><button data-action="end-turn" ${state.guessesUsed < 1 ? 'disabled' : ''}>结束回合</button></div>`; else controlsEl.innerHTML = `<div class="standby"><span class="signal-bars"><i></i><i></i><i></i></span><div><b>${teamLabel(state.activeTeam)}正在执行猜测</b><small>${state.guessesUsed}/${state.maxGuesses} 已使用</small></div></div>`; }
}
function renderGame() {
  if (!state) return;
  lobbyEl.classList.add('hidden'); gameEl.classList.remove('hidden');
  clueDisplayEl.innerHTML = state.clue ? `<span class="clue-label">ACTIVE CLUE</span><strong>${esc(state.clue.word)}</strong><b>${state.clue.count}</b>` : '<span class="clue-label">NO SIGNAL</span><strong class="muted">等待 Captain 提示</strong>';
  renderMissionBrief(); renderControls(); renderBoard();
  historyEl.innerHTML = state.history.length ? state.history.slice().reverse().slice(0, 12).map((entry, index) => `<div class="log-entry"><span>${String(index + 1).padStart(2, '0')}</span><p>${esc(entry.text)}</p></div>`).join('') : '<div class="empty-log">暂无行动记录</div>';
}
function render(next) {
  state = next; if (captainMapRound !== next.round) captainMap = null; noticeEl.textContent = next.notice || ''; renderTeamSummary();
  turnBadgeEl.innerHTML = `<span class="status-dot"></span>${phaseLabel(next.phase)}${next.phase !== 'lobby' && next.phase !== 'gameEnd' ? ` // ${teamLabel(next.activeTeam)}` : ''}`;
  turnBadgeEl.className = `turn-badge ${next.phase !== 'lobby' && next.phase !== 'gameEnd' ? next.activeTeam : ''}`;
  if (next.phase === 'lobby') renderLobby(); else renderGame();
}
app.addEventListener('click', (event) => {
  const origin = event.target, target = origin && origin.closest ? origin.closest('[data-action], [data-card]') : null;
  if (!target) return; if (target.dataset.action === 'toggle-rules') { setRules(!rulesOpen); return; } if (!state) return;
  const cardId = target.dataset.card; if (cardId) { void parti.action('guessWord', { cardId }); return; }
  switch (target.dataset.action) { case 'set-team': void parti.action('lobby:setTeam', { team: target.dataset.team }); break; case 'make-captain': void parti.action('lobby:setCaptain', { team: target.dataset.team, playerId: target.dataset.player }); break; case 'start': void parti.action('game:start'); break; case 'end-turn': void parti.action('endTurn'); break; case 'rematch': void parti.action('rematch'); break; }
});
app.addEventListener('submit', (event) => { const origin = event.target; if (!origin || origin.id !== 'clueForm') return; event.preventDefault(); const wordInput = document.querySelector('#clueWord'), countInput = document.querySelector('#clueCount'); const word = (wordInput ? wordInput.value : '').trim(), count = Number(countInput ? countInput.value : 1); void parti.action('submitClue', { word, count }); });
parti.onEvent('keywordOps:captainMap', (payload) => { captainMap = payload.identities; captainMapRound = payload.round; if (state) renderBoard(); });
parti.onEvent('keywordOps:error', (payload) => showToast(String(payload && payload.message !== undefined ? payload.message : '操作无效')));
parti.onEvent('keywordOps:gameEnd', () => showToast('任务结束，身份图已公开'));
parti.onState((next) => render(next));
if (parti.exposeToAgent) parti.exposeToAgent((current) => { const me = current.players.find((player) => player.id === parti.playerId) || null; return { game: 'Keyword Ops：两队根据 Captain 的单词+数字提示猜 5×5 关键词。', phase: current.phase, yourTeam: me ? me.team : null, yourRole: me && current.teams[me.team].captainId === me.id ? 'captain' : 'field-agent', activeTeam: current.activeTeam, clue: current.clue, guessesUsed: current.guessesUsed, maxGuesses: current.maxGuesses, board: current.board.map((card) => ({ id: card.id, word: card.word, revealed: card.revealed, identity: card.identity })), availableActions: current.phase === 'clue' ? ['submitClue'] : current.phase === 'guessing' ? ['guessWord', 'endTurn'] : [] }; });
function startAmbient() {
  const canvas = document.querySelector('#ambientCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const points = Array.from({ length: 34 }, (_, index) => ({ x: ((index * 73) % 997) / 997, y: ((index * 151) % 991) / 991, speed: .000035 + (index % 5) * .000012, phase: index * .73 }));
  function resize() { const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.floor(innerWidth * ratio); canvas.height = Math.floor(innerHeight * ratio); canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  function draw(time) { ctx.clearRect(0, 0, innerWidth, innerHeight); for (let i = 0; i < points.length; i += 1) { const p = points[i], x = p.x * innerWidth + Math.sin(time * p.speed + p.phase) * 24, y = p.y * innerHeight + Math.cos(time * p.speed * .8 + p.phase) * 18; ctx.fillStyle = i % 3 === 0 ? 'rgba(95,196,255,.28)' : 'rgba(117,255,218,.16)'; ctx.fillRect(x, y, 1.5, 1.5); if (i > 0) { const prev = points[i - 1], px = prev.x * innerWidth + Math.sin(time * prev.speed + prev.phase) * 24, py = prev.y * innerHeight + Math.cos(time * prev.speed * .8 + prev.phase) * 18, d = Math.hypot(x - px, y - py); if (d < 180) { ctx.strokeStyle = `rgba(87,174,214,${.11 * (1 - d / 180)})`; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); } } } if (!reduced) requestAnimationFrame(draw); }
  resize(); window.addEventListener('resize', resize); requestAnimationFrame(draw);
}
startAmbient();
parti.ready();
