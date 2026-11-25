'use strict';
/* SATÜRN 27 — GÜNLÜK HAYAT (12 özellik)
 *  8) toplanti_kaydi   — uzun ses kaydı (görüşme, toplantı, ders) → 4 dk parçalarla yazıya döküm → özet, kararlar, yapılacaklar (görevlere ekle)
 *  9) belge_tara       — telefon kamerasıyla çok sayfalı belge tarayıcı → netleştirilmiş PDF (internet gerekmez)
 * 10) belge_cevir      — fotoğraf/PDF belgeyi (rapor, ilaç prospektüsü, resmi yazı) Türkçe/Arapça/Kürtçe/İngilizce'ye çevirir
 * 11) rota             — “Cizre’den Mardin’e” → mesafe, süre, kendi aracının tüketimine göre yakıt maliyeti, harita bağlantısı (OSRM)
 * 12) nakit_akisi      — 3 aylık nakit akışı projeksiyonu: ortalama gelir/gider, faturalar, tahsil edilecek alacaklar, uyarı
 * 13) vergi_takvimi    — serbest meslek/şahıs işletmesi vergi ve SGK tarihleri, sıradaki son gün; görev olarak ekleme
 * 14) sure_takibi      — ehliyet, pasaport, sigorta, araç muayenesi, cihaz kalibrasyonu, sözleşme bitişleri → 30/7/1 gün kala uyarı
 * 15) ilac_hatirlatici — kişi bazlı ilaç saatleri, saati gelince sesli + titreşimli uyarı, “aldım” kaydı ve uyum oranı
 * 16) namaz_hatirlatici— vakit girince (ya da X dk önce) uyarı; Cizre vakitleri (Diyanet yöntemi)
 * 17) hava_uyari       — önümüzdeki 12 saat için kuvvetli yağış, fırtına, aşırı sıcak/soğuk ve TOZ TAŞINIMI uyarısı (Open-Meteo)
 * 18) youtube_studyo   — video konusu → 5 başlık, SEO açıklama, etiketler, bölümler, küçük resim yazısı, 45 sn Shorts senaryosu
 * 19) indirilenler_duzenle — bilgisayarın İndirilenler klasörünü analiz eder: kopyalar, eski kurulum dosyaları, büyük dosyalar → onayla düzenler (silmez, taşır) */
(() => {
  const DAY = 86400000, show = t => { const b = bubble('ai', t); try { answerTools(b.el, t); } catch {} return b; };
  const ask = (s, u, tier = 'default', image) => { if (!window.jarvisResearch?.ask) throw Error('Yapay zekâ bağlı değil'); return window.jarvisResearch.ask(s, u, tier, false, image); };
  const getJ = async (u, ms = 12000, o) => { const r = await withTimeout(fetch(u, o), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
  const todayK = () => isoLocal(now()).slice(0, 10), hm = () => isoLocal(now()).slice(11, 16);
  const speakTR = t => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'tr-TR'; const v = speechSynthesis.getVoices().find(v => /^tr/i.test(v.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch {} };
  const alertUser = (msg, title = 'SATÜRN') => { note(msg); speakTR(msg.replace(/[^\p{L}\p{N}\s.,:]/gu, '')); try { navigator.vibrate?.([300, 120, 300]); } catch {} if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(msg, { title })?.catch?.(() => {}); };
  function overlay(title, ...kids) {
    document.querySelector('.satov')?.remove();
    const card = el('div', { class: 'sfcard', style: 'width:min(96vw,680px);max-height:92vh;overflow:auto' }, el('h4', {}, title), ...kids);
    const box = el('div', { class: 'camera skillform satov' }, card); const close = () => { box.remove(); box.onclose?.(); };
    card.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Kapat')));
    document.body.append(box); return { box, card, close };
  }
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  /* ================= 8) TOPLANTI / GÖRÜŞME KAYDI ================= */
  function meeting(kind = 'toplantı') {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return 'Bu tarayıcı ses kaydı desteklemiyor.';
    let stream, rec, parts = [], texts = [], t0 = 0, timer, stopped = false, busy = 0;
    const st = el('p', { style: 'font-size:1.3em;text-align:center' }, '⏺ Hazır'), log = el('pre', { class: 'muted', style: 'white-space:pre-wrap;font:inherit;max-height:30vh;overflow:auto' });
    const kSel = el('select', {}, ...['toplantı', 'hasta görüşmesi', 'ders / eğitim', 'telefon görüşmesi'].map(x => new Option(x, x))); kSel.value = kind;
    const startB = el('button', { type: 'button', class: 'btn', onclick: start }, '⏺ Kaydı başlat'), stopB = el('button', { type: 'button', class: 'btn', disabled: true, onclick: stop }, '⏹ Bitir ve özetle');
    const ov = overlay('🎙 Toplantı / görüşme kaydı', el('p', { class: 'muted' }, 'Kayıt 4 dakikalık parçalar hâlinde yazıya dökülür; uzun toplantılar için de uygundur. Hasta görüşmesi kaydediyorsan önce hastanın onayını al.'), kSel, st, el('div', { class: 'row', style: 'justify-content:center' }, startB, stopB), log);
    ov.box.onclose = () => { if (!stopped && rec) { stopped = true; try { rec.stop(); } catch {} stream?.getTracks().forEach(t => t.stop()); clearInterval(timer); } };
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
    async function transcribe(blob, i) {
      busy++; log.textContent += `\n[parça ${i + 1} yazıya dökülüyor…]`;
      try { const r = await api('/api/stt', { method: 'POST', body: JSON.stringify({ mimeType: blob.type || mime || 'audio/webm', data: await b64(blob) }) }); const d = await r.json().catch(() => ({})); texts[i] = d.text || `[parça ${i + 1} anlaşılamadı]`; }
      catch (e) { texts[i] = `[parça ${i + 1}: ${e.message}]`; }
      busy--; log.textContent = texts.filter(Boolean).join('\n');
    }
    function segment() { // her 4 dk yeni dosya: parçalar bağımsız çözülebilsin
      const i = parts.length; const chunks = []; const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      r.ondataavailable = e => e.data.size && chunks.push(e.data);
      r.onstop = () => { const blob = new Blob(chunks, { type: r.mimeType || mime }); parts[i] = blob; if (blob.size > 3000) transcribe(blob, i); if (!stopped) segment(); };
      r.start(); rec = r; setTimeout(() => { if (rec === r && r.state === 'recording') r.stop(); }, 240000);
    }
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return note('Mikrofon izni verilmedi.'); }
      t0 = Date.now(); startB.disabled = true; stopB.disabled = false; segment();
      timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); st.textContent = `⏺ Kayıt ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    }
    async function stop() {
      stopped = true; stopB.disabled = true; clearInterval(timer); try { rec?.stop(); } catch {} stream?.getTracks().forEach(t => t.stop());
      st.textContent = '⏳ Yazıya döküm tamamlanıyor…';
      for (let k = 0; k < 120 && (busy || texts.filter(x => x != null).length < parts.filter(p => p?.size > 3000).length); k++) await new Promise(r => setTimeout(r, 1000));
      const full = texts.filter(Boolean).join('\n').trim();
      if (!full) { st.textContent = 'Metin çıkmadı.'; return; }
      st.textContent = '🧠 Özetleniyor…';
      const dur = Math.round((Date.now() - t0) / 60000);
      let sum = '';
      try { sum = await ask(`Türkçe, net ve düzenli bir ${kSel.value} tutanağı yaz. Bölümler: ÖZET (3-5 madde), ALINAN KARARLAR, YAPILACAKLAR (her satır “- [kim] iş — son tarih varsa”), AÇIK SORULAR. ${kSel.value === 'hasta görüşmesi' ? 'Hasta görüşmesiyse ayrıca SOAP (S/O/A/P) bölümü ekle; tanı uydurma.' : ''} Metinde olmayan bilgi ekleme.`, `Süre ≈ ${dur} dk. Döküm:\n${full.slice(0, 60000)}`, 'default'); } catch (e) { sum = 'Özet alınamadı: ' + e.message; }
      ov.close();
      const id = saveItem({ kind: 'note', title: `${kSel.value} kaydı · ${new Date().toLocaleDateString('tr-TR')}`, text: (sum + '\n\n— DÖKÜM —\n' + full).slice(0, 4000) });
      const b = show(`🎙 ${kSel.value.toUpperCase()} TUTANAĞI (${dur} dk) — hafızaya kaydedildi\n\n${sum}`);
      const todos = (sum.split(/YAPILACAKLAR/i)[1] || '').split(/\n[A-ZÇĞİÖŞÜ ]{5,}:?\n|AÇIK SORULAR/i)[0].split('\n').map(l => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(l => l.length > 4).slice(0, 10);
      if (todos.length) b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: ev => { for (const t of todos) saveItem({ kind: 'task', text: t, due: '' }); ev.target.disabled = true; note(todos.length + ' yapılacak görevlere eklendi.'); } }, `＋ ${todos.length} yapılacağı görevlere ekle`)));
      void id;
    }
    return 'Kayıt penceresi açıldı.';
  }

  /* ================= 9) BELGE TARAYICI → PDF ================= */
  function pdfFromJpegs(pages) { // pages: [{data: Uint8Array (JPEG), w, h}]
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const N = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${N} >>`);
    pages.forEach((p, i) => { const pg = 3 + i * 3, im = pg + 1, ct = pg + 2, W = 595, H = Math.round(595 * p.h / p.w), cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
      obj(im, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`, p.data, '\nendstream']);
      obj(ct, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`); });
    const xref = len, n = 3 + N * 3;
    push(`xref\n0 ${n}\n0000000000 65535 f \n` + Array.from({ length: n - 1 }, (_, i) => String(offs[i + 1]).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }
  function scanner() {
    const pages = [], strip = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }), info = el('p', { class: 'muted' }, 'Belgeyi düz zemine koy, gölge yapmadan yukarıdan çek. Her sayfa otomatik netleştirilir (gri ton + kontrast).');
    const mode = el('select', {}, new Option('Belge (siyah-beyaz netleştir)', 'bw'), new Option('Renkli (fotoğraf/rapor)', 'color'));
    const f = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, style: 'display:none' });
    f.onchange = async () => { for (const file of f.files) { try { pages.push(await processPage(file, mode.value)); } catch (e) { note('Sayfa işlenemedi: ' + e.message); } } f.value = ''; paint(); };
    const paint = () => strip.replaceChildren(...pages.map((p, i) => el('div', { style: 'position:relative' }, el('img', { src: p.url, style: 'height:110px;border-radius:6px;border:1px solid #2a5566' }), el('button', { type: 'button', class: 'btn ghost', style: 'position:absolute;top:2px;right:2px;padding:0 6px', onclick: () => { pages.splice(i, 1); paint(); } }, '✕'))));
    const name = el('input', { placeholder: 'Dosya adı (ör. Ayşe Yılmaz MR raporu)' });
    const make = el('button', { type: 'button', class: 'btn', onclick: async () => {
      if (!pages.length) return note('Önce sayfa ekle.');
      const blob = pdfFromJpegs(pages), fn = (name.value.trim() || 'Tarama ' + todayK()).replace(/[\\/:*?"<>|]/g, '') + '.pdf', file = new File([blob], fn, { type: 'application/pdf' });
      try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: fn }); return; } } catch {}
      const a = el('a', { href: URL.createObjectURL(blob), download: fn }); document.body.append(a); a.click(); a.remove(); note(`📄 ${fn} indirildi (${pages.length} sayfa, ${(blob.size / 1024).toFixed(0)} KB).`);
    } }, '📄 PDF oluştur / paylaş');
    overlay('📷 Belge tarayıcı', info, mode, el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => f.click() }, '＋ Sayfa çek / ekle'), make), name, f, strip);
    return 'Belge tarayıcı açıldı.';
  }
  async function processPage(file, mode) {
    const img = await createImageBitmap(file), k = Math.min(1, 1654 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = el('canvas', { width: w, height: h }), x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    if (mode === 'bw') { const d = x.getImageData(0, 0, w, h), a = d.data; let lo = 255, hi = 0; const g = new Uint8Array(w * h);
      for (let i = 0; i < g.length; i++) { const v = 0.299 * a[i * 4] + 0.587 * a[i * 4 + 1] + 0.114 * a[i * 4 + 2]; g[i] = v; }
      const hist = new Uint32Array(256); for (const v of g) hist[v]++; let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > g.length * 0.02 && lo === 255) lo = v; if (acc > g.length * 0.9) { hi = v; break; } }
      const sc = 255 / Math.max(20, hi - lo); for (let i = 0; i < g.length; i++) { const v = Math.max(0, Math.min(255, (g[i] - lo) * sc)); a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = v; }
      x.putImageData(d, 0, 0); }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return { data: new Uint8Array(await blob.arrayBuffer()), w, h, url: URL.createObjectURL(blob), blob };
  }

  /* ================= 10) BELGE ÇEVİRİ ================= */
  function translator(langQ) {
    const L = el('select', {}, ...['Türkçe', 'Arapça', 'Kürtçe (Kurmancî)', 'İngilizce', 'Farsça', 'Almanca'].map(x => new Option(x, x))); if (langQ) { const m = [...L.options].find(o => fold(o.value).startsWith(fold(langQ).slice(0, 3))); if (m) L.value = m.value; }
    const f = el('input', { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }), st = el('p', { class: 'muted' }, 'Fotoğraf ya da PDF seç (en fazla ~15 MB).');
    f.onchange = async () => {
      const file = f.files?.[0]; if (!file) return; if (file.size > 15e6) return note('Dosya çok büyük (15 MB üstü).');
      st.textContent = '⏳ Okunuyor ve çevriliyor…';
      try {
        let data, mediaType = file.type;
        if (/^image\//.test(file.type)) { const p = await processPage(file, 'color'); data = await b64(p.blob); mediaType = 'image/jpeg'; } else data = await b64(file);
        const out = await ask(`Belge çevirmenisin. Belgedeki TÜM metni ${L.value} diline eksiksiz ve doğru çevir; başlık/madde/tablo düzenini koru, sayıları ve ilaç dozlarını aynen aktar. Okunamayan yeri [okunamadı] diye işaretle. En sona “ÖZET:” başlığıyla 3 maddelik ${L.value === 'Türkçe' ? 'Türkçe' : 'Türkçe'} özet ekle. Tıbbi belgeyse yorum katma.`, 'Belgeyi çevir.', 'default', { mediaType, data });
        overlayClose(); show(`🌐 ÇEVİRİ (${L.value}) · ${file.name}\n\n${out}`);
      } catch (e) { st.textContent = '✗ ' + e.message; }
    };
    const ov = overlay('🌐 Belge çevir', L, el('button', { type: 'button', class: 'btn', onclick: () => f.click() }, '📎 Fotoğraf / PDF seç'), f, st);
    const overlayClose = ov.close;
    return 'Belge çeviri penceresi açıldı.';
  }

  /* ================= 11) ROTA + YAKIT ================= */
  const geo = async q => { if (/^(burasi|buradan|konumum|bulundugum yer)$/.test(fold(q))) { const p = await new Promise((r, j) => navigator.geolocation.getCurrentPosition(x => r(x.coords), j, { timeout: 8000 })); return { lat: p.latitude, lon: p.longitude, name: 'bulunduğun yer' }; }
    const d = await getJ(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + (/turkiye|türkiye|irak|iraq|syria|suriye/i.test(q) ? '' : ', Türkiye'))}&format=json&limit=1&accept-language=tr`, 10000);
    if (!d[0]) throw Error(`“${q}” bulunamadı`); return { lat: +d[0].lat, lon: +d[0].lon, name: d[0].display_name.split(',').slice(0, 2).join(',') }; };
  function consumption() { const F = store.get('fuel', []).filter(x => x.litre > 0 && x.km > 0).sort((a, b) => a.km - b.km); let l100 = Number(opt('carL100')) || 0; if (!l100 && F.length >= 2) { const dist = F.at(-1).km - F[0].km, lit = F.slice(1).reduce((a, x) => a + x.litre, 0); if (dist > 100) l100 = lit / dist * 100; } const last = store.get('fuel', []).filter(x => x.litre > 0).at(-1); return { l100: l100 || 7, price: Number(opt('fuelPrice')) || (last ? last.tutar / last.litre : 0), measured: !!l100 }; }
  async function route(fromQ, toQ, back) {
    if (!toQ) throw Error('Biçim: rota|nereden|nereye (ör. rota|Cizre|Mardin)');
    const [a, b] = await Promise.all([geo(fromQ || 'Cizre'), geo(toQ)]);
    const r = await getJ(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`, 12000);
    const R = r.routes?.[0]; if (!R) throw Error('Yol bulunamadı');
    const km = R.distance / 1000 * (back ? 2 : 1), min = R.duration / 60 * (back ? 2 : 1), c = consumption(), lit = km * c.l100 / 100;
    pendingLinks.push({ url: `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=driving`, title: '🗺 Google Haritalar’da yol tarifi' });
    const arr = new Date(Date.now() + R.duration * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `🚗 ${a.name} → ${b.name}${back ? ' (gidiş-dönüş)' : ''}\nMesafe: ${km.toFixed(0)} km · süre ≈ ${Math.floor(min / 60)} sa ${Math.round(min % 60)} dk${back ? '' : ` · şimdi çıkarsan varış ≈ ${arr}`}\nYakıt: ≈ ${lit.toFixed(1)} L (${c.l100.toFixed(1)} L/100 km${c.measured ? ', kendi kayıtlarından' : ', varsayılan — “yakıt” kayıtları girince kesinleşir'})${c.price ? ` · ≈ ${tl(lit * c.price)} (${c.price.toFixed(2)} TL/L)` : ' · fiyat için yakıt kaydı gir'}\n(Trafik, yol çalışması ve köprü/otoyol ücretleri hariç; OSRM/OpenStreetMap.)`;
  }

  /* ================= 12) NAKİT AKIŞI ================= */
  function cashflow() {
    const led = store.get('ledger', []), months = {}; for (const x of led) { const m = x.d.slice(0, 7); (months[m] ||= { g: 0, c: 0 }); months[m][x.type === 'gelir' ? 'g' : 'c'] += x.amt; }
    const cur = todayK().slice(0, 7), past = Object.keys(months).filter(m => m < cur).sort().slice(-3);
    if (!past.length && !led.length) return 'Kasada kayıt yok; nakit akışı için birkaç ay gelir/gider girilmeli (“kasa gelir 1500 seans”).';
    const avg = k => past.length ? past.reduce((a, m) => a + months[m][k], 0) / past.length : (months[cur]?.[k] || 0);
    const bills = store.get('bills', []), billM = bills.reduce((a, b) => a + (Number(b.tutar) || 0), 0);
    const recv = store.get('receivables', []).map(r => r.tutar - (r.odenen || []).reduce((a, x) => a + x.amt, 0)).filter(v => v > 0), recvT = recv.reduce((a, b) => a + b, 0);
    const g = avg('g'), c = Math.max(avg('c'), billM);
    let bal = Number(opt('cashStart')) || 0; const rows = [];
    for (let i = 1; i <= 3; i++) { const d = new Date(); d.setMonth(d.getMonth() + i); const m = d.toISOString().slice(0, 7); const inn = g + (i === 1 ? recvT * 0.6 : i === 2 ? recvT * 0.25 : 0); bal += inn - c; rows.push(`• ${m}: giriş ≈ ${tl(inn)} · çıkış ≈ ${tl(c)} · net ${inn - c >= 0 ? '+' : ''}${tl(inn - c)}${opt('cashStart') ? ' · bakiye ≈ ' + tl(bal) : ''}`); }
    const warn = g < c ? '⚠ Ortalama gider geliri aşıyor: sabit giderleri gözden geçir, paket satışı ve alacak tahsilatını hızlandır.' : (g - c) / (g || 1) < 0.15 ? '⚠ Kâr marjı ince (%' + Math.round((g - c) / (g || 1) * 100) + '): 1 aylık gider kadar nakit tamponu hedefle.' : '✓ Gelir giderin üstünde.';
    return `💧 NAKİT AKIŞI · 3 aylık projeksiyon\nTemel: son ${past.length || 1} ay ortalaması — gelir ${tl(g)}, gider ${tl(avg('c'))}${billM ? `, kayıtlı faturalar ${tl(billM)}/ay` : ''}\nAçık alacak: ${tl(recvT)} (${recv.length} kalem; %60’ı gelecek ay, %25’i sonraki ay tahsil varsayıldı)\n${rows.join('\n')}\n${warn}${opt('cashStart') ? '' : '\n(Başlangıç kasa bakiyesini “nakit_akisi|bakiye|tutar” ile girersen ay sonu bakiyesini de hesaplarım.)'}`;
  }

  /* ================= 13) VERGİ TAKVİMİ ================= */
  function taxDates(from = new Date()) {
    const y = from.getFullYear(), L = [];
    const add = (d, t, n) => L.push({ d, t, n });
    for (let yy = y; yy <= y + 1; yy++) for (let m = 0; m < 12; m++) {
      const ym = (mm, dd) => new Date(yy, mm, dd), last = new Date(yy, m + 1, 0).getDate();
      add(ym(m, 26), 'Muhtasar ve Prim Hizmet Beyannamesi (MUHSGK)', 'çalışanın/kira stopajın varsa; beyan ve ödeme');
      add(ym(m, 28), 'KDV beyannamesi ve ödemesi', 'KDV mükellefiysen (önceki ay)');
      add(ym(m, last), 'Bağ-Kur (4/b) primi', 'SGK prim ödemesi — son gün');
    }
    for (const yy of [y, y + 1]) {
      add(new Date(yy, 2, 31), 'Yıllık gelir vergisi beyanı + 1. taksit', 'önceki yılın kazancı (1–31 Mart)');
      add(new Date(yy, 6, 31), 'Gelir vergisi 2. taksit', 'Temmuz sonu');
      add(new Date(yy, 4, 17), 'Geçici vergi 1. dönem (Ocak–Mart)', 'beyan ve ödeme');
      add(new Date(yy, 7, 17), 'Geçici vergi 2. dönem (Nisan–Haziran)', 'beyan ve ödeme');
      add(new Date(yy, 10, 17), 'Geçici vergi 3. dönem (Temmuz–Eylül)', 'beyan ve ödeme');
      add(new Date(yy, 0, 31), 'Motorlu taşıtlar vergisi 1. taksit', 'Ocak sonu'); add(new Date(yy, 6, 31), 'Motorlu taşıtlar vergisi 2. taksit', 'Temmuz sonu');
    }
    const t0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    return L.map(x => { const d = new Date(x.d); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return { ...x, d }; }).filter(x => x.d >= t0).sort((a, b) => a.d - b.d);
  }
  function taxTool([op]) {
    const L = taxDates(), next = L.slice(0, 8), fmt = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
    if (/ekle|gorev/.test(fold(op || ''))) { let n = 0; for (const x of L.filter(x => x.d - Date.now() < 45 * DAY)) { const key = x.t + x.d.toISOString().slice(0, 10); if ((store.get('taxAdded', [])).includes(key)) continue; saveItem({ kind: 'task', text: `🧾 ${x.t} — son gün`, due: isoLocal(new Date(x.d.getTime() - DAY)).slice(0, 10) + 'T10:00' }); store.set('taxAdded', [...store.get('taxAdded', []), key].slice(-100)); n++; } return `${n} vergi/SGK tarihi görevlere eklendi (son günden 1 gün önce hatırlatır).`; }
    const left = d => Math.round((d - new Date(todayK())) / DAY);
    return `🧾 VERGİ & SGK TAKVİMİ (sıradaki)\n${next.map(x => `• ${fmt(x.d)} (${left(x.d) === 0 ? 'BUGÜN' : left(x.d) + ' gün'}) — ${x.t} · ${x.n}`).join('\n')}\nHafta sonuna denk gelen son gün ilk iş gününe kayar. Genel takvimdir; mükellefiyet türünü ve güncel tarihleri muhasebecinle doğrula. “vergi takvimini görevlere ekle” dersen hatırlatırım.`;
  }

  /* ================= 14) SÜRE TAKİBİ ================= */
  const terms = () => store.get('terms', []);
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDateTR = s => { const t = fold(String(s || '')).trim(); const M = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik']; let m;
    if ((m = t.match(/^(\d{4})-(\d\d)-(\d\d)/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/))) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    if ((m = t.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/)) && M.findIndex(x => m[2].startsWith(x.slice(0, 3))) >= 0) { const mi = M.findIndex(x => m[2].startsWith(x.slice(0, 3))); const y = +m[3] || new Date().getFullYear(); let d = new Date(y, mi, +m[1]); if (!m[3] && d < new Date()) d = new Date(y + 1, mi, +m[1]); return d; }
    return null; };
  function termTool([op, ad, tarih, kat]) {
    const o = fold(op || 'liste'), T = terms();
    if (/^ekle/.test(o)) { const d = parseDateTR(tarih); if (!ad || !d) throw Error('Biçim: sure_takibi|ekle|ad (ör. trafik sigortası)|tarih (12 Mart 2027 veya 12.03.2027)|kategori'); T.push({ id: 's' + Date.now(), ad, d: ymd(d), kat: kat || '' }); store.set('terms', T); return `📌 ${ad}: ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} — 30, 7 ve 1 gün kala hatırlatacağım.`; }
    if (/^sil/.test(o)) { const n = T.length; store.set('terms', T.filter(x => !fold(x.ad).includes(fold(ad || '§')))); return n - terms().length ? 'Silindi.' : 'Bulunamadı.'; }
    if (/^yenile/.test(o)) { const x = T.find(x => fold(x.ad).includes(fold(ad || '§'))); const d = parseDateTR(tarih); if (!x || !d) throw Error('Biçim: sure_takibi|yenile|ad|yeni tarih'); x.d = ymd(d); x.uyari = []; store.set('terms', T); return `${x.ad} yeni bitiş: ${x.d}`; }
    if (!T.length) return 'Takipte süre yok. Örnek: “trafik sigortası 12 Mart 2027’de bitiyor”, “araç muayenesi 05.06.2027”, “TENS cihazı kalibrasyonu 1 Şubat”.';
    return '📌 SÜRE TAKİBİ\n' + T.slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => { const l = Math.round((new Date(x.d + 'T12:00:00') - new Date(todayK() + 'T12:00:00')) / DAY); return `${l < 0 ? '⛔' : l <= 30 ? '⚠' : '•'} ${x.ad}: ${new Date(x.d + 'T12:00:00').toLocaleDateString('tr-TR')} (${l < 0 ? Math.abs(l) + ' gün GEÇTİ' : l + ' gün kaldı'})`; }).join('\n');
  }
  function termCheck() { const T = terms(); let ch = false; for (const x of T) { const l = Math.round((new Date(x.d + 'T12:00:00') - new Date(todayK() + 'T12:00:00')) / DAY); for (const k of [30, 7, 1, 0]) if (l <= k && l >= 0 && !(x.uyari ||= []).includes(k)) { x.uyari.push(k); ch = true; alertUser(`📌 ${x.ad} ${l === 0 ? 'BUGÜN bitiyor' : l + ' gün sonra bitiyor'} (${new Date(x.d + 'T12:00:00').toLocaleDateString('tr-TR')}).`); break; } } if (ch) store.set('terms', T); }

  /* ================= 15) İLAÇ HATIRLATICI ================= */
  const meds = () => store.get('meds', []), medLog = () => store.get('medLog', []);
  function medTool([op, ad, saat, kisi, gun]) {
    const o = fold(op || 'liste'), M = meds();
    if (/^ekle/.test(o)) { const times = String(saat || '').match(/\d{1,2}[:.]\d{2}/g)?.map(x => x.replace('.', ':').padStart(5, '0')); if (!ad || !times?.length) throw Error('Biçim: ilac_hatirlatici|ekle|ilaç adı|saatler (08:00, 20:00)|kimin için|kaç gün (boş: sürekli)'); M.push({ id: 'm' + Date.now(), ad, times, kisi: kisi || 'Beyhan', bitis: parseInt(gun, 10) ? new Date(Date.now() + parseInt(gun, 10) * DAY).toISOString().slice(0, 10) : '' }); store.set('meds', M); return `💊 ${ad} (${kisi || 'Beyhan'}): her gün ${times.join(', ')}${gun ? ', ' + gun + ' gün' : ''}. Saati gelince sesli hatırlatırım (uygulama açıkken; telefona bildirim ayarlıysa oraya da).`; }
    if (/^sil/.test(o)) { store.set('meds', M.filter(x => !fold(x.ad).includes(fold(ad || '§')))); return 'Silindi.'; }
    if (/^aldi|^aldim/.test(o)) { const x = M.find(x => fold(x.ad).includes(fold(ad || ''))) || M[0]; if (!x) return 'Kayıtlı ilaç yok.'; const L = medLog(); L.push({ id: x.id, t: Date.now() }); store.set('medLog', L.slice(-500)); return `✓ ${x.ad} alındı olarak işaretlendi.`; }
    if (/^rapor|uyum/.test(o)) { const L = medLog(); return M.map(x => { const due = x.times.length * 7, took = L.filter(l => l.id === x.id && l.t > Date.now() - 7 * DAY).length; return `• ${x.ad} (${x.kisi}): son 7 gün ${took}/${due} doz · uyum %${Math.min(100, Math.round(took / due * 100))}`; }).join('\n') || 'Kayıtlı ilaç yok.'; }
    return M.length ? '💊 İLAÇLAR\n' + M.map(x => `• ${x.ad} — ${x.kisi} · ${x.times.join(', ')}${x.bitis ? ' · bitiş ' + x.bitis : ''}`).join('\n') : 'Kayıtlı ilaç yok. Örnek: “annem için tansiyon ilacı her gün 09:00 ve 21:00 hatırlat”.';
  }
  function medCheck() {
    const M = meds(), t = hm(), d = todayK(), fired = store.get('medFired', {});
    let keep = M.filter(x => !x.bitis || x.bitis >= d); if (keep.length !== M.length) store.set('meds', keep);
    for (const x of keep) for (const tm of x.times) { const key = x.id + d + tm; if (t >= tm && t <= addMin(tm, 15) && !fired[key]) { fired[key] = 1; const b = bubble('ai', `💊 İlaç saati: ${x.ad}${x.kisi && x.kisi !== 'Beyhan' ? ' (' + x.kisi + ')' : ''} — ${tm}`); b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: ev => { note(medTool(['aldim', x.ad])); ev.target.disabled = true; } }, '✓ Aldım'))); alertUser(`İlaç saati: ${x.ad}${x.kisi && x.kisi !== 'Beyhan' ? ', ' + x.kisi : ''}`); } }
    store.set('medFired', Object.fromEntries(Object.entries(fired).filter(([k]) => k.includes(d))));
  }
  const addMin = (tm, m) => { const [h, mi] = tm.split(':').map(Number), x = h * 60 + mi + m; return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

  /* ================= 16) NAMAZ HATIRLATICI ================= */
  async function prayerTimes() { const c = store.get('prayCache', null); if (c?.d === todayK()) return c.v; const s = String(await TOOLS.namaz.run(['Cizre'])); const v = {}; for (const [k, re] of [['İmsak', /İmsak\s*(\d\d:\d\d)/], ['Öğle', /Öğle\s*(\d\d:\d\d)/], ['İkindi', /İkindi\s*(\d\d:\d\d)/], ['Akşam', /Akşam\s*(\d\d:\d\d)/], ['Yatsı', /Yatsı\s*(\d\d:\d\d)/]]) { const m = s.match(re); if (m) v[k] = m[1]; } if (Object.keys(v).length >= 4) store.set('prayCache', { d: todayK(), v }); return v; }
  async function prayCheck() { const c = store.get('prayAlarm', null); if (!c?.on) return; const v = await prayerTimes(), t = hm(), d = todayK(), fired = store.get('prayFired', {}); for (const [k, tm] of Object.entries(v)) { if (!(c.vakitler || []).length || c.vakitler.includes(k)) { const at = addMin(tm, -(c.once || 0)); if (t >= at && t <= addMin(at, 10) && !fired[d + k]) { fired[d + k] = 1; alertUser(`🕌 ${k} vakti ${c.once ? c.once + ' dakika sonra (' + tm + ')' : 'girdi (' + tm + ')'}.`, 'Namaz vakti'); } } } store.set('prayFired', Object.fromEntries(Object.entries(fired).filter(([k]) => k.startsWith(d)))); }
  function prayTool([op, once, vakit]) { const o = fold(op || 'durum'); if (/^ac|^kur|^baslat/.test(o)) { const v = vakit ? String(vakit).split(/[ ,]+/).map(x => ({ imsak: 'İmsak', ogle: 'Öğle', ikindi: 'İkindi', aksam: 'Akşam', yatsi: 'Yatsı' })[fold(x)]).filter(Boolean) : []; store.set('prayAlarm', { on: true, once: parseInt(once, 10) || 0, vakitler: v }); prayCheck().catch(() => {}); return `🕌 Namaz hatırlatıcısı açık: ${v.length ? v.join(', ') : 'beş vakit'}${parseInt(once, 10) ? ', ' + parseInt(once, 10) + ' dk önce' : ', vakit girince'}.`; } if (/^kapat/.test(o)) { store.set('prayAlarm', { on: false }); return 'Namaz hatırlatıcısı kapatıldı.'; } return prayerTimes().then(v => `Namaz hatırlatıcısı ${store.get('prayAlarm', {})?.on ? 'AÇIK' : 'KAPALI'}. Bugün: ${Object.entries(v).map(([k, t]) => k + ' ' + t).join(' · ')}`); }

  /* ================= 17) HAVA UYARISI ================= */
  async function weatherCheck(manual) {
    const c = store.get('wxAlarm', { on: false }); if (!c.on && !manual) return '';
    const [lat, lon] = [37.33, 42.19];
    const [f, aq] = await Promise.all([getJ(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation,wind_gusts_10m,temperature_2m,weather_code&forecast_hours=12&timezone=Europe%2FIstanbul`, 12000), getJ(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=dust,pm10&forecast_hours=12&timezone=Europe%2FIstanbul`, 12000).catch(() => null)]);
    const H = f.hourly, out = [], at = i => H.time[i].slice(11, 16);
    const rainI = H.precipitation.findIndex((p, i) => p >= 2 || (H.precipitation_probability[i] >= 70 && p >= 0.5)); if (rainI >= 0) out.push(['yagis', `🌧 Yağış bekleniyor: ${at(rainI)} civarı (${H.precipitation[rainI]} mm, olasılık %${H.precipitation_probability[rainI]}) — şemsiye al.`]);
    if (H.weather_code.some(w => w >= 95)) out.push(['firtina', `⛈ Gök gürültülü fırtına olasılığı (${at(H.weather_code.findIndex(w => w >= 95))}).`]);
    const g = Math.max(...H.wind_gusts_10m); if (g >= 50) out.push(['ruzgar', `💨 Kuvvetli rüzgâr: ${Math.round(g)} km/s’ye varan hamleler.`]);
    const tx = Math.max(...H.temperature_2m), tn = Math.min(...H.temperature_2m); if (tx >= 40) out.push(['sicak', `🔥 Aşırı sıcak: ${Math.round(tx)}°C — öğle saatlerinde dışarı çıkma, bol su iç.`]); if (tn <= -2) out.push(['don', `🧊 Don/buzlanma: ${Math.round(tn)}°C — yollar kayabilir.`]);
    if (aq?.hourly) { const dmax = Math.max(...aq.hourly.dust.filter(x => x != null)), pm = Math.max(...aq.hourly.pm10.filter(x => x != null)); if (dmax >= 100 || pm >= 150) out.push(['toz', `🌫 Toz taşınımı: toz ${Math.round(dmax)} µg/m³, PM10 ${Math.round(pm)} µg/m³ — astım/KOAH hastaları ve yaşlılar dışarıda maske kullansın, pencere kapalı.`]); }
    const d = todayK(), fired = store.get('wxFired', {}); const fresh = out.filter(([k]) => !fired[d + k]);
    if (!manual) { for (const [k, m] of fresh) { fired[d + k] = 1; alertUser(m, 'Hava uyarısı'); } store.set('wxFired', Object.fromEntries(Object.entries(fired).filter(([k]) => k.startsWith(d)))); }
    return out.length ? '⚠ CİZRE · önümüzdeki 12 saat\n' + out.map(x => x[1]).join('\n') : `✓ Cizre’de önümüzdeki 12 saat için olağan dışı hava yok (${Math.round(tn)}–${Math.round(tx)}°C, en güçlü rüzgâr ${Math.round(g)} km/s).`;
  }

  /* ================= 18) YOUTUBE STÜDYOSU ================= */
  async function ytStudio(topic, fmt) {
    if (!topic) throw Error('Biçim: youtube_studyo|video konusu|shorts veya uzun');
    let stats = ''; try { stats = String(await TOOLS.youtube.run(['durum'])).slice(0, 1500); } catch {}
    return '🎬 YOUTUBE STÜDYOSU\n' + await ask('Türk YouTube içerik stratejistisin. Kanal: Beyhan Erden (fizyoterapist; bilim/uzay Shorts ve FİZYOVİTA sağlık içerikleri). Sağlık konusunda yanıltıcı/abartılı vaat yok, “tanı koymaz, doktora danışın” notu açıklamada olsun. Çıktı bölümleri: 1) 5 BAŞLIK seçeneği (≤60 karakter, merak + anahtar kelime; en iyisini ★ ile işaretle) 2) AÇIKLAMA (ilk 2 satır kancalı, anahtar kelimeli, 120-200 kelime, sonda harekete çağrı + FİZYOVİTA Cizre) 3) ETİKETLER (15, virgülle) 4) BÖLÜMLER (uzun videoysa 00:00 zaman damgalı) 5) KÜÇÜK RESİM YAZISI (2-4 kelime, 3 seçenek) + görsel kompozisyon önerisi 6) 45 SN SHORTS SENARYOSU (0-3 sn kanca, saniye saniye, ekran yazısı) 7) SABİT YORUM 8) EN İYİ YAYIN SAATİ ve gerekçe.', `Konu: ${topic}\nBiçim: ${fmt || 'uzun video + Shorts'}\nKanal verisi: ${stats || 'yok'}`, 'default');
  }

  /* ================= 19) İNDİRİLENLER DÜZENLEYİCİ (bilgisayar yardımcısı) ================= */
  // analiz salt okunur; düzenle/geri al “risky” araçtır → Satürn önce onay sorar
  async function dlTool([op]) {
    if (typeof pcCall !== 'function') throw Error('Bilgisayar yardımcısı modülü yok');
    const d = await pcCall('klasor_analiz', ['indirilenler'], false); return d.text + '\n\nUygulamak için: “indirilenleri düzenle” (onay ister; hiçbir dosya SİLİNMEZ, türlerine göre klasörlere taşınır, kopyalar “_Kopyalar”a alınır; “indirilenleri geri al” ile eski hâline döner).';
  }

  /* ================= zamanlayıcı döngüleri ================= */
  setInterval(() => { try { medCheck(); } catch {} prayCheck().catch(() => {}); }, 30000);
  setInterval(() => { try { termCheck(); } catch {} }, 30 * 60000); setTimeout(() => { try { termCheck(); } catch {} }, 25000);
  setInterval(() => { if (!document.hidden) weatherCheck().catch(() => {}); }, 60 * 60000); setTimeout(() => weatherCheck().catch(() => {}), 30000);

  Object.assign(TOOLS, {
    toplanti_kaydi: { d: 'toplanti_kaydi|toplantı/hasta görüşmesi/ders — uzun ses kaydı → yazıya döküm → özet, kararlar, yapılacaklar (görevlere eklenebilir)', run: ([k]) => meeting(k ? (/hasta/.test(fold(k)) ? 'hasta görüşmesi' : /ders|egitim/.test(fold(k)) ? 'ders / eğitim' : /telefon/.test(fold(k)) ? 'telefon görüşmesi' : 'toplantı') : 'toplantı') },
    belge_tara: { d: 'belge_tara — kamerayla çok sayfalı belge tarar, netleştirir, PDF yapar (internet gerekmez)', run: () => scanner() },
    belge_cevir: { d: 'belge_cevir|hedef dil (Türkçe/Arapça/Kürtçe/İngilizce/Farsça) — fotoğraf veya PDF belgeyi çevirir ve özetler', run: ([l]) => translator(l) },
    rota: { d: 'rota|nereden (boş: Cizre; “buradan” = konum)|nereye|gidiş-dönüş — mesafe, süre, kendi tüketimine göre yakıt litresi ve maliyeti, harita bağlantısı', run: ([a, b, c]) => route(a, b, /donus|dönüş|gidis/.test(fold(c || ''))) },
    nakit_akisi: { d: 'nakit_akisi · nakit_akisi|bakiye|tutar — 3 aylık nakit akışı projeksiyonu (kasa ortalaması, faturalar, açık alacaklar)', run: ([op, v]) => { if (/bakiye/.test(fold(op || ''))) { store.set('set.cashStart', String(Number(String(v).replace(/\./g, '').replace(',', '.')) || 0)); } return cashflow(); } },
    vergi_takvimi: { d: 'vergi_takvimi · vergi_takvimi|gorevlere ekle — serbest meslek/şahıs işletmesi vergi ve SGK son günleri', run: a => taxTool(a) },
    sure_takibi: { d: 'sure_takibi|ekle|ad|bitiş tarihi|kategori · sure_takibi|liste · sure_takibi|yenile|ad|yeni tarih · sure_takibi|sil|ad — ehliyet, pasaport, sigorta, muayene, kalibrasyon, sözleşme bitişleri (30/7/1 gün uyarı)', run: a => termTool(a) },
    ilac_hatirlatici: { d: 'ilac_hatirlatici|ekle|ilaç|saatler (08:00, 20:00)|kimin için|kaç gün · ilac_hatirlatici|liste · ilac_hatirlatici|aldim|ilaç · ilac_hatirlatici|rapor · ilac_hatirlatici|sil|ilaç', run: a => medTool(a) },
    namaz_hatirlatici: { d: 'namaz_hatirlatici|ac|kaç dk önce (0)|vakitler (boş: beş vakit) · namaz_hatirlatici|kapat · namaz_hatirlatici|durum', run: a => prayTool(a) },
    hava_uyari: { d: 'hava_uyari|ac veya kapat veya simdi — Cizre için 12 saatlik kuvvetli yağış, fırtına, rüzgâr, aşırı sıcak/soğuk ve toz taşınımı uyarısı', run: async ([op]) => { const o = fold(op || 'simdi'); if (/^ac/.test(o)) { store.set('wxAlarm', { on: true }); return '🌦 Hava uyarısı açık (saatte bir kontrol).\n' + await weatherCheck(true); } if (/^kapat/.test(o)) { store.set('wxAlarm', { on: false }); return 'Hava uyarısı kapatıldı.'; } return weatherCheck(true); } },
    youtube_studyo: { d: 'youtube_studyo|video konusu|shorts veya uzun — başlıklar, SEO açıklama, etiketler, bölümler, küçük resim yazısı, Shorts senaryosu, yayın saati', run: ([t, f]) => ytStudio(t, f) },
    indirilenler_analiz: { d: 'indirilenler_analiz — bilgisayarın İndirilenler klasörü: türlere göre dağılım, kopyalar, eski kurulum dosyaları, büyük dosyalar', run: a => dlTool(a) },
    indirilenler_duzenle: { d: 'indirilenler_duzenle — İndirilenler’i türlerine göre klasörlere taşır, kopyaları _Kopyalar’a alır (SİLMEZ, onay ister)', risky: true, run: async () => (await pcCall('klasor_duzenle', ['indirilenler'], true)).text },
    indirilenler_geri_al: { d: 'indirilenler_geri_al — son İndirilenler düzenlemesini geri alır (onay ister)', risky: true, run: async () => (await pcCall('klasor_geri_al', ['indirilenler'], true)).text }
  });
  for (const k of ['sure_takibi', 'ilac_hatirlatici', 'nakit_akisi']) WRITE_TOOLS.add(k);
  TOOL_GROUPS.push([/kayıt|kayit|toplantı|toplanti|görüşme|gorusme|tara|pdf|çevir|cevir|rota|yol|mesafe|kaç saat|kac saat|nakit|vergi|sgk|bağ-kur|bagkur|beyanname|süre|sure|bitiyor|sigorta|muayene|ilaç|ilac|namaz|ezan|hava|toz|youtube|video|indirilenler|indirilenleri/i, /^(toplanti_kaydi|belge_tara|belge_cevir|rota|nakit_akisi|vergi_takvimi|sure_takibi|ilac_hatirlatici|namaz_hatirlatici|hava_uyari|youtube_studyo|indirilenler_analiz|indirilenler_duzenle|indirilenler_geri_al)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÜNLÜK 27: toplantı/görüşme kaydı → toplanti_kaydi; belge tarayıp PDF → belge_tara; belge çeviri → belge_cevir; yol/mesafe/yakıt → rota; nakit projeksiyonu → nakit_akisi; vergi/SGK son günleri → vergi_takvimi; belge/sigorta bitiş tarihi → sure_takibi; ilaç saati → ilac_hatirlatici; ezan/namaz hatırlatma → namaz_hatirlatici; hava/toz uyarısı → hava_uyari; YouTube video paketi → youtube_studyo; bilgisayarda indirilenleri incele → indirilenler_analiz, toparla → indirilenler_duzenle, geri al → indirilenler_geri_al.';
  const _lc = localCommand;
  const later = (fn, msg) => { setTimeout(async () => { try { const t = await fn(); if (t) show(t); } catch (e) { note(e.message); } }, 10); return msg; };
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let m;
    if (/^(toplanti kaydi|toplantiyi kaydet|gorusmeyi kaydet|kaydi baslat|ses kaydi baslat)/.test(f)) return meeting(/hasta/.test(f) ? 'hasta görüşmesi' : 'toplantı');
    if (/^(belge tara|tarayici|pdf tara|belgeyi tara|tarama yap)$/.test(f)) return scanner();
    if ((m = f.match(/^belge (?:cevir|tercume)\s*(.*)$/))) return translator(m[1]);
    if ((m = t.match(/^(.{2,30}?)['’]?(?:den|dan|ten|tan)\s+(.{2,30}?)['’]?(?:e|a|ye|ya)\s*(?:ne kadar|kaç km|kac km|kaç saat|kac saat|yol|rota|gidiş|mesafe)(?:\s+.*)?$/i))) return later(() => route(m[1], m[2], /dönüş|donus/i.test(t)), '🚗 Rotayı hesaplıyorum…');
    if (/^(nakit akisi|nakit akisim|nakit projeksiyonu)$/.test(f)) return cashflow();
    if (/^(vergi takvimi|vergi tarihleri|beyanname tarihleri|vergi son gunleri)$/.test(f)) return taxTool([]);
    if (/^vergi takvimini gorevlere ekle$/.test(f)) return taxTool(['ekle']);
    if ((m = t.match(/^(.{3,40}?)\s+(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}\s+\p{L}+(?:\s+\d{4})?)['’]?(?:de|da|te|ta)?\s+(?:bitiyor|doluyor|sona eriyor|yenilenecek)$/iu))) { try { return termTool(['ekle', m[1], m[2]]); } catch (e) { return e.message; } }
    if (/^(sure takibi|bitecek belgeler|suresi dolacaklar)$/.test(f)) return termTool(['liste']);
    if ((m = t.match(/^(?:(.{2,20}?)\s+için\s+)?(.{2,40}?)\s+(?:ilacı|ilacini|ilacını|hapı|hapini)?\s*(?:her gün\s+)?((?:\d{1,2}[:.]\d{2}(?:\s*(?:,|ve)\s*)?)+)\s*(?:da|de|ta|te)?\s+hatırlat$/i))) { try { return medTool(['ekle', m[2].replace(/\s+(ilacı|hapı)$/i, ''), m[3], m[1] || 'Beyhan']); } catch (e) { return e.message; } }
    if (/^(ilaclarim|ilac listesi)$/.test(f)) return medTool(['liste']);
    if ((m = f.match(/^namaz (?:hatirlaticisini|vakitlerini hatirlat|hatirlatici)\s*(ac|kapat)?$/))) return later(() => prayTool([m[1] || 'ac']), '🕌 Namaz hatırlatıcısı ayarlanıyor…');
    if ((m = f.match(/^hava (?:uyarisi|uyarisini|uyarilari|uyarilarini)\s*(ac|kapat)?$/))) return later(() => TOOLS.hava_uyari.run([m[1] || 'simdi']), '🌦 Hava kontrol ediliyor…');
    if (/^(toz var mi|toz tasinimi var mi|bugun yagmur yagacak mi)$/.test(f)) return later(() => weatherCheck(true), '🌦 Bakıyorum…');
    if ((m = t.match(/^youtube (?:stüdyo|studyo|paketi|videosu)\s*[:-]?\s*(.+)$/i))) return later(() => ytStudio(m[1]), '🎬 Video paketi hazırlanıyor…');
    if (/^(indirilenleri analiz et|indirilenler klasorunu analiz et)$/.test(f)) return later(() => dlTool(['analiz']), '🗂 İndirilenler analiz ediliyor…');
    return _lc(t0);
  };
  window.jarvisGunluk27 = { meeting, scanner, pdfFromJpegs, processPage, translator, route, cashflow, taxDates, taxTool, termTool, parseDateTR, medTool, medCheck, prayTool, prayerTimes, weatherCheck, ytStudio, dlTool };
})();
