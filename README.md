# Keyword Ops

Parti Room 原创词语联想对抗游戏。4–10 人分成红蓝两队，每队 1 名 Captain；Captain 查看秘密身份图并给出「单个词 + 数字」提示，Field Agents 在 5×5 关键词板上逐个猜测。

## 开发

```bash
npm install
npm run dev
npm run verify
```

构建产物位于 `dist/`：

- `index.html`
- `parti.room.json`
- `room.worker.js`

## 实现要点

- Worker 是唯一权威状态源。
- 未揭示 identity 不进入公共 `ctx.state`；仅保存在 Worker 模块内，并通过 `ctx.send` 私发给 Captain。
- 本局 seed 由 Worker 的 `ctx.random()` 生成，随后使用确定性 PRNG 完成词库与身份洗牌；对局结束才公开 seed 供复盘。
- 房主恢复导致 Worker 模块秘密状态丢失时，安全回到 lobby，而不是继续一局身份图不完整的游戏。
- MVP 的 Captain 每局固定；Field Agent 首个合法点击立即生效。

## 核心 Action

- `submitClue({ word, count })`
- `guessWord({ cardId })`
- `endTurn()`

另外提供 lobby 编组、指定 Captain、开局和 rematch actions。
