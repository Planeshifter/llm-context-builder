const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode', 'esbuild'],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    watch: process.argv.includes('--watch'),
    minify: process.argv.includes('--minify'),
  })
  .catch(() => process.exit(1));
