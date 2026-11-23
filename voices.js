'use strict';
/* JARVIS 5.1 — kaliteli ses: Gemini doğal sesleri (ücretsiz, 30 ses, Türkçe), ses tonu/üslup, sesli komutlarla ses değiştirme. */
(() => {
  const VOICES = [
    ['Charon', 'erkek', 'bilgilendirici · JARVIS'], ['Orus', 'erkek', 'kararlı'], ['Iapetus', 'erkek', 'net'], ['Rasalgethi', 'erkek', 'bilgilendirici'], ['Sadaltager', 'erkek', 'bilgili'],
    ['Alnilam', 'erkek', 'kararlı'], ['Algieba', 'erkek', 'pürüzsüz'], ['Schedar', 'erkek', 'dengeli'], ['Achird', 'erkek', 'samimi'], ['Algenib', 'erkek', 'kalın, pürüzlü'],
    ['Fenrir', 'erkek', 'heyecanlı'], ['Puck', 'erkek', 'neşeli'], ['Umbriel', 'erkek', 'rahat'], ['Zubenelgenubi', 'erkek', 'gündelik'], ['Enceladus', 'erkek', 'nefesli'], ['Sadachbia', 'erkek', 'canlı'],
    ['Kore', 'kadın', 'kararlı'], ['Sulafat', 'kadın', 'sıcak'], ['Despina', 'kadın', 'yumuşak'], ['Erinome', 'kadın', 'net'], ['Vindemiatrix', 'kadın', 'nazik'], ['Achernar', 'kadın', 'yumuşak'],
    ['Aoede', 'kadın', 'ferah'], ['Zephyr', 'kadın', 'parlak'], ['Autonoe', 'kadın', 'parlak'], ['Leda', 'kadın', 'genç'], ['Callirrhoe', 'kadın', 'rahat'], ['Laomedeia', 'kadın', 'neşeli'],
    ['Pulcherrima', 'kadın', 'atılgan'], ['Gacrux', 'kadın', 'olgun']
  ];
  const STYLES = [['jarvis', 'JARVIS · sakin, net, kendinden emin'], ['sakin', 'Sakin ve yumuşak'], ['sicak', 'Sıcak ve şefkatli'], ['resmi', 'Resmî ve kesin'], ['enerjik', 'Enerjik ve neşeli']];
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const sel = (id, opts) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); return s; };
  const vSel = sel('ttsVoice', VOICES.map(([n, g, d]) => [n, `${n} · ${g} · ${d}`]));
  const voiceField = $('voice').closest('.field');
  voiceField.after(
    field('ttsVoice', 'Doğal ses karakteri', vSel),
    field('ttsStyle', 'Konuşma üslubu', sel('ttsStyle', STYLES)),
    field('ttsEngine', 'Doğal ses motoru', sel('ttsEngine', [['gemini', 'Gemini (ücretsiz, aynı anahtar)'], ['eleven', 'ElevenLabs (anahtar gerekir)']])));
  for (const id of ['ttsVoice', 'ttsStyle', 'ttsEngine']) {
    const n = $(id), v = store.get('set.' + id, null);
    if (v !== null && [...n.options].some(o => o.value === v)) n.value = v;
    n.addEventListener('change', () => { store.set('set.' + id, n.value); sysInfo(); });
  }
  if (!store.get('set.ttsVoice', '')) store.set('set.ttsVoice', 'Charon');
  // first run with a working natural voice: prefer it (device voice stays as automatic fallback)
  if (store.get('set.voice', null) === null) { $('voice').value = 'natural'; store.set('set.voice', 'natural'); }
  $('voice').addEventListener('change', () => chip('cVoice', setting('voice') === 'natural' ? 'Ses: doğal' : 'Ses: cihaz', true));

  // device voice ranking: prefer the high-quality voices each platform ships
  const _score = JarvisSpeechPlayer.voiceScore;
  JarvisSpeechPlayer.voiceScore = v => (_score ? _score(v) : 0) + (/natural|neural|online/i.test(v?.name || '') ? 50 : 0) + (/enhanced|premium|geliştirilmiş/i.test(v?.name || '') ? 40 : 0) + (/google/i.test(v?.name || '') ? 15 : 0);

  function sample() {
    const v = VOICES.find(x => x[0] === setting('ttsVoice'));
    return `Merhaba Beyhan, ben JARVIS. Bu ${v ? v[0] : 'yeni'} sesim; ${v ? v[2].split(' · ')[0] : ''} bir tonla konuşuyorum. Nasıl yardımcı olabilirim?`;
  }
  $('testVoice').onclick = () => { window.jarvisUnlock(); stopAll(); voiceSession.read(sample()); };
  const testRow = $('testVoice').closest('.row');
  testRow.append(el('button', { type: 'button', class: 'btn', onclick: () => { const i = VOICES.findIndex(x => x[0] === setting('ttsVoice')); set('ttsVoice', VOICES[(i + 1) % VOICES.length][0]); window.jarvisUnlock(); stopAll(); voiceSession.read(sample()); } }, 'Sonraki sesi dene'));
  const set = (id, v) => { $(id).value = v; store.set('set.' + id, v); sysInfo(); };

  /* ---------- sesli komutlar ---------- */
  const _local = localCommand;
  localCommand = text => {
    const t = fold(text).replace(/[.!?,]/g, '').replace(/^jarvis\s+/, '').trim();
    let m;
    if (/^(sesleri (listele|say)|hangi sesler(in)? var|ses(ler)?in neler)$/.test(t)) return 'Erkek sesler: ' + VOICES.filter(v => v[1] === 'erkek').map(v => v[0]).join(', ') + '. Kadın sesler: ' + VOICES.filter(v => v[1] === 'kadın').map(v => v[0]).join(', ') + '. “Kore sesine geç” ya da “erkek sesi” diyebilirsin.';
    if ((m = t.match(/^([a-z]+) ses(?:ine|ini|i)? (?:gec|kullan|ac|olsun|sec)/))) { const v = VOICES.find(x => fold(x[0]) === m[1]); if (v) { set('ttsVoice', v[0]); set('voice', 'natural'); return `Tamam, artık ${v[0]} sesiyle konuşuyorum.`; } }
    if (/^(erkek ses(i|ine gec|le konus)?|erkek sesiyle konus)$/.test(t)) { set('ttsVoice', 'Charon'); set('voice', 'natural'); return 'Erkek sese geçtim; Charon sesiyle konuşuyorum.'; }
    if (/^(kadin ses(i|ine gec|le konus)?|kadin sesiyle konus)$/.test(t)) { set('ttsVoice', 'Kore'); set('voice', 'natural'); return 'Kadın sese geçtim; Kore sesiyle konuşuyorum.'; }
    if (/^(sesini degistir|baska (bir )?ses|sonraki ses|ses degistir)$/.test(t)) { const i = VOICES.findIndex(x => x[0] === setting('ttsVoice')); const v = VOICES[(i + 1) % VOICES.length]; set('ttsVoice', v[0]); set('voice', 'natural'); return `${v[0]} sesine geçtim; ${v[1]}, ${v[2]}. Beğenmezsen “sonraki ses” de.`; }
    if (/^(kalin|tok|daha kalin|daha tok) ses(le konus)?$/.test(t)) { set('ttsVoice', 'Algenib'); set('voice', 'natural'); return 'Daha kalın bir sese geçtim.'; }
    if (/^(dogal ses(i)? ac|kaliteli ses(e gec)?|dogal sese gec)$/.test(t)) { set('voice', 'natural'); return 'Doğal sese geçtim.'; }
    if (/^(dogal ses(i)? kapat|cihaz sesine gec|telefon sesine gec)$/.test(t)) { set('voice', 'device'); return 'Cihazın kendi sesine geçtim.'; }
    if (/^(daha )?sakin konus$/.test(t)) { set('ttsStyle', 'sakin'); return 'Daha sakin konuşacağım.'; }
    if (/^(daha )?(enerjik|neseli|canli) konus$/.test(t)) { set('ttsStyle', 'enerjik'); return 'Tamam, daha enerjik!'; }
    if (/^(daha )?(resmi|ciddi) konus$/.test(t)) { set('ttsStyle', 'resmi'); return 'Bundan sonra daha resmî konuşacağım.'; }
    if (/^(daha )?(sicak|samimi) konus$/.test(t)) { set('ttsStyle', 'sicak'); return 'Daha sıcak bir tonla konuşacağım.'; }
    if (/^(normal|jarvis) (ton|uslup)(la konus|a don)?$/.test(t)) { set('ttsStyle', 'jarvis'); return 'Normal JARVIS üslubuma döndüm.'; }
    return _local(text);
  };

  // status row
  const _sys = sysInfo;
  sysInfo = () => { _sys(); const dd = [...document.querySelectorAll('#sys dt')].find(x => x.textContent === 'Ses'); if (dd) dd.nextElementSibling.textContent = setting('voice') === 'natural' ? `doğal · ${setting('ttsEngine') === 'eleven' ? 'ElevenLabs' : 'Gemini'} · ${setting('ttsVoice')} · ${$('ttsStyle').selectedOptions[0]?.text}; kota dolarsa cihaz sesi` : 'cihaz sesi · ' + (bestVoice()?.name || 'varsayılan'); };
  sysInfo();
})();
