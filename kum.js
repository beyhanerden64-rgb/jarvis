'use strict';
/* SATÜRN kod kum havuzu (Web Worker): gönderilen JavaScript'i AĞ ERİŞİMİ OLMADAN çalıştırır, çıktıyı geri yollar.
 * Ana sayfanın verisine (hasta, kasa, anahtarlar) erişemez; 5 sn'de bitmezse ana sayfa işçiyi sonlandırır. */
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'navigator']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch { try { self[k] = undefined; } catch {} } }
self.onmessage = async e => {
  const out = [], fmt = v => { try { return typeof v === 'string' ? v : JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x), 2); } catch { return String(v); } };
  const con = { log: (...a) => out.push(a.map(fmt).join(' ')), info: (...a) => out.push(a.map(fmt).join(' ')), warn: (...a) => out.push('⚠ ' + a.map(fmt).join(' ')), error: (...a) => out.push('✗ ' + a.map(fmt).join(' ')), table: a => out.push(fmt(a)) };
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('console', '"use strict";\nreturn (async () => {\n' + String(e.data.code) + '\n})();');
    const r = await fn(con);
    self.postMessage({ ok: true, out: out.join('\n').slice(0, 20000), result: r === undefined ? null : fmt(r).slice(0, 20000) });
  } catch (err) { self.postMessage({ ok: false, out: out.join('\n').slice(0, 20000), error: String(err && err.message || err) }); }
};
