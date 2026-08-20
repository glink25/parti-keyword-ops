import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

for (const path of ['dist/index.html', 'dist/parti.room.json', 'dist/room.worker.js', 'dist/assets/main.js', 'dist/cover.svg']) {
  if (!existsSync(path)) throw new Error(`missing build artifact: ${path}`);
}
execFileSync(process.execPath, ['--check', 'dist/assets/main.js'], { stdio: 'inherit' });
const worker = readFileSync('dist/room.worker.js', 'utf8');
if (!worker.includes('@parti/worker-sdk')) throw new Error('worker sdk import was bundled away');
if (!worker.includes('defineRoom')) throw new Error('defineRoom missing from worker build');
const manifest = JSON.parse(readFileSync('dist/parti.room.json', 'utf8'));
if (manifest.entry.worker !== 'room.worker.js' || manifest.entry.ui !== 'index.html') {
  throw new Error('manifest entry mismatch');
}
if (manifest.cover !== 'cover.svg') throw new Error('market cover missing from manifest');
console.log('build verification passed');
