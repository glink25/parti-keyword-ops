import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rules = await import(pathToFileURL(`${process.cwd()}/.local-build/shared/rules.js`).href);
assert.equal(rules.validateClue('星河', 1, ['灯塔', '轨道']), null);
assert.match(rules.validateClue('灯塔', 1, ['灯塔', '轨道']), /桌面词/);
assert.match(rules.validateClue('two words', 2, []), /token/);
assert.match(rules.validateClue('123', 2, []), /纯数字/);
assert.deepEqual(rules.resolutionForGuess('red', 'danger'), { continueTurn: false, winner: 'blue', loser: 'red', reason: 'danger' });
assert.equal(rules.resolutionForGuess('red', 'red').continueTurn, true);
assert.equal(rules.resolutionForGuess('red', 'blue').continueTurn, false);
assert.equal(rules.resolutionForGuess('red', 'neutral').continueTurn, false);
const a = rules.shuffled([1, 2, 3, 4, 5], rules.mulberry32(42));
const b = rules.shuffled([1, 2, 3, 4, 5], rules.mulberry32(42));
assert.deepEqual(a, b);
assert.equal(1 + 1, 2, 'count=1 must permit a count+1 ceiling of 2 guesses');
console.log('rules smoke tests passed');
