import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tmp = path.join(root, '.local-build');
const dist = path.join(root, 'dist');
rmSync(tmp, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(path.join(dist, 'assets'), { recursive: true });

execFileSync('tsc', [
  '--target', 'ES2019', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--strict',
  '--lib', 'ES2019,DOM', '--outDir', tmp,
  'src/shared/types.ts', 'src/shared/rules.ts', 'src/worker-sdk.d.ts', 'src/worker/index.ts', 'src/ui/main.ts',
], { stdio: 'inherit' });

let rules = readFileSync(path.join(tmp, 'shared/rules.js'), 'utf8').replace(/export\s+/g, '');
let worker = readFileSync(path.join(tmp, 'worker/index.js'), 'utf8')
  .replace(/^import\s+\{[^\n]+\}\s+from\s+['"]\.\.\/shared\/rules['"];?\s*$/m, '')
  .trim();
writeFileSync(path.join(dist, 'room.worker.js'), `${rules.trim()}\n\n${worker}\n`);

const ui = readFileSync(path.join(tmp, 'ui/main.js'), 'utf8').replace(/^import\s+['"]\.\/style\.css['"];?\s*$/m, '');
writeFileSync(path.join(dist, 'assets/main.js'), ui);
cpSync(path.join(root, 'src/ui/style.css'), path.join(dist, 'assets/style.css'));
cpSync(path.join(root, 'public/parti.room.json'), path.join(dist, 'parti.room.json'));
if (readFileSync(path.join(root, 'public/parti.room.json'), 'utf8').includes('"cover"')) {
  cpSync(path.join(root, 'public/cover.svg'), path.join(dist, 'cover.svg'));
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/ui/main.ts"></script>', '<link rel="stylesheet" href="./assets/style.css" />\n    <script type="module" src="./assets/main.js"></script>');
writeFileSync(path.join(dist, 'index.html'), html);
console.log('local fallback build complete');
