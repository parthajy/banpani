// Generate per-family Open Graph share images (1200x630 PNG) with headless Chrome - zero npm deps.
// Run:  node scripts/gen-og.mjs
// Writes frontend/og-<family>.png for every disaster family + og-world.png for the world map.
// These are the images social platforms (WhatsApp/X/Facebook) show when an event or the map is shared.
import { DISASTERS } from '../server/disasters.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FE = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmp = mkdtempSync(join(tmpdir(), 'og-'));

const card = ({ color, emoji, label, tag, sub }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  html,body{width:1200px;height:630px}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Bengali","Apple Color Emoji","Segoe UI Emoji",sans-serif;
    background:radial-gradient(1100px 520px at 82% -12%, ${color}38, transparent 60%), linear-gradient(160deg,#141b23 0%, #0f1419 55%, #0b0f14 100%);
    color:#e8edf2;padding:64px 78px;position:relative;overflow:hidden;display:flex;flex-direction:column}
  .bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:${color}}
  .content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%}
  .top{display:flex;align-items:center;gap:22px}
  .emoji{font-size:96px;line-height:1}
  .brand{font-size:70px;font-weight:800;letter-spacing:-1px;line-height:1}
  .brand .as{color:#8b97a6;font-weight:500;font-size:38px}
  .tag{font-size:56px;font-weight:800;line-height:1.08;margin-top:34px;max-width:1000px;color:#fff}
  .tag b{color:${color}}
  .sub{font-size:27px;color:#aeb9c7;margin-top:20px;line-height:1.45;max-width:1000px}
  .pills{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
  .pill{font-size:23px;color:#cdd6e2;border:1px solid #2a3541;background:rgba(30,39,50,.6);border-radius:999px;padding:10px 20px}
  .spacer{flex:1}
  .foot{display:flex;align-items:center;justify-content:space-between}
  .url{font-size:33px;font-weight:700;color:${color}}
  .meta{font-size:23px;color:#8b97a6}
</style></head><body>
  <div class="bar"></div>
  <div class="content">
    <div class="top"><div class="emoji">${emoji}</div><div class="brand">Banpani <span class="as">· বানপানী</span></div></div>
    <div class="tag">${tag}</div>
    <div class="sub">${sub}</div>
    <div class="pills"><div class="pill">Free &amp; open source</div><div class="pill">No accounts</div><div class="pill">Owned by everyone</div></div>
    <div class="spacer"></div>
    <div class="foot"><div class="url">🌐 banpani.org</div><div class="meta">Community-run disaster relief</div></div>
  </div>
</body></html>`;

function shoot(name, html) {
  const h = join(tmp, name + '.html'), out = join(FE, name + '.png');
  writeFileSync(h, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', '--default-background-color=00000000', '--screenshot=' + out, 'file://' + h], { stdio: 'ignore' });
  console.log('wrote frontend/' + name + '.png');
}

for (const [key, f] of Object.entries(DISASTERS)) {
  const lo = f.label.toLowerCase();
  shoot('og-' + key, card({ color: f.color, emoji: f.emoji, label: f.label,
    tag: `${f.emoji} <b>${f.label}</b> relief,<br>coordinated`,
    sub: `A free, community-run live map to coordinate ${lo} relief - report needs, see who's covering where, and reach the places nobody has.` }));
}
// The world map card (multi-hazard)
shoot('og-world', card({ color: '#2E77FF', emoji: '🌍', label: 'World',
  tag: `The world's disasters,<br><b>coordinated by everyone</b>`,
  sub: `A live, community-run world map of floods, fires, storms and more. Report a disaster anywhere - no accounts, no login. Open source.` }));

console.log('done. Regenerate anytime with: node scripts/gen-og.mjs');
