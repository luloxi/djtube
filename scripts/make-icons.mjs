// Regenerates the PNG icons from the glyph below. Run: node scripts/make-icons.mjs (needs playwright + chrome).
// The glyph's bounding box is centered vertically on the disc: top and bottom padding are equal.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORANGE = '#FF8A1F';
const BLUE = '#1B5CFF';
// Glyph bbox in the 128 grid: y 36.5..108 (eyes top, mouth bottom incl. stroke); x 33.5..94.5. Centre y = 72.25.
const GLYPH_CY = 72.25;
const glyph = `
  <circle cx="43" cy="46" r="9.5" fill="${BLUE}"/>
  <circle cx="85" cy="46" r="9.5" fill="${BLUE}"/>
  <path d="M54 72V104L84 88Z" fill="${BLUE}" stroke="${BLUE}" stroke-width="8" stroke-linejoin="round"/>`;
const centered = (s) => `<g transform="translate(64 64) scale(${s}) translate(-64 -${GLYPH_CY})">${glyph}</g>`;

export const SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="62" fill="${ORANGE}"/>
  ${centered(1)}
</svg>
`;
const disc = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><circle cx="64" cy="64" r="62" fill="${ORANGE}"/>${centered(1)}</svg>`;
const square = (size, s) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><rect width="128" height="128" fill="${ORANGE}"/>${centered(s)}</svg>`;

const jobs = [
  ['favicon-32.png', 32, disc(32)],
  ['icon-192.png', 192, disc(192)],
  ['icon-512.png', 512, disc(512)],
  ['apple-touch-icon.png', 180, square(180, 0.84)],
  ['icon-maskable-512.png', 512, square(512, 0.62)],
];
writeFileSync('public/djtube.svg', SOURCE);
writeFileSync('public/favicon.svg', SOURCE);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [file, size, svg] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
  await page.close();
}
await browser.close();
