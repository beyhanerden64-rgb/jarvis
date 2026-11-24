'use strict';
/* SATÜRN 10.1 — ARAŞTIRMA MERKEZİ II
 *  1) Makale analizi: PMID / DOI / PMC no → özet + (açık erişimse) tam metin → yapılandırılmış Türkçe eleştirel değerlendirme
 *  2) Literatür alarmı: takibe alınan konularda her hafta yeni yayınlar (PubMed, yapay zekâ kotası harcamaz) → bildirim
 *  3) Klinik ölçek hesaplayıcı: Oswestry, NDI, DASH, QuickDASH, LEFS, WOMAC, Berg, TUG, 6 dk yürüme, VKİ, nabız bölgeleri, 1TM */
(() => {
  const R = () => window.jarvisResearch;
  const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/', tool = 'tool=jarvis-fizyovita&email=';
  const DAY = 86400000;
  const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  async function getJson(url) { try { const r = await withTimeout(fetch(url), 15000, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return await r.json(); } catch (e) { try { return JSON.parse(await window.jarvisViaBridge(url)); } catch { throw e; } } }
  async function getText(url) { try { const r = await withTimeout(fetch(url), 20000, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return await r.text(); } catch (e) { try { return await window.jarvisViaBridge(url); } catch { throw e; } } }

  /* ---------- 1) makale analizi ---------- */
  async function resolve(idRaw) {
    const s = String(idRaw || '').trim();
    let pmid = (s.match(/^(?:pmid:?\s*)?(\d{5,9})$/i) || [])[1], pmcid = (s.match(/PMC\d+/i) || [])[0]?.toUpperCase(), doi = (s.match(/10\.\d{4,9}\/\S+/) || [])[0];
    const q = pmid ? `EXT_ID:${pmid} AND SRC:MED` : pmcid ? `PMCID:${pmcid}` : doi ? `DOI:"${doi}"` : null;
    if (!q) throw Error('PMID (ör. 31234567), DOI (10.xxxx/…) veya PMC numarası ver');
    const d = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=1&query=${encodeURIComponent(q)}`).catch(() => ({}));
    const r = d.resultList?.result?.[0] || {};
    pmid ||= r.pmid; pmcid ||= r.pmcid;
    return { pmid, pmcid, doi: doi || r.doi, oa: r.isOpenAccess === 'Y' || !!r.pmcid && r.inEPMC === 'Y', epmc: r };
  }
  async function fullText(pmcid) {
    const xml = await getText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const out = [];
    for (const sec of doc.querySelectorAll('body > sec, body sec')) {
      if (sec.parentElement?.tagName === 'sec') continue;
      const title = clean(sec.querySelector(':scope > title')?.textContent);
      const text = clean([...sec.querySelectorAll('p')].map(p => p.textContent).join(' '));
      if (text) out.push((title ? title.toUpperCase() + ': ' : '') + text);
    }
    return out.join('\n').slice(0, 22000);
  }
  async function article(idRaw) {
    setPhase('thinking', 'Makaleyi buluyorum…');
    const id = await resolve(idRaw);
    let rec = null;
    if (id.pmid) rec = (await R().pubmed(`${id.pmid}[uid]`, 1, false, 0).catch(() => []))[0] || null;
    if (!rec && id.epmc?.title) rec = { title: clean(id.epmc.title), journal: clean(id.epmc.journalTitle), year: id.epmc.pubYear, abstract: clean(id.epmc.abstractText), level: 'çalışma', url: id.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${id.pmid}/` : `https://europepmc.org/article/PMC/${id.pmcid}`, id: id.pmid ? 'PMID:' + id.pmid : id.pmcid, authors: [] };
    if (!rec) throw Error('Makale bulunamadı');
    let full = '';
    if (id.pmcid) { setPhase('thinking', 'Açık erişimli tam metni okuyorum…'); full = await fullText(id.pmcid).catch(() => ''); }
    setPhase('thinking', 'Makaleyi değerlendiriyorum…');
    const t = await R().ask(`Sen deneyimli bir fizyoterapiste (Fzt. Beyhan Erden) bilimsel makale okuyan SATÜRN'sün. Aşağıdaki makaleyi TÜRKÇE, düz metin, şu başlıklarla değerlendir (uydurma bilgi yazma; metinde yoksa "belirtilmemiş" de):
KÜNYE: yazar(lar), yıl, dergi, çalışma tipi.
AMAÇ:
YÖNTEM: tasarım, örneklem (sayı, yaş, tanı), müdahale ve kontrol, süre, sonuç ölçütleri.
BULGULAR: ana sonuçlar; varsa etki büyüklüğü, güven aralığı, p değeri, klinik olarak anlamlı fark (MCID) ile karşılaştırma.
KANIT DÜZEYİ VE YANLILIK RİSKİ: (randomizasyon, körleme, kayıp, örneklem gücü) kısa değerlendirme.
KLİNİĞE UYARLAMA: FİZYOVİTA'da nasıl uygulanır — doz/süre/ilerleme.
SINIRLILIKLAR:
TEK CÜMLEDE SONUÇ:
${full ? '(Tam metin verildi.)' : '(Yalnız özet var; tam metin açık erişimde değil — buna göre temkinli ol.)'}`,
      `${rec.title}\n${(rec.authors || []).join(', ')} · ${rec.journal || ''} ${rec.year || ''} · ${rec.id || ''}\n\nÖZET: ${rec.abstract || '-'}\n\n${full ? 'TAM METİN (kısaltılmış):\n' + full : ''}`, 'complex');
    logOp('makale analizi', [rec.id || idRaw], 'başarılı', full ? 'tam metin' : 'özet');
    return { text: t, rec, full: !!full };
  }
  async function showArticle(idRaw) {
    bubble('me', '📄 Makale analizi: ' + idRaw);
    try { const a = await article(idRaw); const n = bubble('ai', a.text); addLinks(n.el, [{ url: a.rec.url, title: (a.full ? '📖 Tam metin · ' : '📄 ') + short(a.rec.title, 70) }]); answerTools(n.el, a.text); setPhase('idle', 'Hazır.'); }
    catch (e) { setPhase('idle', 'Hazır.'); note('Makale analiz edilemedi: ' + e.message); }
  }

  /* ---------- 2) literatür alarmı ---------- */
  let follows = store.get('resFollow', []);
  const saveF = () => { store.set('resFollow', follows); renderF(); };
  async function follow(topic) {
    topic = String(topic || '').trim(); if (topic.length < 3) return note('Takip edilecek konuyu yaz.');
    if (follows.some(f => fold(f.q) === fold(topic))) return note('Bu konu zaten takipte.');
    let pq = topic;
    try { pq = (await R().ask('Konuyu PubMed arama sorgusuna çevir (İngilizce, MeSH/serbest terim, AND/OR). Yalnızca sorguyu yaz, başka hiçbir şey yazma. Kişisel bilgi yazma.', topic, 'quick')).split('\n')[0].replace(/^["'`]|["'`]$/g, '').slice(0, 300) || topic; } catch {}
    follows.push({ q: topic, pq, added: Date.now(), last: Date.now(), seen: [] }); saveF();
    note(`“${topic}” takibe alındı. Her hafta yeni yayınları bildireceğim. (PubMed sorgusu: ${short(pq, 120)})`);
  }
  const ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '/');
  async function checkFollows(force = false) {
    if (!follows.length || !navigator.onLine) return [];
    const found = [];
    for (const f of follows) {
      if (!force && Date.now() - f.last < 7 * DAY) continue;
      try {
        const term = `(${f.pq}) AND ("${ymd(f.last - DAY)}"[edat] : "3000"[edat])`;
        const s = await getJson(`${NCBI}esearch.fcgi?db=pubmed&retmode=json&retmax=5&sort=pub_date&${tool}&term=${encodeURIComponent(term)}`);
        const ids = (s.esearchresult?.idlist || []).filter(id => !f.seen.includes(id));
        if (ids.length) {
          await new Promise(r => setTimeout(r, 400));
          const d = await getJson(`${NCBI}esummary.fcgi?db=pubmed&retmode=json&${tool}&id=${ids.join(',')}`);
          for (const id of ids) found.push({ topic: f.q, id, title: d.result?.[id]?.title || '', journal: d.result?.[id]?.source || '', year: (d.result?.[id]?.pubdate || '').slice(0, 4) });
          f.seen = [...f.seen, ...ids].slice(-200);
        }
        f.last = Date.now();
        await new Promise(r => setTimeout(r, 400));
      } catch {}
    }
    saveF();
    if (found.length) {
      const by = {}; for (const x of found) (by[x.topic] ||= []).push(x);
      const text = '📚 Literatür alarmı — yeni yayınlar:\n' + Object.entries(by).map(([t, xs]) => `• ${t} (${xs.length}):\n` + xs.map(x => `   – ${x.title} (${x.journal} ${x.year}) PMID ${x.id}`).join('\n')).join('\n');
      const n = bubble('ai', text);
      addLinks(n.el, found.slice(0, 8).map(x => ({ url: `https://pubmed.ncbi.nlm.nih.gov/${x.id}/`, title: short(x.title, 60) })));
      if (document.hidden && opt('ntfyOn') === '1') window.jarvisPushPhone?.(`${found.length} yeni yayın: ${Object.keys(by).join(', ')}`, { title: 'SATÜRN literatür alarmı', tags: 'books' }).catch(() => {});
      logOp('literatür alarmı', [], 'başarılı', found.length + ' yeni yayın');
    } else if (force) note('Takip edilen konularda yeni yayın yok.');
    return found;
  }
  setTimeout(() => checkFollows().catch(() => {}), 90000);
  setInterval(() => { if (!document.hidden) checkFollows().catch(() => {}); }, 6 * 3600000);

  /* ---------- 3) klinik ölçekler ---------- */
  const nums = v => String(v || '').split(/[\s,;]+/).filter(Boolean).map(x => Number(x.replace(',', '.'))).filter(x => Number.isFinite(x));
  const r1 = x => Math.round(x * 10) / 10;
  const SCALES = {
    oswestry: { ad: 'Oswestry Disabilite İndeksi (ODI)', calc: v => { const a = nums(v); if (a.length < 8 || a.some(x => x < 0 || x > 5)) throw Error('10 madde, her biri 0–5 (en az 8 yanıt)'); const p = a.reduce((s, x) => s + x, 0) / (5 * a.length) * 100; return `ODI %${r1(p)} — ${p <= 20 ? 'minimal' : p <= 40 ? 'orta' : p <= 60 ? 'ciddi' : p <= 80 ? 'sakatlayıcı' : 'yatağa bağımlı / abartı değerlendir'} disabilite (MCID ≈ 10 puan).`; } },
    ndi: { ad: 'Boyun Disabilite İndeksi (NDI)', calc: v => { const a = nums(v); if (a.length < 8 || a.some(x => x < 0 || x > 5)) throw Error('10 madde, her biri 0–5'); const raw = a.reduce((s, x) => s + x, 0) * 10 / a.length; return `NDI ${r1(raw)}/50 (%${r1(raw * 2)}) — ${raw <= 4 ? 'disabilite yok' : raw <= 14 ? 'hafif' : raw <= 24 ? 'orta' : raw <= 34 ? 'ciddi' : 'tam'} disabilite (MCID ≈ 5–7 puan).`; } },
    dash: { ad: 'DASH', calc: v => { const a = nums(v); if (a.length < 27 || a.some(x => x < 1 || x > 5)) throw Error('30 madde, her biri 1–5 (en az 27 yanıt)'); const s = (a.reduce((x, y) => x + y, 0) / a.length - 1) * 25; return `DASH ${r1(s)}/100 (yüksek = daha fazla disabilite; MCID ≈ 10–15).`; } },
    quickdash: { ad: 'QuickDASH', calc: v => { const a = nums(v); if (a.length < 10 || a.some(x => x < 1 || x > 5)) throw Error('11 madde, her biri 1–5 (en az 10 yanıt)'); const s = (a.reduce((x, y) => x + y, 0) / a.length - 1) * 25; return `QuickDASH ${r1(s)}/100 (MCID ≈ 8–14).`; } },
    lefs: { ad: 'Alt Ekstremite Fonksiyonel Skala (LEFS)', calc: v => { const a = nums(v); if (a.length !== 20 || a.some(x => x < 0 || x > 4)) throw Error('20 madde, her biri 0–4'); const s = a.reduce((x, y) => x + y, 0); return `LEFS ${s}/80 (%${r1(s / 80 * 100)} fonksiyon; düşük = kötü; MCID ≈ 9 puan).`; } },
    womac: { ad: 'WOMAC', calc: v => { const a = nums(v); if (a.length !== 24 || a.some(x => x < 0 || x > 4)) throw Error('24 madde (5 ağrı, 2 tutukluk, 17 fonksiyon), her biri 0–4'); const sum = (i, j) => a.slice(i, j).reduce((x, y) => x + y, 0); const t = sum(0, 24); return `WOMAC toplam ${t}/96 (%${r1(t / 96 * 100)}) · ağrı ${sum(0, 5)}/20 · tutukluk ${sum(5, 7)}/8 · fonksiyon ${sum(7, 24)}/68 (yüksek = kötü).`; } },
    berg: { ad: 'Berg Denge Ölçeği', calc: v => { const a = nums(v); if (a.length !== 14 || a.some(x => x < 0 || x > 4)) throw Error('14 madde, her biri 0–4'); const s = a.reduce((x, y) => x + y, 0); return `Berg ${s}/56 — ${s <= 20 ? 'yüksek düşme riski (tekerlekli sandalye düzeyi)' : s <= 40 ? 'orta düşme riski (yardımla yürüme)' : 'düşük düşme riski (bağımsız)'}${s < 45 && s > 40 ? '; <45 puan artmış düşme riskiyle ilişkili' : ''} (MDC ≈ 4–7).`; } },
    tug: { ad: 'Süreli Kalk ve Yürü (TUG)', calc: v => { const [s] = nums(v); if (!(s > 0)) throw Error('Süre (saniye)'); return `TUG ${s} sn — ${s < 10 ? 'normal hareketlilik' : s < 13.5 ? 'çoğu yaşlıda kabul edilebilir; izle' : 'yaşlılarda artmış düşme riski (≥13,5 sn)'}${s >= 12 ? '; CDC STEADI eşiği ≥12 sn' : ''}.`; } },
    altidk: { ad: '6 Dakika Yürüme Testi (Enright)', calc: v => { const [d, age, h, w] = nums(v); const sex = /k/i.test(String(v)) ? 'k' : 'e'; if (!(d > 0 && age > 0 && h > 0 && w > 0)) throw Error('mesafe(m) yaş boy(cm) kilo(kg) cinsiyet(e/k)'); const pred = sex === 'k' ? 2.11 * h - 2.29 * w - 5.78 * age + 667 : 7.57 * h - 5.02 * age - 1.76 * w - 309; return `6DYT ${d} m · beklenen ${Math.round(pred)} m (${sex === 'k' ? 'kadın' : 'erkek'}, Enright 1998) → %${Math.round(d / pred * 100)} (MCID ≈ 30 m).`; } },
    vki: { ad: 'Vücut Kitle İndeksi', calc: v => { const [w, h] = nums(v); if (!(w > 0 && h > 0)) throw Error('kilo(kg) boy(cm)'); const b = w / ((h / 100) ** 2); return `VKİ ${r1(b)} — ${b < 18.5 ? 'zayıf' : b < 25 ? 'normal' : b < 30 ? 'fazla kilolu' : 'obez'}.`; } },
    nabiz: { ad: 'Maksimum nabız ve antrenman bölgeleri', calc: v => { const [age, rest] = nums(v); if (!(age > 0)) throw Error('yaş [dinlenme nabzı]'); const max = Math.round(208 - 0.7 * age); const z = p => rest ? Math.round(rest + (max - rest) * p) : Math.round(max * p); return `Maks. nabız ≈ ${max}/dk (Tanaka)${rest ? ', Karvonen (dinlenme ' + rest + ')' : ''}. Bölgeler: hafif %50–60 ${z(0.5)}–${z(0.6)} · orta %60–70 ${z(0.6)}–${z(0.7)} · aerobik %70–80 ${z(0.7)}–${z(0.8)} · yüksek %80–90 ${z(0.8)}–${z(0.9)}.`; } },
    birtm: { ad: 'Tahmini 1 Tekrar Maksimum (Epley)', calc: v => { const [w, reps] = nums(v); if (!(w > 0 && reps > 0)) throw Error('ağırlık(kg) tekrar'); const m = w * (1 + reps / 30); return `1TM ≈ ${r1(m)} kg · %60 ${r1(m * 0.6)} · %70 ${r1(m * 0.7)} · %80 ${r1(m * 0.8)} kg (≤10 tekrarda daha güvenilir).`; } }
  };
  const ALIAS = { odi: 'oswestry', 'boyun': 'ndi', 'qdash': 'quickdash', '6dyt': 'altidk', '6dk': 'altidk', 'alti': 'altidk', 'bmi': 'vki', 'kalp': 'nabiz', '1rm': 'birtm', '1tm': 'birtm' };
  const scale = (k, v) => { const key = ALIAS[fold(k)] || fold(k).replace(/\s+/g, ''); const S = SCALES[key]; if (!S) throw Error('Ölçek: ' + Object.keys(SCALES).join(', ')); return S.calc(v); };

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    makale_ozet: { d: 'makale_ozet|PMID veya DOI veya PMC no — makalenin (açık erişimse tam metinden) yapılandırılmış Türkçe eleştirel analizi', run: async ([id]) => { const a = await article(id); setTimeout(() => { const n = bubble('ai', a.text); addLinks(n.el, [{ url: a.rec.url, title: short(a.rec.title, 70) }]); answerTools(n.el, a.text); setPhase('idle', 'Hazır.'); }, 30); return 'Analiz ekrana kondu. Tek cümlede sonucu söyle: ' + short((a.text.match(/TEK CÜMLEDE SONUÇ:?\s*(.*)/) || [])[1] || '', 300); } },
    konu_takip: { d: 'konu_takip|ekle|konu · konu_takip|liste · konu_takip|sil|konu · konu_takip|kontrol — literatür alarmı (haftalık yeni yayın bildirimi)', run: async ([op, ...a]) => { op = fold(op || 'liste'); if (op === 'ekle') { await follow(a.join(' ')); return 'takibe alındı'; } if (op === 'sil') { const n = follows.length; follows = follows.filter(f => fold(f.q) !== fold(a.join(' '))); saveF(); return n !== follows.length ? 'silindi' : 'bulunamadı'; } if (op === 'kontrol') { const f = await checkFollows(true); return f.length + ' yeni yayın'; } return follows.map(f => f.q).join(', ') || 'takipte konu yok'; } },
    olcek: { d: 'olcek|oswestry/ndi/dash/quickdash/lefs/womac/berg/tug/altidk/vki/nabiz/birtm|değerler (boşlukla) — klinik ölçek puanı ve yorumu', run: ([k, ...v]) => scale(k, v.join(' ')) }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nARAŞTIRMA II: PMID/DOI verilirse makale_ozet; “bu konuyu takip et” denirse konu_takip|ekle; ölçek puanı (Oswestry, NDI, DASH, LEFS, WOMAC, Berg, TUG, 6DYT, VKİ, nabız bölgesi, 1TM) için olcek.';
  const _lc = localCommand;
  localCommand = text => {
    if (window.jarvisUltra?.guest?.()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?jarvis[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:makale(?:yi)?|pmid|doi)\s*(?:özetle|analiz et|incele)?\s*[:,-]?\s*((?:pmid:?\s*)?\d{5,9}|10\.\d{4,9}\/\S+|PMC\d+)\s*(?:özetle|analiz et|incele)?$/i))) { setTimeout(() => showArticle(m[1]), 30); return 'Makaleyi buluyorum ve inceliyorum…'; }
    if ((m = t.match(/^(.{4,80}?)\s+(?:konusunu|literatürünü)\s+takip et$/i))) { setTimeout(() => follow(m[1]), 30); return `“${m[1]}” konusunu takibe alıyorum.`; }
    if ((m = t.match(/^(oswestry|odi|ndi|dash|quickdash|lefs|womac|berg|tug|6dyt|vki|bmi|1rm|1tm)\s+((?=[^a-zçğıöşü]*\d)[\d\s.,]+(?:\s*[ek])?)$/i))) { try { return scale(m[1], m[2]); } catch (e) { return e.message; } }
    return _lc(text);
  };

  /* ---------- panel ---------- */
  const art = el('input', { id: 'artId', placeholder: 'PMID, DOI veya PMC no (ör. 31234567 · 10.1136/bjsports-…)' });
  const fIn = el('input', { id: 'followIn', placeholder: 'Takip edilecek konu (ör. tendinopati şok dalga tedavisi)' });
  const sk = el('select', { id: 'scaleKey', 'aria-label': 'Ölçek' }); for (const [k, s] of Object.entries(SCALES)) sk.append(new Option(s.ad, k));
  const sv = el('input', { id: 'scaleVals', placeholder: 'Değerler boşlukla: ör. 3 2 1 4 0 2 3 1 2 0' });
  const hints = { oswestry: '10 madde 0–5', ndi: '10 madde 0–5', dash: '30 madde 1–5', quickdash: '11 madde 1–5', lefs: '20 madde 0–4', womac: '24 madde 0–4 (ağrı 5, tutukluk 2, fonksiyon 17)', berg: '14 madde 0–4', tug: 'süre (sn)', altidk: 'mesafe yaş boy kilo e/k  (ör. 420 65 170 80 e)', vki: 'kilo boy (ör. 78 172)', nabiz: 'yaş [dinlenme nabzı]', birtm: 'ağırlık tekrar (ör. 40 8)' };
  sk.onchange = () => { sv.placeholder = 'Değerler: ' + hints[sk.value]; }; sk.onchange();
  const fl = el('ul', { class: 'list', id: 'followList' });
  const box = el('div', { id: 'res2' },
    el('h3', {}, 'MAKALE ANALİZİ'),
    el('div', { class: 'row' }, art, el('button', { type: 'button', class: 'btn', onclick: () => { const v = art.value.trim(); if (!v) return note('PMID veya DOI yaz.'); $('drawer').classList.remove('open'); showArticle(v); } }, 'İncele')),
    el('h3', {}, 'LİTERATÜR ALARMI'),
    el('p', { class: 'muted' }, 'Takip ettiğin konularda her hafta yeni PubMed yayınlarını bildirir (yapay zekâ kotası harcamaz).'),
    el('div', { class: 'row' }, fIn, el('button', { type: 'button', class: 'btn', onclick: () => { follow(fIn.value); fIn.value = ''; } }, 'Takibe al'), el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('drawer').classList.remove('open'); checkFollows(true).catch(e => note(e.message)); } }, 'Şimdi kontrol et')),
    fl,
    el('h3', {}, 'KLİNİK ÖLÇEK HESAPLAYICI'),
    el('div', { class: 'field' }, el('label', { for: 'scaleKey' }, 'Ölçek'), sk), sv,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { try { const r = scale(sk.value, sv.value); $('drawer').classList.remove('open'); const n = bubble('ai', r); answerTools(n.el, r); logOp('ölçek', [sk.value], 'başarılı', r); } catch (e) { note(e.message); } } }, 'Hesapla')));
  const hist = $('resHist'); hist?.previousElementSibling?.before(box);
  function renderF() { if (!fl) return; fl.replaceChildren(...(follows.length ? follows.map(f => el('li', { class: 'item' }, el('span', {}, '📚'), el('div', {}, el('p', {}, f.q), el('small', {}, 'son kontrol ' + dateTR(f.last))), el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Takipten çıkar', onclick: () => { follows = follows.filter(x => x !== f); saveF(); } }, '×'))) : [el('li', { class: 'muted' }, 'Takipte konu yok.')])); }
  renderF();
  window.jarvisResearch2 = { article, showArticle, follow, checkFollows, scale, SCALES, follows: () => follows };
})();
