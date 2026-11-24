'use strict';
/* SATÜRN 4.1 — listedeki ücretsiz kalan özellikler: 26 uzman ajan, belge bilgi tabanı (PDF/metin), geri bildirimden öğrenme,
 * ZOİ zaman-olasılık motoru, klinik randevu/program/kasa/envanter, kripto backtest/portföy/emir defteri, site izleme,
 * ağ teşhisi, bağlantı güvenlik kontrolü, kamera, panel özelleştirme, otonomi/deneme modu, bütçe ve performans metrikleri,
 * yarım kalan görevi sürdürme, veri saklama süresi, düşük güç modu. hud.js'ten sonra yüklenir. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const sel = (id, opts) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); return s; };
  const bindSetting = (id, onChange) => { const v = store.get('set.' + id, null), n = $(id); if (v !== null) n.value = v; n.addEventListener('change', () => { store.set('set.' + id, n.value); onChange?.(); }); };
  const day = () => isoLocal(now()).slice(0, 10);

  /* ================= 1) uzman ajanlar: 10 → 26 ================= */
  Object.assign(AGENTS, {
    strateji: ['Strateji', 'Karar ve strateji ajanısın. Seçenekleri, olası senaryoları (iyimser/olası/kötümser) olasılıklarıyla, karşı-olgusal (“ya şöyle olsaydı”) sonuçları ve gerekiyorsa oyun teorisi açısından tarafların teşviklerini değerlendir. Belirsizliği açıkça yaz, net bir öneri ve gerekçesini ver.', false],
    veri: ['Veri analizi', 'Veri analizi ajanısın. Verilen sayısal veriyi özetle, eğilim ve aykırı değerleri bul, uygun istatistiği seç, sonuçların güvenilirliğini belirt.', false],
    ekonomi: ['Ekonomi', 'Ekonomi araştırma ajanısın. Türkiye ve dünya makro verilerini (enflasyon, faiz, kur, büyüme) güncel kaynaklarla yorumla; tarih ve kaynak belirt.', true],
    haber: ['Haber', 'Medya ve haber ajanısın. Güncel haberleri birden çok kaynaktan karşılaştır, doğrulanmamış iddiaları işaretle, tarafsız kısa bülten yaz.', true],
    gorsel: ['Görsel tasarım', 'Görsel tasarım ajanısın. Sosyal medya görseli, afiş veya infografik için yerleşim, renk, başlık metni ve görsel üretim istemleri (prompt) hazırla.', false],
    video: ['Video', 'Video üretim ajanısın. Reels/YouTube için sahne sahne senaryo, çekim listesi, altyazı, kapak metni ve süre planı hazırla.', false],
    eposta: ['İletişim', 'E-posta ve iletişim ajanısın. Kısa, nazik, net Türkçe mesaj/e-posta taslakları yaz; gönderme, yalnızca taslak ver.', false],
    guvenlik: ['Siber güvenlik', 'Siber güvenlik savunma ajanısın. Şüpheli bağlantı, e-posta, dosya veya ayarları değerlendir; riskleri ve korunma adımlarını sırala. Saldırı tekniği öğretme.', false],
    sistem: ['Sistem', 'Sistem performans ajanısın. Verilen CPU, RAM, disk, süreç ve hata günlüğü verilerinden sorunları teşhis et, güvenli çözüm adımları öner.', false],
    dogrulama: ['Doğrulama', 'Veri doğrulama ajanısın. Verilen iddiaları güvenilir kaynaklarla kontrol et; doğru/yanlış/doğrulanamadı olarak işaretle ve kaynak yaz.', true],
    hafiza: ['Hafıza', 'Hafıza yönetim ajanısın. Verilen notları ve hafıza kayıtlarını tekrarları birleştirerek düzenle, çelişkileri ve eskimiş bilgileri işaretle.', false],
    ev: ['Akıllı ev', 'Akıllı ev ajanısın. Home Assistant için otomasyon fikirleri, sabah/gece rutinleri ve enerji tasarrufu önerileri hazırla (YAML örneğiyle).', false],
    kod_inceleme: ['Kod inceleme', 'Kod inceleme ajanısın. Hataları, güvenlik açıklarını, okunabilirlik ve performans sorunlarını önem sırasıyla listele, düzeltme öner.', false],
    hata_ayiklama: ['Hata ayıklama', 'Hata ayıklama ajanısın. Hata mesajı ve koddan kök nedeni bul, adım adım düzeltme ve doğrulama yöntemi ver.', false],
    test: ['Test', 'Otomatik test ajanısın. Verilen kod veya özellik için birim, entegrasyon ve arayüz test senaryoları yaz.', false],
    egitim: ['Hasta eğitimi', 'Hasta eğitimi ajanısın. Fizyoterapi hastası için sade, cesaretlendirici, yazdırılabilir bilgilendirme metni yaz; tıbbi tanı koyma.', false]
  });

  /* ================= 2) belge bilgi tabanı: PDF, metin, CSV ================= */
  $('file').accept = 'image/*,.pdf,.txt,.md,.csv,.json';
  $('attach').title = 'Fotoğraf veya belge ekle (PDF, metin, CSV)';
  $('file').onchange = async () => {
    const f = $('file').files[0]; $('file').value = ''; if (!f) return;
    if (f.type.startsWith('image/')) return setImage(f, f.name);
    if (f.size > 5e6) return note('Dosya çok büyük (5 MB sınırı). PDF ise sayfaları bölerek ekle.');
    const op = logOp('belge', [f.name], 'beklemede');
    try {
      let text;
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        if (server.provider !== 'gemini') throw Error('PDF okuma Gemini ile çalışır');
        note('PDF okunuyor: ' + f.name + ' …');
        const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'default', system: 'Belge okuyucusun. Belgenin metnini olduğu gibi çıkar (en fazla 15000 karakter), en başa 5 maddelik Türkçe özet koy. Başka yorum ekleme.', messages: [{ role: 'user', content: 'Bu PDF belgesini oku.' }], image: { mediaType: 'application/pdf', data: await blobToBase64(f) } }) });
        if (!r.ok) throw Error('PDF okunamadı (' + r.status + ')');
        text = (await r.text()).split('\u0000')[0].trim();
      } else text = await f.text();
      if (!text) throw Error('Belge boş');
      saveItem({ kind: 'doc', title: f.name, text: text.slice(0, 20000), src: 'belge' });
      updateOp(op, 'başarılı', `${f.name} bilgi tabanına eklendi (${text.length} karakter)`);
      renderDocs();
      note(`“${f.name}” bilgi tabanına eklendi. Artık bu belge hakkında soru sorabilirsin.`);
      $('prompt').value = `“${f.name}” belgesini özetle ve önemli noktaları söyle.`; autosize();
    } catch (e) { updateOp(op, 'başarısız', e.message); note('Belge eklenemedi: ' + e.message); }
  };
  // app.js keeps only 4000 chars per item; documents need more.
  const _save = saveItem;
  saveItem = i => { if (i.kind !== 'doc') return _save(i); const id = i.id || uid('d'); const clean = { id, kind: 'doc', title: String(i.title || 'Belge').slice(0, 120), text: String(i.text).slice(0, 20000), due: '', done: false, created: i.created || Date.now(), src: 'belge' }; items = items.filter(x => x.id !== id).concat(clean); persist(); return id; };
  function renderDocs() {
    const box = $('docList'); if (!box) return;
    const docs = items.filter(i => i.kind === 'doc');
    box.replaceChildren(...docs.map(d => el('li', {}, el('details', {}, el('summary', {}, '📄 ' + d.title + ' ', el('small', { class: 'muted' }, dateTR(d.created) + ' · ' + d.text.length + ' kr')), el('p', { class: 'doctext' }, short(d.text, 1500)),
      el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { $('drawer').classList.remove('open'); typedTurn(`“${d.title}” belgesine göre şunu yanıtla: `, false); } }, 'Soru sor'), el('button', { type: 'button', onclick: () => { removeItem(d.id); renderDocs(); } }, 'Sil'))))));
    $('docEmpty').hidden = docs.length > 0;
  }
  $('p-memory').append(el('h3', {}, 'BELGELER · BİLGİ TABANI'), el('p', { class: 'muted' }, 'Ataç düğmesiyle PDF, metin veya CSV ekle; SATÜRN sorularını bu belgelere göre yanıtlar (hafiza_ara).'), el('ul', { class: 'list', id: 'docList' }), el('p', { class: 'muted', id: 'docEmpty' }, 'Belge yok.'),
    el('h3', {}, 'GERİ BİLDİRİMLERİM'), el('p', { class: 'muted' }, 'Bir yanıtı 👎 ile işaretleyip neyin yanlış olduğunu yazarsan SATÜRN bundan sonra buna uyar.'), el('ul', { class: 'list', id: 'lessonList' }));
  // a doc's full text is searchable by hafiza_ara through searchItems (items list)
  const _search = TOOLS.hafiza_ara.run;
  TOOLS.hafiza_ara.run = ([q]) => {
    const base = _search([q]);
    const words = fold(q).split(/\s+/).filter(w => w.length > 2);
    const hits = items.filter(i => i.kind === 'doc').flatMap(d => { const t = d.text, ft = fold(t); return words.filter(w => ft.includes(w)).slice(0, 2).map(w => { const k = ft.indexOf(w); return `[belge: ${d.title}] …${t.slice(Math.max(0, k - 300), k + 600)}…`; }); }).slice(0, 4);
    return [base, ...hits].filter(Boolean).join('\n');
  };

  /* ================= 3) geri bildirimden öğrenme (👍 / 👎) ================= */
  const _tools = answerTools;
  answerTools = (elm, text) => {
    _tools(elm, text);
    const bar = elm.querySelector('.tool:last-child'); if (!bar) return;
    const up = el('button', { type: 'button', title: 'İyi yanıt' }, '👍'), down = el('button', { type: 'button', title: 'Kötü yanıt; neyin yanlış olduğunu yaz' }, '👎');
    up.onclick = () => { logOp('geri bildirim', ['👍'], 'başarılı', short(text, 80)); up.disabled = down.disabled = true; store.set('fbUp', store.get('fbUp', 0) + 1); renderMetrics(); };
    down.onclick = () => { const w = prompt('Neyi yanlış yaptım? Bundan sonra nasıl yapayım?'); if (!w) return; saveItem({ kind: 'lesson', text: w.trim() + ' (yanıt: “' + short(text, 80) + '”)' }); up.disabled = down.disabled = true; store.set('fbDown', store.get('fbDown', 0) + 1); note('Teşekkürler, bundan sonra buna dikkat edeceğim.'); renderLessons(); renderMetrics(); };
    bar.append(up, down);
  };
  function renderLessons() {
    const box = $('lessonList'); if (!box) return;
    box.replaceChildren(...items.filter(i => i.kind === 'lesson').map(l => el('li', { class: 'item' }, el('span', {}, '✎'), el('div', {}, el('p', {}, l.text)), el('button', { type: 'button', class: 'x', 'aria-label': 'Sil', onclick: () => { removeItem(l.id); renderLessons(); } }, '×'))));
  }

  /* ================= 4) ZOİ: zaman-olasılık tahmin motoru (ölçülebilir) ================= */
  let preds = store.get('preds', []);
  const savePreds = () => { store.set('preds', preds); renderZoi(); };
  const brier = list => list.length ? list.reduce((s, p) => s + (p.p - (p.outcome ? 1 : 0)) ** 2, 0) / list.length : NaN;
  function zoiStats() {
    const done = preds.filter(p => p.outcome !== undefined && p.outcome !== null);
    const b = brier(done);
    const buckets = [[0, 0.33], [0.33, 0.66], [0.66, 1.01]].map(([lo, hi]) => { const g = done.filter(p => p.p >= lo && p.p < hi); return { lo, hi, n: g.length, rate: g.length ? g.filter(p => p.outcome).length / g.length : NaN, avg: g.length ? g.reduce((s, p) => s + p.p, 0) / g.length : NaN }; });
    return { n: preds.length, resolved: done.length, brier: b, buckets, open: preds.filter(p => p.outcome == null) };
  }
  function renderZoi() {
    const box = $('zoiList'); if (!box) return;
    const st = zoiStats();
    $('zoiStats').textContent = st.resolved ? `Çözülen ${st.resolved}/${st.n} · Brier skoru ${st.brier.toFixed(3)} (0 = kusursuz, 0.25 = yazı-tura) · ` + st.buckets.filter(b => b.n).map(b => `%${Math.round(b.avg * 100)} tahminlerde gerçekleşme %${Math.round(b.rate * 100)} (n=${b.n})`).join(' · ') : `${st.n} tahmin · henüz sonuçlanan yok`;
    box.replaceChildren(...preds.slice().reverse().map(p => el('li', { class: 'pred' + (p.outcome == null ? '' : p.outcome ? ' yes' : ' no') },
      el('div', {}, el('b', {}, '%' + Math.round(p.p * 100)), ' ' + p.text), el('small', { class: 'muted' }, `${dateTR(p.t)} → hedef ${p.due || '—'}${p.outcome == null ? (p.due && p.due < day() ? ' · SÜRESİ GEÇTİ, sonucu gir' : '') : p.outcome ? ' · GERÇEKLEŞTİ' : ' · GERÇEKLEŞMEDİ'}`),
      p.outcome == null ? el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { p.outcome = true; p.resolvedT = Date.now(); savePreds(); } }, 'Gerçekleşti'), el('button', { type: 'button', onclick: () => { p.outcome = false; p.resolvedT = Date.now(); savePreds(); } }, 'Gerçekleşmedi'), el('button', { type: 'button', onclick: () => { const v = prompt('Yeni olasılık (0-100)', Math.round(p.p * 100)); if (v !== null && +v >= 0 && +v <= 100) { (p.history ||= []).push({ t: Date.now(), p: p.p }); p.p = +v / 100; savePreds(); } } }, 'Olasılığı güncelle'), el('button', { type: 'button', onclick: () => { preds = preds.filter(x => x !== p); savePreds(); } }, 'Sil')) : null)));
  }
  Object.assign(TOOLS, {
    tahmin: { d: 'tahmin|olay|olasılık 0-100|hedef tarih YYYY-MM-DD — ZOİ motoruna ölçülebilir tahmin kaydeder', run: ([t, p, d]) => { const v = Number(String(p).replace('%', '')) / 100; if (!t || !(v >= 0 && v <= 1)) throw Error('Olay ve 0-100 arası olasılık gerekli'); preds.push({ id: uid('z'), t: Date.now(), text: t, p: v, due: d || '' }); savePreds(); return `Tahmin kaydedildi: %${Math.round(v * 100)} · ${t}`; } },
    tahmin_durum: { d: 'tahmin_durum — ZOİ tahmin isabeti (Brier skoru, kalibrasyon) ve açık tahminler', run: () => { const s = zoiStats(); return `Toplam ${s.n}, çözülen ${s.resolved}, Brier ${isNaN(s.brier) ? '-' : s.brier.toFixed(3)}. Açık: ` + s.open.map(p => `%${Math.round(p.p * 100)} ${p.text} (${p.due || 'tarihsiz'})`).join('; '); } },
    tahmin_sonuc: { d: 'tahmin_sonuc|tahmin metninden bir parça|evet/hayır — tahminin sonucunu işler', run: ([q, r]) => { const p = preds.find(x => x.outcome == null && fold(x.text).includes(fold(q))); if (!p) throw Error('Açık tahmin bulunamadı'); p.outcome = /^(evet|e|true|1|gerçekleşti)/i.test(fold(r)); p.resolvedT = Date.now(); savePreds(); return 'Sonuç işlendi. ' + TOOLS.tahmin_durum.run([]); } }
  });

  /* ================= 5) klinik: randevular, eksik programlar, kasa, envanter ================= */
  let ledger = store.get('ledger', []), stock = store.get('stock', []);
  const saveLedger = () => { store.set('ledger', ledger); renderKasa(); }, saveStock = () => { store.set('stock', stock); renderStock(); };
  const tl = n => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' TL';
  function monthSum(m = day().slice(0, 7)) { const e = ledger.filter(x => x.d.startsWith(m)); const g = e.filter(x => x.type === 'gelir').reduce((s, x) => s + x.amt, 0), c = e.filter(x => x.type === 'gider').reduce((s, x) => s + x.amt, 0); return { m, g, c, net: g - c, n: e.length }; }
  Object.assign(TOOLS, {
    randevular: { d: 'randevular|YYYY-MM-DD veya bugün/yarın — o günün randevu ve görevleri, ilgili hastaların durumu', run: ([d]) => {
      const target = !d || /bug[uü]n/i.test(d) ? day() : /yar[ıi]n/i.test(d) ? isoLocal(new Date(Date.now() + 86400000)).slice(0, 10) : d.slice(0, 10);
      const list = items.filter(i => i.kind === 'task' && (i.due || '').startsWith(target)).sort((a, b) => a.due.localeCompare(b.due));
      if (!list.length) return target + ': randevu/görev yok.';
      return target + ':\n' + list.map(i => { const p = patients.find(x => fold(i.text).includes(fold(x.ad.split(' ')[0])) && fold(i.text).includes(fold(x.ad.split(' ').at(-1)))); return `- ${i.due.slice(11, 16) || 'gün boyu'} ${i.text}${i.done ? ' (tamamlandı)' : ''}${p ? ' → hasta: ' + patientSummary(p) : ''}`; }).join('\n');
    } },
    eksik_program: { d: 'eksik_program — ev egzersiz programı olmayan veya ev programına uymayan hastalar', run: () => { const a = patients.filter(p => !p.program), b = patients.filter(p => p.seanslar?.at(-1)?.uyum === 'uymadı'); return `Programı olmayan (${a.length}): ${a.map(p => aiName(p) + (p.tani ? ' – ' + p.tani : '')).join(', ') || 'yok'}\nEv programına uymayan (${b.length}): ${b.map(aiName).join(', ') || 'yok'}`; } },
    program_kaydet: { d: 'program_kaydet|hasta adı|program metni — hastanın ev egzersiz programını kaydeder', run: ([q, t]) => { const p = findPatient(q); if (!p) throw Error('Hasta bulunamadı: ' + q); if (!t) throw Error('Program metni boş'); p.program = String(t).slice(0, 8000); p.programT = Date.now(); savePatients(); return 'Program kaydedildi: ' + initials(p.ad); } },
    kasa: { d: 'kasa|gelir veya gider|tutar|açıklama — klinik gelir/gider kaydı', run: ([t, a, desc = '']) => { const amt = Number(String(a).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')); if (!/^(gelir|gider)$/.test(fold(t)) || !(amt > 0)) throw Error('Biçim: kasa|gelir veya gider|tutar|açıklama'); ledger.push({ id: uid('k'), d: day(), type: fold(t), amt, desc }); saveLedger(); const s = monthSum(); return `Kaydedildi. Bu ay: gelir ${tl(s.g)}, gider ${tl(s.c)}, net ${tl(s.net)}.`; } },
    kasa_ozet: { d: 'kasa_ozet|YYYY-MM (boş: bu ay) — aylık gelir, gider, net ve en büyük kalemler', run: ([m]) => { const s = monthSum(m || undefined); const top = ledger.filter(x => x.d.startsWith(s.m) && x.type === 'gider').sort((a, b) => b.amt - a.amt).slice(0, 5); return `${s.m}: gelir ${tl(s.g)}, gider ${tl(s.c)}, net ${tl(s.net)} (${s.n} kayıt). En büyük giderler: ${top.map(x => x.desc + ' ' + tl(x.amt)).join(', ') || '-'}`; } },
    envanter: { d: 'envanter|malzeme|adet (+/- ile değişim)|en az adet — malzeme/ekipman stoğu', run: ([n, q, min]) => { if (!n) return stock.map(s => `${s.n}: ${s.q}${s.q <= s.min ? ' (AZALDI)' : ''}`).join('\n') || 'Envanter boş.'; let s = stock.find(x => fold(x.n) === fold(n)); if (!s) { s = { n, q: 0, min: 0 }; stock.push(s); } const v = String(q || '0'); s.q = /^[+-]/.test(v) ? s.q + Number(v) : Number(v); if (min) s.min = Number(min); saveStock(); return `${s.n}: ${s.q} adet${s.q <= s.min ? ' — en az seviyenin altında, sipariş ver' : ''}.`; } }
  });
  function renderKasa() {
    const s = monthSum(); $('kasaSum').textContent = `${s.m} · gelir ${tl(s.g)} · gider ${tl(s.c)} · net ${tl(s.net)}`;
    $('kasaList').replaceChildren(...ledger.slice(-12).reverse().map(x => el('li', { class: 'item' }, el('span', {}, x.type === 'gelir' ? '▲' : '▼'), el('div', {}, el('p', {}, `${tl(x.amt)} · ${x.desc || '-'}`), el('small', {}, x.d)), el('button', { type: 'button', class: 'x', 'aria-label': 'Sil', onclick: () => { ledger = ledger.filter(y => y !== x); saveLedger(); } }, '×'))));
  }
  function renderStock() {
    $('stockList').replaceChildren(...stock.map(x => el('li', { class: 'item' + (x.q <= x.min ? ' late' : '') }, el('span', {}, '▪'), el('div', {}, el('p', {}, `${x.n}: ${x.q} adet`), el('small', {}, x.q <= x.min ? 'AZALDI · en az ' + x.min : 'en az ' + x.min)),
      el('button', { type: 'button', class: 'x', 'aria-label': 'Bir azalt', onclick: () => { x.q = Math.max(0, x.q - 1); saveStock(); } }, '−'))));
  }
  const kasaForm = el('form', { class: 'add pat-add' }, sel('kType', [['gelir', 'Gelir'], ['gider', 'Gider']]), el('input', { id: 'kAmt', placeholder: 'Tutar (TL)', inputmode: 'decimal', 'aria-label': 'Tutar' }), el('input', { id: 'kDesc', placeholder: 'Açıklama (ör. seans, kira)', 'aria-label': 'Açıklama' }), el('button', {}, 'Kaydet'));
  kasaForm.onsubmit = e => { e.preventDefault(); try { TOOLS.kasa.run([$('kType').value, $('kAmt').value, $('kDesc').value]); kasaForm.reset(); } catch (er) { note(er.message); } };
  const stockForm = el('form', { class: 'add pat-add' }, el('input', { id: 'sName', placeholder: 'Malzeme (ör. kinesio bant)', 'aria-label': 'Malzeme' }), el('input', { id: 'sQty', placeholder: 'Adet', inputmode: 'numeric', 'aria-label': 'Adet' }), el('input', { id: 'sMin', placeholder: 'En az', inputmode: 'numeric', 'aria-label': 'En az adet' }), el('button', {}, 'Ekle / güncelle'));
  stockForm.onsubmit = e => { e.preventDefault(); if ($('sName').value.trim()) { TOOLS.envanter.run([$('sName').value.trim(), $('sQty').value || '0', $('sMin').value || '0']); stockForm.reset(); } };
  $('p-clinic').append(el('h3', {}, 'KASA (GELİR · GİDER)'), el('div', { class: 'muted', id: 'kasaSum' }), kasaForm, el('ul', { class: 'list', id: 'kasaList' }),
    el('h3', {}, 'MALZEME · EKİPMAN ENVANTERİ'), stockForm, el('ul', { class: 'list', id: 'stockList' }));
  renderKasa(); renderStock();

  /* ================= 6) kripto: risk puanı, emir defteri, backtest, sanal portföy ================= */
  const kl = async (s, n = 500) => { const sym = String(s || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '') + 'USDT'; const r = await withTimeout(fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=1d&limit=${n}`), 12000, 'Borsa verisi zaman aşımı'); if (!r.ok) throw Error(sym + ' bulunamadı'); const k = await r.json().catch(() => null); if (!Array.isArray(k) || k.length < 35) throw Error(sym + ' için borsa verisi alınamadı (Binance geçici olarak yanıt vermiyor olabilir)'); return { sym, k }; };
  let pf = store.get('portfolio', { cash: 10000, pos: {}, trades: [] });
  Object.assign(TOOLS, {
    kripto_risk: { d: 'kripto_risk|BTC — risk puanı (0-100), maksimum düşüş, emir defteri dengesizliği', run: async ([s]) => {
      const { sym, k } = await kl(s, 365); const c = k.map(x => +x[4]);
      let peak = c[0], mdd = 0; for (const x of c) { peak = Math.max(peak, x); mdd = Math.min(mdd, x / peak - 1); }
      const rets = c.slice(1).map((x, i) => Math.log(x / c[i])), vol = Math.sqrt(rets.slice(-30).reduce((a, x) => a + x * x, 0) / 30) * Math.sqrt(365);
      let imb = '';
      try { const d = await (await fetch(`https://data-api.binance.vision/api/v3/depth?symbol=${sym}&limit=100`)).json(); const bid = d.bids.reduce((a, [p, q]) => a + p * q, 0), ask = d.asks.reduce((a, [p, q]) => a + p * q, 0); imb = ` Emir defteri (ilk 100 kademe): alış ${Math.round(bid).toLocaleString('tr-TR')}$ / satış ${Math.round(ask).toLocaleString('tr-TR')}$ → ${bid > ask ? 'alış' : 'satış'} baskısı %${Math.round(Math.abs(bid - ask) / (bid + ask) * 100)}.`; } catch {}
      const score = Math.round(Math.min(100, vol * 100 * 0.9 + Math.abs(mdd) * 60));
      return `${sym}: risk puanı ${score}/100 (${score > 70 ? 'yüksek' : score > 40 ? 'orta' : 'düşük'}); yıllık oynaklık %${Math.round(vol * 100)}; 1 yıllık en büyük düşüş %${Math.round(mdd * 100)}.${imb} Not: geçmiş veri geleceği garanti etmez.`;
    } },
    backtest: { d: 'backtest|BTC|hızlı SMA|yavaş SMA|işlem ücreti % — SMA kesişim stratejisinin geçmiş getirisi, al-tut ile karşılaştırma', run: async ([s, f = 20, sl = 50, fee = 0.1]) => {
      const { sym, k } = await kl(s, 1000); const c = k.map(x => +x[4]); f = +f || 20; sl = +sl || 50; const fr = (+fee || 0.1) / 100;
      let eq = 1, inPos = false, trades = 0, wins = 0, entry = 0, peak = 1, mdd = 0;
      for (let i = sl; i < c.length; i++) {
        const a = c.slice(i - f, i).reduce((x, y) => x + y, 0) / f, b = c.slice(i - sl, i).reduce((x, y) => x + y, 0) / sl;
        if (!inPos && a > b) { inPos = true; entry = c[i]; eq *= 1 - fr; trades++; }
        else if (inPos && a < b) { inPos = false; eq *= (c[i] / entry) * (1 - fr); if (c[i] > entry) wins++; }
        const cur = inPos ? eq * c[i] / entry : eq; peak = Math.max(peak, cur); mdd = Math.min(mdd, cur / peak - 1);
      }
      if (inPos) eq *= c.at(-1) / entry;
      const hold = c.at(-1) / c[sl];
      return `${sym} SMA${f}/${sl} (${c.length - sl} gün, ücret %${fr * 100}): strateji ${((eq - 1) * 100).toFixed(1)}%, al-tut ${((hold - 1) * 100).toFixed(1)}%; ${trades} işlem, kazanma oranı %${trades ? Math.round(wins / trades * 100) : 0}, en büyük düşüş %${Math.round(mdd * 100)}. Geçmiş performans gelecek için garanti değildir.`;
    } },
    portfoy: { d: 'portfoy|al veya sat veya durum|sembol|USDT tutarı — sanal (gerçek para yok) kripto portföyü', run: async ([act = 'durum', s, amt]) => {
      const a = fold(act);
      const price = async sym => { const v = +(await (await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}USDT`)).json().catch(() => ({}))).price; if (!(v > 0)) throw Error(sym + ' fiyatı alınamadı'); return v; };
      if (a === 'al' || a === 'sat') {
        const sym = String(s).toUpperCase().replace(/USDT$/, ''), p = await price(sym), usd = +amt;
        if (!(p > 0) || !(usd > 0)) throw Error('Sembol veya tutar geçersiz');
        if (a === 'al') { if (usd > pf.cash) throw Error('Sanal bakiye yetersiz'); pf.cash -= usd; pf.pos[sym] = (pf.pos[sym] || 0) + usd * 0.999 / p; }
        else { const q = Math.min(pf.pos[sym] || 0, usd / p); if (!q) throw Error('Pozisyon yok'); pf.pos[sym] -= q; pf.cash += q * p * 0.999; }
        pf.trades.push({ t: Date.now(), a, sym, usd, p }); store.set('portfolio', pf);
      }
      let total = pf.cash; const rows = [];
      for (const [sym, q] of Object.entries(pf.pos)) if (q > 1e-9) { const p = await price(sym); total += q * p; rows.push(`${sym} ${q.toPrecision(4)} (${Math.round(q * p)}$)`); }
      return `SANAL portföy: nakit ${Math.round(pf.cash)}$, ${rows.join(', ') || 'pozisyon yok'}; toplam ${Math.round(total)}$ (başlangıç 10.000$, getiri %${((total / 10000 - 1) * 100).toFixed(1)}).`;
    } }
  });

  /* ================= 7) site izleme, ağ teşhisi, bağlantı güvenlik kontrolü ================= */
  let watches = store.get('watches', []);
  const hashText = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  async function checkWatches(force) {
    for (const w of watches) {
      if (!force && Date.now() - w.checked < 3 * 3600000) continue;
      try { const t = await readPage(w.url); const h = await hashText(t.replace(/\s+/g, ' ').slice(0, 12000)); if (w.hash && h !== w.hash) { bubble('alarm', '🔔 Sayfa değişti: ' + w.url); logOp('izle', [w.url], 'başarılı', 'değişiklik bulundu'); } w.hash = h; w.checked = Date.now(); } catch {}
    }
    store.set('watches', watches);
  }
  setInterval(() => { if (!document.hidden && watches.length) checkWatches(); }, 20 * 60000);
  Object.assign(TOOLS, {
    izle: { d: 'izle|https://adres veya "liste" veya "sil|adres" — web sayfasını değişikliklere karşı izler (uygulama açıkken 3 saatte bir)', run: async ([u, x]) => { if (fold(u) === 'liste') return watches.map(w => w.url).join('\n') || 'İzlenen sayfa yok.'; if (fold(u) === 'sil') { watches = watches.filter(w => w.url !== x); store.set('watches', watches); return 'İzleme kaldırıldı.'; } if (!/^https?:\/\//.test(u)) throw Error('Adres https ile başlamalı'); if (!watches.some(w => w.url === u)) watches.push({ url: u, hash: '', checked: 0 }); await checkWatches(true); return 'İzlemeye alındı: ' + u; } },
    ag_testi: { d: 'ag_testi — internet bağlantısı teşhisi (gecikme, bağlantı türü, servislere erişim)', run: async () => {
      const targets = [['Google', 'https://www.google.com/generate_204'], ['Gemini', 'https://generativelanguage.googleapis.com/'], ['GitHub', 'https://api.github.com/'], ['Cloudflare', 'https://1.1.1.1/cdn-cgi/trace']];
      const res = await Promise.all(targets.map(async ([n, u]) => { const t0 = performance.now(); try { await withTimeout(fetch(u, { mode: 'no-cors', cache: 'no-store' }), 6000); return `${n} ${Math.round(performance.now() - t0)} ms`; } catch { return `${n} ERİŞİLEMEDİ`; } }));
      const c = navigator.connection; return `Çevrimiçi: ${navigator.onLine ? 'evet' : 'HAYIR'}. ${c ? `Bağlantı: ${c.effectiveType || '?'}, ~${c.downlink || '?'} Mbps, RTT ${c.rtt || '?'} ms. ` : ''}${res.join(', ')}.`;
    } },
    link_kontrol: { d: 'link_kontrol|adres — şüpheli/oltalama bağlantı belirtileri', run: ([u]) => {
      let url; try { url = new URL(/^https?:/i.test(u) ? u : 'http://' + u); } catch { throw Error('Geçersiz adres'); }
      const h = url.hostname, flags = [];
      if (url.protocol !== 'https:') flags.push('şifresiz http');
      if (/xn--/.test(h)) flags.push('benzer harfli (punycode) alan adı');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) flags.push('alan adı yerine IP adresi');
      if (/(bit\.ly|tinyurl|t\.co|cutt\.ly|shorturl|is\.gd|rebrand\.ly)$/.test(h)) flags.push('kısaltılmış bağlantı (asıl hedef gizli)');
      if (/\.(zip|mov|xyz|top|click|tk|gq|ml|cf|work|rest)$/.test(h)) flags.push('sık kötüye kullanılan uzantı');
      if (h.split('.').length > 4) flags.push('çok sayıda alt alan adı');
      if (/(login|verify|secure|account|update|bank|odeme|giris|dogrula|e-?devlet|ptt|kargo)/i.test(h + url.pathname) && !/(\.gov\.tr|turkiye\.gov\.tr|ptt\.gov\.tr)$/.test(h)) flags.push('giriş/ödeme/kargo temalı kelimeler (oltalama belirtisi olabilir)');
      if (url.username) flags.push('adres içinde kullanıcı adı (@ hilesi)');
      return `${h}: ${flags.length ? 'DİKKAT — ' + flags.join('; ') : 'belirgin bir şüphe işareti yok (yine de bilmediğin bağlantılara şifre girme)'}.`;
    } }
  });

  /* ================= 8) kamera ile anında görüntü ================= */
  async function camera() {
    if (!navigator.mediaDevices?.getUserMedia) return note('Bu cihazda kamera erişimi yok. Ataç ile fotoğraf seçebilirsin.');
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1600 } }, audio: false }); } catch { return note('Kamera izni verilmedi.'); }
    const v = el('video', { autoplay: true, playsinline: true, muted: true }); v.srcObject = s;
    const close = () => { s.getTracks().forEach(t => t.stop()); box.remove(); };
    const box = el('div', { class: 'camera' }, v, el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: async () => { const c = document.createElement('canvas'); const k = Math.min(1, 1568 / Math.max(v.videoWidth, v.videoHeight)); c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); close(); await setImage(new File([b], 'kamera.jpg', { type: 'image/jpeg' }), 'Kamera'); $('prompt').value = 'Bu görüntüde ne var? Yazı varsa oku, önemli noktaları söyle.'; autosize(); } }, '◉ Çek'),
      el('button', { type: 'button', class: 'btn', onclick: close }, 'Kapat')));
    document.body.append(box);
  }
  SKILLS.camera = { label: 'Kamera', run: camera };
  $('skills').append(el('button', { type: 'button', onclick: () => { window.jarvisUnlock(); camera(); } }, 'Kamera'));
  $('mobileSkills').append(el('button', { type: 'button', onclick: () => { window.jarvisUnlock(); camera(); } }, 'Kamera'));
  SKILLS.zoi = { label: 'ZOİ tahmin', run: () => openDrawer('zoi') };

  /* ================= 9) bütçe ve performans metrikleri ================= */
  const met = store.get('metrics', { day: '', calls: 0, ms: [], models: {} });
  const _api = api;
  api = async (path, options = {}) => {
    if (!String(path).includes('/api/chat')) return _api(path, options);
    if (met.day !== day()) { met.day = day(); met.calls = 0; }
    const lim = Number(opt('budget')) || 0;
    if (lim && met.calls >= lim) throw Object.assign(Error(`Günlük yapay zekâ bütçesi (${lim} istek) doldu. Ayar → Bütçe'den artırabilirsin.`), { status: 429 });
    met.calls++;
    const t0 = performance.now(); const r = await _api(path, options);
    met.ms.push(Math.round(performance.now() - t0)); met.ms = met.ms.slice(-50);
    if (window.jarvisLastModel) met.models[window.jarvisLastModel] = (met.models[window.jarvisLastModel] || 0) + 1;
    store.set('metrics', met); renderMetrics(); return r;
  };
  function renderMetrics() {
    const box = $('metrics'); if (!box) return;
    const ok = opLog.filter(o => o.status === 'başarılı').length, bad = opLog.filter(o => o.status === 'başarısız').length;
    const avg = met.ms.length ? Math.round(met.ms.reduce((a, b) => a + b, 0) / met.ms.length) : 0;
    const fails = opLog.filter(o => o.status === 'başarısız').reduce((m, o) => (m[o.tool] = (m[o.tool] || 0) + 1, m), {});
    const rows = [['Bugünkü model isteği', met.calls + (Number(opt('budget')) ? ' / ' + opt('budget') : '')], ['Yanıt başlama süresi (ort.)', avg ? avg + ' ms' : '—'], ['Araç başarı oranı', ok + bad ? `%${Math.round(ok / (ok + bad) * 100)} (${ok}/${ok + bad})` : '—'], ['En çok hata veren', Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} (${v})`).join(', ') || '—'], ['Kullanılan modeller', Object.entries(met.models).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'], ['Geri bildirim', `👍 ${store.get('fbUp', 0)} · 👎 ${store.get('fbDown', 0)}`]];
    box.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  }
  $('opsList').before(el('h3', {}, 'PERFORMANS'), el('dl', { class: 'kv', id: 'metrics' }));

  /* ================= 10) ZOİ sekmesi ================= */
  (() => {
    const tabs = document.querySelector('.tabs'), t = el('button', { role: 'tab', id: 't-zoi', 'aria-selected': 'false', 'data-p': 'zoi' }, 'ZOİ');
    tabs.insertBefore(t, tabs.querySelector('[data-p="settings"]'));
    t.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === t))); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-zoi'); };
    const f = el('form', { class: 'add pat-add' }, el('input', { id: 'zText', placeholder: 'Olay (ör. Aralıkta yeni hasta sayısı 40’ı geçer)', 'aria-label': 'Olay' }), el('input', { id: 'zP', placeholder: 'Olasılık %', inputmode: 'numeric', 'aria-label': 'Olasılık' }), el('input', { id: 'zDue', type: 'date', 'aria-label': 'Hedef tarih' }), el('button', {}, 'Tahmin ekle'));
    f.onsubmit = e => { e.preventDefault(); try { (window.jarvisZoiRecord || TOOLS.tahmin.run)([$('zText').value, $('zP').value, $('zDue').value]); f.reset(); } catch (er) { note(er.message); } };
    const p = el('div', { class: 'pane', id: 'p-zoi', role: 'tabpanel' }, el('h3', {}, 'ZOİ · ZAMAN-OLASILIK MOTORU'),
      el('p', { class: 'muted' }, 'Ölçülebilir tahminler: olay, olasılık ve tarih yaz; zamanı gelince sonucu işaretle. Motor isabetini Brier skoru ve kalibrasyonla ölçer; SATÜRN de “tahmin” aracıyla kayıt açabilir. Ana beyinden bağımsız, deneysel bir modüldür.'),
      el('div', { class: 'summary', id: 'zoiStats' }), f, el('ul', { class: 'list', id: 'zoiList' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); typedTurn('ZOİ: açık tahminlerimi incele; her biri için güncel bilgiye göre olasılığın değişmesi gerekip gerekmediğini, olası senaryoları ve en uygun eylem zamanını söyle. tahmin_durum aracını kullan.', false); } }, 'Tahminleri yeniden değerlendir')));
    p.hidden = true; $('p-settings').before(p);
    const d = el('button', { type: 'button', 'data-open': 'zoi', onclick: () => openDrawer('zoi') }, 'ZOİ');
    document.querySelector('.dockbar').insertBefore(d, document.querySelector('.dockbar [data-open="settings"]'));
  })();

  /* ================= 11) ayarlar: otonomi, deneme modu, bütçe, saklama, paneller, güç ================= */
  $('p-link').append(el('h3', {}, 'YETKİ VE GÜVENLİK SEVİYESİ'),
    field('autonomy', 'Otonomi seviyesi', sel('autonomy', [['1', 'Dengeli · yalnız riskli işlemlerde onay'], ['0', 'Temkinli · değişiklik yapan her işlemde onay']])),
    field('dryRun', 'Deneme modu (sandbox)', sel('dryRun', [['0', 'Kapalı · işlemler gerçekten yapılır'], ['1', 'Açık · bilgisayar/ev/kayıt işlemleri yalnız simüle edilir']])),
    el('p', { class: 'muted' }, 'Kilit açıksa riskli bilgisayar işlemlerinde Face ID/Windows Hello veya PIN ile ikinci doğrulama istenir.'),
    el('h3', {}, 'ERİŞİMLERİ İPTAL ET'),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: async () => { try { await pcCall('kaldir', [], false); store.set('pcPaired', ''); note('Bilgisayar ile telefon köprüsü eşleşmesi kaldırıldı.'); } catch (e) { note('Kaldırılamadı: ' + e.message); } } }, 'Bilgisayar eşleşmesini kaldır'),
      el('button', { type: 'button', class: 'btn', onclick: () => { if (!confirm('Bu cihazdaki tüm anahtarlar (Gemini, GitHub, ElevenLabs, Home Assistant, yardımcı kodu) silinsin mi?')) return; for (const k of ['ghToken', 'syncPass', 'elevenKey', 'haToken', 'pcToken']) store.set('set.' + k, ''); store.set('key', ''); location.reload(); } }, 'Bu cihazdaki tüm anahtarları sil')));
  $('p-settings').append(el('h3', {}, 'BÜTÇE VE SAKLAMA'),
    field('budget', 'Günlük yapay zekâ istek sınırı', sel('budget', [['0', 'Sınırsız (ücretsiz kota sınırı geçerli)'], ['100', '100 istek'], ['250', '250 istek'], ['500', '500 istek']])),
    field('keepDays', 'Konuşma geçmişi ve işlem kaydı saklama', sel('keepDays', [['0', 'Süresiz'], ['30', '30 gün'], ['90', '90 gün'], ['365', '1 yıl']])),
    field('power', 'Güç modu', sel('power', [['auto', 'Otomatik · pil %20 altında tasarruf'], ['eco', 'Hep tasarruf'], ['full', 'Hep tam görüntü']])),
    el('h3', {}, 'PANELLER'),
    ...[['pGlobe', 'Küre'], ['pRadar', 'Radar ve göstergeler'], ['pTicker', 'Bilgi şeridi'], ['pEdges', 'Kenar telemetrisi'], ['pBoot', 'Açılış animasyonu']].map(([id, l]) => field(id, l, sel(id, [['1', 'Göster'], ['0', 'Gizle']]))));
  for (const id of ['autonomy', 'dryRun', 'budget', 'keepDays', 'power', 'pGlobe', 'pRadar', 'pTicker', 'pEdges', 'pBoot']) bindSetting(id, () => { applyPanels(); renderMetrics(); });
  function applyPanels() {
    const b = document.body.classList;
    b.toggle('no-globe', opt('pGlobe') === '0'); b.toggle('no-radar', opt('pRadar') === '0'); b.toggle('no-ticker', opt('pTicker') === '0'); b.toggle('no-edges', opt('pEdges') === '0');
    if (opt('pBoot') === '0') sessionStorage.setItem('jarvis.booted', '1');
  }
  applyPanels();
  // low-power mode
  async function powerTick() {
    let eco = opt('power') === 'eco';
    if (opt('power') !== 'full' && !eco) { try { const b = await navigator.getBattery?.(); eco = !!b && !b.charging && b.level < 0.2; } catch {} }
    if (eco !== !!window.jarvisEco) { window.jarvisEco = eco; document.body.classList.toggle('eco', eco); if (eco) note('Pil düşük: tasarruf modu (daha az animasyon).'); }
  }
  setInterval(powerTick, 60000); powerTick();
  // retention
  const keep = Number(opt('keepDays')) || 0;
  if (keep) { const lim = Date.now() - keep * 86400000; archive = archive.filter(x => x.t > lim); store.set('archive', archive); opLog = opLog.filter(o => o.t > lim); store.set('oplog', opLog); }

  /* ================= 12) yarım kalan görevi sürdürme ================= */
  const pend = store.get('pendingTask', null);
  if (pend && Date.now() - pend.t < 86400000) {
    store.set('pendingTask', null);
    setTimeout(() => { const n = bubble('note', 'Yarım kalan görev: “' + short(pend.text, 120) + '”'); n.el.append(el('button', { type: 'button', class: 'undo', onclick: e => { e.target.remove(); typedTurn('Kaldığın yerden devam et: ' + pend.text, false); } }, 'Devam et')); $('caption').textContent = 'Yarım kalan bir görev var: “' + short(pend.text, 90) + '”. KAYIT panelinden “Devam et”e dokunabilirsin.'; }, 4000);
  }

  /* ================= 13) bileşik görevler için yönetici talimatı ================= */
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `
YÖNETİCİ AJAN OLARAK ÇALIŞ: birden çok iş içeren komutta (ör. “yarınki randevuları kontrol et, eksik hasta programlarını bul, Instagram paylaşımı hazırla, bilgisayarı kontrol et, bana sesli bildir”) önce işleri sırala; birbirinden bağımsız araçları AYNI turda birlikte çağır (paralel çalışır); her işin sonucunu ayrı ayrı doğrula; en sonda her iş için BAŞARILI / BAŞARISIZ / BEKLEMEDE / İPTAL durumunu tek satırda bildir. Hasta egzersiz programı hazırladığında Beyhan onaylarsa program_kaydet ile kaydet. ZOİ: belirsiz bir gelecek olay konuşulursa ölçülebilir hale getirip tahmin aracıyla kaydetmeyi öner.`;

  /* ================= başlangıç ================= */
  renderDocs(); renderLessons(); renderZoi(); renderMetrics();
  const _ri = renderItems; renderItems = () => { _ri(); renderDocs?.(); renderLessons?.(); };
})();
