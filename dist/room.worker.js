function otherTeam(team) {
    return team === 'red' ? 'blue' : 'red';
}
function validateClue(wordValue, countValue, unrevealedWords) {
    if (typeof wordValue !== 'string')
        return '提示词不能为空';
    const word = wordValue.trim();
    if (!word)
        return '提示词不能为空';
    if (word.length > 12)
        return '提示词最多 12 个字符';
    if (/\s/u.test(word))
        return '提示词必须是单个 token';
    if (/^\d+$/u.test(word))
        return '提示词不能是纯数字';
    if (!Number.isInteger(countValue) || Number(countValue) < 1 || Number(countValue) > 9) {
        return '提示数量必须为 1 到 9';
    }
    const normalized = word.toLocaleLowerCase();
    if (unrevealedWords.some((candidate) => candidate.trim().toLocaleLowerCase() === normalized)) {
        return '提示词不能与尚未揭示的桌面词相同';
    }
    return null;
}
function resolutionForGuess(activeTeam, identity) {
    if (identity === 'danger') {
        return { continueTurn: false, winner: otherTeam(activeTeam), loser: activeTeam, reason: 'danger' };
    }
    if (identity === 'neutral') {
        return { continueTurn: false, winner: null, loser: null, reason: null };
    }
    if (identity !== activeTeam) {
        return { continueTurn: false, winner: null, loser: null, reason: null };
    }
    return { continueTurn: true, winner: null, loser: null, reason: null };
}
function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffled(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const next = Math.floor(random() * (index + 1));
        [result[index], result[next]] = [result[next], result[index]];
    }
    return result;
}

import { defineRoom } from '@parti/worker-sdk';

const WORD_POOL = [
    '灯塔', '轨道', '琥珀', '镜面', '脉冲', '峡谷', '罗盘', '风筝', '墨水', '蜂巢',
    '引擎', '温室', '信标', '铆钉', '雪线', '回声', '砂砾', '桥塔', '珊瑚', '钟摆',
    '云层', '磁针', '藤蔓', '火花', '雨幕', '隧道', '棱镜', '纸鸢', '潮汐', '钥匙',
    '穹顶', '胶片', '哨塔', '航迹', '折页', '烛芯', '水纹', '齿轮', '碎星', '边界',
    '花岗', '暗河', '栈桥', '晶片', '风标', '银杏', '涟漪', '塔影', '织网', '石阶',
    '海盐', '铜环', '晨雾', '邮戳', '麦穗', '弦线', '树冠', '石墨', '砂钟', '雨燕',
];
let secretIdentities = null;
let secretSeed = null;
let eventSeq = 0;
function pushHistory(ctx, type, text) {
    ctx.state.history.push({ id: ++eventSeq, type, text, at: ctx.now() });
    if (ctx.state.history.length > 80)
        ctx.state.history.splice(0, ctx.state.history.length - 80);
}
function activePlayers(ctx) {
    return ctx.players.filter((player) => player.role !== 'spectator');
}
function teamOf(state, playerId) {
    return state.players.find((player) => player.id === playerId)?.team ?? null;
}
function captainOf(state, team) {
    return state.teams[team].captainId;
}
function isHost(ctx, player) {
    return player.id === ctx.host?.id;
}
function syncPlayers(ctx) {
    const prior = new Map(ctx.state.players.map((player) => [player.id, player]));
    const current = activePlayers(ctx);
    const next = current.map((player, index) => {
        const existing = prior.get(player.id);
        return {
            id: player.id,
            name: player.name,
            role: player.role === 'host' ? 'host' : 'player',
            team: existing?.team ?? (index % 2 === 0 ? 'red' : 'blue'),
            connected: true,
        };
    });
    ctx.state.players = next;
    ctx.state.hostId = ctx.host?.id ?? null;
    for (const team of ['red', 'blue']) {
        const members = next.filter((player) => player.team === team);
        if (!members.some((player) => player.id === ctx.state.teams[team].captainId)) {
            ctx.state.teams[team].captainId = members[0]?.id ?? null;
        }
    }
}
function sendCaptainMap(ctx, playerId) {
    if (!secretIdentities || ctx.state.phase === 'lobby')
        return;
    const team = teamOf(ctx.state, playerId);
    if (!team || captainOf(ctx.state, team) !== playerId)
        return;
    const payload = { round: ctx.state.round, identities: secretIdentities };
    ctx.send(playerId, 'keywordOps:captainMap', payload);
}
function revealCard(ctx, cardId, identity) {
    const card = ctx.state.board.find((item) => item.id === cardId);
    if (!card || card.revealed)
        return false;
    card.revealed = true;
    card.identity = identity;
    if (identity === 'red' || identity === 'blue')
        ctx.state.teams[identity].found += 1;
    return true;
}
function finishGame(ctx, winner, loser, reason) {
    ctx.state.phase = 'gameEnd';
    ctx.state.winner = winner;
    ctx.state.loser = loser;
    ctx.state.endReason = reason;
    ctx.state.auditSeed = secretSeed;
    if (secretIdentities) {
        for (const card of ctx.state.board)
            card.identity = secretIdentities[card.id] ?? card.identity;
    }
    const text = reason === 'danger'
        ? `${winner === 'red' ? '红队' : '蓝队'}获胜：对手触发了危险词。`
        : `${winner === 'red' ? '红队' : '蓝队'}已找出全部目标。`;
    ctx.state.notice = text;
    pushHistory(ctx, 'gameEnd', `${text} 复盘 seed: ${secretSeed ?? 'n/a'}`);
    ctx.broadcast('keywordOps:gameEnd', { winner, reason });
}
function maybeFinishTargets(ctx, team) {
    if (ctx.state.teams[team].found >= ctx.state.teams[team].targetCount) {
        finishGame(ctx, team, null, 'targets');
        return true;
    }
    return false;
}
function startTurn(ctx, team) {
    ctx.state.activeTeam = team;
    ctx.state.phase = 'clue';
    ctx.state.clue = null;
    ctx.state.guessesUsed = 0;
    ctx.state.maxGuesses = 0;
    ctx.state.notice = `${team === 'red' ? '红队' : '蓝队'} captain 请给出提示。`;
    pushHistory(ctx, 'turn', `${team === 'red' ? '红队' : '蓝队'}回合开始。`);
}
function createRound(ctx) {
    const seed = Math.floor(ctx.random() * 0x100000000) >>> 0;
    const random = mulberry32(seed);
    const words = shuffled(WORD_POOL, random).slice(0, 25);
    const startingTeam = random() < 0.5 ? 'red' : 'blue';
    const identities = startingTeam === 'red'
        ? [...Array(9).fill('red'), ...Array(8).fill('blue'), ...Array(7).fill('neutral'), 'danger']
        : [...Array(8).fill('red'), ...Array(9).fill('blue'), ...Array(7).fill('neutral'), 'danger'];
    const shuffledIdentities = shuffled(identities, random);
    secretIdentities = {};
    secretSeed = seed;
    ctx.state.board = words.map((word, index) => {
        const id = `c${index + 1}`;
        secretIdentities[id] = shuffledIdentities[index];
        return { id, word, revealed: false, identity: null };
    });
    ctx.state.teams.red.targetCount = startingTeam === 'red' ? 9 : 8;
    ctx.state.teams.blue.targetCount = startingTeam === 'blue' ? 9 : 8;
    ctx.state.teams.red.found = 0;
    ctx.state.teams.blue.found = 0;
    ctx.state.round += 1;
    ctx.state.winner = null;
    ctx.state.loser = null;
    ctx.state.endReason = null;
    ctx.state.auditSeed = null;
    ctx.state.history = [];
    eventSeq = 0;
    startTurn(ctx, startingTeam);
    for (const team of ['red', 'blue']) {
        const captainId = captainOf(ctx.state, team);
        if (captainId)
            sendCaptainMap(ctx, captainId);
    }
    ctx.log('keyword-ops round created', { round: ctx.state.round, seedKeptSecret: true });
}
export default defineRoom({
    meta: { name: 'Keyword Ops', minPlayers: 4, maxPlayers: 10 },
    initialState() {
        return {
            phase: 'lobby',
            round: 0,
            hostId: null,
            players: [],
            teams: {
                red: { captainId: null, targetCount: 9, found: 0 },
                blue: { captainId: null, targetCount: 8, found: 0 },
            },
            board: [],
            activeTeam: 'red',
            clue: null,
            guessesUsed: 0,
            maxGuesses: 0,
            winner: null,
            loser: null,
            endReason: null,
            notice: '等待 4–10 名玩家加入。',
            history: [],
            auditSeed: null,
        };
    },
    onJoin(ctx) {
        if (ctx.state.phase !== 'lobby')
            return;
        syncPlayers(ctx);
    },
    onLeave(ctx, player) {
        if (ctx.state.phase === 'lobby') {
            ctx.state.players = ctx.state.players.filter(({ id }) => id !== player.id);
            for (const team of ['red', 'blue']) {
                const members = ctx.state.players.filter((item) => item.team === team);
                if (!members.some((item) => item.id === ctx.state.teams[team].captainId)) {
                    ctx.state.teams[team].captainId = members[0]?.id ?? null;
                }
            }
            return;
        }
        const publicPlayer = ctx.state.players.find(({ id }) => id === player.id);
        if (publicPlayer)
            publicPlayer.connected = false;
        ctx.state.notice = `${player.name} 已断线；已完成的公开操作继续有效。`;
    },
    onReconnect(ctx, player) {
        const publicPlayer = ctx.state.players.find(({ id }) => id === player.id);
        if (publicPlayer)
            publicPlayer.connected = true;
        sendCaptainMap(ctx, player.id);
    },
    onRestore(ctx) {
        secretIdentities = null;
        secretSeed = null;
        ctx.state.phase = 'lobby';
        ctx.state.board = [];
        ctx.state.clue = null;
        ctx.state.guessesUsed = 0;
        ctx.state.maxGuesses = 0;
        ctx.state.winner = null;
        ctx.state.loser = null;
        ctx.state.endReason = null;
        ctx.state.auditSeed = null;
        ctx.state.history = [];
        ctx.state.notice = '房主恢复了房间。为防止秘密身份丢失，本局已安全重置，请重新开局。';
        syncPlayers(ctx);
    },
    actions: {
        'lobby:setTeam'(ctx, { player, payload }) {
            if (ctx.state.phase !== 'lobby')
                return;
            const team = payload?.team;
            if (team !== 'red' && team !== 'blue')
                return;
            const own = ctx.state.players.find((item) => item.id === player.id);
            if (!own)
                return;
            own.team = team;
            for (const side of ['red', 'blue']) {
                const members = ctx.state.players.filter((item) => item.team === side);
                if (!members.some((item) => item.id === ctx.state.teams[side].captainId)) {
                    ctx.state.teams[side].captainId = members[0]?.id ?? null;
                }
            }
        },
        'lobby:setCaptain'(ctx, { player, payload }) {
            if (ctx.state.phase !== 'lobby' || !isHost(ctx, player))
                return;
            const data = payload;
            if ((data?.team !== 'red' && data?.team !== 'blue') || typeof data.playerId !== 'string')
                return;
            if (!ctx.state.players.some((item) => item.id === data.playerId && item.team === data.team))
                return;
            ctx.state.teams[data.team].captainId = data.playerId;
        },
        'game:start'(ctx, { player }) {
            if (ctx.state.phase !== 'lobby' || !isHost(ctx, player))
                return;
            const participants = ctx.state.players.filter((item) => item.connected);
            if (participants.length < 4 || participants.length > 10) {
                ctx.state.notice = '需要 4–10 名在线玩家才能开始。';
                return;
            }
            for (const team of ['red', 'blue']) {
                const members = participants.filter((item) => item.team === team);
                if (members.length < 2) {
                    ctx.state.notice = '每队至少需要 2 人（1 captain + 至少 1 field agent）。';
                    return;
                }
                if (!ctx.state.teams[team].captainId || !members.some((item) => item.id === ctx.state.teams[team].captainId)) {
                    ctx.state.notice = '每队都必须指定 captain。';
                    return;
                }
            }
            createRound(ctx);
        },
        submitClue(ctx, { player, payload }) {
            if (ctx.state.phase !== 'clue')
                return;
            if (captainOf(ctx.state, ctx.state.activeTeam) !== player.id)
                return;
            const data = payload;
            const error = validateClue(data?.word, data?.count, ctx.state.board.filter((card) => !card.revealed).map((card) => card.word));
            if (error) {
                ctx.send(player.id, 'keywordOps:error', { message: error });
                return;
            }
            const word = String(data.word).trim();
            const count = Number(data.count);
            ctx.state.clue = { word, count };
            ctx.state.guessesUsed = 0;
            ctx.state.maxGuesses = count + 1;
            ctx.state.phase = 'guessing';
            ctx.state.notice = `${ctx.state.activeTeam === 'red' ? '红队' : '蓝队'}行动：最多猜 ${count + 1} 次，可在至少猜 1 次后结束回合。`;
            pushHistory(ctx, 'clue', `${ctx.state.activeTeam === 'red' ? '红队' : '蓝队'}提示：${word} · ${count}`);
        },
        guessWord(ctx, { player, payload }) {
            if (ctx.state.phase !== 'guessing' || !secretIdentities)
                return;
            if (teamOf(ctx.state, player.id) !== ctx.state.activeTeam)
                return;
            if (captainOf(ctx.state, ctx.state.activeTeam) === player.id)
                return;
            const cardId = payload?.cardId;
            if (typeof cardId !== 'string')
                return;
            const card = ctx.state.board.find((item) => item.id === cardId);
            if (!card || card.revealed)
                return;
            const identity = secretIdentities[cardId];
            if (!identity)
                return;
            ctx.state.guessesUsed += 1;
            revealCard(ctx, cardId, identity);
            pushHistory(ctx, 'guess', `${player.name} 揭示「${card.word}」：${identity === 'red' ? '红' : identity === 'blue' ? '蓝' : identity === 'neutral' ? '中立' : '危险'}`);
            // danger has highest priority over every other side effect.
            const resolution = resolutionForGuess(ctx.state.activeTeam, identity);
            if (resolution.reason === 'danger' && resolution.winner && resolution.loser) {
                finishGame(ctx, resolution.winner, resolution.loser, 'danger');
                return;
            }
            if (identity === 'red' || identity === 'blue') {
                if (maybeFinishTargets(ctx, identity))
                    return;
            }
            if (!resolution.continueTurn) {
                startTurn(ctx, otherTeam(ctx.state.activeTeam));
                return;
            }
            if (ctx.state.guessesUsed >= ctx.state.maxGuesses) {
                startTurn(ctx, otherTeam(ctx.state.activeTeam));
            }
        },
        endTurn(ctx, { player }) {
            if (ctx.state.phase !== 'guessing')
                return;
            if (teamOf(ctx.state, player.id) !== ctx.state.activeTeam)
                return;
            if (captainOf(ctx.state, ctx.state.activeTeam) === player.id)
                return;
            if (ctx.state.guessesUsed < 1)
                return;
            startTurn(ctx, otherTeam(ctx.state.activeTeam));
        },
        rematch(ctx, { player }) {
            if (ctx.state.phase !== 'gameEnd' || !isHost(ctx, player))
                return;
            createRound(ctx);
        },
    },
});
