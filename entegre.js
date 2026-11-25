'use strict';
/* SATÜRN 27 — DÜNDEN KALAN 5 MADDE: tek panel (MERKEZ)
 *  1) Uzman ajanlar  → zaten çalışıyor (uzman, konsey, ULTRON); MERKEZ'den tek dokunuşla konsey.
 *  2) Resmî WhatsApp + Instagram → WhatsApp Cloud API ile gönderme; gelen mesajlar ve ONLINE RANDEVU talepleri
 *     ücretsiz Google Apps Script köprüsüyle (Meta webhook) panele düşer; Instagram yorumları okunur/yanıtlanır.
 *  3) FİZYOVİTA + KRİPTO RADAR aynı panelde → MERKEZ sekmesi: bugünkü klinik, gelen kutusu, randevu talepleri, Kripto Radar, akıllı ev.
 *     Kripto Radar 0.1'in (Python, 8765 portu — yardımcıyla çakışıyordu) 20 kurallı taraması tarayıcıya taşındı.
 *  4) Home Assistant → bağlantı testi, CORS kılavuzu, cihaz kartları (aç/kapat).
 *  5) ZOİ → zaten çalışıyor (tahmin, senaryo_tahmin, isabet ölçümü); MERKEZ'de özet. */
(() => {
  const DAY = 86400000, $id = id => document.getElementById(id);
  const getJ = async (u, ms = 12000, o) => { const r = await withTimeout(fetch(u, o), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const show = (t, links) => { const b = bubble('ai', t); try { answerTools(b.el, t); } catch {} if (links?.length) try { addLinks(b.el, links); } catch {} return b; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ask = (s, u, tier = 'quick') => { if (!window.jarvisResearch?.ask) throw Error('Yapay zekâ bağlı değil'); return window.jarvisResearch.ask(s, u, tier); };

  /* ================= KÖPRÜ 2 (Apps Script): WhatsApp webhook + online randevu formu ================= */
  const KEY = () => { let k = store.get('k2key', ''); if (!k) { k = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join(''); store.set('k2key', k); } return k; };
  const bridge2 = () => store.get('set.bridge2Url', '');
  const SCRIPT = () => `// SATÜRN KÖPRÜSÜ 2 — WhatsApp gelen mesajları + online randevu formu (ücretsiz, Google hesabında çalışır)
const ANAHTAR = '${KEY()}';            // Satürn bu anahtarla okur — kimseyle paylaşma
const DOGRULAMA = 'saturn-${KEY().slice(0, 6)}';   // Meta → WhatsApp → Webhook "Verify token" alanına bunu yaz
const KLINIK = 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi · Cizre';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p['hub.mode'] === 'subscribe') return ContentService.createTextOutput(p['hub.verify_token'] === DOGRULAMA ? p['hub.challenge'] : 'yanlis');
  if (p.oku) {
    if (p.oku !== ANAHTAR) return json({ ok: false, error: 'anahtar' });
    return json({ ok: true, wa: al('wa'), rv: al('rv'), t: Date.now() });
  }
  return HtmlService.createHtmlOutput(FORM).setTitle('Randevu · ' + KLINIK).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function doPost(e) {
  let d = {}; try { d = JSON.parse(e.postData.contents); } catch (x) {}
  if (d.object === 'whatsapp_business_account') {
    (d.entry || []).forEach(en => (en.changes || []).forEach(ch => {
      const v = ch.value || {}, names = {};
      (v.contacts || []).forEach(c => names[c.wa_id] = (c.profile || {}).name || '');
      (v.messages || []).forEach(m => ekle('wa', { id: m.id, from: m.from, ad: names[m.from] || '', t: Number(m.timestamp) * 1000, tur: m.type,
        metin: String((m.text && m.text.body) || (m.button && m.button.text) || (m.interactive && JSON.stringify(m.interactive)) || ('[' + m.type + ']')).slice(0, 800) }));
    }));
  }
  return ContentService.createTextOutput('ok');
}
function randevuKaydet(f) {
  const s = x => String(x || '').slice(0, 300);
  if (!s(f.ad) || !/^[0-9 +()-]{7,20}$/.test(s(f.tel))) throw new Error('Ad ve geçerli telefon gerekli');
  ekle('rv', { id: 'r' + Date.now(), ad: s(f.ad), tel: s(f.tel), sikayet: s(f.sikayet), tarih: s(f.tarih), saat: s(f.saat), t: Date.now() });
  return 'Talebiniz alındı. En kısa sürede sizi arayarak randevunuzu kesinleştireceğiz.';
}
function ekle(k, o) { const l = LockService.getScriptLock(); l.waitLock(10000); try { const a = al(k); if (!a.some(x => x.id === o.id)) a.push(o); PropertiesService.getScriptProperties().setProperty(k, JSON.stringify(a.slice(-40))); } finally { l.releaseLock(); } }
function al(k) { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(k) || '[]'); } catch (x) { return []; } }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const FORM = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>body{font:16px system-ui;margin:0;background:#0b1b28;color:#e8f4f8}main{max-width:460px;margin:auto;padding:22px}h1{font-size:20px;color:#5fe0ea}label{display:block;margin:12px 0 4px;font-size:14px;color:#9cc}input,textarea,select{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #2a5566;background:#102838;color:#fff;font:16px system-ui}button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#0e7c86;color:#fff;font:600 17px system-ui}#s{margin-top:14px}</style></head><body><main><h1>' + KLINIK + '</h1><p>Online randevu talebi — sizi arayarak kesinleştiriyoruz.</p><form id="f"><label>Ad soyad</label><input name="ad" required maxlength="80"><label>Telefon</label><input name="tel" required inputmode="tel" maxlength="20" placeholder="05xx xxx xx xx"><label>Şikâyet / bölge</label><textarea name="sikayet" rows="3" maxlength="300" placeholder="ör. bel ağrısı, diz ameliyatı sonrası"></textarea><label>Tercih ettiğiniz gün</label><input name="tarih" type="date"><label>Saat aralığı</label><select name="saat"><option>Sabah (09-12)</option><option>Öğle (12-15)</option><option>Akşamüstü (15-19)</option></select><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" required style="width:auto;margin-top:3px"> Bilgilerimin randevu amacıyla işlenmesini kabul ediyorum (KVKK).</label><button>Randevu talep et</button><div id="s"></div></form></main><script>f.onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(f));s.textContent="Gönderiliyor…";google.script.run.withSuccessHandler(t=>{f.reset();s.textContent=t}).withFailureHandler(x=>s.textContent="Hata: "+x.message).randevuKaydet(o)}</script></body></html>';
`;
  async function bridgeRead() {
    const u = bridge2(); if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) throw Error('Köprü 2 kurulu değil (MERKEZ → Kurulum).');
    const d = await getJ(u + '?oku=' + encodeURIComponent(KEY()) + '&_=' + Date.now(), 20000);
    if (!d.ok) throw Error(d.error === 'anahtar' ? 'Köprü anahtarı eşleşmiyor — betiği MERKEZ’deki yeni koddan tekrar yapıştır.' : 'Köprü hatası');
    return d;
  }
  const seen = new Set(store.get('k2seen', []));
  async function poll(manual) {
    if (!bridge2()) return manual ? 'Köprü 2 kurulu değil.' : '';
    const d = await bridgeRead();
    const fresh = [...(d.wa || []).filter(m => !seen.has(m.id)), ...(d.rv || []).filter(m => !seen.has(m.id))];
    store.set('k2wa', d.wa || []); store.set('k2rv', d.rv || []);
    for (const m of fresh) {
      seen.add(m.id);
      if (m.from) inboxBubble(m); else rvBubble(m);
      if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(m.from ? `WhatsApp · ${m.ad || '+' + m.from}: ${short(m.metin, 120)}` : `Online randevu: ${m.ad} · ${m.tel} · ${m.sikayet || ''}`, { title: 'SATÜRN', tags: m.from ? 'speech_balloon' : 'calendar' })?.catch?.(() => {});
    }
    store.set('k2seen', [...seen].slice(-400)); renderHub();
    return `${(d.wa || []).length} WhatsApp mesajı, ${(d.rv || []).length} randevu talebi (yeni: ${fresh.length}).`;
  }
  setInterval(() => { if (bridge2() && !document.hidden) poll().catch(() => {}); }, 60000);
  setTimeout(() => { if (bridge2()) poll().catch(() => {}); }, 15000);

  /* ================= WhatsApp Cloud API (resmî) ================= */
  const waReady = () => !!(opt('waPhoneId') && opt('waToken'));
  const normTel = t => { let s = String(t || '').replace(/\D/g, ''); if (s.startsWith('0')) s = '90' + s.slice(1); if (s.length === 10 && s.startsWith('5')) s = '90' + s; return s; };
  async function waSend(to, text) {
    if (!waReady()) throw Error('WhatsApp Cloud API ayarlı değil (MERKEZ → WhatsApp). Şimdilik wa.me bağlantısıyla gönderebilirsin.');
    const r = await withTimeout(fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(opt('waPhoneId'))}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + opt('waToken'), 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: normTel(to), type: 'text', text: { body: String(text).slice(0, 4000) } }) }), 15000, 'WhatsApp yanıt vermedi');
    const d = await r.json().catch(() => ({}));
    if (d.error) throw Error('WhatsApp: ' + (d.error.code === 131047 ? '24 saat penceresi kapalı — hasta son 24 saatte yazmadıysa yalnız onaylı şablon gönderilebilir; wa.me bağlantısını kullan.' : d.error.message));
    const log = store.get('waSent', []); log.push({ to: normTel(to), text: short(text, 300), t: Date.now() }); store.set('waSent', log.slice(-100));
    return `WhatsApp mesajı gönderildi → +${normTel(to)}`;
  }
  const waLink = (to, text) => `https://wa.me/${normTel(to)}?text=${encodeURIComponent(text)}`;
  async function draftReply(m) {
    const slots = (() => { try { return TOOLS.bos_saat?.run(['yarın']) || ''; } catch { return ''; } })();
    const p = typeof findPatient === 'function' && m.ad ? findPatient(m.ad) : null;
    return ask(`Sen ${opt('brandName') || 'FİZYOVİTA'} fizik tedavi kliniğinin (Cizre) WhatsApp asistanısın; Fzt. Beyhan Erden adına yazıyorsun. Kısa, nazik, “siz” diliyle, en fazla 4 cümle. Tıbbi teşhis koyma; ağrı/acil belirti varsa kliniği aramasını veya acile başvurmasını söyle. Randevu isterse uygun saatlerden 2–3 seçenek sun. Fiyat sorulursa “seans ücretlerimiz için sizi arayalım” de. Yalnız mesaj metnini yaz.`,
      `Gelen mesaj (${m.ad || 'bilinmeyen'}${p ? ', kayıtlı hasta, tanı: ' + (p.tani || '-') : ''}): «${m.metin}»\nYarının boş saatleri: ${slots}`);
  }
  function inboxBubble(m) {
    const b = show(`📩 WhatsApp · ${m.ad || ''} (+${m.from}) · ${new Date(m.t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}\n«${m.metin}»`);
    const box = el('div', { class: 'tool' });
    const ta = el('textarea', { rows: 3, style: 'width:100%;margin-top:6px', placeholder: 'Yanıt…' });
    box.append(
      el('button', { type: 'button', onclick: async ev => { ev.target.disabled = true; ev.target.textContent = 'Yazıyorum…'; try { ta.value = await draftReply(m); } catch (e) { note(e.message); } ev.target.disabled = false; ev.target.textContent = '✍ Yanıt taslağı'; } }, '✍ Yanıt taslağı'),
      el('button', { type: 'button', class: 'yes', onclick: async () => { if (!ta.value.trim()) return note('Önce yanıtı yaz veya taslak al.'); try { note(await waSend(m.from, ta.value)); } catch (e) { note(e.message); window.open(waLink(m.from, ta.value), '_blank', 'noopener'); } } }, waReady() ? '➤ Gönder' : '➤ WhatsApp’ta aç'),
      el('button', { type: 'button', onclick: () => { saveItem({ kind: 'task', text: `${m.ad || '+' + m.from} WhatsApp: ${short(m.metin, 120)} — dönüş yap`, due: '' }); note('Görevlere eklendi.'); } }, '＋ Görev'), ta);
    b.el.append(box);
  }
  function rvBubble(r) {
    const b = show(`📅 ONLINE RANDEVU TALEBİ\n${r.ad} · ${r.tel}\nŞikâyet: ${r.sikayet || '-'}\nTercih: ${r.tarih || 'gün belirtilmedi'} · ${r.saat || ''}`);
    const msg = `Merhaba ${r.ad.split(' ')[0]}, FİZYOVİTA randevu talebiniz bize ulaştı. ${r.tarih ? r.tarih + ' ' : ''}için uygun saatimizi bildirmek istiyoruz; size hangi saat uyar?`;
    b.el.append(el('div', { class: 'tool' },
      el('button', { type: 'button', class: 'yes', onclick: () => { saveItem({ kind: 'task', text: `Randevu: ${r.ad} (${r.tel}) — ${r.sikayet || ''} · tercih ${r.tarih || '-'} ${r.saat || ''}`, due: r.tarih ? r.tarih + 'T10:00' : '' }); note('Randevu görevi eklendi (saati görevden düzenle).'); } }, '✓ Randevuya ekle'),
      el('button', { type: 'button', onclick: () => window.open(waLink(r.tel, msg), '_blank', 'noopener') }, '💬 WhatsApp yaz'),
      el('a', { class: 'btn ghost', href: 'tel:' + normTel(r.tel).replace(/^90/, '0') }, '📞 Ara')));
  }

  /* ================= Instagram yorumları (resmî Graph API) ================= */
  async function igComments() {
    const tok = opt('igToken'); if (!tok) throw Error('Instagram bağlı değil (SOSYAL → Instagram erişim anahtarı).');
    const get = async u => { const d = await getJ('https://graph.instagram.com/v22.0/' + u + (u.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(tok), 15000).catch(async e => { throw Error('Instagram: ' + e.message); }); if (d.error) throw Error('Instagram: ' + d.error.message); return d; };
    const media = (await get('me/media?fields=id,caption,timestamp,comments_count,permalink&limit=10')).data || [];
    const out = [];
    for (const m of media.filter(x => x.comments_count > 0).slice(0, 6)) {
      const c = (await get(`${m.id}/comments?fields=id,text,username,timestamp,replies{id}&limit=20`).catch(() => ({ data: [] }))).data || [];
      for (const x of c) out.push({ ...x, media: short(m.caption || '', 50), link: m.permalink, answered: !!x.replies?.data?.length });
    }
    return out;
  }
  async function igReply(id, text) {
    const r = await withTimeout(fetch(`https://graph.instagram.com/v22.0/${encodeURIComponent(id)}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: String(text).slice(0, 1000), access_token: opt('igToken') }) }), 15000, 'Instagram yanıt vermedi');
    const d = await r.json(); if (d.error) throw Error('Instagram: ' + d.error.message + (d.error.code === 10 || d.error.code === 200 ? ' (anahtarda instagram_business_manage_comments izni yok)' : '')); return 'Yorum yanıtlandı.';
  }

  /* ================= KRİPTO RADAR (0.1'den tarayıcıya taşındı: 20 kural, eşit ağırlık) ================= */
  const BN = 'https://data-api.binance.vision/api/v3', CG = 'https://api.coingecko.com/api/v3';
  const emaL = (xs, n) => { let v = xs[0]; for (const x of xs.slice(1)) v += 2 / (n + 1) * (x - v); return v; };
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length, pstd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  function analyze(rows) {
    const close = rows.map(r => +r[4]), vol = rows.map(r => +r[5]), high = rows.map(r => +r[2]), low = rows.map(r => +r[3]), p = close.at(-1);
    const ch = close.slice(-15).slice(1).map((b, i) => b - close.slice(-15)[i]); const g = ch.reduce((s, x) => s + Math.max(x, 0), 0), l = ch.reduce((s, x) => s + Math.max(-x, 0), 0);
    const rsi = g + l ? 100 * g / (g + l) : 50;
    const macd = []; for (let i = 35; i <= close.length; i++) macd.push(emaL(close.slice(0, i), 12) - emaL(close.slice(0, i), 26));
    const hist = macd.at(-1) - emaL(macd, 9), m20 = mean(close.slice(-20)), sd = pstd(close.slice(-20)), m50 = mean(close.slice(-50));
    const atr = mean(high.slice(-14).map((h, i) => { const lo = low.slice(-14)[i], c = close.slice(-15, -1)[i]; return Math.max(h - lo, Math.abs(h - c), Math.abs(lo - c)); }));
    const upv = close.slice(-20).reduce((s, b, i) => { const a = close.slice(-21)[i], v = vol.slice(-20)[i]; return s + (b > a ? v : b < a ? -v : 0); }, 0);
    const rr = Math.max(...high.slice(-14)) - Math.min(...low.slice(-14)), st = rr ? (p - Math.min(...low.slice(-14))) / rr : 0.5;
    const last = rows.at(-1);
    const votes = {
      'RSI': rsi > 50 && rsi < 72, 'MACD': hist > 0, 'EMA 12/26': emaL(close, 12) > emaL(close, 26), 'EMA 26/50': emaL(close, 26) > emaL(close, 50), 'SMA 20': p > m20, 'SMA 50': p > m50, 'SMA 20/50': m20 > m50,
      'Momentum 4s': p > close.at(-5), 'Momentum 24s': p > close.at(-25), 'Momentum 48s': p > close.at(-49), 'Hacim artışı': vol.at(-1) > mean(vol.slice(-21, -1)) && p > close.at(-2), 'OBV yönü': upv > 0,
      'Bollinger': m20 < p && p < m20 + 2 * sd, 'ATR filtresi': p > m20 && atr / p > 0 && atr / p < 0.04, 'Stokastik': st > 0.5 && st < 0.85, 'Direnç kırılımı': p > Math.max(...high.slice(-21, -1)),
      'Yükselen taban': Math.min(...low.slice(-5)) > Math.min(...low.slice(-10, -5)), 'Yükselen tepe': Math.max(...high.slice(-5)) > Math.max(...high.slice(-10, -5)),
      'Hacim ağırlıklı fiyat': p * vol.slice(-20).reduce((s, x) => s + x, 0) > close.slice(-20).reduce((s, c, i) => s + c * vol.slice(-20)[i], 0), 'Mum gövdesi': p > +last[1] && p - low.at(-1) > high.at(-1) - p
    };
    return { score: Object.values(votes).filter(Boolean).length, rsi: Math.round(rsi * 10) / 10, price: p, signals: Object.keys(votes).filter(k => votes[k]) };
  }
  let radarBusy = false;
  async function radarScan(status = () => {}) {
    if (radarBusy) throw Error('Tarama zaten sürüyor'); radarBusy = true;
    try {
      status('Binance piyasa listesi…');
      const [info, tick] = await Promise.all([getJ(BN + '/exchangeInfo?permissions=SPOT', 20000), getJ(BN + '/ticker/24hr?type=MINI', 20000)]);
      const elig = {}; for (const s of info.symbols || []) if (s.quoteAsset === 'USDT' && s.status === 'TRADING') elig[s.baseAsset] = s.symbol;
      const liq = Object.fromEntries(tick.map(t => [t.symbol, +t.quoteVolume]));
      status('CoinGecko ilk 200 + meme…');
      const base = '/coins/markets?vs_currency=usd&order=market_cap_desc&page=1';
      const major = await getJ(CG + base + '&per_page=200', 20000);
      let memes = []; try { memes = await getJ(CG + base + '&category=meme-token&per_page=100', 20000); } catch {}
      const cut = Date.now() - 365 * DAY;
      const durable = memes.filter(c => c.atl_date && Date.parse(c.atl_date) < cut && (c.total_volume || 0) >= 2e6).slice(0, 30);
      const uni = new Map(); for (const c of [...major, ...durable]) uni.set(c.id, c);
      const cnt = {}; for (const c of uni.values()) cnt[c.symbol] = (cnt[c.symbol] || 0) + 1;
      const list = [...uni.values()].filter(c => { const a = c.symbol.toUpperCase(), pr = elig[a]; return pr && !['BTC', 'ETH'].includes(a) && cnt[c.symbol] === 1 && (liq[pr] || 0) >= 2e6 && !/USD|EUR|TRY|DAI|FDUSD|PAXG/.test(a); });
      const picks = [], errors = []; let done = 0, i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => { while (i < list.length) { const c = list[i++]; const a = c.symbol.toUpperCase(), pr = elig[a];
        try { const rows = (await getJ(`${BN}/klines?symbol=${pr}&interval=1h&limit=101`, 12000)).filter(r => r[6] < Date.now()); if (rows.length < 60) continue; const r = analyze(rows); if (c.current_price && Math.abs(r.price / c.current_price - 1) > 0.15) continue; done++; if (r.score >= 14) picks.push({ ...r, token: a, name: c.name, pair: pr, liq: liq[pr] }); }
        catch (e) { errors.push(a + ': ' + e.message); }
        if (done % 15 === 0) status(`Analiz ${done}/${list.length}…`); } }));
      picks.sort((a, b) => b.score - a.score || b.liq - a.liq);
      const res = { t: Date.now(), major: major.length, meme: durable.length, analyzed: done, errors: errors.length, picks: picks.slice(0, 5) };
      store.set('radarLast', res); renderHub(); return res;
    } finally { radarBusy = false; }
  }
  const radarText = r => r ? `📡 KRİPTO RADAR · ${new Date(r.t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}\nEvren: ilk ${r.major} + ${r.meme} kalıcı meme · analiz edilen ${r.analyzed}${r.errors ? ' · ' + r.errors + ' hata' : ''}\n` +
    (r.picks.length ? r.picks.map((p, i) => `${i + 1}. ${p.token} (${p.name}) — ${p.score}/20 · ${p.price} $ · RSI ${p.rsi} · ${p.signals.slice(0, 6).join(', ')}`).join('\n') : '14/20 eşiğini geçen aday yok (piyasa zayıf).') +
    '\n20 bağımsız kural, eşit ağırlık, kapanmış saatlik mumlar. Puan olasılık değildir; emir verilmez. Bilgi amaçlıdır, yatırım tavsiyesi değildir.' : 'Henüz tarama yok.';
  // 0.1'deki takvim: pazartesi ve perşembe 09:00 (uygulama açıksa)
  setInterval(() => { const n = new Date(Date.now() + 3 * 3600000), d = n.getUTCDay(), h = n.getUTCHours(); const last = store.get('radarLast', null); if ((d === 1 || d === 4) && h >= 9 && h < 12 && (!last || Date.now() - last.t > 20 * 3600000) && !document.hidden && store.get('set.radarAuto', '1') === '1') radarScan().then(r => { show(radarText(r)); if (opt('ntfyOn') === '1' && r.picks.length) window.jarvisPushPhone?.('Kripto Radar: ' + r.picks.map(p => p.token + ' ' + p.score + '/20').join(', '), { title: 'SATÜRN' }); }).catch(() => {}); }, 10 * 60000);

  /* ================= Home Assistant: test + cihaz kartları ================= */
  async function haTest() {
    const base = opt('haUrl').replace(/\/$/, ''), tok = opt('haToken');
    if (!base || !tok) return 'Home Assistant adresi ve erişim anahtarı girilmemiş (MERKEZ → Akıllı ev).';
    if (location.protocol === 'https:' && base.startsWith('http:')) return '✗ Satürn https üzerinde; tarayıcı http adresine bağlanmaz. Home Assistant’a https gerekir (ör. Nabu Casa ya da DuckDNS + Let’s Encrypt eklentisi).';
    try { const r = await withTimeout(fetch(base + '/api/', { headers: { Authorization: 'Bearer ' + tok } }), 8000, 'zaman aşımı'); if (r.status === 401) return '✗ Erişim anahtarı geçersiz (HA → Profil → Uzun ömürlü erişim anahtarı oluştur).'; const d = await r.json(); return '✓ Bağlantı tamam: ' + (d.message || 'API çalışıyor'); }
    catch (e) { return `✗ Ulaşılamadı (${e.message}). En sık neden CORS: HA’nın configuration.yaml dosyasına şunu ekleyip yeniden başlat:\nhttp:\n  cors_allowed_origins:\n    - https://beyhanerden64-rgb.github.io\nAyrıca adres dışarıdan (https) erişilebilir olmalı.`; }
  }
  async function haDevices() { const all = await window.jarvisHA('states'); return all.filter(s => /^(light|switch|fan|climate|cover|scene|script)\./.test(s.entity_id)).slice(0, 24); }
  window.jarvisHA = (path, body) => (typeof ha === 'function' ? ha(path, body) : Promise.reject(Error('HA modülü yok')));

  /* ================= MERKEZ sekmesi ================= */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-hub', 'aria-selected': 'false', 'data-p': 'hub' }, 'MERKEZ');
  tabs.insertBefore(tb, tabs.firstChild?.nextSibling || null);
  const today = el('div', { class: 'muted' }), inbox = el('ul', { class: 'list' }), rvl = el('ul', { class: 'list' }), radarBox = el('pre', { class: 'muted', style: 'white-space:pre-wrap;font:inherit' }), haBox = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }), zoiBox = el('div', { class: 'muted' });
  const inp = (id, ph, type = 'text') => { const i = el('input', { id, placeholder: ph, type, autocomplete: 'off', spellcheck: 'false' }); i.value = store.get('set.' + id, ''); i.addEventListener('change', () => { store.set('set.' + id, i.value.trim()); renderHub(); }); return i; };
  const fld = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const btn = (t, fn, cls = 'btn') => el('button', { type: 'button', class: cls, onclick: fn }, t);
  const p = el('div', { class: 'pane', id: 'p-hub', role: 'tabpanel' },
    el('h3', {}, 'FİZYOVİTA · BUGÜN'), today,
    el('div', { class: 'row' }, btn('🏥 Klinik panosu', () => { $id('drawer')?.classList.remove('open'); typedTurn('klinik panosu', false); }), btn('📓 Gün günlüğü', () => { $id('drawer')?.classList.remove('open'); typedTurn('bugün ne yaptım', false); }, 'btn ghost')),
    el('h3', {}, 'GELEN KUTUSU · WHATSAPP'), inbox,
    el('h3', {}, 'ONLINE RANDEVU TALEPLERİ'), rvl,
    el('div', { class: 'row' }, btn('↻ Şimdi kontrol et', async () => { try { note(await poll(true)); } catch (e) { note(e.message); } }), btn('🔗 Randevu formu bağlantısı', () => { if (!bridge2()) return note('Önce köprüyü kur (aşağıda).'); show('Hastalarının randevu talep edeceği form:\n' + bridge2() + '\nBu bağlantıyı Instagram biyografine, Google İşletme profiline ve WhatsApp durumuna koyabilirsin.', [{ url: bridge2(), title: 'Randevu formunu aç' }]); }, 'btn ghost')),
    el('h3', {}, 'KRİPTO RADAR'), radarBox,
    el('div', { class: 'row' }, btn('📡 Radarı tara (1–2 dk)', async ev => { ev.target.disabled = true; try { const r = await radarScan(t => { ev.target.textContent = t; }); show(radarText(r)); } catch (e) { note(e.message); } ev.target.disabled = false; ev.target.textContent = '📡 Radarı tara (1–2 dk)'; })),
    el('h3', {}, 'AKILLI EV (Home Assistant)'), haBox,
    el('h3', {}, 'ZOİ · UZMAN AJANLAR'), zoiBox,
    el('div', { class: 'row' }, btn('🧠 Konseye sor', () => { const q = prompt('Konseye sorulacak zor karar (klinik/işletme):'); if (q) { $id('drawer')?.classList.remove('open'); typedTurn('konsey aracını kullan: ' + q, false); } }), btn('🎯 Tahmin isabeti', () => { $id('drawer')?.classList.remove('open'); typedTurn('ZOİ tahmin isabetim nasıl?', false); }, 'btn ghost')),
    el('details', {}, el('summary', {}, '⚙ Kurulum: WhatsApp, köprü, Instagram, akıllı ev'),
      el('p', { class: 'muted' }, 'A) KÖPRÜ 2 (gelen WhatsApp + online randevu formu, ücretsiz): script.google.com → Yeni proje → aşağıdaki kodu yapıştır → Dağıt → Yeni dağıtım → Web uygulaması, “Erişimi olan: Herkes” → URL’yi buraya yapıştır.'),
      el('div', { class: 'row' }, btn('📋 Köprü kodunu kopyala', async () => { try { await navigator.clipboard.writeText(SCRIPT()); note('Kod kopyalandı — script.google.com’a yapıştır.'); } catch { show(SCRIPT()); } }), el('a', { class: 'btn ghost', href: 'https://script.google.com/home/projects/create', target: '_blank', rel: 'noopener' }, 'script.google.com')),
      fld('bridge2Url', 'Köprü 2 adresi (…/exec)', inp('bridge2Url', 'https://script.google.com/macros/s/…/exec')),
      el('p', { class: 'muted' }, 'B) WHATSAPP CLOUD API (resmî; ayda 1.000 hizmet görüşmesi ücretsiz): developers.facebook.com → Uygulama oluştur → WhatsApp ekle → numaranı doğrula. “Phone number ID” ve kalıcı erişim anahtarını (Sistem kullanıcısı) yaz. Webhook: Callback URL = Köprü 2 adresi, Verify token = ' + ('saturn-' + KEY().slice(0, 6)) + ', “messages” alanına abone ol.'),
      fld('waPhoneId', 'Phone number ID', inp('waPhoneId', '1234567890…')), fld('waToken', 'Erişim anahtarı', inp('waToken', 'EAAG…', 'password')),
      el('p', { class: 'muted' }, 'C) INSTAGRAM: SOSYAL sekmesindeki erişim anahtarı yorumları okumak/yanıtlamak için instagram_business_manage_comments iznini içermeli.'),
      el('p', { class: 'muted' }, 'D) HOME ASSISTANT: adres https olmalı; configuration.yaml → http: cors_allowed_origins: - https://beyhanerden64-rgb.github.io'),
      fld('haUrl', 'Home Assistant adresi', inp('haUrl', 'https://evim.duckdns.org:8123')), fld('haToken', 'Uzun ömürlü erişim anahtarı', inp('haToken', 'eyJ…', 'password')),
      el('div', { class: 'row' }, btn('🔌 Akıllı evi test et', async () => note(await haTest())), el('label', { class: 'muted' }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = store.get('set.radarAuto', '1') === '1'; c.onchange = () => store.set('set.radarAuto', c.checked ? '1' : '0'); return c; })(), ' Kripto Radar pazartesi/perşembe 09:00 otomatik'))));
  p.hidden = true; $id('p-settings').before(p);
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(x => x.hidden = x.id !== 'p-hub'); renderHub(); };
  function renderHub() {
    if (p.hidden && document.readyState === 'complete') return;
    try {
      const P = typeof patients !== 'undefined' ? patients : [], d = isoLocal(now()).slice(0, 10), inDay = t => t && isoLocal(new Date(t)).slice(0, 10) === d;
      const ses = P.reduce((a, x) => a + (x.seanslar || []).filter(s => inDay(s.t)).length, 0), led = store.get('ledger', []).filter(x => x.d === d), g = led.filter(x => x.type === 'gelir').reduce((a, x) => a + x.amt, 0);
      const tasks = (typeof items !== 'undefined' ? items : []).filter(i => i.kind === 'task' && !i.done && (i.due || '').slice(0, 10) === d);
      today.textContent = `${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · seans ${ses} · kasa +${g.toLocaleString('tr-TR')} TL · bugünkü randevu/görev ${tasks.length}` + (tasks.length ? '\n' + tasks.slice(0, 6).map(t => '• ' + (t.due || '').slice(11, 16) + ' ' + short(t.text, 60)).join('\n') : '');
      today.style.whiteSpace = 'pre-wrap';
    } catch {}
    const wa = store.get('k2wa', []), rv = store.get('k2rv', []);
    inbox.replaceChildren(...(wa.length ? wa.slice(-8).reverse().map(m => el('li', { class: 'item' }, el('span', {}, '💬'), el('div', {}, el('p', {}, el('b', {}, m.ad || '+' + m.from), ' · ' + new Date(m.t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), el('small', {}, short(m.metin, 140))), btn('Yanıtla', () => { $id('drawer')?.classList.remove('open'); inboxBubble(m); }, 'btn ghost'))) : [el('li', { class: 'muted' }, bridge2() ? 'Gelen mesaj yok.' : 'Köprü 2 kurulunca WhatsApp mesajları burada görünür (aşağıda Kurulum).')]));
    rvl.replaceChildren(...(rv.length ? rv.slice(-8).reverse().map(r => el('li', { class: 'item' }, el('span', {}, '📅'), el('div', {}, el('p', {}, el('b', {}, r.ad), ' · ' + r.tel), el('small', {}, `${r.sikayet || ''} · ${r.tarih || ''} ${r.saat || ''}`)), btn('Aç', () => { $id('drawer')?.classList.remove('open'); rvBubble(r); }, 'btn ghost'))) : [el('li', { class: 'muted' }, 'Talep yok.')]));
    radarBox.textContent = radarText(store.get('radarLast', null));
    try { const z = TOOLS.tahmin_durum?.run([]); zoiBox.textContent = (typeof z === 'string' ? z : '') + ' · Uzman ajanlar: araştırma, matematik, finans, içerik, çeviri, kod, sağlık, planlama, klinik, denetçi + 3 uzmanlı konsey.'; } catch {}
    if (opt('haUrl') && opt('haToken') && !p.hidden) haDevices().then(list => haBox.replaceChildren(...list.map(s => btn(`${/^(on|open|heat|cool)$/.test(s.state) ? '🟢' : '⚪'} ${short(s.attributes?.friendly_name || s.entity_id, 22)}`, async () => { const dom = s.entity_id.split('.')[0]; const srv = dom === 'scene' || dom === 'script' ? 'turn_on' : dom === 'cover' ? (s.state === 'open' ? 'close_cover' : 'open_cover') : 'toggle'; try { await window.jarvisHA(`services/${dom}/${srv}`, { entity_id: s.entity_id }); setTimeout(renderHub, 800); } catch (e) { note(e.message); } }, 'btn ghost')))).catch(e => haBox.replaceChildren(el('small', { class: 'muted' }, 'Akıllı ev: ' + e.message)));
    else if (!opt('haUrl')) haBox.replaceChildren(el('small', { class: 'muted' }, 'Ayarlı değil — Kurulum’dan adres ve anahtar gir, “Akıllı evi test et”e bas.'));
  }

  /* ================= araçlar ================= */
  Object.assign(TOOLS, {
    whatsapp_gonder: { d: 'whatsapp_gonder|telefon|mesaj — resmî WhatsApp Cloud API ile mesaj gönderir (ayarlıysa; değilse wa.me bağlantısı verir)', risky: true, run: async ([to, ...t]) => { const text = t.join(' | '); if (!to || !text) throw Error('Biçim: whatsapp_gonder|telefon|mesaj'); if (!waReady()) { pendingLinks.push({ url: waLink(to, text), title: '💬 WhatsApp’ta aç' }); return 'WhatsApp Cloud API ayarlı değil; mesaj hazır, bağlantıya dokunup gönder.'; } return waSend(to, text); } },
    gelen_kutusu: { d: 'gelen_kutusu — WhatsApp’tan gelen son mesajlar ve online randevu talepleri (köprü 2)', run: async () => { await poll(true); const wa = store.get('k2wa', []), rv = store.get('k2rv', []); return `WHATSAPP (${wa.length}):\n${wa.slice(-10).map(m => `• ${m.ad || '+' + m.from}: ${short(m.metin, 120)}`).join('\n') || '-'}\nRANDEVU TALEPLERİ (${rv.length}):\n${rv.slice(-10).map(r => `• ${r.ad} ${r.tel} — ${r.sikayet || ''} (${r.tarih || '-'} ${r.saat || ''})`).join('\n') || '-'}`; } },
    instagram_yorumlar: { d: 'instagram_yorumlar — son gönderilere gelen Instagram yorumları (yanıtlanmamışlar işaretli)', run: async () => { const c = await igComments(); return c.length ? c.map(x => `${x.answered ? '✓' : '•'} @${x.username}: ${short(x.text, 120)} — gönderi: ${x.media} [id:${x.id}]`).join('\n') : 'Yorum yok.'; } },
    instagram_yanitla: { d: 'instagram_yanitla|yorum id|yanıt metni — Instagram yorumuna FİZYOVİTA hesabından yanıt yazar', risky: true, run: async ([id, ...t]) => igReply(id, t.join(' | ')) },
    kripto_radar: { d: 'kripto_radar|tara veya son — KRİPTO RADAR: CoinGecko ilk 200 + kalıcı meme, Binance saatlik mum, 20 kurallı puan (≥14/20 adaylar)', run: async ([a]) => /tara|yeni|simdi|şimdi/.test(fold(a || '')) || !store.get('radarLast', null) ? radarText(await radarScan(t => setPhase('thinking', t))) : radarText(store.get('radarLast', null)) },
    akilli_ev_test: { d: 'akilli_ev_test — Home Assistant bağlantısını test eder ve sorunu açıklar', run: () => haTest() }
  });
  TOOL_GROUPS.push([/whatsapp|mesaj gel|gelen kutu|randevu talep|online randevu|instagram yorum|yorumlar|kripto radar|radar|akıllı ev|akilli ev|home assistant/i, /^(whatsapp_gonder|gelen_kutusu|instagram_yorumlar|instagram_yanitla|kripto_radar|akilli_ev_test)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nMERKEZ: gelen WhatsApp/online randevu → gelen_kutusu; WhatsApp gönderme → whatsapp_gonder (onaylı; Cloud API ${waReady() ? 'AYARLI' : 'ayarlı değil → wa.me'}); Instagram yorumları → instagram_yorumlar / instagram_yanitla; Kripto Radar → kripto_radar; akıllı ev bağlantısı → akilli_ev_test.`;
  const _lc = localCommand;
  localCommand = t0 => {
    const f = fold(String(t0 || '')).replace(/[?!.]+$/, '').trim();
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    if (/^(gelen kutusu|gelen mesajlar|whatsapp mesajlari|randevu talepleri)$/.test(f)) { setTimeout(() => poll(true).then(note).catch(e => note(e.message)), 10); return '📩 Gelen kutusunu kontrol ediyorum…'; }
    if (/^(kripto radar|radari tara|kripto radari tara)$/.test(f)) { setTimeout(() => radarScan(t => setPhase('thinking', t)).then(r => { setPhase('idle', 'Hazırım.'); show(radarText(r)); }).catch(e => { setPhase('idle', 'Hazırım.'); note(e.message); }), 10); return '📡 Kripto Radar taranıyor (1–2 dk)…'; }
    if (/^(merkez|merkezi ac|paneli ac)$/.test(f)) { $id('drawer')?.classList.add('open'); tb.click(); return 'MERKEZ paneli açıldı.'; }
    return _lc(t0);
  };
  window.jarvisHub = { poll, waSend, radarScan, radarText, analyze, haTest, SCRIPT, renderHub, igComments };
  renderHub();
})();
