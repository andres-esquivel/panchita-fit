const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');
const assets = path.join(root, 'assets');

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run expo export first.');
  process.exit(1);
}

const copies = [
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'],
  ['icon.png', 'icon.png'],
];
for (const [src, dest] of copies) {
  fs.copyFileSync(path.join(assets, src), path.join(dist, dest));
}

const manifest = {
  name: 'PanchitaFit',
  short_name: 'PanchitaFit',
  description: 'Gym tracker con Panchita, tu coach salchicha con actitud.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0f0a1e',
  theme_color: '#7c3aed',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const tags = [
  '<meta name="theme-color" content="#7c3aed" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="PanchitaFit" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />',
  '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />',
].join('\n    ');

if (!html.includes('manifest.webmanifest')) {
  html = html.replace('</head>', `    ${tags}\n  </head>`);
}
fs.writeFileSync(indexPath, html);
console.log('Patched PWA icons and manifest in dist/');
