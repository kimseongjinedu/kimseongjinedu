// Draws the app icons in this folder from the page's school mark (MARK in app/schoolmate-ai.html).
// Needs Playwright with Chromium:  NODE_PATH=$(npm root -g) node app/icons/make-icons.cjs app/icons
const { chromium } = require('playwright');
const OUT = process.argv[2];
const SHAPES = `<path class="sc" d="M4.5 25.5h23M5.5 25.5V14.5H12M26.5 25.5V14.5H20M12 25.5V10L16 7.2 20 10v15.5M14.5 25.5v-4h3v4M16 7.2V3.4"/><circle class="sc" cx="16" cy="12.6" r="1.9"/><path class="win" d="M7.3 16.9h2.8v2.6H7.3zM7.3 21h2.8v2.6H7.3zM21.9 16.9h2.8v2.6h-2.8zM21.9 21h2.8v2.6h-2.8z"/><path class="flag" d="M16 3h4.2l-1.2 1.3 1.2 1.3H16z"/>`;
const STYLE = `<style>.sc{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.win{fill:#fff}.flag{fill:#FFE45E}</style>`;
// any: rounded tile like the page mark; full: full-bleed square with the drawing scaled to `scale` of the side
const svgAny = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${STYLE}<rect width="32" height="32" rx="7" fill="#2F5BEA"/><g transform="translate(16 15) scale(.92) translate(-16 -14.5)">${SHAPES}</g></svg>`;
const svgFull = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${STYLE}<rect width="32" height="32" fill="#2F5BEA"/><g transform="translate(16 16) scale(${scale}) translate(-16 -14.5)">${SHAPES}</g></svg>`;
const jobs = [
  ['icon-192.png', 192, svgAny()],
  ['icon-512.png', 512, svgAny()],
  ['maskable-512.png', 512, svgFull(0.62)],
  ['apple-touch-icon.png', 180, svgFull(0.74)],
  ['favicon-32.png', 32, svgAny()]
];
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  for (const [name, size, svg] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: OUT + '/' + name, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
  console.log('icons ok');
})();
