// Live news feed - pulls Google News RSS (FREE, no API key) for Assam-flood coverage
// and aggregates many outlets. Cached in memory for 15 min so we don't hammer the source.
//
// Note: this is NEWS aggregation, not social-media APIs. X/Twitter/Facebook/Instagram
// require paid keys + app review (same wall as WhatsApp intake), so they're intentionally
// out. Google News already rolls up most outlets for free and reliably.

const DEFAULT_QS = ['Assam flood', 'Assam baan relief'];   // homepage
const feedUrl = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
const cache = new Map();   // query-key -> { at, items } (per query, so event feeds cache separately)

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const pick = (block, tag) => { const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? decode(m[1]) : ''; };

// queries: a string / array of Google-News search terms (per event); omit for the Assam homepage.
export async function fetchNews(queries) {
  const qs = (Array.isArray(queries) && queries.length) ? queries : (typeof queries === 'string' && queries.trim() ? [queries] : DEFAULT_QS);
  const key = qs.join('|');
  const c = cache.get(key);
  if (c && Date.now() - c.at < 15 * 60 * 1000) return c.items;
  const items = [];
  for (const q of qs) {
    try {
      const r = await fetch(feedUrl(q), { headers: { 'user-agent': 'BanpaniNews/1.0' } });
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
  const out = uniq.slice(0, 30);
  if (out.length) cache.set(key, { at: Date.now(), items: out });
  return out;
}
