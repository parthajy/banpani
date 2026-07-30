// Live news feed - pulls Google News RSS (FREE, no API key) for Assam-flood coverage
// and aggregates many outlets. Cached in memory for 15 min so we don't hammer the source.
//
// Note: this is NEWS aggregation, not social-media APIs. X/Twitter/Facebook/Instagram
// require paid keys + app review (same wall as WhatsApp intake), so they're intentionally
// out. Google News already rolls up most outlets for free and reliably.

const FEEDS = [
  'https://news.google.com/rss/search?q=Assam+flood&hl=en-IN&gl=IN&ceid=IN:en',
  'https://news.google.com/rss/search?q=Assam+baan+relief&hl=en-IN&gl=IN&ceid=IN:en',
];
let cache = { at: 0, items: [] };

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const pick = (block, tag) => { const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? decode(m[1]) : ''; };

export async function fetchNews(force = false) {
  if (!force && cache.items.length && Date.now() - cache.at < 15 * 60 * 1000) return cache.items;
  const items = [];
  for (const url of FEEDS) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'BanpaniNews/1.0' } });
      if (!r.ok) continue;
      const xml = await r.text();
      for (const block of xml.split('<item>').slice(1, 26)) {
        const title = pick(block, 'title'), link = pick(block, 'link'), source = pick(block, 'source'), pubDate = pick(block, 'pubDate');
        if (title && link) items.push({ title, link, source, pubDate });
      }
    } catch { /* ignore a failing feed */ }
  }
  const seen = new Set();
  const uniq = items.filter(i => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  uniq.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  if (uniq.length) cache = { at: Date.now(), items: uniq.slice(0, 30) };
  return cache.items;
}
