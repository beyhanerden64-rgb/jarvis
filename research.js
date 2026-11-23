'use strict';
/* JARVIS 9.4 — ARAŞTIRMA MERKEZİ (klinik karar desteği)
 * Ücretsiz, anahtarsız bilimsel kaynaklar: PubMed (NCBI), Europe PMC, ClinicalTrials.gov, openFDA (ilaç etiketi),
 * NCBI Gene + ClinVar (genetik), Vikipedi (TR/EN). Derin araştırma ajanı: soruyu İngilizce arama planına çevirir,
 * kaynakları paralel tarar, özetleri okur, kanıt düzeyiyle Türkçe rapor + JARVIS'in kendi değerlendirmesini yazar.
 * Görüntü yorumlama: röntgen / MR / BT / USG fotoğrafı veya ekran görüntüsü → yapılandırılmış ön değerlendirme.
 * Gizlilik: dış kaynaklara yalnız konu/terim gider; hasta adı ve kişisel bilgi gönderilmez. */
(() => {
  const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const tool = 'tool=jarvis-fizyovita&email=';
  const DISCLAIMER = 'Not: Bu bir klinik karar desteği özetidir; tanı ve tedavi kararı hekim/uzman değerlendirmesine aittir.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getJson(url, ms = 15000) {
    try { const r = await withTimeout(fetch(url), ms, 'zaman aşımı'); if (r.ok) return await r.json(); throw Error('HTTP ' + r.status); }
    catch (e) { // tarayıcı engellerse bilgisayar yardımcısı getirir (varsa)
      try { const d = await pcCall('web_al', [url], false); return JSON.parse(d.text); } catch { throw Error('Kaynağa ulaşılamadı: ' + new URL(url).hostname + ' (' + e.message + ')'); }
    }
  }
  async function getText(url, ms = 20000) {
    try { const r = await withTimeout(fetch(url), ms, 'zaman aşımı'); if (r.ok) return await r.text(); throw Error('HTTP ' + r.status); }
    catch (e) { try { return (await pcCall('web_al', [url], false)).text; } catch { throw Error('Kaynağa ulaşılamadı: ' + new URL(url).hostname); } }
  }
  const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  /* ---------- PubMed ---------- */
  const EVID = '(systematic review[pt] OR meta-analysis[pt] OR randomized controlled trial[pt] OR practice guideline[pt] OR guideline[pt])';
  async function pubmed(q, n = 6, strong = false, years = 0) {
    let term = strong ? `(${q}) AND ${EVID}` : q;
    if (years) term += ` AND ("${new Date().getFullYear() - years}"[dp] : "3000"[dp])`;
    const s = await getJson(`${NCBI}esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${n}&${tool}&term=${encodeURIComponent(term)}`);
    const ids = s.esearchresult?.idlist || [];
    if (!ids.length) return [];
    await sleep(350); // NCBI: anahtarsız saniyede 3 istek
    const xml = await getText(`${NCBI}efetch.fcgi?db=pubmed&retmode=xml&${tool}&id=${ids.join(',')}`);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [...doc.querySelectorAll('PubmedArticle')].map(a => {
      const pmid = a.querySelector('PMID')?.textContent;
      const types = [...a.querySelectorAll('PublicationType')].map(x => x.textContent);
      const level = types.some(t => /Meta-Analysis/.test(t)) ? 'meta-analiz' : types.some(t => /Systematic Review/.test(t)) ? 'sistematik derleme' : types.some(t => /Guideline/.test(t)) ? 'kılavuz' : types.some(t => /Randomized Controlled Trial/.test(t)) ? 'RKÇ' : types.some(t => /Review/.test(t)) ? 'derleme' : 'çalışma';
      return {
        src: 'PubMed', id: 'PMID:' + pmid, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, level,
        authors: [...a.querySelectorAll('AuthorList Author')].slice(0, 3).map(x => [x.querySelector('LastName')?.textContent, (x.querySelector('Initials')?.textContent || '')].filter(Boolean).join(' ')).filter(Boolean), more: a.querySelectorAll('AuthorList Author').length > 3, doi: [...a.querySelectorAll('ArticleId')].find(x => x.getAttribute('IdType') === 'doi')?.textContent || '',
        title: clean(a.querySelector('ArticleTitle')?.textContent), journal: clean(a.querySelector('Journal ISOAbbreviation, Journal Title')?.textContent),
        year: a.querySelector('PubDate Year')?.textContent || (a.querySelector('PubDate MedlineDate')?.textContent || '').slice(0, 4),
        abstract: clean([...a.querySelectorAll('AbstractText')].map(x => (x.getAttribute('Label') ? x.getAttribute('Label') + ': ' : '') + x.textContent).join(' ')).slice(0, 1800)
      };
    });
  }
  /* ---------- Europe PMC ---------- */
  async function europepmc(q, n = 5) {
    const d = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=${n}&sort=CITED%20desc&query=${encodeURIComponent(q + ' AND (PUB_YEAR:[' + (new Date().getFullYear() - 12) + ' TO 3000])')}`);
    return (d.resultList?.result || []).map(r => ({ src: 'Europe PMC', id: r.pmid ? 'PMID:' + r.pmid : (r.doi ? 'DOI:' + r.doi : r.id), url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : `https://europepmc.org/article/${r.source}/${r.id}`, level: /review|meta/i.test(r.pubTypeList?.pubType?.join(' ') || '') ? 'derleme' : 'çalışma', title: clean(r.title), journal: clean(r.journalInfo?.journal?.isoabbreviation || r.journalTitle), year: r.pubYear, cited: r.citedByCount, abstract: clean(r.abstractText).slice(0, 1500), oa: r.isOpenAccess === 'Y' }));
  }
  /* ---------- ClinicalTrials.gov ---------- */
  async function trials(q, n = 4) {
    const d = await getJson(`https://clinicaltrials.gov/api/v2/studies?pageSize=${n}&sort=LastUpdatePostDate&query.term=${encodeURIComponent(q)}&fields=NCTId,BriefTitle,OverallStatus,Phase,Condition,InterventionName,EnrollmentCount,StartDate`);
    return (d.studies || []).map(s => { const p = s.protocolSection || {}; const id = p.identificationModule?.nctId; return { src: 'ClinicalTrials.gov', id, url: `https://clinicaltrials.gov/study/${id}`, level: 'klinik çalışma kaydı', title: p.identificationModule?.briefTitle, year: (p.statusModule?.startDateStruct?.date || '').slice(0, 4), abstract: `Durum: ${p.statusModule?.overallStatus || '-'}; faz: ${(p.designModule?.phases || []).join(', ') || '-'}; müdahale: ${(p.armsInterventionsModule?.interventions || []).map(i => i.name).join(', ') || '-'}; katılımcı: ${p.designModule?.enrollmentInfo?.count || '-'}` }; });
  }
  /* ---------- openFDA ilaç etiketi ---------- */
  async function drug(name) {
    const q = encodeURIComponent(`openfda.generic_name:"${name}" OR openfda.brand_name:"${name}" OR openfda.substance_name:"${name}"`);
    const d = await getJson(`https://api.fda.gov/drug/label.json?limit=1&search=${q}`);
    const r = d.results?.[0]; if (!r) return null;
    const f = k => clean((r[k] || []).join(' ')).slice(0, 900);
    return { src: 'openFDA', id: r.openfda?.generic_name?.[0] || name, url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(name)}`, level: 'ilaç etiketi (FDA)', title: `${(r.openfda?.brand_name || [name]).join(', ')} (${(r.openfda?.generic_name || ['']).join(', ')})`, abstract: `Endikasyon: ${f('indications_and_usage')} | Uyarılar: ${f('warnings') || f('warnings_and_cautions')} | Etkileşimler: ${f('drug_interactions')} | Yan etkiler: ${f('adverse_reactions')}` };
  }
  /* ---------- genetik: NCBI Gene + ClinVar ---------- */
  async function gene(sym) {
    const s = await getJson(`${NCBI}esearch.fcgi?db=gene&retmode=json&${tool}&term=${encodeURIComponent(sym + '[sym] AND human[orgn]')}`);
    const id = s.esearchresult?.idlist?.[0]; if (!id) return null;
    await sleep(350);
    const g = (await getJson(`${NCBI}esummary.fcgi?db=gene&retmode=json&${tool}&id=${id}`)).result?.[id] || {};
    await sleep(350);
    const cv = await getJson(`${NCBI}esearch.fcgi?db=clinvar&retmode=json&retmax=0&${tool}&term=${encodeURIComponent(sym + '[gene] AND (clinsig_pathogenic[prop] OR clinsig_likely_pathogenic[prop])')}`).catch(() => ({}));
    return { src: 'NCBI Gene', id: 'Gene:' + id, url: `https://www.ncbi.nlm.nih.gov/gene/${id}`, level: 'gen kaydı', title: `${g.name} — ${g.description}`, abstract: `Kromozom: ${g.chromosome || '-'} (${g.maplocation || '-'}). Diğer adlar: ${g.otheraliases || '-'}. Özet: ${clean(g.summary).slice(0, 1200)} ClinVar'da patojenik/olası patojenik varyant sayısı: ${cv.esearchresult?.count ?? '?'}.` };
  }
  /* ---------- Vikipedi ---------- */
  async function wiki(q, lang = 'tr') {
    const s = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(q)}`);
    const t = s.query?.search?.[0]?.title; if (!t) return null;
    const d = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
    return { src: 'Vikipedi', id: t, url: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t)}`, level: 'ansiklopedi', title: d.title, abstract: clean(d.extract).slice(0, 1200) };
  }

  /* ---------- yapay zekâ çağrısı ---------- */
  async function ask(system, user, tier = 'default', search = false, image) {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier, system, search, image, messages: [{ role: 'user', content: user }] }) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch {} throw Error(m || 'Yapay zekâ yanıt vermedi (' + r.status + ')'); }
    return (await r.text()).replace(/\u0000[^\n]*\n?/g, '').trim();
  }
  const parseJson = t => { try { return JSON.parse((t.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch { return {}; } };

  /* ---------- DERİN ARAŞTIRMA ---------- */
  let busy = false;
  const anonym = q => { let s = String(q); for (const p of (typeof patients !== 'undefined' ? patients : [])) { if (!p.ad) continue; const re = new RegExp(p.ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'giu'); s = s.replace(re, aiName(p)); } return s; };
  async function deep(question, { voice = false, years = Number(opt('resYears')) || 12, strongOnly = opt('resStrong') === '1', status = t => setPhase('thinking', t) } = {}) {
    if (busy) throw Error('Bir araştırma zaten sürüyor');
    question = anonym(question);
    busy = true; const t0 = Date.now();
    try {
      status('Araştırma planı yapıyorum…');
      const plan = parseJson(await ask('Sen tıbbi bilgi uzmanı bir araştırma planlayıcısısın. Soruyu bilimsel veritabanlarında aranacak İNGİLİZCE terimlere çevir. Hasta adı veya kişisel bilgi ASLA yazma. YALNIZCA JSON: {"pico":{"P":"hasta/popülasyon (Türkçe)","I":"müdahale","C":"karşılaştırma veya -","O":"sonuç ölçütü"},"pubmed":"MeSH/serbest terimlerle PubMed sorgusu (AND/OR)","genel":"Europe PMC için 3-6 kelimelik İngilizce sorgu","klinik_calisma":true/false,"gen":"gen sembolü veya null","ilac":"ilacın İngilizce jenerik adı veya null","ansiklopedi":"Vikipedi başlığı (Türkçe) veya null","alan":"fizyoterapi/ortopedi/nöroloji/genetik/farmakoloji/… "}', question, 'quick'));
      const pq = plan.pubmed || question, gq = plan.genel || pq;
      status('PubMed, Europe PMC ve diğer kaynakları tarıyorum…');
      const jobs = [
        pubmed(pq, strongOnly ? 9 : 6, true, years).catch(() => []),
        strongOnly ? [] : sleep(400).then(() => pubmed(pq, 4, false, Math.min(years, 6))).catch(() => []),
        europepmc(gq, 5).catch(() => []),
        plan.klinik_calisma ? trials(gq, 3).catch(() => []) : [],
        plan.gen ? sleep(900).then(() => gene(plan.gen)).catch(() => null) : null,
        plan.ilac ? drug(plan.ilac).catch(() => null) : null,
        plan.ansiklopedi ? wiki(plan.ansiklopedi).catch(() => null) : null
      ];
      const all = (await Promise.all(jobs)).flat().filter(Boolean);
      const seen = new Set(), src = all.filter(x => { const k = x.id || x.title; if (seen.has(k)) return false; seen.add(k); return !!x.title; }).slice(0, 16);
      status(`${src.length} kaynak bulundu, kanıtı değerlendiriyorum…`);
      const corpus = src.map((x, i) => `[${i + 1}] ${x.title} — ${x.journal || x.src}${x.year ? ' ' + x.year : ''} · ${x.level}${x.cited ? ' · ' + x.cited + ' atıf' : ''} · ${x.id || ''}\n${x.abstract || '(özet yok)'}`).join('\n\n');
      const report = await ask(
        `Sen JARVIS'in tıbbi araştırma ajanısın; kullanıcı deneyimli bir fizyoterapist (Fzt. Beyhan Erden, FİZYOVİTA). Aşağıdaki bilimsel kaynakları oku, gerekirse güncel web aramasıyla tamamla ve TÜRKÇE, kanıta dayalı bir rapor yaz. Kaynakları köşeli parantezle numarasıyla göster [1]. Uydurma kaynak, uydurma sayı yazma; kanıt zayıfsa açıkça söyle.
Biçim (düz metin, başlıklar BÜYÜK HARF):
KISA CEVAP: 2-3 cümle.
KANIT ÖZETİ: maddeler; her maddede kanıt düzeyi (meta-analiz / sistematik derleme / RKÇ / kılavuz / gözlemsel / uzman görüşü) ve kaynak numarası.
KLİNİK UYGULAMA: fizyoterapist için somut öneriler (doz, süre, sıklık, ilerleme, ölçüm araçları) — kanıt neyi destekliyorsa.
KIRMIZI BAYRAKLAR VE SINIRLAR: sevk gerektiren durumlar, kontrendikasyonlar, kanıttaki boşluklar.
JARVIS'İN DEĞERLENDİRMESİ: tüm kanıtı tartarak kendi net sonucun ve güven düzeyin (yüksek/orta/düşük) — gerekçesiyle.
Uzunluk en fazla 650 kelime. Son satır: "${DISCLAIMER}"`,
        `SORU: ${question}\nALAN: ${plan.alan || '-'}\n\nKAYNAKLAR:\n${corpus || '(veritabanlarından sonuç gelmedi; yalnız güncel web aramasına ve genel bilgine dayan ve bunu belirt)'}`, 'complex', true);
      const pico = plan.pico && plan.pico.P ? `PICO · P: ${plan.pico.P} · I: ${plan.pico.I || '-'} · C: ${plan.pico.C || '-'} · O: ${plan.pico.O || '-'}` : '';
      const out = { question, report: (pico ? pico + '\n\n' : '') + report, sources: src, plan, ms: Date.now() - t0 };
      store.set('research', [{ t: Date.now(), q: question, report, sources: src.map(({ title, url, id, level, year }) => ({ title, url, id, level, year })) }, ...store.get('research', [])].slice(0, 30));
      logOp('derin araştırma', [short(question, 80)], 'başarılı', `${src.length} kaynak · ${Math.round(out.ms / 1000)} sn`);
      return out;
    } finally { busy = false; }
  }
  function showReport(r, voice) {
    const n = bubble('ai', r.report);
    addLinks(n.el, r.sources.slice(0, 12).map((s, i) => ({ url: s.url, title: `[${i + 1}] ${short(s.title, 60)}${s.year ? ' (' + s.year + ')' : ''}` })));
    answerTools(n.el, r.report);
    const bar = el('div', { class: 'tool' },
      el('button', { type: 'button', onclick: () => { const t = vancouver(r.sources); navigator.clipboard?.writeText(t).then(() => note('Kaynakça (Vancouver) kopyalandı.'), () => { const b = bubble('ai', t); answerTools(b.el, t); }); } }, 'Kaynakça (Vancouver)'),
      el('button', { type: 'button', onclick: () => patientSheet(r).catch(e => note(e.message)) }, 'Hasta için sade anlatım'),
      el('button', { type: 'button', onclick: () => { window.jarvisResearch2?.follow(r.question); } }, 'Konuyu takibe al'));
    n.el.append(bar);
    setPhase('idle', `Araştırma tamam · ${r.sources.length} kaynak · ${Math.round(r.ms / 1000)} sn`);
    if (voice && setting('speakOn') === '1') { const k = (r.report.match(/KISA CEVAP:?\s*([\s\S]*?)(?:\n[A-ZÇĞİÖŞÜ' ]{6,}:|$)/) || [])[1]; if (k) voiceSession.read(k.trim() + ' Ayrıntılı rapor ve kaynaklar ekranda.'); }
  }
  function vancouver(src) {
    return src.map((x, i) => `${i + 1}. ${x.authors?.length ? x.authors.join(', ') + (x.more ? ', et al' : '') + '. ' : ''}${x.title}${/[.?!]$/.test(x.title || '') ? '' : '.'} ${x.journal ? x.journal + '. ' : ''}${x.year ? x.year + '. ' : ''}${x.doi ? 'doi:' + x.doi + '. ' : ''}${/^PMID/.test(x.id || '') ? x.id.replace(':', ': ') + '.' : x.id ? x.id + '.' : ''} ${x.url || ''}`.trim()).join('\n');
  }
  async function patientSheet(r) {
    setPhase('thinking', 'Hasta için sade anlatım hazırlıyorum…');
    try {
      const t = await ask('Sen FİZYOVİTA Fizik Tedavi Merkezi için hasta bilgilendirme metni yazan bir fizyoterapistsin. Aşağıdaki kanıt raporundan HASTANIN anlayacağı, tıbbi terim içermeyen (gerekirse parantezle açıkla), sıcak ve cesaretlendirici bir TÜRKÇE bilgi notu yaz: 1) Durumunuz hakkında kısaca, 2) Tedavide ne yapacağız ve neden, 3) Evde yapmanız gerekenler (madde), 4) Ne zaman hemen haber vermelisiniz (kırmızı bayraklar), 5) Ne kadar sürede düzelme beklenir. En fazla 250 kelime. Kaynak numarası, yüzde, istatistik yazma. Sonuna: "Sorularınız için: FİZYOVİTA — Fzt. Beyhan Erden"', r.report, 'default');
      const n = bubble('ai', t); answerTools(n.el, t); setPhase('idle', 'Hazır.');
    } catch (e) { setPhase('idle', 'Hazır.'); throw e; }
  }
  async function runDeep(q, voice = false) {
    if (window.jarvisUltra?.guest?.()) return note('Misafir modunda araştırma merkezi kapalı.');
    bubble('me', '🔬 ' + q);
    try { showReport(await deep(q, { voice }), voice); } catch (e) { setPhase('idle', 'Hazır.'); note('Araştırma yapılamadı: ' + e.message); }
  }

  /* ---------- GÖRÜNTÜ YORUMLAMA ---------- */
  async function imageRead(file, kind = 'otomatik', context = '') {
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const mediaType = file.type || 'image/jpeg';
    const sys = `Sen JARVIS'in tıbbi görüntü ön-değerlendirme modülüsün; kullanıcı deneyimli bir fizyoterapist. Görüntü bir ${kind === 'otomatik' ? 'tıbbi görüntü (röntgen/MR/BT/USG ya da rapor fotoğrafı — önce türünü belirle)' : kind} olabilir; bazen ekran/kâğıt fotoğrafıdır ve kalite sınırlıdır.
TÜRKÇE, düz metin, şu başlıklarla yaz:
GÖRÜNTÜ: tür, bölge, kesit/sekans veya projeksiyon, kalite ve sınırlılıklar.
GÖZLENENLER: gördüğün bulgular, tarafsız ve tanımlayıcı (yer, boyut tahmini, sinyal/dansite, hizalanma, eklem aralığı, dejenerasyon, kırık hattı, ödem vb.). Emin olmadığın şeyi "olası" diye işaretle; görmediğini uydurma.
OLASI YORUMLAR: ayırıcı tanı listesi, en olasıdan aza.
KIRMIZI BAYRAKLAR: acil sevk gerektirebilecek bulgular (kırık, kord basısı, kauda ekina belirtisi, tümör şüphesi, enfeksiyon vb.).
FİZYOTERAPİ İÇİN ANLAMI: rehabilitasyona etkisi, dikkat edilmesi gereken hareketler, hangi testlerle doğrulanmalı.
GÜVEN: yüksek/orta/düşük ve nedeni.
Son satır: "Bu bir ön değerlendirmedir; kesin yorum radyolog raporuna aittir."`;
    return ask(sys, (context ? 'Klinik bağlam: ' + context + '\n' : '') + 'Bu görüntüyü değerlendir.', 'complex', false, { mediaType, data });
  }

  /* ---------- araçlar ---------- */
  const fmt = list => list.length ? list.map((x, i) => `[${i + 1}] ${x.title} — ${x.journal || x.src} ${x.year || ''} · ${x.level} · ${x.id || ''}\n${short(x.abstract || '', 500)}`).join('\n\n') : 'Sonuç yok.';
  Object.assign(TOOLS, {
    pubmed: { d: 'pubmed|İngilizce sorgu|güçlü (yalnız meta-analiz/sistematik derleme/RKÇ/kılavuz) — PubMed makaleleri ve özetleri', run: async ([q, s]) => fmt(await pubmed(q, 6, /g[uü]?c|strong|1/i.test(s || ''), 0)) },
    europepmc: { d: 'europepmc|İngilizce sorgu — Europe PMC: çok atıf alan güncel makaleler ve özetleri', run: async ([q]) => fmt(await europepmc(q, 6)) },
    klinik_calisma: { d: 'klinik_calisma|İngilizce sorgu — ClinicalTrials.gov kayıtlı klinik çalışmalar', run: async ([q]) => fmt(await trials(q, 5)) },
    ilac_bilgi: { d: 'ilac_bilgi|İngilizce jenerik ad — FDA ilaç etiketi: endikasyon, uyarılar, etkileşim, yan etki', run: async ([q]) => { const r = await drug(q); return r ? fmt([r]) : 'FDA etiketinde bulunamadı.'; } },
    gen: { d: 'gen|gen sembolü (ör. COL1A1) — NCBI Gene özeti ve ClinVar patojenik varyant sayısı', run: async ([q]) => { const r = await gene(q); return r ? fmt([r]) : 'Gen bulunamadı.'; } },
    ansiklopedi: { d: 'ansiklopedi|konu|tr/en — Vikipedi özeti', run: async ([q, l]) => { const r = await wiki(q, /en/i.test(l || '') ? 'en' : 'tr'); return r ? fmt([r]) : 'Bulunamadı.'; } },
    derin_arastirma: { d: 'derin_arastirma|soru — PubMed+Europe PMC+klinik çalışma+ilaç+gen+ansiklopedi+web taraması, kanıt düzeyli Türkçe rapor ve JARVIS’in değerlendirmesi (30-60 sn). Tıbbi/bilimsel her derin soruda kullan.', run: async ([q]) => { const r = await deep(q); setTimeout(() => showReport(r, false), 50); return 'Rapor hazırlandı ve ekrana kondu (' + r.sources.length + ' kaynak). Kısa cevabı söyle: ' + short((r.report.match(/KISA CEVAP:?\s*([\s\S]*?)\n/) || [])[1] || '', 400); } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nARAŞTIRMA MERKEZİ: Tıbbi, fizyoterapi, ortopedi, nöroloji, farmakoloji, genetik veya bilimsel bir konuda derinlemesine/kanıta dayalı soru gelirse derin_arastirma kullan; hızlı makale bakışı için pubmed (sorgu İngilizce). İlaç için ilac_bilgi, gen için gen. Dış kaynaklara hasta adı veya kişisel bilgi gönderme. Tıbbi görüntü (röntgen/MR) eklenirse yapılandırılmış ön değerlendirme yap ve radyolog raporunun esas olduğunu belirt.';

  /* ---------- sesli komutlar ---------- */
  const _lc = localCommand;
  localCommand = text => {
    const m = text.trim().match(/^(?:hey\s+)?(?:jarvis[,\s]+)?(?:derin(?:lemesine)?\s+)?(?:araştır|araştırma yap|kanıtları? (?:bul|tara)|literatür(?:ü)? tara)\s*[:,-]?\s+(.{4,})$/i);
    if (m && !window.jarvisUltra?.guest?.()) { setTimeout(() => runDeep(m[1].trim(), true), 30); return `“${short(m[1], 80)}” için PubMed, Europe PMC ve diğer kaynakları tarıyorum; 30-60 saniye sürer.`; }
    return _lc(text);
  };

  /* ---------- ARAŞTIRMA paneli ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-research', 'aria-selected': 'false', 'data-p': 'research' }, 'ARAŞTIRMA');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-research'); renderHist(); };
  const qIn = el('textarea', { id: 'resQ', rows: 3, placeholder: 'Ör. Kronik bel ağrısında McKenzie ile stabilizasyon egzersizlerinin karşılaştırılması · Ön çapraz bağ rekonstrüksiyonu sonrası koşuya dönüş kriterleri · COL5A1 varyantları ve tendinopati' });
  const imgIn = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const kindSel = el('select', { id: 'imgKind' }); for (const k of ['otomatik', 'düz röntgen', 'MR', 'BT', 'ultrason', 'radyoloji raporu fotoğrafı']) kindSel.append(new Option(k[0].toLocaleUpperCase('tr-TR') + k.slice(1), k));
  const ctxIn = el('input', { id: 'imgCtx', placeholder: 'Klinik bağlam (isteğe bağlı): ör. 45 y, sağ omuz ağrısı 3 ay, abdüksiyonda ağrı' });
  imgIn.onchange = async () => {
    const f = imgIn.files[0]; imgIn.value = ''; if (!f) return;
    if (window.jarvisUltra?.guest?.()) return note('Misafir modunda kapalı.');
    $('drawer').classList.remove('open');
    const url = URL.createObjectURL(f); bubble('me', '🩻 Görüntü yorumla · ' + kindSel.value + (ctxIn.value ? ' · ' + ctxIn.value : ''), { image: url });
    setPhase('thinking', 'Görüntüyü inceliyorum…');
    try { const t = await imageRead(f, kindSel.value, ctxIn.value.trim()); const n = bubble('ai', t); answerTools(n.el, t); logOp('görüntü yorumu', [kindSel.value], 'başarılı'); setPhase('idle', 'Hazır.'); }
    catch (e) { setPhase('idle', 'Hazır.'); note('Görüntü değerlendirilemedi: ' + e.message); }
  };
  const p = el('div', { class: 'pane', id: 'p-research', role: 'tabpanel' },
    el('h3', {}, 'DERİN ARAŞTIRMA'),
    el('p', { class: 'muted' }, 'PubMed · Europe PMC · ClinicalTrials.gov · FDA ilaç etiketi · NCBI Gene/ClinVar · Vikipedi · güncel web. Kanıt düzeyiyle Türkçe rapor ve JARVIS’in kendi değerlendirmesi. Sesle: “Jarvis, araştır: …”'),
    qIn,
    el('div', { class: 'row resfilters' },
      (() => { const s = el('select', { id: 'resYears', 'aria-label': 'Yayın yılı aralığı' }); for (const [v, t] of [['5', 'Son 5 yıl'], ['12', 'Son 12 yıl'], ['30', 'Son 30 yıl']]) s.append(new Option(t, v)); s.value = store.get('set.resYears', '12') || '12'; s.onchange = () => store.set('set.resYears', s.value); return s; })(),
      (() => { const s = el('select', { id: 'resStrong', 'aria-label': 'Kanıt düzeyi' }); for (const [v, t] of [['0', 'Tüm kanıt'], ['1', 'Yalnız güçlü kanıt (meta-analiz, SR, RKÇ, kılavuz)']]) s.append(new Option(t, v)); s.value = store.get('set.resStrong', '0') || '0'; s.onchange = () => store.set('set.resStrong', s.value); return s; })()),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: () => { const q = qIn.value.trim(); if (q.length < 4) return note('Araştırılacak soruyu yaz.'); $('drawer').classList.remove('open'); runDeep(q); } }, 'Derin araştır'),
      el('button', { type: 'button', class: 'btn ghost', onclick: async () => { const q = qIn.value.trim(); if (q.length < 3) return; try { const r = await pubmed(q, 8, true); const n = bubble('ai', r.length ? r.map((x, i) => `[${i + 1}] ${x.title} — ${x.journal} ${x.year} · ${x.level}`).join('\n') : 'Sonuç yok (sorguyu İngilizce dene).'); addLinks(n.el, r.map((x, i) => ({ url: x.url, title: `[${i + 1}] ${short(x.title, 60)}` }))); $('drawer').classList.remove('open'); } catch (e) { note(e.message); } } }, 'Hızlı PubMed (güçlü kanıt)')),
    el('h3', {}, 'GÖRÜNTÜ YORUMLAMA'),
    el('p', { class: 'muted' }, 'Röntgen, MR, BT, ultrason görüntüsü ya da rapor fotoğrafı. Bulgular, olası yorumlar, kırmızı bayraklar ve fizyoterapi için anlamı. Ön değerlendirmedir; kesin yorum radyoloğa aittir.'),
    el('div', { class: 'field' }, el('label', { for: 'imgKind' }, 'Görüntü türü'), kindSel), ctxIn,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => imgIn.click() }, 'Görüntü seç ve yorumla'), imgIn),
    el('h3', {}, 'GEÇMİŞ ARAŞTIRMALAR'), el('ul', { class: 'list', id: 'resHist' }));
  p.hidden = true; $('p-settings').before(p);
  function renderHist() {
    const h = store.get('research', []);
    $('resHist').replaceChildren(...(h.length ? h.map(r => el('li', { class: 'item' }, el('span', {}, '🔬'), el('div', {}, el('p', {}, r.q), el('small', {}, dateTR(r.t) + ' · ' + r.sources.length + ' kaynak')), el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('drawer').classList.remove('open'); showReport({ ...r, ms: 0, report: r.report, sources: r.sources }, false); } }, 'Aç'))) : [el('li', { class: 'muted' }, 'Henüz araştırma yok.')]));
  }
  window.jarvisResearch = { ask, vancouver, patientSheet, showReport, pubmed, europepmc, trials, drug, gene, wiki, deep, runDeep, imageRead };
})();
