import { existsSync, readFileSync } from 'node:fs';

for (const path of ['dist/index.html', 'dist/parti.room.json', 'dist/room.worker.js']) {
  if (!existsSync(path)) throw new Error(`missing build artifact: ${path}`);
}
const worker = readFileSync('dist/room.worker.js', 'utf8');
if (!worker.includes('@parti/worker-sdk')) throw new Error('worker sdk import was bundled away');
if (!worker.includes('defineRoom')) throw new Error('defineRoom missing from worker build');
const manifest = JSON.parse(readFileSync('dist/parti.room.json', 'utf8'));
if (manifest.entry.worker !== 'room.worker.js' || manifest.entry.ui !== 'index.html') {
  throw new Error('manifest entry mismatch');
}
console.log('build verification passed');
