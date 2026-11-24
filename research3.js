'use strict';
/* SATÜRN 19 — DERİN WEB ARAŞTIRMASI (genel konular; tıbbi konular mevcut PubMed/kanıt hattına gider)
 *  1) Planlama: soru 3-4 alt soruya bölünür (Türkçe + İngilizce kaynak hedefli)
 *  2) Paralel arama: her alt soru Google aramalı Gemini ile → bulgu + gerçek kaynak bağlantıları; + Vikipedi özeti (kotasız)
 *  3) Sentez: yalnız toplanan kaynaklara dayanan, numaralı atıflı rapor (özet, bulgular, rakamlar, farklı görüşler, sonuç)
 *  4) Gösterim: kaynaklar tıklanır, ilgili görseller ana ekranda, rapor indirilebilir, “devamını araştır” ile derinleşir. */
(() => {
  const jsonOf = t => { try { return JSON.parse((String(t).match(/[[{][\s\S]*[\]}]/) || ['null'])[0]); } catch { return null; } };
  async function askWeb(system, user, tier = 'quick', search = true) {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier, system, search, messages: [{ role: 'user', content: user }] }) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch {} throw Error(m || 'Yapay zekâ yanıt vermedi (' + r.status + ')'); }
    const raw = await r.text();
    let sources = [];
    const si = raw.indexOf('\u0000SRC:'); if (si >= 0) { try { sources = JSON.parse(raw.slice(si + 5).split('\u0000')[0]); } catch {} }
    const err = (raw.match(/\u0000ERR:([^\u0000]*)/) || [])[1];
    const text = raw.split('\u0000')[0].trim();
    if (!text && err) throw Error(err);
    return { text, sources: sources.filter(s => /^https?:\/\//.test(s.url || '')) };
  }
  const MED = /(ağrı|hasta|tedavi|egzersiz|fizyoterapi|rehabilitasyon|kas\b|eklem|disk|tendon|bağ\b|ligament|menisküs|kırık|ameliyat|sendrom|hastalık|ilaç|doz|klinik|tanı|semptom|belirti|sinir|omurga|skolyoz|fıtık|artrit|artroz|osteo|nöro|inme|felç|diyabet|kanser|tümör|gen\b|genetik|mutasyon|mr\b|röntgen|pubmed|kanıt|meta-analiz)/i;
  const isMedical = q => MED.test(q);
  let busy = false;
  async function deepWeb(question, { depth = 1, prev = null } = {}) {
    question = String(question || '').trim(); if (question.length < 4) throw Error('Neyi araştırayım?');
    if (busy) throw Error('Bir araştırma zaten sürüyor.');
    busy = true;
    try {
      setPhase('thinking', 'Araştırmayı planlıyorum…');
      const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      let plan = jsonOf(await window.jarvisResearch.ask(`Sen bir araştırma planlayıcısısın. Bugün ${today}. Soruyu, iyi bir raporu mümkün kılacak 3 veya 4 FARKLI alt soruya böl: tanım/arka plan, güncel durum ve rakamlar, farklı görüşler/karşılaştırma, pratik sonuç. Uygun olanları İngilizce yaz (uluslararası kaynak için), Türkiye'yle ilgiliyse Türkçe. YALNIZ JSON: {"konu":"kısa konu adı","alt":["…","…"],"gorsel":"konunun görsel araması için 1-3 kelime"}`, prev ? `ÖNCEKİ RAPOR ÖZETİ: ${prev.slice(0, 1500)}\nŞİMDİ DAHA DERİNE İN: ${question}` : question, 'quick'));
      if (!plan?.alt?.length) plan = { konu: question, alt: [question], gorsel: question };
      const subs = plan.alt.slice(0, 4).map(String);
      if (plan.gorsel && window.jarvisStage) window.jarvisStage.showSearch(plan.gorsel, { quiet: true });
      setPhase('thinking', `${subs.length} yönden internette araştırıyorum…`);
      const finds = await Promise.allSettled(subs.map(s => askWeb(`Sen titiz bir araştırmacısın. Bugün ${today}. Google aramasıyla bu alt soruyu araştır ve TÜRKÇE, olgusal, 120-180 kelimelik bulgu notu yaz: somut rakamlar, tarihler, kim/ne/nerede. Tahmin yürütme; kaynakta yoksa yazma; çelişkili bilgileri belirt.`, s, 'quick', true)));
      // kaynakları birleştir + numarala
      const src = [], idx = new Map();
      const notes = finds.map((f, i) => {
        if (f.status !== 'fulfilled') return `(${subs[i]}: bilgi alınamadı)`;
        const nums = f.value.sources.slice(0, 6).map(s => { const k = s.url.replace(/[#?].*$/, ''); if (!idx.has(k)) { src.push(s); idx.set(k, src.length); } return idx.get(k); });
        return `ALT SORU: ${subs[i]}\nKAYNAK NUMARALARI: ${nums.map(n => '[' + n + ']').join(' ') || 'yok'}\nBULGU: ${f.value.text}`;
      });
      if (!finds.some(f => f.status === 'fulfilled')) throw Error(finds[0]?.reason?.message || 'internet araması yapılamadı');
      setPhase('thinking', 'Bulguları birleştirip rapor yazıyorum…');
      const report = await window.jarvisResearch.ask(`Sen üst düzey bir araştırma analistisin. Aşağıdaki bulgu notlarından TÜRKÇE, net ve profesyonel bir rapor yaz. Bugün ${today}.
BİÇİM (düz metin, başlıklar büyük harf):
KISA CEVAP: 2-3 cümle, doğrudan.
ANA BULGULAR: 4-7 madde; her maddenin sonunda dayandığı kaynak numaraları [1][3].
RAKAMLAR VE TARİHLER: varsa önemli sayılar (kaynaklı).
FARKLI GÖRÜŞLER / BELİRSİZLİKLER: tartışmalı veya eksik noktalar.
SONUÇ: Beyhan için pratik çıkarım (1-3 cümle).
KURALLAR: Yalnız notlardaki bilgiye dayan, yeni bilgi uydurma; kaynak numarası yalnız notlarda geçenlerden olsun; siyasi konularda taraf tutma; güncel olmayabilecek bilgiyi belirt.`, notes.join('\n\n'), 'complex');
      const out = { q: question, konu: plan.konu || question, report: report.trim(), sources: src, t: Date.now(), subs };
      const h = store.get('webResHist', []); h.unshift({ q: out.q, konu: out.konu, t: out.t, report: out.report.slice(0, 6000), sources: src.slice(0, 20) }); store.set('webResHist', h.slice(0, 15));
      logOp('derin web araştırması', [short(question, 60)], 'başarılı', `${subs.length} alt soru · ${src.length} kaynak`);
      return out;
    } finally { busy = false; setPhase('idle', 'Hazır.'); }
  }
  function show(r) {
    const body = `🔎 ${r.konu.toUpperCase()}\n${r.report}${r.sources.length ? '\n\nKAYNAKLAR:\n' + r.sources.map((s, i) => `[${i + 1}] ${s.title || new URL(s.url).hostname}`).join('\n') : ''}`;
    const n = bubble('ai', body);
    addLinks(n.el, r.sources.slice(0, 12).map((s, i) => ({ url: s.url, title: `[${i + 1}] ${short(s.title || new URL(s.url).hostname, 60)}` })));
    const more = el('input', { class: 'vref', placeholder: 'Devamını araştır: ör. Türkiye’deki durum, maliyetler, son 1 yıl' });
    n.el.append(el('div', { class: 'row vrow' }, more, el('button', { type: 'button', class: 'btn', onclick: () => { const v = more.value.trim(); if (!v) return more.focus(); run(v, { prev: r.report }); more.value = ''; } }, '🔎 Derinleş')),
      el('div', { class: 'tool' },
        el('button', { type: 'button', onclick: () => { const md = `# ${r.konu}\n\n_${new Date(r.t).toLocaleString('tr-TR')} · SATÜRN derin araştırma_\n\n${r.report}\n\n## Kaynaklar\n${r.sources.map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`).join('\n')}\n`; const a = el('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `arastirma-${Date.now()}.md` }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Raporu indir'),
        el('button', { type: 'button', onclick: () => window.jarvisStage?.runDesign?.(`“${r.konu}” konusunun özet infografiği. Ana bulgular:\n${r.report.slice(0, 1800)}`, { format: 'infografik' }) }, '✦ İnfografiğe dönüştür')));
    answerTools(n.el, r.report);
    window.jarvisArchive?.('Araştırma: ' + r.konu, r.report);
  }
  async function run(q, o = {}) {
    bubble('me', '🔎 Derin araştırma: ' + q);
    try { const r = await deepWeb(q, o); show(r); return r; }
    catch (e) { note('Araştırma tamamlanamadı: ' + e.message); }
  }

  Object.assign(TOOLS, {
    web_arastir: { d: 'web_arastir|soru — GENEL konularda (teknoloji, ekonomi, hukuk, eğitim, seyahat, ürün, tarih, güncel olaylar) çok kaynaklı derin internet araştırması ve atıflı rapor; tıbbi konularda derin_arastirma kullan', run: async ([q]) => { const r = await deepWeb(q); setTimeout(() => show(r), 30); return 'Rapor ekranda. KISA CEVAP: ' + short((r.report.match(/KISA CEVAP:?\s*([\s\S]*?)(\n[A-ZÇĞİÖŞÜ /]{6,}:|$)/) || [])[1] || r.report, 500); } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nARAŞTIRMA: genel bir konuyu “araştır / detaylı incele / karşılaştır” deniyorsa web_arastir; tıbbi/klinik konuysa derin_arastirma.';
  TOOL_GROUPS.push([/araştır|incele|karşılaştır|detaylı|derinlemesine|rapor hazırla|nedir|kimdir|nasıl çalışır|fark/i, /^(web_arastir)$/]);
  const _lc = localCommand;
  localCommand = text => {
    if (window.jarvisUltra?.guest?.()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:derin(?:lemesine)?\s+|detaylı\s+|internette\s+|webde\s+)?(?:araştır|araştırma yap|incele)\s*[:,-]\s*(.{4,})$/i)) || (m = t.match(/^(.{4,}?)\s+(?:hakkında|konusunda)\s+(?:derin|detaylı|kapsamlı)?\s*(?:araştırma yap|araştır|rapor hazırla)\.?$/i)) || (m = t.match(/^(?:karşılaştır)\s*[:,-]\s*(.{4,})$/i))) {
      if (isMedical(m[1]) && !/internette|webde/i.test(t)) return _lc(text); // tıbbi → PubMed/kanıt hattı
      const q = m[1]; setTimeout(() => run(/^karşılaştır/i.test(t) ? 'Karşılaştır: ' + q : q), 30);
      return '🔎 Derin araştırma: plan → çoklu internet araması → atıflı rapor (30-60 sn)…';
    }
    return _lc(text);
  };
  window.jarvisWebResearch = { deepWeb, run, show, askWeb, isMedical, hist: () => store.get('webResHist', []) };
})();
