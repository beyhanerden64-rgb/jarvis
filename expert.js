'use strict';
/* SATÜRN 21 — UZMAN ZİHİN
 *  1) Otomatik alan uzmanlığı: her soruda konu tanınır (fizyoterapi/klinik, tıp/ilaç, hukuk/SGK/KVKK, vergi/muhasebe, finans,
 *     işletme/pazarlama, teknoloji, akademik yazım, gündem) ve o alanın uzman çerçevesi o tura eklenir (kota harcamaz).
 *  2) Derinlik kuralları: somut ve sayısal ol, mekanizmayı açıkla, varsayımları yaz, alternatif açıklamaları düşün,
 *     eksik kritik bilgi varsa cevabın SONUNDA en fazla 2 hedefli soru sor.
 *  3) Aktif devam: uzun cevapların sonunda “sonraki adım” önerileri tek dokunuşluk düğme olur.
 *  4) DERİN ANALİZ: “analiz et: …” → önce en ince ayrıntıyı soran hedefli sorular (seçenekli) → gerekirse internetten veri →
 *     yönetici özeti, kök nedenler, seçenekler (artı/eksi/risk/maliyet), öneri, eylem planı, ölçütler, varsayımlar.
 *     Eylem planı tek dokunuşla görev listesine, rapor infografiğe/dosyaya. */
(() => {
  const jsonOf = t => { try { return JSON.parse((String(t).match(/[[{][\s\S]*[\]}]/) || ['null'])[0]); } catch { return null; } };
  const DOMAINS = [
    ['fizyo', /fizyoterapi|rehabilitasyon|egzersiz|ağrı|bel|boyun|omuz|diz|kalça|ayak bileği|menisküs|bağ yırt|tendin|fıtık|skolyoz|postür|manuel terapi|mobilizasyon|kinezyo|tens|ultrason tedavi|elektroterapi|seans|ROM|eklem hareket|kas gücü|propriosepsiyon|felç|inme|parkinson|ms hastal|serebral palsi|ameliyat sonrası/i,
      'FİZYOTERAPİ UZMANI (klinik akıl yürütme): şikâyeti hipotezlere dönüştür → ayırıcı tanı → hangi testlerle doğrulanır (özel testler, duyarlılık/özgüllük biliniyorsa yaz) → kırmızı bayraklar (sevk kriterleri) → ICF çerçevesi (vücut yapısı/aktivite/katılım) → kanıta dayalı tedavi (kanıt düzeyiyle) → dozaj FITT (set×tekrar, yoğunluk, sıklık, süre) ve ilerleme kriterleri → ölçüm (VAS, ölçek, MCID) → hasta eğitimi. Terimlerin Türkçesini ve parantez içinde İngilizcesini ver.'],
    ['tip', /ilaç|doz|yan etki|etkileşim|tahlil|kan değer|tansiyon|şeker|kolesterol|enfeksiyon|ateş|antibiyotik|hastalık|semptom|belirti|teşhis|tanı|kanser|kalp|böbrek|karaciğer|tiroid|vitamin|gebelik/i,
      'TIP DANIŞMANI: patofizyolojiyi kısaca açıkla, olası nedenleri olasılık sırasıyla ver, hangi bulgunun neyi ayırt ettiğini söyle; ilaçta etken madde, doz aralığı, kontrendikasyon ve etkileşimleri belirt; acil durum belirtilerini ayrı yaz; kesin tanı ve tedavi kararının hekime ait olduğunu bir cümleyle hatırlat.'],
    ['hukuk', /kanun|yasa|mevzuat|yönetmelik|dava|avukat|sözleşme|kira|tazminat|işçi|işveren|kıdem|ihbar|sgk|sigorta prim|kvkk|kişisel veri|ruhsat|izin belgesi|ceza|mahkeme|noter|vekalet|miras|boşanma|tapu/i,
      'HUKUK DANIŞMANI (Türk hukuku): ilgili kanun/yönetmelik adını ve mümkünse madde numarasını yaz, kuralı sade dille açıkla, şartları ve istisnaları madde madde ver, süreleri ve başvuru yerlerini belirt; sağlık kuruluşu ve KVKK yükümlülüklerine özellikle dikkat et; mevzuat değişmiş olabileceğinden güncelliğini teyit etmesini ve önemli işlerde avukata danışmasını söyle.'],
    ['vergi', /vergi|kdv|stopaj|fatura|e-arşiv|muhasebe|mali müşavir|gelir vergisi|beyanname|bağkur|serbest meslek|makbuz|amortisman|gider yaz/i,
      'VERGİ/MUHASEBE UZMANI: ilgili vergi türünü, oranı, matrahı ve beyan dönemini açıkla; serbest meslek / işletme ayrımını yap; örnek hesapla göster; belge (fatura/serbest meslek makbuzu) gerekliliklerini belirt; oranlar değişebileceği için mali müşavirle teyidi hatırlat.'],
    ['finans', /yatırım|borsa|hisse|faiz|enflasyon|kredi|mevduat|altın|döviz|kripto|bitcoin|fon|portföy|getiri|risk|bütçe|tasarruf|emeklilik/i,
      'FİNANS ANALİSTİ: getiriyi her zaman riskle birlikte ver; enflasyona göre reel getiriyi hesapla; senaryoları (iyimser/temel/kötümser) olasılıkla anlat; masrafları, vergiyi ve likiditeyi hesaba kat; garanti verme, kesin al/sat deme.'],
    ['isletme', /müşteri|hasta kazan|pazarlama|reklam|instagram|kampanya|fiyat(landırma)?|ciro|kâr|maliyet|personel|çalışan|randevu doluluk|verimlilik|strateji|rakip|marka|klinik yönetim|şube|büyüme/i,
      'İŞLETME DANIŞMANI (sağlık hizmetleri): birim ekonomisini çıkar (hasta başı gelir, seans maliyeti, doluluk), kök nedeni bul, 2-4 seçenek üret ve her birini etki/maliyet/süre/risk ile karşılaştır, ölçülebilir hedef (KPI) ve 30-60-90 günlük eylem planı ver; Cizre/Şırnak yerel koşullarını ve sağlık reklam etiğini gözet.'],
    ['teknoloji', /yazılım|kod|uygulama|site|bilgisayar|telefon ayar|internet|wifi|excel|word|yapay zek|program kur|hata kodu|güvenlik açığı|şifre/i,
      'TEKNOLOJİ UZMANI: sorunu adım adım teşhis et (en olası nedenden başla), her adımda neye bakılacağını ve beklenen sonucu yaz, kesin komut/ayar yolunu ver, veri kaybı riski olan adımları önceden uyar.'],
    ['akademik', /makale|tez|literatür|kaynakça|apa|vancouver|özet yaz|abstract|yöntem bölümü|istatistik|anket tasarla|örneklem|p değeri|etki büyüklüğü|kongre|bildiri/i,
      'AKADEMİK DANIŞMAN: araştırma sorusunu PICO ile netleştir, uygun tasarım ve istatistiği öner, örneklem/güç hesabını açıkla, yazımda bölüm yapısını ve dili akademik tut; kaynak uydurma, yalnız gerçek ve doğrulanabilir kaynak öner.'],
    ['gundem', /seçim|hükümet|cumhurbaşkanı|bakan|meclis|parti|savaş|ateşkes|ülke|diplomasi|yaptırım|dünya gündemi|son dakika/i,
      'GÜNDEM ANALİSTİ: olguyu yorumdan ayır, tarafların resmî tutumlarını tarafsız aktar, kronoloji ver, olası etkileri (Türkiye ve ekonomi) olasılıkla değerlendir; hiçbir siyasi tarafı övme/yerme, doğrulanmamış iddiayı “iddia” diye belirt.']
  ];
  const domainOf = q => DOMAINS.filter(([, re]) => re.test(q || '')).slice(0, 2);
  const DEPTH = `UZMAN DERİNLİK KURALLARI: Genel geçer cümle kurma; somut, sayısal ve mekanizmayı açıklayan cevap ver. Varsayımın varsa açıkça yaz. Tek açıklamaya saplanma, alternatifleri düşün. Emin olmadığını söyle, uydurma.
Cevabı geciktirmeden ver; ama sonucu belirgin biçimde değiştirecek KRİTİK bir bilgi eksikse cevabın sonunda en fazla 2 hedefli soru sor (“Daha iyi yönlendirmem için: …?”).`;
  const FOLLOW = `Uzun ve konulu (sesli olmayan) cevaplarda EN SONA ayrı satırda Beyhan'ın dokunarak sorabileceği 2-3 kısa devam önerisi ekle: ⟦DEVAM|öneri 1|öneri 2|öneri 3⟧ (her biri en çok 8 kelime, birinci tekil emir kipi: “Haftalık programı çıkar” gibi). Kısa sohbet cevaplarında ekleme.`;
  const _ins = instructions;
  instructions = v => {
    const base = _ins(v);
    if (window.jarvisKlinik2?.interp?.() || window.jarvisUltra?.guest?.() || opt('expertAuto') === '0') return base;
    const q = String(window.jarvisCurText || '');
    const persona = (typeof setting === 'function' && setting('persona')) || 'genel';
    const ds = persona === 'genel' || persona === '' ? domainOf(q) : [];
    return base + '\n\n' + (ds.length ? 'BU SORU İÇİN UZMANLIK ÇERÇEVESİ:\n' + ds.map(d => '• ' + d[2]).join('\n') + '\n' : '') + DEPTH + (v ? '' : '\n' + FOLLOW);
  };

  /* ---------- devam önerileri → düğmeler ---------- */
  const _aa = applyActions;
  applyActions = full => {
    _aa(full);
    try {
      const m = String(full || '').match(/⟦DEVAM\|([^⟧]*)⟧/); if (!m) return;
      const opts = m[1].split('|').map(s => s.trim()).filter(s => s.length > 2 && s.length < 90).slice(0, 3); if (!opts.length) return;
      const last = [...document.querySelectorAll('.msg.ai')].at(-1); if (!last || last.querySelector('.nextbar')) return;
      last.append(el('div', { class: 'nextbar' }, ...opts.map(o => el('button', { type: 'button', class: 'chip', onclick: () => { window.jarvisUnlock?.(); typedTurn(o); } }, '➜ ' + o))));
    } catch {}
  };

  /* ---------- DERİN ANALİZ (soran → araştıran → analiz eden) ---------- */
  async function questions(topic) {
    const ds = domainOf(topic).map(d => d[2]).join(' ');
    const raw = await window.jarvisResearch.ask(`Sen titiz bir uzman danışmansın${ds ? ' (' + ds.slice(0, 300) + ')' : ''}. Beyhan'ın konusunu en ince ayrıntısına kadar analiz etmeden ÖNCE sonucu en çok etkileyecek bilgileri öğrenmen gerekiyor.
3-5 HEDEFLİ soru üret: her biri tek bir eksik bilgiyi sorsun (hedef, kısıtlar, bütçe/süre, mevcut durum ve rakamlar, denenmiş çözümler, öncelik). Mümkünse 2-4 kısa seçenek ver. Ayrıca güncel internet verisi gerekip gerekmediğine karar ver.
YALNIZ JSON: {"konu":"kısa başlık","sorular":[{"soru":"…","secenekler":["…","…"]}],"web":true|false,"aramalar":["en çok 2 arama sorgusu"]}`, topic, 'quick');
    const j = jsonOf(raw);
    if (!j?.sorular?.length) return { konu: topic, sorular: [], web: false, aramalar: [] };
    j.sorular = j.sorular.slice(0, 5).map(q => ({ soru: String(q.soru || q).slice(0, 200), secenekler: (Array.isArray(q.secenekler) ? q.secenekler : []).map(String).slice(0, 4) }));
    return j;
  }
  async function analyze(topic, answers = [], plan = {}) {
    let web = '', sources = [];
    if (plan.web && window.jarvisWebResearch?.askWeb) {
      setPhase('thinking', 'Güncel verileri araştırıyorum…');
      const res = await Promise.allSettled((plan.aramalar || [topic]).slice(0, 2).map(q => window.jarvisWebResearch.askWeb('Olgusal TÜRKÇE not (en çok 150 kelime): rakamlar, tarihler, kaynakta yazanlar. Uydurma yok.', q, 'quick', true)));
      for (const r of res) if (r.status === 'fulfilled') { web += r.value.text + '\n'; sources.push(...r.value.sources); }
    }
    setPhase('thinking', 'Derin analiz yapıyorum…');
    const ds = domainOf(topic + ' ' + answers.map(a => a.a).join(' ')).map(d => d[2]).join('\n');
    const raw = await window.jarvisResearch.ask(`Sen ${ds ? 'şu uzmanlıklara sahip ' : ''}kıdemli bir danışmansın.${ds ? '\n' + ds : ''}
Beyhan'ın konusunu en ince ayrıntısına kadar analiz et. Beyhan'ın cevaplarını mutlaka kullan; bilinmeyeni varsayım olarak işaretle. TÜRKÇE, düz metin, başlıklar büyük harf:
YÖNETİCİ ÖZETİ: 3 madde (en önemli sonuç, öneri, risk).
DURUM: kısa ve sayısal.
KÖK NEDENLER / BELİRLEYİCİ ETKENLER: (5 Neden ya da etken ağırlıkları).
SEÇENEKLER: 2-4 seçenek; her biri için artı, eksi, risk, maliyet/süre, başarı olasılığı (%).
ÖNERİ: tek net öneri ve gerekçesi.
EYLEM PLANI: numaralı adımlar; her satır “Adım — ne zaman (YYYY-AA-GG ya da süre)” biçiminde.
ÖLÇÜTLER: başarıyı gösterecek 2-4 ölçülebilir gösterge.
VARSAYIMLAR VE BİLİNMEYENLER:
${web ? 'Güncel veri notlarını kullan ve onlara dayanan cümlelerin sonuna [web] yaz.' : ''}`,
      `KONU: ${topic}\n\nBEYHAN'IN CEVAPLARI:\n${answers.length ? answers.map(a => `- ${a.q}: ${a.a || '(cevapsız — varsayım yap)'}`).join('\n') : '(soru sorulmadı)'}${web ? '\n\nGÜNCEL VERİ NOTLARI:\n' + web : ''}`, 'complex');
    return { topic, konu: plan.konu || topic, text: raw.trim(), sources, t: Date.now() };
  }
  function showReport(r) {
    const n = bubble('ai', `🧠 DERİN ANALİZ · ${r.konu}\n${r.text}`);
    if (r.sources.length) addLinks(n.el, r.sources.slice(0, 6).map(s => ({ url: s.url, title: short(s.title || new URL(s.url).hostname, 60) })));
    const steps = (r.text.split(/EYLEM PLANI:?/i)[1] || '').split(/\n[A-ZÇĞİÖŞÜ ]{5,}:/)[0].split('\n').map(s => s.trim()).filter(s => /^\d+[.)]/.test(s));
    n.el.append(el('div', { class: 'tool' },
      steps.length ? el('button', { type: 'button', onclick: e => { for (const s of steps) { const d = (s.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; saveItem({ kind: 'task', text: short(s.replace(/^\d+[.)]\s*/, ''), 140), due: d ? d + 'T10:00' : '' }); } e.target.disabled = true; e.target.textContent = `✓ ${steps.length} adım görevlere eklendi`; } }, `✓ Eylem planını görevlere ekle (${steps.length})`) : '',
      el('button', { type: 'button', onclick: () => window.jarvisStage?.runDesign?.(`“${r.konu}” analizinin özet infografiği:\n${r.text.slice(0, 1800)}`, { format: 'infografik' }) }, '✦ İnfografik'),
      el('button', { type: 'button', onclick: () => { const a = el('a', { href: URL.createObjectURL(new Blob([`# ${r.konu}\n\n${r.text}\n`], { type: 'text/markdown' })), download: `analiz-${Date.now()}.md` }); document.body.append(a); a.click(); a.remove(); } }, '⬇ İndir')));
    answerTools(n.el, r.text);
    window.jarvisArchive?.('Derin analiz: ' + r.konu, r.text);
    logOp('derin analiz', [short(r.konu, 50)], 'başarılı', r.sources.length + ' kaynak');
  }
  async function start(topic) {
    topic = String(topic || '').trim(); if (topic.length < 4) return note('Neyi analiz edeyim?');
    bubble('me', '🧠 Derin analiz: ' + topic);
    let plan;
    try { setPhase('thinking', 'Önce doğru soruları hazırlıyorum…'); plan = await questions(topic); }
    catch (e) { setPhase('idle', 'Hazır.'); return note('Analiz başlatılamadı: ' + e.message); }
    setPhase('idle', 'Hazır.');
    if (!plan.sorular.length) return finish(topic, [], plan);
    const card = bubble('ai', `🧠 ${plan.konu || topic}\nEn isabetli analizi yapabilmem için birkaç sorum var. Seçeneğe dokun ya da kendi cevabını yaz; bilmediklerini boş bırak.`);
    const fields = plan.sorular.map((q, i) => {
      const inp = el('input', { class: 'qa-in', placeholder: 'Cevabın…', 'aria-label': q.soru });
      return { q: q.soru, inp, node: el('div', { class: 'qa' }, el('p', {}, `${i + 1}. ${q.soru}`), q.secenekler.length ? el('div', { class: 'qa-opts' }, ...q.secenekler.map(o => el('button', { type: 'button', class: 'chip', onclick: e => { inp.value = o; e.target.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === e.target)); } }, o))) : '', inp) };
    });
    const go = el('button', { type: 'button', class: 'btn', onclick: () => { go.disabled = skip.disabled = true; finish(topic, fields.map(f => ({ q: f.q, a: f.inp.value.trim() })), plan); } }, '🧠 Analize başla');
    const skip = el('button', { type: 'button', class: 'btn ghost', onclick: () => { go.disabled = skip.disabled = true; finish(topic, [], plan); } }, 'Sorusuz devam');
    card.el.append(el('div', { class: 'qa-box' }, ...fields.map(f => f.node), el('div', { class: 'row' }, go, skip)));
    try { if (typeof voiceSession !== 'undefined' && (voiceSession.active || (typeof continuous !== 'undefined' && continuous))) voiceSession.read(`Analizden önce ${plan.sorular.length} sorum var, ekranda. İlki: ${plan.sorular[0].soru}`); } catch {}
    $('feed').scrollTop = $('feed').scrollHeight;
  }
  async function finish(topic, answers, plan) {
    try { const r = await analyze(topic, answers, plan); showReport(r); }
    catch (e) { note('Analiz tamamlanamadı: ' + e.message); }
    finally { setPhase('idle', 'Hazır.'); }
  }

  Object.assign(TOOLS, {
    derin_analiz: { d: 'derin_analiz|konu — karar, sorun, strateji, plan gibi önemli konularda: önce hedefli sorular sorar, sonra kök neden, seçenekler (artı/eksi/risk/olasılık), öneri ve eylem planı içeren derin analiz yapar', run: async ([t]) => { setTimeout(() => start(t), 30); return 'Derin analiz ekranda başladı; Beyhan’a soruları cevaplamasını söyle.'; } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nDERİN ANALİZ: Beyhan önemli bir karar/sorun/strateji için “analiz et, değerlendir, ne yapmalıyım, karar veremiyorum” derse derin_analiz kullan.';
  TOOL_GROUPS.push([/analiz|değerlendir|ne yapmalıyım|karar ver|strateji|sorun|neden düşüyor|nasıl artırırım|plan/i, /^(derin_analiz)$/]);
  const _lc = localCommand;
  localCommand = text => {
    if (window.jarvisUltra?.guest?.()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:derin(?:lemesine)?\s+|detaylı\s+|kapsamlı\s+)?(?:analiz et|analiz yap|analiz|değerlendir|incele ve değerlendir)\s*[:,-]\s*(.{4,})$/i)) || (m = t.match(/^(.{6,}?)\s+(?:konusunu|durumunu|sorununu|kararını)?\s*(?:derinlemesine|detaylı|en ince ayrıntısına kadar)\s+(?:analiz et|değerlendir)\.?$/i)) || (m = t.match(/^karar(?:ımı)? vermeme yardım et\s*[:,-]?\s*(.{4,})$/i))) {
      setTimeout(() => start(m[1]), 30); return '🧠 Derin analiz: önce birkaç hedefli soru hazırlıyorum…';
    }
    return _lc(text);
  };
  // ayar
  const sel = el('select', { id: 'expertAuto' }); sel.append(new Option('Açık — her soruda alan uzmanı + derinlik + devam önerileri', '1'), new Option('Kapalı', '0'));
  sel.value = store.get('set.expertAuto', '1'); sel.onchange = () => store.set('set.expertAuto', sel.value);
  $('p-settings')?.append(el('div', { class: 'field' }, el('label', { for: 'expertAuto' }, 'Uzman zihin'), sel));
  window.jarvisExpert = { domainOf, questions, analyze, start, showReport, DOMAINS };
})();
