// SATÜRN ARKA PLAN PİYASA BEKÇİSİ — GitHub Actions'ta 10 dakikada bir çalışır (uygulama kapalıyken de).
// Yalnız HERKESE AÇIK piyasa verisi işler ve yalnız bu bekçiye ayrılmış ntfy kanalına yazar (kişisel bildirim kanalı KULLANILMAZ).
// Durum tutmaz: aynı uyarıyı tekrarlamamak için ntfy kanalındaki son mesajlara bakar.
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const BN = 'https://data-api.binance.vision/api/v3/';
const NTFY = 'https://ntfy.sh';
const OZ = 31.1034768;
const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d });
const label = s => s === 'PAXGUSDT' ? 'Altın (ons)' : s === 'USDTTRY' ? 'Dolar/TL' : s.replace(/USDT$/, '');
const fmt = (s, p) => s === 'USDTTRY' ? nf(p, 3) + ' TL' : s === 'PAXGUSDT' ? nf(p, 0) + ' $' : (p < 1 ? nf(p, 5) : p < 100 ? nf(p, 3) : nf(p, 0)) + ' $';
const cls = s => s === 'PAXGUSDT' ? 'altin' : s === 'USDTTRY' ? 'doviz' : 'kripto';

export async function getJ(f, url) { const r = await f(url); if (!r.ok) throw Error(url + ' HTTP ' + r.status); return r.json(); }

// Kurallar: [15 dk %, 60 dk %] sınıf bazında; şimdiki kapanış ile 3 / 12 mum (5 dk) önceki kapanış karşılaştırılır
export function rules(sym, kl, t24, th) {
  const c = kl.map(k => +k[4]), n = c.length, out = [];
  if (n < 14) return out;
  const [a15, a60] = th[cls(sym)], p = c[n - 1];
  const c15 = (p / c[n - 4] - 1) * 100, c60 = (p / c[n - 13] - 1) * 100;
  if (Math.abs(c15) >= a15) out.push({ key: `${sym}:15:${Math.sign(c15)}`, cool: 45, msg: `${label(sym)} son 15 dakikada ${c15 > 0 ? 'sert yükseldi' : 'sert düştü'}: %${nf(c15, 1)} → ${fmt(sym, p)}` });
  else if (Math.abs(c60) >= a60) out.push({ key: `${sym}:60:${Math.sign(c60)}`, cool: 60, msg: `${label(sym)} son 1 saatte %${nf(c60, 1)} ${c60 > 0 ? 'yükseldi' : 'düştü'} → ${fmt(sym, p)}` });
  if (t24) {
    const hi = +t24.highPrice, lo = +t24.lowPrice, ch = +t24.priceChangePercent;
    const before = c.slice(0, n - 3); // son 15 dk hariç
    if (hi && p >= hi * 0.9995 && Math.max(...before) < hi * 0.999 && Math.abs(ch) >= 1) out.push({ key: `${sym}:hi`, cool: 360, msg: `${label(sym)} 24 saatin ZİRVESİNİ kırdı: ${fmt(sym, p)} (24s %${nf(ch, 1)})` });
    if (lo && p <= lo * 1.0005 && Math.min(...before) > lo * 1.001 && Math.abs(ch) >= 1) out.push({ key: `${sym}:lo`, cool: 360, msg: `${label(sym)} 24 saatin DİBİNE indi: ${fmt(sym, p)} (24s %${nf(ch, 1)})` });
  }
  return out;
}

export async function recentKeys(f, topic, hours = 7) {
  try {
    const r = await f(`${NTFY}/${topic}/json?poll=1&since=${hours}h`);
    if (!r.ok) return new Map();
    const txt = await r.text(), m = new Map();
    for (const line of txt.split('\n')) { try { const j = JSON.parse(line); const k = (j.tags || []).find(x => x.startsWith('k_')); if (k) m.set(k.slice(2), Math.max(m.get(k.slice(2)) || 0, j.time * 1000)); } catch {} }
    return m;
  } catch { return new Map(); }
}

export async function push(f, topic, title, message, key, priority = 4) {
  const r = await f(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, title, message, tags: ['chart_with_upwards_trend', 'k_' + key], priority, click: cfg.click }) });
  if (!r.ok) throw Error('ntfy HTTP ' + r.status);
}

export async function run({ f = fetch, mode = process.env.MODE || 'watch', nowMs = Date.now(), log = console.log } = {}) {
  const topic = cfg.topic, th = cfg.thresholds;
  const seen = await recentKeys(f, topic);
  const sent = [];
  if (mode === 'brief') {
    const day = new Date(nowMs + 3 * 3600000).toISOString().slice(0, 10), slot = new Date(nowMs + 3 * 3600000).getUTCHours() < 14 ? 'am' : 'pm', key = `brief:${day}:${slot}`;
    if (seen.has(key)) { log('özet zaten gönderilmiş'); return sent; }
    const T = await getJ(f, BN + 'ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(cfg.symbols)));
    const by = Object.fromEntries(T.map(x => [x.symbol, x])), usd = +by.USDTTRY?.lastPrice;
    const lines = cfg.symbols.filter(s => s !== 'USDTTRY' && s !== 'PAXGUSDT' && by[s]).map(s => `${label(s)} ${fmt(s, +by[s].lastPrice)} (${+by[s].priceChangePercent >= 0 ? '▲' : '▼'}%${nf(Math.abs(+by[s].priceChangePercent), 1)})`);
    if (by.PAXGUSDT && usd) lines.push(`Gram altın ${nf(+by.PAXGUSDT.lastPrice / OZ * usd, 0)} TL (${+by.PAXGUSDT.priceChangePercent >= 0 ? '▲' : '▼'}%${nf(Math.abs(+by.PAXGUSDT.priceChangePercent), 1)})`);
    if (usd) lines.push(`Dolar/TL ${nf(usd, 3)}`);
    try { const g = await getJ(f, 'https://api.alternative.me/fng/?limit=1'); lines.push(`Korku-Açgözlülük ${g.data[0].value} (${g.data[0].value_classification})`); } catch {}
    await push(f, topic, slot === 'am' ? 'SATÜRN sabah piyasa özeti' : 'SATÜRN akşam piyasa özeti', lines.join('\n'), key, 3);
    sent.push(key); log('özet gönderildi'); return sent;
  }
  const T = await getJ(f, BN + 'ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(cfg.symbols)));
  const by = Object.fromEntries(T.map(x => [x.symbol, x]));
  for (const s of cfg.symbols) {
    let kl; try { kl = await getJ(f, `${BN}klines?symbol=${s}&interval=5m&limit=20`); } catch (e) { log('atlandı', s, e.message); continue; }
    for (const r of rules(s, kl, by[s], th)) {
      const last = seen.get(r.key);
      if (last && nowMs - last < r.cool * 60000) continue;
      await push(f, topic, 'SATÜRN piyasa', r.msg, r.key); seen.set(r.key, nowMs); sent.push(r.key); log('gönderildi:', r.msg);
    }
  }
  if (!sent.length) log('olağan dışı hareket yok');
  return sent;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  run().catch(e => { console.error('HATA', e.message); process.exit(1); });
}
