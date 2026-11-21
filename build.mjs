// Zero-dependency build: concatenates src/NN-*.js into one inline <script>
// and emits two single-file builds:
//   index.html          full HTML document (open directly in a browser)
//   dist/artifact.html  same page without the document wrapper (for hosted embeds)
// Usage: node build.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const read = (f) => readFileSync(join(src, f), 'utf8');

const parts = readdirSync(src).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
const js = parts.map((f) => `// ==== ${f} ====\n${read(f)}`).join('\n');
const program = `(() => {\n'use strict';\n${js}\n})();`;

// Syntax check without executing (fails the build on parse errors).
try { new Function(program); } catch (e) { console.error('Syntax error in game script:', e.message); process.exit(1); }

const head = read('head.html').trim();
// (replacer function: a replacement string would treat "$$", "$&" etc. in the game code as patterns)
const body = read('body.html').trim().replace('<!-- @GAME_SCRIPT -->', () => `<script>\n${program}\n</script>`);

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'index.html'), full);
writeFileSync(join(root, 'dist', 'artifact.html'), `${head}\n${body}\n`);
writeFileSync(join(root, 'dist', 'game.js'), program);
console.log(`built index.html (${(full.length / 1024).toFixed(1)} KB) from ${parts.length} modules: ${parts.join(', ')}`);
