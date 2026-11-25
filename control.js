'use strict';
/* SATÜRN 5 — bilgisayara ve telefona hâkimiyet:
 * • ekranda görerek tıklama (ekran görüntüsü → yapay zekâ hedefi bulur → onaylı tıklama)
 * • telefona anlık bildirim (ntfy, ücretsiz; SATÜRN kapalıyken bile) + zamanlanmış hatırlatmalar
 * • Siri / Google Asistan / ana ekran bağlantısı: ?q=komut
 * • iPhone kontrol paketi (Kestirmeler): fener, ses, parlaklık, odak, alarm, mesaj, arama, müzik, Wi-Fi, konum
 * • telefonun web yetenekleri: konum, konum hatırlatma, ekranı açık tut, titreşim, paylaş
 * • telefondan bilgisayara / bilgisayardan telefona dosya. features.js'ten sonra yüklenir. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const txt = (id, ph) => el('input', { id, placeholder: ph, autocomplete: 'off', spellcheck: 'false' });

  /* ================= 1) ekranda görerek tıklama ================= */
  async function screenClick([target, how = 'tikla'], ctx) {
    if (!target) throw Error('Neye tıklanacağını yaz (ör. “Kaydet düğmesi”)');
    const shot = await pcCall('ekran', [], false);
    const geo = shot.screen || window.jarvisLastScreen;
    if (!shot.image || !geo?.width) throw Error('Ekran görüntüsü alınamadı');
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'complex', system: 'Ekran görüntüsünde istenen öğeyi bul. YALNIZCA JSON yaz: {"bulundu":true,"x":0-1000,"y":0-1000,"ad":"öğenin görünen adı"} — x ve y öğenin MERKEZİNİN görüntü genişliği ve yüksekliğine göre binde biri cinsinden konumu. Bulamazsan {"bulundu":false,"neden":"..."}', messages: [{ role: 'user', content: 'Bul: ' + target }], image: { mediaType: shot.mime || 'image/jpeg', data: shot.image } }) });
    if (!r.ok) throw Error('Görüntü incelenemedi (' + r.status + ')');
    const raw = (await r.text()).split('\u0000')[0];
    let j; try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { throw Error('Hedef konumu anlaşılamadı'); }
    if (!j.bulundu) throw Error('Ekranda bulunamadı: ' + (j.neden || target));
    const x = Math.round(geo.left + (Number(j.x) / 1000) * geo.width), y = Math.round(geo.top + (Number(j.y) / 1000) * geo.height);
    if (!(await confirmAction(`Ekranda “${j.ad || target}” öğesine ${fold(how) === 'cift' ? 'çift ' : ''}tıklansın mı? (${x}, ${y})`, ctx?.say))) return 'İPTAL — Beyhan onaylamadı.';
    if (opt('dryRun') === '1') return `DENEME MODU — “${j.ad}” (${x}, ${y}) bulundu, tıklanmadı.`;
    await pcCall('tikla', [x, y], true);
    if (fold(how) === 'cift') await pcCall('fare', ['ciftik'], true);
    await sleep(900);
    const after = await pcCall('ekran', [], false);
    return { text: `“${j.ad || target}” öğesine tıklandı (${x}, ${y}). Tıklama sonrası ekran görüntüsü ekte; sonucu kontrol et.`, image: after.image ? { mediaType: after.mime || 'image/jpeg', data: after.image } : null };
  }

  /* ================= 2) telefona anlık bildirim (ntfy.sh) ================= */
  if (!store.get('set.ntfyTopic', '')) store.set('set.ntfyTopic', 'jarvis-' + Array.from(crypto.getRandomValues(new Uint8Array(9)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''));
  const topic = () => opt('ntfyTopic');
  async function pushPhone(msg, { title = 'SATÜRN', at = null, tags = 'robot', click = location.origin + location.pathname } = {}) {
    if (!topic()) throw Error('Bildirim kanalı yok');
    // JSON publishing (UTF-8 safe titles; HTTP headers cannot carry Turkish characters)
    const body = { topic: topic(), message: String(msg).slice(0, 3800), title, tags: [tags], click };
    if (at) body.delay = String(Math.floor(new Date(at).getTime() / 1000));
    const r = await withTimeout(fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify(body) }), 10000, 'Bildirim sunucusu yanıt vermedi');
    if (!r.ok) throw Error('Bildirim gönderilemedi (' + r.status + ')');
    return (await r.json()).id;
  }
  // reminders reach the phone even when SATÜRN is closed (ntfy delays up to 3 days)
  let scheduled = store.get('ntfySched', {});
  async function scheduleReminders() {
    if (opt('ntfyOn') !== '1') return;
    const lim = Date.now() + 3 * 86400000 - 60000;
    for (const i of items.filter(x => x.kind === 'task' && !x.done && x.due && x.due.includes('T'))) {
      const t = new Date(i.due).getTime(), key = i.id + '@' + i.due;
      if (scheduled[key] || t <= Date.now() + 60000 || t > lim) continue;
      try { await pushPhone('⏰ ' + i.text, { title: 'SATÜRN hatırlatma', at: i.due, tags: 'alarm_clock' }); scheduled[key] = Date.now(); } catch { break; }
    }
    for (const k of Object.keys(scheduled)) if (scheduled[k] < Date.now() - 5 * 86400000) delete scheduled[k];
    store.set('ntfySched', scheduled);
  }
  setInterval(scheduleReminders, 5 * 60000); setTimeout(scheduleReminders, 6000);
  const _persist = persist; persist = () => { _persist(); clearTimeout(window.__schedT); window.__schedT = setTimeout(scheduleReminders, 1500); };

  /* ================= 3) iPhone kontrol paketi (Kestirmeler) ================= */
  const PACK = [
    ['JARVIS Fener', 'Feneri Ayarla (Set Flashlight) → Değer: Kestirme Girdisi ya da “Aç/Kapat”', 'fener|aç / kapat'],
    ['JARVIS Ses', 'Ses Düzeyini Ayarla (Set Volume) → Kestirme Girdisi (0-100 sayı)', 'ses|60'],
    ['JARVIS Parlaklık', 'Parlaklığı Ayarla (Set Brightness) → Kestirme Girdisi', 'parlaklik|40'],
    ['JARVIS Odak', 'Odak Modunu Ayarla (Set Focus) → Rahatsız Etme → Aç (girdi “kapat” ise kapat: Eğer eylemiyle)', 'odak|aç / kapat'],
    ['JARVIS Alarm', 'Alarm Oluştur (Create Alarm) → Saat: Kestirme Girdisi (ör. 07:30)', 'alarm|07:30'],
    ['JARVIS Mesaj', 'Metni Böl (girdi “kişi|mesaj”) → Mesaj Gönder (Send Message) → Alıcı: 1. öğe, Mesaj: 2. öğe', 'mesaj|Ahmet|Geliyorum'],
    ['JARVIS Ara', 'Ara (Call) → Kişi: Kestirme Girdisi', 'ara|Ahmet'],
    ['JARVIS Müzik', 'Müzik Çal (Play Music) ya da Oynat/Duraklat (Play/Pause)', 'muzik|oynat'],
    ['JARVIS WiFi', 'Wi-Fi’yi Ayarla (Set Wi-Fi) → Aç/Kapat', 'wifi|aç'],
    ['SATÜRN Hatırlatıcı', 'Hatırlatıcı Ekle (Add New Reminder) → Kestirme Girdisi', 'hatirlatici|Süt al'],
    ['JARVIS Not', 'Not Oluştur (Create Note) → Kestirme Girdisi', 'not|Toplantı notu'],
    ['JARVIS Takvim Oku', 'Takvim Etkinliklerini Bul (Find Calendar Events: Başlangıç Tarihi önümüzdeki 7 gün içinde, sırala: Başlangıç Tarihi) → Hatırlatıcıları Bul (Find Reminders: Tamamlanmamış) → Metin: “TAKVİM:” + Takvim Etkinlikleri + “ANIMSATICILAR:” + Hatırlatıcılar → URL Kodla (URL Encode) → URL’yi Aç: bu site adresi + ?takvim= + Kodlanmış Metin. Her sabah otomatik okusun istersen Otomasyon → Günün Saati → bu kestirmeyi çalıştır', 'takvim'],
    ['JARVIS Pil', 'Pil Düzeyini Al (Get Battery Level) → URL’yi Aç: bu site adresi + ?q=pil%20durumum%20 + Pil Düzeyi', 'pil']
  ];
  const IPH = { fener: 'JARVIS Fener', ses: 'JARVIS Ses', parlaklik: 'JARVIS Parlaklık', odak: 'JARVIS Odak', alarm: 'JARVIS Alarm', mesaj: 'JARVIS Mesaj', ara: 'JARVIS Ara', muzik: 'JARVIS Müzik', wifi: 'JARVIS WiFi', hatirlatici: 'SATÜRN Hatırlatıcı', not: 'JARVIS Not', pil: 'JARVIS Pil', takvim: 'JARVIS Takvim Oku' };
  function iphone([cmd, ...rest]) {
    const name = IPH[fold(cmd)];
    if (!name) throw Error('Bilinmeyen telefon komutu. Olanlar: ' + Object.keys(IPH).join(', '));
    const input = rest.join('|');
    const back = encodeURIComponent(location.origin + location.pathname);
    pendingLinks.push({ url: `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(name)}${input ? '&input=text&text=' + encodeURIComponent(input) : ''}&x-success=${back}&x-error=${back}`, title: '▶ ' + name + (input ? ': ' + input : '') });
    return `“${name}” kestirmesi hazır; Beyhan dokununca iPhone çalıştırır ve SATÜRN’e döner. (Kestirme kurulu değilse Bağlantı → iPhone kontrol paketi.)`;
  }

  /* ================= 4) telefonun kendi yetenekleri ================= */
  const geo = () => new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(Error(e.code === 1 ? 'Konum izni verilmedi' : 'Konum alınamadı')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }) : rej(Error('Bu cihazda konum yok')));
  const dist = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  let places = store.get('placeRem', []), wakeLock = null, watchId = null;
  function watchPlaces() {
    if (watchId !== null || !places.length || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(p => {
      const here = { lat: p.coords.latitude, lon: p.coords.longitude };
      for (const pl of places.filter(x => !x.done)) if (dist(here, pl) < (pl.r || 250)) {
        pl.done = true; store.set('placeRem', places);
        bubble('alarm', '📍 ' + pl.name + ': ' + pl.text); beep(); navigator.vibrate?.([200, 100, 200]);
        if (opt('speakOn') === '1' && !answering) voiceSession.read('Konum hatırlatması: ' + pl.text);
        pushPhone('📍 ' + pl.text, { title: 'SATÜRN · ' + pl.name, tags: 'round_pushpin' }).catch(() => {});
      }
      if (!places.some(x => !x.done)) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    }, () => {}, { enableHighAccuracy: false, maximumAge: 120000 });
  }
  watchPlaces();

  /* ================= 5) araçlar ================= */
  Object.assign(TOOLS, {
    ekran_tikla: { d: 'ekran_tikla|tıklanacak öğenin tarifi|tek veya cift — bilgisayar ekranına bakar, öğeyi bulur, onayla tıklar ve sonucu yeni ekran görüntüsüyle doğrular', risky: false, run: async (args, ctx) => { const out = await screenClick(args, ctx); if (typeof out === 'string') return out; ctx.lastImage = out.image; return out.text; } },
    telefona_bildir: { d: 'telefona_bildir|mesaj|zaman (isteğe bağlı YYYY-MM-DDTHH:MM, en fazla 3 gün sonrası) — Beyhan’ın telefonuna anlık bildirim (SATÜRN kapalıyken de gelir)', run: async ([m, at]) => { if (!m) throw Error('Mesaj boş'); await pushPhone(m, { at: at || null }); return at ? `Bildirim ${at} için zamanlandı.` : 'Bildirim telefona gönderildi.'; } },
    iphone: { d: 'iphone|komut|değer — iPhone’u kontrol eder (Kestirmeler): fener, ses, parlaklik, odak, alarm, mesaj (kişi|mesaj), ara, muzik, wifi, hatirlatici, not, pil, takvim (iPhone takvimini ve anımsatıcıları SATÜRN’e okutur; bilgi eskiyse ya da hiç yoksa öner)', pending: true, run: iphone },
    konum: { d: 'konum — bu cihazın şu anki konumu ve adresi', run: async () => { const c = await geo(); let addr = ''; try { const d = await (await withTimeout(fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=tr&lat=${c.latitude}&lon=${c.longitude}`), 8000)).json(); addr = d.display_name || ''; } catch {} pendingLinks.push({ url: (isApple ? 'https://maps.apple.com/?ll=' : 'https://www.google.com/maps?q=') + c.latitude + ',' + c.longitude, title: 'Haritada aç' }); return `${addr || 'adres bulunamadı'} (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}, ±${Math.round(c.accuracy)} m)`; } },
    konum_hatirlat: { d: 'konum_hatirlat|yer (adres veya “burası”)|hatırlatma metni|yarıçap metre — o yere varınca hatırlatır (uygulama açıkken)', run: async ([place, text, r]) => {
      if (!text) throw Error('Hatırlatma metni gerekli');
      let lat, lon, name = place;
      if (!place || /^(burası|burasi|bura|şu an|su an)$/i.test(place.trim())) { const c = await geo(); lat = c.latitude; lon = c.longitude; name = 'Buraya'; }
      else { const d = await (await withTimeout(fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=tr&countrycodes=tr&q=' + encodeURIComponent(place)), 8000)).json(); if (!d[0]) throw Error('Yer bulunamadı: ' + place); lat = +d[0].lat; lon = +d[0].lon; name = d[0].display_name.split(',').slice(0, 2).join(','); }
      places.push({ id: uid('l'), name, lat, lon, r: Number(r) || 250, text, done: false }); store.set('placeRem', places); watchPlaces();
      return `${name} için konum hatırlatması kuruldu (${Number(r) || 250} m). SATÜRN açıkken çalışır.`;
    } },
    ekran_acik: { d: 'ekran_acik|aç veya kapat — telefon/bilgisayar ekranının kararmasını engeller', run: async ([a]) => { if (/kapat/i.test(a || '')) { await wakeLock?.release(); wakeLock = null; return 'Ekran normal kararabilir.'; } if (!navigator.wakeLock) throw Error('Bu cihaz desteklemiyor'); try { wakeLock = await navigator.wakeLock.request('screen'); } catch { throw Error('Tarayıcı ekranı açık tutma iznini vermedi (pil tasarrufu açık olabilir)'); } return 'Ekran açık tutuluyor (uygulama önde olduğu sürece).'; } },
    titresim: { d: 'titresim — telefonu titreştirir (Android)', run: () => { if (!navigator.vibrate) throw Error('Bu cihaz titreşimi desteklemiyor (iPhone izin vermiyor)'); navigator.vibrate([300, 150, 300]); return 'Titreşti.'; } },
    paylas: { d: 'paylas|metin — telefonun paylaş menüsünü açar (WhatsApp, Mail…)', pending: true, run: ([t]) => { pendingLinks.push({ url: 'https://wa.me/?text=' + encodeURIComponent(t || ''), title: 'WhatsApp ile paylaş' }); if (navigator.share) { const b = el('button', { type: 'button', class: 'btn', onclick: () => navigator.share({ text: t }).catch(() => {}) }, 'Paylaş…'); setTimeout(() => document.querySelector('.msg.ai:last-of-type')?.append(b), 300); } return 'Paylaşım hazır; Beyhan dokunmalı.'; } }
  });
  // the click tool attaches the after-click screenshot for the model
  const _run = window.jarvisRunTools;
  window.jarvisRunTools = async (calls, ctx) => { const res = await _run(calls, ctx); if (ctx.lastImage && !res.image) { res.image = ctx.lastImage; ctx.lastImage = null; } return res; };
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `
CİHAZ HÂKİMİYETİ: Bilgisayarda bir şeyi göremediğin bir yerde yapmak gerekiyorsa önce pc|pencereler veya pc|ekran ile durumu gör, sonra pc|pencere|odakla, pc|kisayol, ekran_tikla ile adım adım ilerle ve her adımın sonucunu kontrol et. Telefona bir şey hatırlatmak/haber vermek için telefona_bildir; iPhone ayarları için iphone aracını kullan.`;

  /* ================= 6) telefondan bilgisayara dosya ================= */
  async function sendFileToPC(f) {
    if (f.size > (pcLocal ? 8e6 : 4.5e5)) return note(pcLocal ? 'Dosya 8 MB’tan büyük.' : 'Telefon köprüsüyle en fazla 450 KB gönderilebilir. Büyük dosyalar için bilgisayardaki SATÜRN’ü kullan.');
    const op = logOp('pc · dosya_kaydet', [f.name], 'beklemede');
    try {
      if (!(await confirmAction(`“${f.name}” (${Math.round(f.size / 1024)} KB) bilgisayara gönderilsin mi?`))) return updateOp(op, 'iptal', 'onaylanmadı');
      const d = await pcCall('dosya_kaydet', [f.name, await blobToBase64(f)], true);
      updateOp(op, 'başarılı', d.text); note(d.text);
    } catch (e) { updateOp(op, 'başarısız', e.message); note('Gönderilemedi: ' + e.message); }
  }
  const upl = el('input', { type: 'file', hidden: true, id: 'toPcFile' }); upl.hidden = true;
  upl.onchange = () => { const f = upl.files[0]; upl.value = ''; if (f) sendFileToPC(f); };
  document.body.append(upl);

  /* ================= 7) ayarlar ve kurulum anlatımı ================= */
  const pageUrl = location.origin + location.pathname;
  $('p-link').append(
    el('h3', {}, 'TELEFONA ANLIK BİLDİRİM (ÜCRETSİZ)'),
    el('p', { class: 'muted' }, 'SATÜRN kapalıyken bile hatırlatmalar, bilgisayar uyarıları ve SATÜRN’ün haberleri telefonuna gelsin: App Store / Google Play’den ücretsiz “ntfy” uygulamasını kur → + → aşağıdaki kanal adını yaz → Abone ol. Kanal adı gizli bir paroladır; kimseyle paylaşma.'),
    field('ntfyTopic', 'Bildirim kanalı', txt('ntfyTopic', 'jarvis-…')),
    field('ntfyOn', 'Zamanı gelen görevleri telefona da gönder', (() => { const s = el('select', { id: 'ntfyOn' }); s.append(new Option('Açık', '1'), new Option('Kapalı', '0')); return s; })()),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: async () => { try { await pushPhone('Merhaba Beyhan, bildirimler çalışıyor. 🤖'); note('Deneme bildirimi gönderildi; telefonuna bakabilirsin.'); } catch (e) { note('Gönderilemedi: ' + e.message); } } }, 'Deneme bildirimi gönder'),
      el('button', { type: 'button', class: 'btn', onclick: () => { navigator.clipboard?.writeText(topic()).then(() => note('Kanal adı kopyalandı.'), () => note('Kopyalanamadı; kanal adı: ' + topic())); } }, 'Kanal adını kopyala')),
    el('h3', {}, '“HEY SİRİ, SATÜRN”'),
    el('p', { class: 'muted' }, 'iPhone: Kestirmeler → + → “Metni Dikte Et” (Dictate Text) ekle → “URL’yi Aç” (Open URLs) ekle ve adrese şunu yaz: ' + pageUrl + '?q= ardından “Dikte Edilen Metin” değişkeni → kestirmenin adını “Jarvis” koy. Artık “Hey Siri, Jarvis” deyip komutunu söyle; SATÜRN açılır ve komutu hemen çalıştırır. Kestirmeyi Apple Watch’ta da gösterirsen saatten de çalışır. Android: Google Asistan → Rutinler → “Jarvis” → Web sitesi aç ile aynı adres.'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => navigator.clipboard?.writeText(pageUrl + '?q=').then(() => note('Adres kopyalandı; kestirmeye yapıştır.'), () => note('Kopyalanamadı; adres: ' + pageUrl + '?q=')) }, 'Kestirme adresini kopyala')),
    el('h3', {}, 'İPHONE KONTROL PAKETİ'),
    el('p', { class: 'muted' }, 'Kestirmeler uygulamasında aşağıdaki adlarla birer kestirme oluştur (her birinde girdi olarak “Metin” kabul et). Sonra “Jarvis, feneri aç”, “sesi 60 yap”, “yarın 7:30’a alarm kur”, “Ahmet’e geliyorum yaz” diyebilirsin; SATÜRN doğru kestirmeyi hazırlar, dokununca iPhone yapar.'),
    el('ul', { class: 'list' }, ...PACK.map(([n, how, ex]) => el('li', { class: 'item' }, el('span', {}, '▸'), el('div', {}, el('p', {}, el('b', {}, n)), el('small', {}, how + ' · örnek: ' + ex))))),
    el('h3', {}, 'DOSYA AKTARIMI'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => upl.click() }, 'Bilgisayara dosya gönder'),
      el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); typedTurn('Bilgisayarımdaki son indirilen dosyaları listele.', false); } }, 'Bilgisayardaki son dosyalar')),
    el('p', { class: 'muted' }, 'Bilgisayardan telefona: “Jarvis, masaüstündeki rapor.pdf’i bana gönder” de; indirme bağlantısı hazırlanır. Gelen dosyalar bilgisayarda Belgeler\\JARVIS\\Gelen klasörüne kaydedilir.'));
  for (const id of ['ntfyTopic', 'ntfyOn']) { const v = store.get('set.' + id, null), n = $(id); if (v !== null) n.value = v; n.addEventListener('change', () => { store.set('set.' + id, n.value.trim()); store.set('pcPaired', ''); pairNtfy(); }); }
  // share the phone-notification channel with the PC helper so the PC can alert the phone (disk full, memory, start-up)
  async function pairNtfy() { if (!pcLocal || !topic() || store.get('ntfyPaired', '') === topic()) return; try { const r = await fetch(PC + '/eslestir', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': opt('pcToken') || '' }, body: JSON.stringify({ ntfy: topic() }) }); if (r.ok) store.set('ntfyPaired', topic()); } catch {} }
  setInterval(pairNtfy, 30000); setTimeout(pairNtfy, 3000);

  /* ================= 7b) iPhone takvim köprüsü: ?takvim=… (JARVIS Takvim Oku kestirmesi gönderir) ================= */
  const calIn = new URLSearchParams(location.search).get('takvim');
  if (calIn !== null) {
    history.replaceState(null, '', location.pathname);
    const text = String(calIn).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
    store.set('phoneCal', { text, at: Date.now() });
    const go = () => { if ($('gate').hidden && $('cBrain').dataset.s === 'on' && !answering) { window.jarvisUnlock?.(); note('iPhone takvimi ve anımsatıcılar alındı.'); typedTurn('iPhone takvimimi ve anımsatıcılarımı az önce aldın. Bugünü ve yaklaşan günleri kısaca özetle; çakışma, gecikmiş anımsatıcı ya da hazırlık gereken bir şey varsa söyle.', opt('speakOn') === '1'); } else setTimeout(go, 500); };
    setTimeout(go, 1800);
  }

  /* ================= 8) Siri / Asistan / ana ekran derin bağlantısı: ?q=komut ================= */
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    history.replaceState(null, '', location.pathname);
    const go = () => { if ($('gate').hidden && $('cBrain').dataset.s === 'on' && !answering) { window.jarvisUnlock?.(); typedTurn(q, opt('speakOn') === '1'); } else setTimeout(go, 500); };
    setTimeout(go, 1800);
  }

  // skills
  for (const [k, label, fn] of [['pcfile', 'Bilgisayara dosya', () => upl.click()], ['where', 'Neredeyim?', () => typedTurn('Neredeyim? konum aracını kullan.', false)]]) {
    SKILLS[k] = { label, run: fn };
    $('mobileSkills').append(el('button', { type: 'button', onclick: () => { window.jarvisUnlock(); fn(); } }, label));
  }
  window.jarvisPushPhone = pushPhone;
})();
