// Generates a 20,000-bookmark Netscape export for performance testing.
import { writeFileSync } from 'node:fs';

const SITES = [
  'react.dev',
  'developer.mozilla.org',
  'w3schools.com',
  'github.com',
  'stackoverflow.com',
  'news.ycombinator.com',
  'arxiv.org',
  'wikipedia.org',
];
const TOTAL = Number(process.argv[2] ?? 20000);

let out = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
out += `  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>\n  <DL><p>\n`;

for (let folder = 0; folder < 40; folder++) {
  out += `    <DT><H3 ADD_DATE="1700000000">Folder ${folder}</H3>\n    <DL><p>\n`;
  for (let i = 0; i < TOTAL / 40; i++) {
    const site = SITES[(folder + i) % SITES.length];
    out += `      <DT><A HREF="https://${site}/page/${folder}/${i}?utm_source=test" ADD_DATE="${1700000000 + i}">Item ${folder}-${i}</A>\n`;
  }
  out += `    </DL><p>\n`;
}
out += `  </DL><p>\n</DL><p>\n`;

writeFileSync('fixture-20k.html', out);
console.log(`wrote fixture-20k.html with ${TOTAL} bookmarks`);
