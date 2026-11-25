'use strict';
/* SATÜRN 35 — BİLİM ÇEKİRDEĞİ (yerel, kotasız, kesin hesap; yapay zekâ da bu araçları kullanır)
 *  MATEMATİK/CALCULUS: hesap makinesi, sembolik türev, sembolik + sayısal integral (sonsuz sınır dahil), limit, denklem ve doğrusal sistem çözümü
 *    (karmaşık kökler dahil), Taylor serisi, matris (det, ters, çözüm, özdeğer), fonksiyon grafiği (kök ve ekstremum işaretli)
 *  İSTATİSTİK: betimsel (çeyrekler, çarpıklık, basıklık, güven aralığı, aykırı değer, Jarque-Bera), t testleri (tek, Welch, eşleştirilmiş),
 *    Mann-Whitney U, korelasyon (Pearson, Spearman), doğrusal regresyon, tek yönlü ANOVA, ki-kare, örneklem büyüklüğü, KLİNİK SONUÇ İSTATİSTİĞİ
 *  FİZİK · MÜHENDİSLİK · MİMARLIK · BİYOLOJİ · KİMYA · EKONOMİ: 90+ formül; bilinmeyen hangisiyse onu çözer
 *  KİMYA: mol kütlesi ve % bileşim (hidratlar dahil), tepkime denkleştirme · BİRİM ÇEVİRİ · FİNANS: NPV, IRR, kredi, geri ödeme */
(() => {
  /* ======================= SAYI BİÇİMİ ======================= */
  const fmt = (v, sig = 6) => { if (typeof v !== 'number') return String(v); if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'tanımsız'; if (v === 0) return '0'; const a = Math.abs(v); if (a < 1e-4 || a >= 1e10) return v.toExponential(sig - 2).replace(/e\+?/, '×10^').replace('.', ','); return Number(v.toPrecision(sig)).toLocaleString('tr-TR', { maximumFractionDigits: 10, useGrouping: a >= 10000 }); };
  const num = s => { const t = String(s).trim().replace(/\s/g, ''); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.')); return Number(t.replace(',', '.')); };
  const nums = s => (String(s).replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number);

  /* ======================= İFADE ÇÖZÜMLEYİCİ ======================= */
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: x => 1 / Math.tan(x), sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sind: x => Math.sin(x * Math.PI / 180), cosd: x => Math.cos(x * Math.PI / 180), tand: x => Math.tan(x * Math.PI / 180),
    max: (...a) => Math.max(...a), min: (...a) => Math.min(...a), atan2: Math.atan2, hypot: Math.hypot, root: (x, n) => x < 0 && n % 2 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n), logb: (x, b) => Math.log(x) / Math.log(b), ncr: (n, k) => fact(n) / (fact(k) * fact(n - k)), npr: (n, k) => fact(n) / fact(n - k), gcd: (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }, lcm: (a, b) => Math.abs(a * b) / FN.gcd(a, b) };
  FN.kok = FN.sqrt; FN.mutlak = FN.abs;
  const CONST = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, inf: Infinity, sonsuz: Infinity };
  function fact(n) { if (n < 0 || !Number.isFinite(n)) return NaN; if (Number.isInteger(n) && n <= 170) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; } return Math.exp(lnG(n + 1)); }
  const MULTI = /\b(max|min|atan2|hypot|root|logb|ncr|npr|gcd|lcm)\s*\(/i;
  function normalize(s) {
    s = String(s).trim().replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi').replace(/√\s*\(/g, 'sqrt(').replace(/√\s*([\w.]+)/g, 'sqrt($1)').replace(/∞/g, 'inf').replace(/\*\*/g, '^');
    if (!MULTI.test(s)) s = s.replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/(\d|\))\s*°/g, '$1*(pi/180)');
    return s;
  }
  function tokenize(s) {
    const T = [], re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([a-zA-Zα-ωΑ-Ω_][a-zA-Z0-9α-ωΑ-Ω_]*)|(\S))/gy; let m;
    while ((m = re.exec(s)) && m[0]) {
      if (m[1]) T.push({ t: 'n', v: parseFloat(m[1]) });
      else if (m[2]) { let id = m[2]; const low = id.toLowerCase(); let sp;
        if (FN[low] && (id === low || id.length > 1)) T.push({ t: 'i', v: low }); else if (CONST[id] !== undefined || (id.length > 1 && CONST[low] !== undefined)) T.push({ t: 'i', v: low });
        else if ((sp = low.match(/^(sin|cos|tan|ln|exp|sqrt|log)([a-z])$/))) T.push({ t: 'i', v: sp[1] }, { t: 'p', v: '(' }, { t: 'i', v: sp[2] }, { t: 'p', v: ')' });
        else if (id.length >= 2 && id.length <= 3 && /^[xyzt]+$/.test(id)) [...id].forEach((c, i) => { if (i) T.push({ t: 'o', v: '*' }); T.push({ t: 'i', v: c }); });
        else T.push({ t: 'i', v: id }); }
      else T.push({ t: '()[]'.includes(m[3]) ? 'p' : 'o', v: m[3] === '[' ? '(' : m[3] === ']' ? ')' : m[3] });
    }
    // örtük çarpma
    const out = [];
    for (let i = 0; i < T.length; i++) { const a = T[i], b = T[i + 1]; out.push(a); if (!b) continue;
      const aEnd = a.t === 'n' || (a.t === 'i' && !FN[a.v]) || (a.t === 'p' && a.v === ')') || (a.t === 'o' && a.v === '!');
      const bStart = b.t === 'n' || b.t === 'i' || (b.t === 'p' && b.v === '(');
      if (aEnd && bStart && !(a.t === 'n' && b.t === 'n')) out.push({ t: 'o', v: '*' }); }
    return out;
  }
  function parse(src) {
    const T = tokenize(normalize(src)); let i = 0;
    const peek = () => T[i], eat = v => { const t = T[i]; if (!t || (v && t.v !== v)) throw Error(v ? `“${v}” bekleniyordu` : 'ifade eksik'); i++; return t; };
    function expr() { let n = term(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = eat().v; n = { t: 'op', o, a: n, b: term() }; } return n; }
    function term() { let n = unary(); while (peek() && (peek().v === '*' || peek().v === '/')) { const o = eat().v; n = { t: 'op', o, a: n, b: unary() }; } return n; }
    function unary() { if (peek()?.v === '-') { eat(); return { t: 'neg', a: unary() }; } if (peek()?.v === '+') { eat(); return unary(); } return power(); }
    function power() { const b = postfix(); if (peek()?.v === '^') { eat(); return { t: 'op', o: '^', a: b, b: unary() }; } return b; }
    function postfix() { let n = primary(); while (peek()?.v === '!') { eat(); n = { t: 'fn', f: 'fact', args: [n] }; } return n; }
    function primary() {
      const t = peek(); if (!t) throw Error('ifade eksik');
      if (t.t === 'n') { eat(); return { t: 'num', v: t.v }; }
      if (t.v === '(') { eat(); const n = expr(); eat(')'); return n; }
      if (t.v === '|') { eat(); const n = expr(); eat('|'); return { t: 'fn', f: 'abs', args: [n] }; }
      if (t.t === 'i') { eat(); if (FN[t.v] && peek()?.v === '(') { eat('('); const args = [expr()]; while (peek()?.v === ',' || peek()?.v === ';') { eat(); args.push(expr()); } eat(')'); return { t: 'fn', f: t.v, args }; }
        if (FN[t.v]) { return { t: 'fn', f: t.v, args: [power()] }; }
        if (CONST[t.v] !== undefined) return { t: 'num', v: CONST[t.v], c: t.v };
        return { t: 'var', n: t.v }; }
      throw Error(`beklenmeyen “${t.v}”`);
    }
    const n = expr(); if (i < T.length) throw Error(`fazladan “${T[i].v}”`); return n;
  }
  function ev(n, env = {}) {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': { if (n.n in env) return env[n.n]; throw Error(`“${n.n}” değeri verilmedi`); }
      case 'neg': return -ev(n.a, env);
      case 'op': { const a = ev(n.a, env), b = ev(n.b, env); return n.o === '+' ? a + b : n.o === '-' ? a - b : n.o === '*' ? a * b : n.o === '/' ? a / b : (a < 0 && !Number.isInteger(b) && Number.isInteger(1 / b) && (1 / b) % 2 ? -Math.pow(-a, b) : Math.pow(a, b)); }
      case 'fn': { const args = n.args.map(x => ev(x, env)); return n.f === 'fact' ? fact(args[0]) : FN[n.f](...args); }
    }
  }
  const varsOf = (n, s = new Set()) => { if (n.t === 'var') s.add(n.n); for (const k of ['a', 'b']) if (n[k]) varsOf(n[k], s); for (const x of n.args || []) varsOf(x, s); return s; };
  const has = (n, x) => varsOf(n).has(x);
  const C = v => ({ t: 'num', v }), V = n => ({ t: 'var', n }), O = (o, a, b) => ({ t: 'op', o, a, b }), F = (f, a) => ({ t: 'fn', f, args: [a] }), NEG = a => ({ t: 'neg', a });
  const isN = (n, v) => n.t === 'num' && (v === undefined || Math.abs(n.v - v) < 1e-15);
  /* ---- yazdırma ---- */
  const PR = n => n.t === 'op' ? { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[n.o] : n.t === 'neg' ? 3 : 5;
  const nstr = v => { if (Number.isInteger(v)) return String(v); const r = Number(v.toPrecision(10)); const fr = toFrac(r); return fr || String(r); };
  function toFrac(x) { if (Number.isInteger(x)) return null; for (let d = 2; d <= 64; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-10 && Math.abs(n) < 10000) return `${n}/${d}`; } return null; }
  function str(n) {
    switch (n.t) {
      case 'num': return n.c === 'pi' ? 'π' : n.c === 'e' ? 'e' : (n.v < 0 ? '(' + nstr(n.v) + ')' : nstr(n.v).includes('/') ? '(' + nstr(n.v) + ')' : nstr(n.v));
      case 'var': return n.n;
      case 'neg': { const s = str(n.a); return '-' + (PR(n.a) <= 2 ? '(' + s + ')' : s); }
      case 'fn': return n.f === 'fact' ? wrap(n.args[0], 5) + '!' : n.f + '(' + n.args.map(str).join(', ') + ')';
      case 'op': { const p = PR(n);
        if (n.o === '*' && n.a.t === 'num' && !String(nstr(n.a.v)).includes('/') && n.a.v >= 0 && (n.b.t === 'var' || n.b.t === 'fn' || (n.b.t === 'op' && n.b.o === '^' && n.b.a.t === 'var'))) return nstr(n.a.v) + str(n.b);
        const L = wrap(n.a, p, n.o === '^'), R = wrap(n.b, p, n.o === '-' || n.o === '/' || (n.o === '^' ? false : false), n.o === '^');
        return L + (n.o === '+' || n.o === '-' ? ` ${n.o} ` : n.o === '*' ? '·' : n.o) + R; }
    }
  }
  function wrap(n, p, strictLeft = false, isExpRight = false) { const s = str(n); const q = PR(n); if (isExpRight) return q < 5 || (n.t === 'num' && n.v < 0) ? '(' + s + ')' : s; return q < p || (strictLeft && q === p && n.t !== 'num' && n.t !== 'var' && n.t !== 'fn') ? '(' + s + ')' : s; }
  /* ---- sadeleştirme ---- */
  const same = (a, b) => str(a) === str(b);
  function simp(n) {
    if (n.t === 'num' || n.t === 'var') return n;
    if (n.t === 'fn') { const args = n.args.map(simp); if (args.every(a => a.t === 'num') && !['fact'].includes(n.f)) { const v = FN[n.f](...args.map(a => a.v)); if (Number.isInteger(Math.round(v * 1e12) / 1e12) && Math.abs(v - Math.round(v)) < 1e-12) return C(Math.round(v)); } if (n.f === 'ln' && args[0].t === 'fn' && args[0].f === 'exp') return args[0].args[0]; if (n.f === 'exp' && args[0].t === 'fn' && args[0].f === 'ln') return args[0].args[0]; return { ...n, args }; }
    if (n.t === 'neg') { const a = simp(n.a); if (a.t === 'num') return C(-a.v); if (a.t === 'neg') return a.a; if (a.t === 'op' && a.o === '*' && a.a.t === 'num') return simp(O('*', C(-a.a.v), a.b)); return NEG(a); }
    let a = simp(n.a), b = simp(n.b);
    if (a.t === 'num' && b.t === 'num' && !a.c && !b.c) { const v = ev(O(n.o, a, b)); if (Number.isFinite(v)) return C(v); }
    switch (n.o) {
      case '+': if (isN(a, 0)) return b; if (isN(b, 0)) return a; if (b.t === 'neg') return simp(O('-', a, b.a)); if (b.t === 'num' && b.v < 0) return O('-', a, C(-b.v)); if (same(a, b)) return simp(O('*', C(2), a));
        { const ca = coef(a), cb = coef(b); if (same(ca[1], cb[1]) && !(ca[1].t === 'num')) return simp(O('*', C(ca[0] + cb[0]), ca[1])); }
        if (a.t === 'num' && b.t !== 'num') return O('+', b, a); break;
      case '-': if (isN(b, 0)) return a; if (isN(a, 0)) return simp(NEG(b)); if (same(a, b)) return C(0); if (b.t === 'neg') return simp(O('+', a, b.a)); if (b.t === 'num' && b.v < 0) return O('+', a, C(-b.v));
        { const ca = coef(a), cb = coef(b); if (same(ca[1], cb[1]) && ca[1].t !== 'num') return simp(O('*', C(ca[0] - cb[0]), ca[1])); } break;
      case '*': if (isN(a, 0) || isN(b, 0)) return C(0); if (isN(a, 1)) return b; if (isN(b, 1)) return a; if (isN(a, -1)) return simp(NEG(b)); if (isN(b, -1)) return simp(NEG(a));
        if (b.t === 'num' && a.t !== 'num') return simp(O('*', b, a));
        if (a.t === 'neg') return simp(NEG(O('*', a.a, b))); if (b.t === 'neg') return simp(NEG(O('*', a, b.a)));
        if (a.t === 'num' && b.t === 'op' && b.o === '*' && b.a.t === 'num') return simp(O('*', C(a.v * b.a.v), b.b));
        if (a.t === 'num' && b.t === 'op' && b.o === '/' && b.a.t === 'num') return simp(O('/', C(a.v * b.a.v), b.b));
        if (same(a, b)) return O('^', a, C(2));
        { const pa = powOf(a), pb = powOf(b); if (same(pa[0], pb[0])) return simp(O('^', pa[0], simp(O('+', pa[1], pb[1])))); }
        if (b.t === 'op' && b.o === '/' && isN(b.a, 1)) return simp(O('/', a, b.b));
        if (a.t === 'op' && a.o === '/' && isN(a.a, 1)) return simp(O('/', b, a.b));
        break;
      case '/': if (isN(a, 0)) return C(0); if (isN(b, 1)) return a; if (same(a, b)) return C(1);
        if (b.t === 'num' && a.t === 'op' && a.o === '*' && a.a.t === 'num') return simp(O('*', C(a.a.v / b.v), a.b));
        if (b.t === 'num' && a.t === 'op' && a.o === '/' && a.b.t === 'num') return simp(O('/', a.a, C(a.b.v * b.v)));
        if (b.t === 'num' && a.t !== 'num' && Math.abs(1 / b.v - Math.round(1 / b.v * 1e9) / 1e9) < 1e-12 && Number.isInteger(1 / b.v)) return simp(O('*', C(1 / b.v), a));
        { const pa = powOf(a), pb = powOf(b); if (same(pa[0], pb[0]) && pa[0].t !== 'num') return simp(O('^', pa[0], simp(O('-', pa[1], pb[1])))); }
        if (a.t === 'neg') return simp(NEG(O('/', a.a, b)));
        break;
      case '^': if (isN(b, 0)) return C(1); if (isN(b, 1)) return a; if (isN(a, 1)) return C(1); if (a.t === 'op' && a.o === '^' && b.t === 'num' && a.b.t === 'num') return O('^', a.a, C(a.b.v * b.v)); if (a.t === 'fn' && a.f === 'sqrt' && isN(b, 2)) return a.args[0]; break;
    }
    return O(n.o, a, b);
  }
  const coef = n => n.t === 'op' && n.o === '*' && n.a.t === 'num' ? [n.a.v, n.b] : n.t === 'neg' ? [-coef(n.a)[0], coef(n.a)[1]] : [1, n];
  const powOf = n => n.t === 'op' && n.o === '^' && n.b.t === 'num' ? [n.a, n.b] : n.t === 'fn' && n.f === 'sqrt' ? [n.args[0], C(0.5)] : [n, C(1)];
  const S = n => { let p = n, q; for (let k = 0; k < 6; k++) { q = simp(p); if (same(p, q)) break; p = q; } return q; };
  /* ---- sembolik türev ---- */
  function d(n, x) {
    switch (n.t) {
      case 'num': return C(0);
      case 'var': return C(n.n === x ? 1 : 0);
      case 'neg': return NEG(d(n.a, x));
      case 'op': { const { a, b } = n, da = d(a, x), db = d(b, x);
        if (n.o === '+' || n.o === '-') return O(n.o, da, db);
        if (n.o === '*') return O('+', O('*', da, b), O('*', a, db));
        if (n.o === '/') return O('/', O('-', O('*', da, b), O('*', a, db)), O('^', b, C(2)));
        if (n.o === '^') { if (!has(b, x)) return O('*', O('*', b, O('^', a, S(O('-', b, C(1))))), da); if (!has(a, x)) return O('*', O('*', n, F('ln', a)), db); return O('*', n, O('+', O('*', db, F('ln', a)), O('/', O('*', b, da), a))); } }
      case 'fn': { const u = n.args[0], du = d(u, x); const ch = g => O('*', g, du);
        switch (n.f) {
          case 'sin': return ch(F('cos', u)); case 'cos': return ch(NEG(F('sin', u))); case 'tan': return ch(O('/', C(1), O('^', F('cos', u), C(2))));
          case 'cot': return ch(NEG(O('/', C(1), O('^', F('sin', u), C(2))))); case 'sec': return ch(O('*', F('sec', u), F('tan', u))); case 'csc': return ch(NEG(O('*', F('csc', u), F('cot', u))));
          case 'asin': case 'arcsin': return ch(O('/', C(1), F('sqrt', O('-', C(1), O('^', u, C(2))))));
          case 'acos': case 'arccos': return ch(NEG(O('/', C(1), F('sqrt', O('-', C(1), O('^', u, C(2)))))));
          case 'atan': case 'arctan': return ch(O('/', C(1), O('+', C(1), O('^', u, C(2)))));
          case 'sinh': return ch(F('cosh', u)); case 'cosh': return ch(F('sinh', u)); case 'tanh': return ch(O('/', C(1), O('^', F('cosh', u), C(2))));
          case 'exp': return ch(F('exp', u)); case 'ln': return ch(O('/', C(1), u)); case 'log': case 'log10': return ch(O('/', C(1), O('*', u, F('ln', C(10)))));
          case 'log2': return ch(O('/', C(1), O('*', u, F('ln', C(2))))); case 'sqrt': return ch(O('/', C(1), O('*', C(2), F('sqrt', u)))); case 'cbrt': return ch(O('/', C(1), O('*', C(3), O('^', F('cbrt', u), C(2)))));
          case 'abs': return ch(O('/', u, F('abs', u)));
          case 'sind': return ch(O('*', C(Math.PI / 180), F('cosd', u))); case 'cosd': return ch(NEG(O('*', C(Math.PI / 180), F('sind', u))));
        }
        throw Error(`${n.f} fonksiyonunun türevi desteklenmiyor`); }
    }
  }
  /* ---- sembolik integral (doğrulamalı) ---- */
  function lin(u, x) { const du = S(d(u, x)); return has(du, x) ? null : ev(du); }
  function I(n, x) {
    if (!has(n, x)) return O('*', n, V(x));
    switch (n.t) {
      case 'var': return O('/', O('^', V(x), C(2)), C(2));
      case 'neg': { const r = I(n.a, x); return r && NEG(r); }
      case 'op': { const { a, b } = n;
        if (n.o === '+' || n.o === '-') { const ra = I(a, x), rb = I(b, x); return ra && rb ? O(n.o, ra, rb) : null; }
        if (n.o === '*') { if (!has(a, x)) { const r = I(b, x); return r && O('*', a, r); } if (!has(b, x)) { const r = I(a, x); return r && O('*', b, r); } return byParts(a, b, x) || byParts(b, a, x); }
        if (n.o === '/') { if (!has(b, x)) { const r = I(a, x); return r && O('/', r, b); } if (!has(a, x)) { const k = lin(b, x); if (k) return O('*', O('/', a, C(k)), F('ln', F('abs', b))); const p = powOf(b); const k2 = lin(p[0], x); if (k2 && p[1].t === 'num') return I(O('*', a, O('^', p[0], C(-p[1].v))), x); } return null; }
        if (n.o === '^') { if (!has(b, x)) { const k = lin(a, x); if (!k) return null; const nn = ev(b); if (Math.abs(nn + 1) < 1e-12) return O('/', F('ln', F('abs', a)), C(k)); return O('/', O('^', a, C(nn + 1)), C((nn + 1) * k)); } if (!has(a, x)) { const k = lin(b, x); if (!k) return null; return O('/', n, O('*', F('ln', a), C(k))); } return null; } }
      case 'fn': { const u = n.args[0], k = lin(u, x); if (!k) return null; const D = g => O('/', g, C(k));
        switch (n.f) { case 'sin': return D(NEG(F('cos', u))); case 'cos': return D(F('sin', u)); case 'exp': return D(F('exp', u)); case 'tan': return D(NEG(F('ln', F('abs', F('cos', u))))); case 'sinh': return D(F('cosh', u)); case 'cosh': return D(F('sinh', u)); case 'sqrt': return D(O('*', C(2 / 3), O('^', u, C(1.5)))); case 'ln': return D(O('-', O('*', u, F('ln', u)), u)); }
        return null; }
    }
    return null;
  }
  function byParts(p, g, x) { // tablo yöntemi: p polinom, g tekrar tekrar integrallenebilir
    const ds = [p]; for (let k = 0; k < 7; k++) { const nx = S(d(ds.at(-1), x)); if (isN(nx, 0)) break; ds.push(nx); if (k === 6) return null; }
    let G = g, acc = null; for (let k = 0; k < ds.length; k++) { G = I(G, x); if (!G) return null; G = S(G); const term = O('*', ds[k], G); acc = acc ? O(k % 2 ? '-' : '+', acc, term) : term; } return acc; }
  function verify(F0, f, x) { for (const t of [0.37, 1.21, 2.5, -0.73, 3.9]) { let a, b; try { a = ev(S(d(F0, x)), { [x]: t }); b = ev(f, { [x]: t }); } catch { continue; } if (!Number.isFinite(a) || !Number.isFinite(b)) continue; if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(b))) return false; } return true; }
  function simpson(f, a, b, eps = 1e-10, depth = 50) {
    const s = (a, b, fa, fm, fb) => (b - a) / 6 * (fa + 4 * fm + fb);
    const rec = (a, b, fa, fm, fb, whole, eps, dep) => { const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2, flm = f(lm), frm = f(rm), L = s(a, m, fa, flm, fm), R = s(m, b, fm, frm, fb); if (dep <= 0 || Math.abs(L + R - whole) <= 15 * eps) return L + R + (L + R - whole) / 15; return rec(a, m, fa, flm, fm, L, eps / 2, dep - 1) + rec(m, b, fm, frm, fb, R, eps / 2, dep - 1); };
    const fa = f(a), fb = f(b), fm = f((a + b) / 2); return rec(a, b, fa, fm, fb, s(a, b, fa, fm, fb), eps, depth);
  }
  function numInt(f, a, b) {
    const safe = g => t => { const v = g(t); return Number.isFinite(v) ? v : 0; };
    if (a === -Infinity && b === Infinity) return numInt(f, -Infinity, 0) + numInt(f, 0, Infinity);
    if (b === Infinity) return simpson(safe(t => f(a + t / (1 - t)) / (1 - t) ** 2), 0, 1 - 1e-9, 1e-10, 40);
    if (a === -Infinity) return numInt(t => f(-t), -b, Infinity);
    const n = 64, h = (b - a) / n; let s = 0; for (let i = 0; i < n; i++) s += simpson(safe(f), a + i * h + (i === 0 ? 1e-12 : 0), a + (i + 1) * h - (i === n - 1 ? 1e-12 : 0), 1e-11, 30); return s;
  }
  /* ---- limit ---- */
  function limit(f, a) {
    if (!Number.isFinite(a)) { const xs = [1e2, 1e3, 1e4, 1e5, 1e6, 1e8].map(t => a > 0 ? t : -t), ys = xs.map(f); const L = ys.at(-1); if (Math.abs(L) > 1e7 && Math.abs(ys.at(-1)) > Math.abs(ys.at(-2))) return L > 0 ? Infinity : -Infinity; if (Math.abs(ys.at(-1) - ys.at(-2)) < 1e-6 * (1 + Math.abs(L))) return L; return NaN; }
    const side = s => { const hs = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7], ys = hs.map(h => f(a + s * h)); const L = ys.at(-1); if (Math.abs(L) > 1e6 && Math.abs(ys.at(-1)) > Math.abs(ys.at(-3)) * 5) return L > 0 ? Infinity : -Infinity; return Math.abs(ys.at(-1) - ys.at(-2)) < 1e-5 * (1 + Math.abs(L)) || Math.abs(ys.at(-2) - ys.at(-3)) < 1e-4 * (1 + Math.abs(L)) ? L : NaN; };
    const l = side(-1), r = side(1); return { l, r };
  }
  /* ---- kök bulma ---- */
  function roots(f, lo = -1e3, hi = 1e3) {
    const pts = []; const N = 6000; for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N; pts.push(Math.sign(u) * (Math.expm1(Math.abs(u) * Math.log1p(hi)) )); }
    const xs = [...new Set([...pts, ...Array.from({ length: 2001 }, (_, i) => -10 + i / 100)])].filter(x => x >= lo && x <= hi).sort((a, b) => a - b);
    const out = []; let px = xs[0], py = f(px);
    const refine = (a, b) => { let fa = f(a); for (let k = 0; k < 200; k++) { const m = (a + b) / 2, fm = f(m); if (!Number.isFinite(fm)) return null; if (fm === 0) return m; if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; if (Math.abs(b - a) < 1e-14 * (1 + Math.abs(a))) break; } return (a + b) / 2; };
    for (let i = 1; i < xs.length; i++) { const x = xs[i], y = f(x); if (Number.isFinite(y) && Number.isFinite(py)) { if (y === 0) out.push(x); else if (Math.sign(y) !== Math.sign(py)) { const r = refine(px, x); if (r != null && Math.abs(f(r)) < 1e-6 * (1 + Math.abs(py) + Math.abs(y))) out.push(r); } else if (i > 1 && Math.abs(y) < 1e-9) out.push(x); } px = x; py = y; }
    // teğet kökler (çift katlı): |f| yerel minimumu ~0
    for (let i = 1; i < xs.length - 1; i++) { const a = Math.abs(f(xs[i - 1])), b = Math.abs(f(xs[i])), c = Math.abs(f(xs[i + 1])); if (b < a && b < c && b < 1e-3) { let L = xs[i - 1], R = xs[i + 1]; for (let k = 0; k < 100; k++) { const m1 = L + (R - L) / 3, m2 = R - (R - L) / 3; if (Math.abs(f(m1)) < Math.abs(f(m2))) R = m2; else L = m1; } const m = (L + R) / 2; if (Math.abs(f(m)) < 1e-10) out.push(m); } }
    const u = []; for (const r of out.sort((a, b) => a - b)) if (!u.some(v => Math.abs(v - r) < 1e-7 * (1 + Math.abs(r)))) u.push(Math.abs(r) < 1e-12 ? 0 : r); return u;
  }
  const clean = v => { const r = Math.round(v); return Math.abs(v - r) < 1e-9 ? r : Math.abs(v * 1e6 - Math.round(v * 1e6)) < 1e-6 ? Math.round(v * 1e6) / 1e6 : v; };
  /* ---- denklem ---- */
  function splitEq(s) { const p = normalize(s).split('='); if (p.length === 1) return [p[0], '0']; if (p.length !== 2) throw Error('denklemde tek “=” olmalı'); return p; }
  function pickVar(ns, pref) { const vs = [...new Set(ns.flatMap(n => [...varsOf(n)]))]; if (pref && vs.includes(pref)) return pref; for (const c of ['x', 'y', 't', 'z', 'n']) if (vs.includes(c)) return c; return vs[0]; }
  function solve(src, pref) {
    const eqs = String(src).split(/\s*;\s*|\s*\n\s*|\s+ve\s+/).filter(Boolean);
    if (eqs.length > 1) return solveSystem(eqs);
    const [l, r] = splitEq(eqs[0]), L = parse(l), R = parse(r), x = pickVar([L, R], pref); if (!x) throw Error('bilinmeyen yok');
    const fn = O('-', L, R), others = [...varsOf(fn)].filter(v => v !== x); if (others.length) throw Error(`başka bilinmeyen var: ${others.join(', ')} (değerlerini ver ya da “;” ile ikinci denklem yaz)`);
    const f = t => ev(fn, { [x]: t });
    // ikinci dereceden mi? (3. türev sıfır)
    let deg = null; try { const d1 = S(d(fn, x)), d2 = S(d(d1, x)), d3 = S(d(d2, x)); if (!has(d3, x) && Math.abs(ev(d3)) < 1e-12) deg = !has(d2, x) && Math.abs(ev(d2)) < 1e-12 ? (!has(d1, x) && Math.abs(ev(d1)) < 1e-12 ? 0 : 1) : 2; } catch {}
    const lines = [`Denklem: ${str(S(L))} = ${str(S(R))}`];
    if (deg === 2) { const c = f(0), b = (f(1) - f(-1)) / 2, a = (f(1) + f(-1)) / 2 - c, D = b * b - 4 * a * c; lines.push(`İkinci dereceden: a=${fmt(a)}, b=${fmt(b)}, c=${fmt(c)} · Δ = b²−4ac = ${fmt(D)}`); if (D >= 0) { const r1 = (-b - Math.sqrt(D)) / (2 * a), r2 = (-b + Math.sqrt(D)) / (2 * a); lines.push(D === 0 ? `Çift katlı kök: ${x} = ${fmt(clean(r1))}` : `${x}₁ = ${fmt(clean(r1))}, ${x}₂ = ${fmt(clean(r2))}`); } else { const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * a); lines.push(`Gerçek kök yok. Karmaşık kökler: ${x} = ${fmt(re)} ± ${fmt(Math.abs(im))}i`); } return lines.join('\n'); }
    if (deg === 1) { const b = f(0), a = f(1) - b; lines.push(`Doğrusal: ${x} = ${fmt(clean(-b / a))}`); return lines.join('\n'); }
    if (deg === 0) return lines.concat(f(0) === 0 ? 'Her değer için doğru (özdeşlik).' : 'Çözüm yok (çelişki).').join('\n');
    const rs = roots(f); lines.push(rs.length ? `Gerçek kökler (sayısal, ±1000 aralığında): ${rs.slice(0, 12).map(r => `${x} ≈ ${fmt(clean(r), 9)}`).join(', ')}${rs.length > 12 ? ` … (+${rs.length - 12})` : ''}` : '±1000 aralığında gerçek kök bulunamadı.');
    return lines.join('\n');
  }
  function solveSystem(eqs) {
    const fs = eqs.map(e => { const [l, r] = splitEq(e); return O('-', parse(l), parse(r)); });
    const vs = [...new Set(fs.flatMap(f => [...varsOf(f)]))].sort();
    if (vs.length !== fs.length) throw Error(`${fs.length} denklem, ${vs.length} bilinmeyen (${vs.join(', ')}) — sayıları eşit olmalı`);
    const at = (f, vals) => ev(f, Object.fromEntries(vs.map((v, i) => [v, vals[i]])));
    const z = vs.map(() => 0), A = [], b = [];
    for (const f of fs) { const c0 = at(f, z); A.push(vs.map((_, j) => at(f, vs.map((_, k) => k === j ? 1 : 0)) - c0)); b.push(-c0); const t = vs.map(() => 1.7), tt = vs.map(() => 3.1); if (Math.abs(at(f, t) - (c0 + A.at(-1).reduce((s, a) => s + a * 1.7, 0))) > 1e-8 || Math.abs(at(f, tt) - (c0 + A.at(-1).reduce((s, a) => s + a * 3.1, 0))) > 1e-8) return newtonSys(fs, vs); }
    const x = gauss(A, b); if (!x) return 'Sistemin tek çözümü yok (denklemler bağımlı ya da çelişkili).';
    return 'Doğrusal sistem çözümü: ' + vs.map((v, i) => `${v} = ${fmt(clean(x[i]))}`).join(', ');
  }
  function newtonSys(fs, vs) { let x = vs.map(() => 0.5); for (let it = 0; it < 100; it++) { const F0 = fs.map(f => ev(f, Object.fromEntries(vs.map((v, i) => [v, x[i]])))); if (Math.max(...F0.map(Math.abs)) < 1e-12) break; const J = fs.map(f => vs.map((_, j) => { const h = 1e-7 * (1 + Math.abs(x[j])), xp = x.slice(); xp[j] += h; return (ev(f, Object.fromEntries(vs.map((v, i) => [v, xp[i]]))) - ev(f, Object.fromEntries(vs.map((v, i) => [v, x[i]])))) / h; })); const dx = gauss(J, F0.map(v => -v)); if (!dx) break; x = x.map((v, i) => v + dx[i]); } const ok = fs.every(f => Math.abs(ev(f, Object.fromEntries(vs.map((v, i) => [v, x[i]])))) < 1e-8); return ok ? 'Doğrusal olmayan sistem (Newton) çözümü: ' + vs.map((v, i) => `${v} ≈ ${fmt(clean(x[i]), 9)}`).join(', ') + ' (başka çözümler de olabilir)' : 'Doğrusal olmayan sistem için çözüm bulunamadı.'; }
  function gauss(A, b) { const n = A.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; } } return M.map((r, i) => r[n] / r[i]); }
  /* ---- matris ---- */
  const parseM = s => { const j = JSON.parse(String(s).replace(/(\d),(\d)/g, (m, a, b) => m).replace(/;/g, '],[').replace(/^\s*\[?\s*\[/, '[[').replace(/\]\s*\]?\s*$/, ']]')); if (!Array.isArray(j) || !j.every(Array.isArray)) throw Error('matris biçimi: [[1,2],[3,4]]'); return j.map(r => r.map(Number)); };
  const det = M => { const n = M.length; if (M.some(r => r.length !== n)) throw Error('kare matris değil'); const A = M.map(r => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-14) return 0; if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const k = A[r][c] / A[c][c]; for (let j = c; j < n; j++) A[r][j] -= k * A[c][j]; } } return D; };
  const inv = M => { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-14) return null; [A[c], A[p]] = [A[p], A[c]]; const k = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= k; for (let r = 0; r < n; r++) if (r !== c) { const q = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= q * A[c][j]; } } return A.map(r => r.slice(n)); };
  const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  function eig(M) { const n = M.length; let A = M.map(r => r.slice()); for (let it = 0; it < 500; it++) { const Q = A.map(r => r.map(() => 0)), R = A.map(r => r.map(() => 0)); for (let j = 0; j < n; j++) { let v = A.map(r => r[j]); for (let i = 0; i < j; i++) { const q = Q.map(r => r[i]); R[i][j] = q.reduce((s, x, k) => s + x * A[k][j], 0); v = v.map((x, k) => x - R[i][j] * q[k]); } R[j][j] = Math.hypot(...v); for (let k = 0; k < n; k++) Q[k][j] = R[j][j] ? v[k] / R[j][j] : 0; } A = mul(R, Q); } const ev0 = A.map((r, i) => r[i]); const sub = A.some((r, i) => i > 0 && Math.abs(r[i - 1]) > 1e-6); return { vals: ev0, complex: sub }; }
  const mstr = M => M.map(r => '[ ' + r.map(v => fmt(clean(v), 5).padStart(8)).join('  ') + ' ]').join('\n');

  /* ======================= İSTATİSTİK ======================= */
  function lnG(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnG(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
  function gammaP(a, x) { if (x <= 0) return 0; if (x < a + 1) { let s = 1 / a, t = s; for (let n = 1; n < 500; n++) { t *= x / (a + n); s += t; if (Math.abs(t) < Math.abs(s) * 1e-15) break; } return s * Math.exp(-x + a * Math.log(x) - lnG(a)); } let b = x + 1 - a, c = 1e300, dd = 1 / b, h = dd; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; dd = an * dd + b; if (Math.abs(dd) < 1e-300) dd = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; dd = 1 / dd; const del = dd * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; } return 1 - Math.exp(-x + a * Math.log(x) - lnG(a)) * h; }
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, dd = 1 - qab * x / qap; if (Math.abs(dd) < 1e-300) dd = 1e-300; dd = 1 / dd; let h = dd; for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); dd = 1 + aa * dd; if (Math.abs(dd) < 1e-300) dd = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; dd = 1 / dd; h *= dd * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); dd = 1 + aa * dd; if (Math.abs(dd) < 1e-300) dd = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; dd = 1 / dd; const del = dd * c; h *= del; if (Math.abs(del - 1) < 3e-16) break; } return h; }
  function betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lnG(a + b) - lnG(a) - lnG(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  const Phi = z => 0.5 * (1 + Math.sign(z) * gammaP(0.5, z * z / 2));
  function zInv(p) { const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00], b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01], c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00], dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]; const pl = 0.02425; let q, r; if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1); } if (p > 1 - pl) return -zInv(1 - p); q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const tP2 = (t, df) => betai(df / 2, 0.5, df / (df + t * t)); // iki yönlü p
  const tInv = (p, df) => { let lo = 0, hi = 1000; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tP2(m, df) > p) lo = m; else hi = m; } return (lo + hi) / 2; }; // iki yönlü kritik değer
  const fP = (F, d1, d2) => betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));
  const chiP = (x, df) => 1 - gammaP(df / 2, x / 2);
  const pstr = p => p < 0.001 ? 'p < 0,001' : 'p = ' + fmt(p, 3);
  const sig = p => p < 0.05 ? '✓ istatistiksel olarak ANLAMLI (α = 0,05)' : '✗ anlamlı değil (α = 0,05)';
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const vr = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
  const sd = a => Math.sqrt(vr(a));
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y), h = (s.length - 1) * p, l = Math.floor(h); return s[l] + (h - l) * ((s[l + 1] ?? s[l]) - s[l]); };
  const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  function describe(x) {
    const n = x.length; if (n < 2) throw Error('en az 2 değer gerekli');
    const m = mean(x), s = sd(x), se = s / Math.sqrt(n), tc = tInv(0.05, n - 1), Q1 = q(x, 0.25), Q3 = q(x, 0.75), iqr = Q3 - Q1;
    const sk = n > 2 ? n / ((n - 1) * (n - 2)) * x.reduce((a, v) => a + ((v - m) / s) ** 3, 0) : NaN;
    const ku = n > 3 ? n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * x.reduce((a, v) => a + ((v - m) / s) ** 4, 0) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)) : NaN;
    const out = x.filter(v => v < Q1 - 1.5 * iqr || v > Q3 + 1.5 * iqr), freq = {}; x.forEach(v => freq[v] = (freq[v] || 0) + 1); const mf = Math.max(...Object.values(freq)), mode = mf > 1 ? Object.keys(freq).filter(k => freq[k] === mf).join(', ') : 'yok';
    const jb = n / 6 * (sk ** 2 + (ku ** 2) / 4), jbp = chiP(jb, 2);
    return `📊 BETİMSEL İSTATİSTİK (n = ${n})\nOrtalama ${fmt(m)} · Medyan ${fmt(q(x, 0.5))} · Mod ${mode}\nStandart sapma ${fmt(s)} · Varyans ${fmt(s * s)} · Std. hata ${fmt(se)} · Değişim katsayısı %${fmt(s / Math.abs(m) * 100, 3)}\nMin ${fmt(Math.min(...x))} · Q1 ${fmt(Q1)} · Q3 ${fmt(Q3)} · Maks ${fmt(Math.max(...x))} · Çeyrekler açıklığı ${fmt(iqr)}\nOrtalamanın %95 güven aralığı: ${fmt(m - tc * se)} – ${fmt(m + tc * se)}\nÇarpıklık ${fmt(sk, 3)} · Basıklık (fazla) ${fmt(ku, 3)}${n >= 8 ? ` · Normallik (Jarque-Bera) ${pstr(jbp)} → ${jbp < 0.05 ? 'normal dağılmıyor olabilir; parametrik olmayan test düşün' : 'normal dağılıma uygun'}` : ''}\nAykırı değer (1,5×IQR): ${out.length ? out.map(v => fmt(v)).join(', ') : 'yok'}`;
  }
  const dCohen = (a, b) => { const sp = Math.sqrt(((a.length - 1) * vr(a) + (b.length - 1) * vr(b)) / (a.length + b.length - 2)); return (mean(a) - mean(b)) / sp; };
  const dWord = dd => { const a = Math.abs(dd); return a < 0.2 ? 'önemsiz' : a < 0.5 ? 'küçük' : a < 0.8 ? 'orta' : 'büyük'; };
  function tOne(x, mu = 0) { const n = x.length, m = mean(x), se = sd(x) / Math.sqrt(n), t = (m - mu) / se, p = tP2(t, n - 1), tc = tInv(0.05, n - 1); return `🧪 TEK ÖRNEKLEM t TESTİ (μ₀ = ${fmt(mu)})\nn = ${n}, ortalama ${fmt(m)}, ss ${fmt(sd(x))}\nt(${n - 1}) = ${fmt(t, 4)}, ${pstr(p)} → ${sig(p)}\nFark ${fmt(m - mu)}, %95 GA ${fmt(m - mu - tc * se)} – ${fmt(m - mu + tc * se)} · Cohen d = ${fmt((m - mu) / sd(x), 3)} (${dWord((m - mu) / sd(x))} etki)`; }
  function tWelch(a, b) { const ma = mean(a), mb = mean(b), va = vr(a) / a.length, vb = vr(b) / b.length, t = (ma - mb) / Math.sqrt(va + vb), df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1)), p = tP2(t, df), tc = tInv(0.05, df), dd = dCohen(a, b); const fv = Math.max(vr(a), vr(b)) / Math.min(vr(a), vr(b)), pv = Math.min(1, 2 * fP(fv, vr(a) >= vr(b) ? a.length - 1 : b.length - 1, vr(a) >= vr(b) ? b.length - 1 : a.length - 1));
    return `🧪 BAĞIMSIZ İKİ ÖRNEKLEM t TESTİ (Welch)\nGrup 1: n=${a.length}, ort ${fmt(ma)}, ss ${fmt(sd(a))} · Grup 2: n=${b.length}, ort ${fmt(mb)}, ss ${fmt(sd(b))}\nt(${fmt(df, 4)}) = ${fmt(t, 4)}, ${pstr(p)} → ${sig(p)}\nFark ${fmt(ma - mb)}, %95 GA ${fmt(ma - mb - tc * Math.sqrt(va + vb))} – ${fmt(ma - mb + tc * Math.sqrt(va + vb))} · Cohen d = ${fmt(dd, 3)} (${dWord(dd)} etki)\nVaryans eşitliği (F) ${pstr(pv)} · Not: Welch testi varyanslar eşit olmasa da geçerlidir.${a.length < 15 || b.length < 15 ? '\nKüçük örneklem: sonucu Mann-Whitney U ile de doğrula (“mann whitney: … | …”).' : ''}`; }
  function tPaired(a, b) { if (a.length !== b.length) throw Error('eşleştirilmiş testte iki ölçüm sayısı eşit olmalı'); const dd = a.map((v, i) => v - b[i]), n = dd.length, m = mean(dd), s = sd(dd), se = s / Math.sqrt(n), t = m / se, p = tP2(t, n - 1), tc = tInv(0.05, n - 1); return `🧪 EŞLEŞTİRİLMİŞ t TESTİ (önce–sonra)\nn = ${n} · ortalama fark ${fmt(m)} (ss ${fmt(s)})\nt(${n - 1}) = ${fmt(t, 4)}, ${pstr(p)} → ${sig(p)}\n%95 GA ${fmt(m - tc * se)} – ${fmt(m + tc * se)} · etki büyüklüğü dz = ${fmt(m / s, 3)} (${dWord(m / s)})`; }
  function mannW(a, b) { const all = [...a, ...b], r = rank(all), R1 = r.slice(0, a.length).reduce((s, v) => s + v, 0), n1 = a.length, n2 = b.length, U1 = R1 - n1 * (n1 + 1) / 2, U = Math.min(U1, n1 * n2 - U1); const T = {}; all.forEach(v => T[v] = (T[v] || 0) + 1); const tie = Object.values(T).reduce((s, t) => s + t ** 3 - t, 0), N = n1 + n2; const sdU = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1)))), z = (U - n1 * n2 / 2 + 0.5) / sdU, p = Math.min(1, 2 * Phi(z)); return `🧪 MANN-WHITNEY U (parametrik olmayan)\nn₁=${n1}, n₂=${n2} · medyanlar ${fmt(q(a, .5))} / ${fmt(q(b, .5))}\nU = ${fmt(U)}, z = ${fmt(z, 4)}, ${pstr(p)} → ${sig(p)} · r = ${fmt(Math.abs(z) / Math.sqrt(N), 3)}`; }
  function corr(x, y) { if (x.length !== y.length) throw Error('x ve y aynı uzunlukta olmalı'); const n = x.length, mx = mean(x), my = mean(y), sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0), sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), syy = y.reduce((s, v) => s + (v - my) ** 2, 0), r = sxy / Math.sqrt(sxx * syy), t = r * Math.sqrt((n - 2) / (1 - r * r)), p = tP2(t, n - 2); const rx = rank(x), ry = rank(y), mrx = mean(rx), mry = mean(ry), rs = rx.reduce((s, v, i) => s + (v - mrx) * (ry[i] - mry), 0) / Math.sqrt(rx.reduce((s, v) => s + (v - mrx) ** 2, 0) * ry.reduce((s, v) => s + (v - mry) ** 2, 0)), ts = rs * Math.sqrt((n - 2) / (1 - rs * rs)), ps = tP2(ts, n - 2); const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3), w = a => Math.abs(a) < 0.1 ? 'yok denecek kadar' : Math.abs(a) < 0.3 ? 'zayıf' : Math.abs(a) < 0.5 ? 'orta' : Math.abs(a) < 0.7 ? 'güçlü' : 'çok güçlü';
    return `🔗 KORELASYON (n = ${n})\nPearson r = ${fmt(r, 4)} (${w(r)} ${r >= 0 ? 'pozitif' : 'negatif'}), ${pstr(p)} → ${sig(p)} · %95 GA ${fmt(Math.tanh(z - 1.96 * se), 3)} – ${fmt(Math.tanh(z + 1.96 * se), 3)} · r² = ${fmt(r * r, 3)}\nSpearman ρ = ${fmt(rs, 4)}, ${pstr(ps)}\nNot: korelasyon nedensellik göstermez.`; }
  function regress(x, y) { const n = x.length, mx = mean(x), my = mean(y), sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0), b1 = sxy / sxx, b0 = my - b1 * mx, res = y.map((v, i) => v - (b0 + b1 * x[i])), sse = res.reduce((s, e) => s + e * e, 0), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), r2 = 1 - sse / sst, s = Math.sqrt(sse / (n - 2)), seb1 = s / Math.sqrt(sxx), seb0 = s * Math.sqrt(1 / n + mx * mx / sxx), t = b1 / seb1, p = tP2(t, n - 2), tc = tInv(0.05, n - 2), F = (sst - sse) / (sse / (n - 2));
    return { b0, b1, r2, text: `📈 DOĞRUSAL REGRESYON (n = ${n})\ny = ${fmt(b0, 5)} ${b1 >= 0 ? '+' : '−'} ${fmt(Math.abs(b1), 5)}·x\nEğim ${fmt(b1)} (SE ${fmt(seb1)}), %95 GA ${fmt(b1 - tc * seb1)} – ${fmt(b1 + tc * seb1)}, t = ${fmt(t, 4)}, ${pstr(p)} → ${sig(p)}\nKesişim ${fmt(b0)} (SE ${fmt(seb0)}) · R² = ${fmt(r2, 4)} (değişkenliğin %${fmt(r2 * 100, 3)}’i açıklanıyor) · düzeltilmiş R² = ${fmt(1 - (1 - r2) * (n - 1) / (n - 2), 4)}\nF(1, ${n - 2}) = ${fmt(F, 4)} · kalıntı std. hatası ${fmt(s)}` }; }
  function anova(groups) { const k = groups.length, N = groups.reduce((s, g) => s + g.length, 0), gm = mean(groups.flat()), ssb = groups.reduce((s, g) => s + g.length * (mean(g) - gm) ** 2, 0), ssw = groups.reduce((s, g) => s + g.reduce((a, v) => a + (v - mean(g)) ** 2, 0), 0), dfb = k - 1, dfw = N - k, F = (ssb / dfb) / (ssw / dfw), p = fP(F, dfb, dfw), eta = ssb / (ssb + ssw);
    return `🧪 TEK YÖNLÜ ANOVA (${k} grup, N = ${N})\n${groups.map((g, i) => `Grup ${i + 1}: n=${g.length}, ort ${fmt(mean(g))}, ss ${fmt(sd(g))}`).join('\n')}\nF(${dfb}, ${dfw}) = ${fmt(F, 4)}, ${pstr(p)} → ${sig(p)} · η² = ${fmt(eta, 3)} (${eta < 0.06 ? 'küçük' : eta < 0.14 ? 'orta' : 'büyük'} etki)${p < 0.05 ? '\nHangi grupların farklı olduğunu görmek için ikili t testleri (Bonferroni: α/' + (k * (k - 1) / 2) + ') yap.' : ''}`; }
  function chiSq(M) { const R = M.map(r => r.reduce((a, b) => a + b, 0)), Cc = M[0].map((_, j) => M.reduce((a, r) => a + r[j], 0)), N = R.reduce((a, b) => a + b, 0); let x2 = 0, low = 0; M.forEach((r, i) => r.forEach((o, j) => { const e = R[i] * Cc[j] / N; if (e < 5) low++; x2 += (o - e) ** 2 / e; })); const df = (M.length - 1) * (M[0].length - 1), p = chiP(x2, df), V = Math.sqrt(x2 / (N * (Math.min(M.length, M[0].length) - 1)));
    return `🧪 Kİ-KARE BAĞIMSIZLIK TESTİ (${M.length}×${M[0].length}, N = ${N})\nχ²(${df}) = ${fmt(x2, 4)}, ${pstr(p)} → ${sig(p)} · Cramér V = ${fmt(V, 3)}${low ? `\n⚠ ${low} hücrede beklenen frekans < 5; ${M.length === 2 && M[0].length === 2 ? 'Fisher kesin testi daha uygun' : 'kategorileri birleştirmeyi düşün'}.` : ''}`; }
  function sampleSize(o) { const a = o.alfa ?? 0.05, pw = o.guc ?? 0.8, za = zInv(1 - a / 2), zb = zInv(pw); if (o.p1 != null && o.p2 != null) { const pb = (o.p1 + o.p2) / 2, n = (za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(o.p1 * (1 - o.p1) + o.p2 * (1 - o.p2))) ** 2 / (o.p1 - o.p2) ** 2; return `🎯 ÖRNEKLEM BÜYÜKLÜĞÜ (iki oran: ${o.p1} vs ${o.p2}, α=${a}, güç=${pw})\nGrup başına ${Math.ceil(n)} kişi, toplam ${2 * Math.ceil(n)}. %15 kayıp payıyla grup başına ${Math.ceil(n / 0.85)}.`; } const dd = o.d ?? 0.5, n = 2 * ((za + zb) / dd) ** 2 + za * za / 4; return `🎯 ÖRNEKLEM BÜYÜKLÜĞÜ (iki ortalama, etki d=${dd}, α=${a}, güç=${pw})\nGrup başına ${Math.ceil(n)} kişi, toplam ${2 * Math.ceil(n)}. %15 kayıp payıyla grup başına ${Math.ceil(n / 0.85)}.\nEşleştirilmiş (önce–sonra) tasarımda: ${Math.ceil(((za + zb) / dd) ** 2 + za * za / 2)} kişi.`; }
  function clinicalStats() {
    const P = typeof patients !== 'undefined' ? patients : [];
    const rows = P.map(p => ({ p, v: (p.seanslar || []).map(s => s.vas).filter(x => x != null && x !== '').map(Number) })).filter(r => r.v.length >= 2);
    if (rows.length < 3) return 'Klinik sonuç istatistiği için en az 3 hastada 2+ ağrı (VAS) ölçümü gerekiyor.';
    const pre = rows.map(r => r.v[0]), post = rows.map(r => r.v.at(-1)), diff = pre.map((v, i) => v - post[i]);
    const resp = rows.filter(r => r.v[0] - r.v.at(-1) >= 2 || (r.v[0] > 0 && (r.v[0] - r.v.at(-1)) / r.v[0] >= 0.3)).length;
    const kw = p => fold(p.tani || '').split(/[^a-z0-9]+/).find(w => w.length >= 3 && !/^(sag|sol|ve|ile|agri|agrisi|kronik|akut)$/.test(w)) || 'diğer';
    const G = {}; rows.forEach((r, i) => (G[kw(r.p)] ||= []).push(diff[i])); const gk = Object.keys(G).filter(k => G[k].length >= 2);
    let out = `🏥 KLİNİK SONUÇ İSTATİSTİĞİ — ağrı (VAS), ilk vs son seans, ${rows.length} hasta\nİlk: ort ${fmt(mean(pre), 3)} (ss ${fmt(sd(pre), 3)}) → Son: ort ${fmt(mean(post), 3)} (ss ${fmt(sd(post), 3)}) · ortalama azalma ${fmt(mean(diff), 3)} puan (%${fmt(mean(diff) / mean(pre) * 100, 3)})\n` + tPaired(pre, post).split('\n').slice(2).join('\n') + `\nKlinik olarak anlamlı iyileşme (≥2 puan ya da ≥%30): ${resp}/${rows.length} hasta (%${fmt(resp / rows.length * 100, 3)})`;
    if (gk.length >= 2) out += '\n\nTanıya göre karşılaştırma:\n' + anova(gk.map(k => G[k])).split('\n').map((l, i) => l.replace(/^Grup (\d+)/, (m, j) => gk[+j - 1])).slice(1).join('\n');
    return out + '\n\nNot: Kontrol grubu olmadığı için bu bir öncesi–sonrası analizidir; doğal iyileşme ve ortalamaya dönüş etkisi dışlanamaz.';
  }

  /* ======================= KİMYA ======================= */
  const AW = { H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03, Np: 237, Pu: 244 };
  function formula(f) {
    const parts = String(f).replace(/\s/g, '').split(/[·.*•]/); const tot = {};
    for (let part of parts) { let mult = 1; const m0 = part.match(/^(\d+)(.*)$/); if (m0) { mult = +m0[1]; part = m0[2]; }
      let i = 0; const group = () => { const c = {}; while (i < part.length && part[i] !== ')' && part[i] !== ']') { if (part[i] === '(' || part[i] === '[') { i++; const g = group(); i++; const n = num0(); for (const k in g) c[k] = (c[k] || 0) + g[k] * n; } else { const m = part.slice(i).match(/^([A-Z][a-z]?)/); if (!m) throw Error(`formülde anlaşılmayan: “${part.slice(i)}”`); if (!AW[m[1]]) throw Error(`bilinmeyen element: ${m[1]}`); i += m[1].length; const n = num0(); c[m[1]] = (c[m[1]] || 0) + n; } } return c; };
      const num0 = () => { const m = part.slice(i).match(/^\d+/); if (m) { i += m[0].length; return +m[0]; } return 1; };
      const g = group(); for (const k in g) tot[k] = (tot[k] || 0) + g[k] * mult; }
    return tot;
  }
  function molar(f) { const c = formula(f), M = Object.entries(c).reduce((s, [k, n]) => s + AW[k] * n, 0); return `⚗ ${f}: mol kütlesi ${fmt(M, 6)} g/mol\nBileşim: ${Object.entries(c).map(([k, n]) => `${k}${n > 1 ? '×' + n : ''} %${fmt(AW[k] * n / M * 100, 4)}`).join(' · ')}\n1 g = ${fmt(1 / M, 4)} mol · 1 mol = ${fmt(M, 6)} g · 1 mol ≈ 6,022×10²³ tanecik`; }
  function balance(eq) {
    const [L, R] = String(eq).replace(/→|=+>|->|⟶|=/g, '>').split('>'); if (!R) throw Error('biçim: “H2 + O2 -> H2O”');
    const sp = s => s.split(/\s\+\s|\s*\+\s*(?=[A-Z(\[])/).map(x => x.trim().replace(/^\d+(?=[A-Z(\[])/, '')).filter(Boolean);
    const lhs = sp(L), rhs = sp(R), all = [...lhs, ...rhs], comp = all.map(formula), els = [...new Set(comp.flatMap(Object.keys))];
    const M = els.map(e => comp.map((c, j) => (c[e] || 0) * (j < lhs.length ? 1 : -1)));
    // tam sayı çekirdek: rasyonel Gauss
    const n = all.length; const A = M.map(r => r.map(v => [v, 1])); const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a); const red = ([p, qq]) => { if (qq < 0) { p = -p; qq = -qq; } const g = gcd(p, qq) || 1; return [p / g, qq / g]; }; const sub = (a, b) => red([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]), mulR = (a, b) => red([a[0] * b[0], a[1] * b[1]]), divR = (a, b) => red([a[0] * b[1], a[1] * b[0]]);
    let row = 0; const piv = [];
    for (let c = 0; c < n && row < A.length; c++) { let p = A.findIndex((r, i) => i >= row && r[c][0] !== 0); if (p < 0) continue; [A[row], A[p]] = [A[p], A[row]]; const pv = A[row][c]; A[row] = A[row].map(v => divR(v, pv)); for (let r = 0; r < A.length; r++) if (r !== row && A[r][c][0] !== 0) { const k = A[r][c]; A[r] = A[r].map((v, j) => sub(v, mulR(k, A[row][j]))); } piv.push(c); row++; }
    const free = [...Array(n).keys()].filter(c => !piv.includes(c)); if (free.length !== 1) throw Error(free.length ? 'tepkime tek şekilde denkleştirilemiyor (birden fazla bağımsız çözüm)' : 'tepkime denkleştirilemiyor — formülleri kontrol et');
    const fc = free[0], x = Array(n).fill(null); x[fc] = [1, 1]; piv.forEach((c, i) => x[c] = red([-A[i][fc][0], A[i][fc][1]]));
    const L0 = x.reduce((l, [, d]) => l * d / gcd(l, d), 1); let co = x.map(([p, d]) => p * L0 / d); if (co.some(v => v < 0)) co = co.map(v => -v); const g = co.reduce((a, b) => gcd(a, b)); co = co.map(v => v / g); if (co.some(v => v <= 0)) throw Error('tepkime denkleştirilemiyor');
    const side = (arr, off) => arr.map((s, i) => (co[i + off] > 1 ? co[i + off] : '') + s).join(' + ');
    const mass = all.map((s, i) => co[i] * Object.entries(formula(s)).reduce((a, [k, nn]) => a + AW[k] * nn, 0));
    return `⚗ DENKLEŞTİRİLMİŞ TEPKİME\n${side(lhs, 0)} → ${side(rhs, lhs.length)}\nKütle denkliği: ${fmt(mass.slice(0, lhs.length).reduce((a, b) => a + b, 0), 6)} g = ${fmt(mass.slice(lhs.length).reduce((a, b) => a + b, 0), 6)} g (mol oranlarıyla)`;
  }

  /* ======================= FORMÜL KÜTÜPHANESİ ======================= */
  const g0 = 9.80665;
  const LIB = [
    ['Fizik', 'Newton 2. yasa · kuvvet', 'F = m*a', { F: 'kuvvet (N)', m: 'kütle (kg)', a: 'ivme (m/s²)' }],
    ['Fizik', 'ağırlık', `W = m*${g0}`, { W: 'ağırlık (N)', m: 'kütle (kg)' }],
    ['Fizik', 'kinetik enerji', 'E = 0.5*m*v^2', { E: 'enerji (J)', m: 'kütle (kg)', v: 'hız (m/s)' }],
    ['Fizik', 'potansiyel enerji', `E = m*${g0}*h`, { E: 'enerji (J)', m: 'kütle (kg)', h: 'yükseklik (m)' }],
    ['Fizik', 'iş', 'W = F*d', { W: 'iş (J)', F: 'kuvvet (N)', d: 'yol (m)' }],
    ['Fizik', 'güç', 'P = W/t', { P: 'güç (W)', W: 'iş (J)', t: 'süre (s)' }],
    ['Fizik', 'momentum', 'p = m*v', { p: 'momentum (kg·m/s)', m: 'kütle (kg)', v: 'hız (m/s)' }],
    ['Fizik', 'ortalama hız', 'v = d/t', { v: 'hız (m/s)', d: 'yol (m)', t: 'süre (s)' }],
    ['Fizik', 'ivmeli hareket yol', 's = v0*t + 0.5*a*t^2', { s: 'yol (m)', v0: 'ilk hız (m/s)', t: 'süre (s)', a: 'ivme (m/s²)' }],
    ['Fizik', 'ivmeli hareket son hız', 'v = v0 + a*t', { v: 'son hız (m/s)', v0: 'ilk hız (m/s)', a: 'ivme (m/s²)', t: 'süre (s)' }],
    ['Fizik', 'zamansız hız', 'v^2 = v0^2 + 2*a*s', { v: 'son hız (m/s)', v0: 'ilk hız (m/s)', a: 'ivme (m/s²)', s: 'yol (m)' }],
    ['Fizik', 'serbest düşme', `h = 0.5*${g0}*t^2`, { h: 'yükseklik (m)', t: 'süre (s)' }],
    ['Fizik', 'merkezcil kuvvet', 'F = m*v^2/r', { F: 'kuvvet (N)', m: 'kütle (kg)', v: 'hız (m/s)', r: 'yarıçap (m)' }],
    ['Fizik', 'tork · moment', 'T = F*r', { T: 'tork (N·m)', F: 'kuvvet (N)', r: 'kol uzunluğu (m)' }],
    ['Fizik', 'kaldıraç dengesi', 'F1*d1 = F2*d2', { F1: 'kuvvet 1 (N)', d1: 'kol 1 (m)', F2: 'kuvvet 2 (N)', d2: 'kol 2 (m)' }],
    ['Fizik', 'dönme gücü', 'P = T*2*pi*n/60', { P: 'güç (W)', T: 'tork (N·m)', n: 'devir (dev/dk)' }],
    ['Fizik', 'basınç', 'P = F/A', { P: 'basınç (Pa)', F: 'kuvvet (N)', A: 'alan (m²)' }],
    ['Fizik', 'hidrostatik basınç', `P = rho*${g0}*h`, { P: 'basınç (Pa)', rho: 'yoğunluk (kg/m³)', h: 'derinlik (m)' }],
    ['Fizik', 'yoğunluk', 'rho = m/V', { rho: 'yoğunluk (kg/m³)', m: 'kütle (kg)', V: 'hacim (m³)' }],
    ['Fizik', 'kaldırma kuvveti (Arşimet)', `F = rho*${g0}*V`, { F: 'kaldırma kuvveti (N)', rho: 'sıvı yoğunluğu (kg/m³)', V: 'batan hacim (m³)' }],
    ['Fizik', 'Hooke yay', 'F = k*x', { F: 'kuvvet (N)', k: 'yay sabiti (N/m)', x: 'uzama (m)' }],
    ['Fizik', 'yay enerjisi', 'E = 0.5*k*x^2', { E: 'enerji (J)', k: 'yay sabiti (N/m)', x: 'uzama (m)' }],
    ['Fizik', 'sarkaç periyodu', `T = 2*pi*sqrt(L/${g0})`, { T: 'periyot (s)', L: 'ip uzunluğu (m)' }],
    ['Fizik', 'dalga hızı', 'v = f*l', { v: 'hız (m/s)', f: 'frekans (Hz)', l: 'dalga boyu (m)' }],
    ['Fizik', 'ısı', 'Q = m*c*dT', { Q: 'ısı (J)', m: 'kütle (kg)', c: 'öz ısı (J/kg·K)', dT: 'sıcaklık farkı (K)' }],
    ['Fizik', 'Ohm yasası', 'V = I*R', { V: 'gerilim (V)', I: 'akım (A)', R: 'direnç (Ω)' }],
    ['Fizik', 'elektrik gücü', 'P = V*I', { P: 'güç (W)', V: 'gerilim (V)', I: 'akım (A)' }],
    ['Fizik', 'Coulomb yasası', 'F = 8.9875517923e9*q1*q2/r^2', { F: 'kuvvet (N)', q1: 'yük 1 (C)', q2: 'yük 2 (C)', r: 'uzaklık (m)' }],
    ['Fizik', 'evrensel çekim', 'F = 6.6743e-11*m1*m2/r^2', { F: 'kuvvet (N)', m1: 'kütle 1 (kg)', m2: 'kütle 2 (kg)', r: 'uzaklık (m)' }],
    ['Fizik', 'foton enerjisi', 'E = 6.62607015e-34*f', { E: 'enerji (J)', f: 'frekans (Hz)' }],
    ['Fizik', 'kütle-enerji (Einstein)', 'E = m*299792458^2', { E: 'enerji (J)', m: 'kütle (kg)' }],
    ['Fizik', 'Snell kırılma', 'n1*sind(a1) = n2*sind(a2)', { n1: 'kırılma indisi 1', a1: 'geliş açısı (°)', n2: 'kırılma indisi 2', a2: 'kırılma açısı (°)' }],
    ['Fizik', 'ideal gaz', 'P*V = n*8.314462618*T', { P: 'basınç (Pa)', V: 'hacim (m³)', n: 'mol', T: 'sıcaklık (K)' }],
    ['Fizik', 'Doppler', 'f2 = f1*(343 + vo)/(343 - vs)', { f2: 'algılanan frekans (Hz)', f1: 'kaynak frekansı (Hz)', vo: 'gözlemci hızı (m/s, yaklaşma +)', vs: 'kaynak hızı (m/s, yaklaşma +)' }],
    ['Mühendislik', 'eğilme gerilmesi', 's = M*y/I', { s: 'gerilme (Pa)', M: 'moment (N·m)', y: 'tarafsız eksene uzaklık (m)', I: 'atalet momenti (m⁴)' }],
    ['Mühendislik', 'dikdörtgen kesit atalet momenti', 'I = b*h^3/12', { I: 'atalet momenti (m⁴)', b: 'genişlik (m)', h: 'yükseklik (m)' }],
    ['Mühendislik', 'dairesel kesit atalet momenti', 'I = pi*d^4/64', { I: 'atalet momenti (m⁴)', d: 'çap (m)' }],
    ['Mühendislik', 'basit kiriş ortada tekil yük moment', 'M = P*L/4', { M: 'maks. moment (N·m)', P: 'yük (N)', L: 'açıklık (m)' }],
    ['Mühendislik', 'basit kiriş ortada tekil yük sehim', 'd = P*L^3/(48*E*I)', { d: 'sehim (m)', P: 'yük (N)', L: 'açıklık (m)', E: 'elastisite modülü (Pa; çelik 2e11, alüminyum 6.9e10, ahşap 1.1e10)', I: 'atalet momenti (m⁴)' }],
    ['Mühendislik', 'basit kiriş yayılı yük moment', 'M = q*L^2/8', { M: 'maks. moment (N·m)', q: 'yayılı yük (N/m)', L: 'açıklık (m)' }],
    ['Mühendislik', 'basit kiriş yayılı yük sehim', 'd = 5*q*L^4/(384*E*I)', { d: 'sehim (m)', q: 'yayılı yük (N/m)', L: 'açıklık (m)', E: 'elastisite modülü (Pa)', I: 'atalet momenti (m⁴)' }],
    ['Mühendislik', 'konsol kiriş uç yük sehim', 'd = P*L^3/(3*E*I)', { d: 'sehim (m)', P: 'yük (N)', L: 'boy (m)', E: 'elastisite modülü (Pa)', I: 'atalet momenti (m⁴)' }],
    ['Mühendislik', 'konsol kiriş uç yük moment', 'M = P*L', { M: 'maks. moment (N·m)', P: 'yük (N)', L: 'boy (m)' }],
    ['Mühendislik', 'mil burulma gerilmesi', 'tau = 16*T/(pi*d^3)', { tau: 'kayma gerilmesi (Pa)', T: 'tork (N·m)', d: 'mil çapı (m)' }],
    ['Mühendislik', 'Euler burkulma yükü', 'Pcr = pi^2*E*I/(K*L)^2', { Pcr: 'kritik yük (N)', E: 'elastisite modülü (Pa)', I: 'atalet momenti (m⁴)', K: 'boy katsayısı (iki ucu mafsal 1, ankastre-serbest 2)', L: 'boy (m)' }],
    ['Mühendislik', 'emniyet katsayısı', 'n = Sy/s', { n: 'emniyet katsayısı', Sy: 'akma dayanımı (Pa; S235 çelik 2.35e8)', s: 'oluşan gerilme (Pa)' }],
    ['Mühendislik', 'eksenel gerilme', 's = F/A', { s: 'gerilme (Pa)', F: 'kuvvet (N)', A: 'kesit alanı (m²)' }],
    ['Mühendislik', 'dişli oranı', 'n2 = n1*z1/z2', { n2: 'çıkış devri', n1: 'giriş devri', z1: 'giriş diş sayısı', z2: 'çıkış diş sayısı' }],
    ['Mühendislik', 'Reynolds sayısı', 'Re = rho*v*D/mu', { Re: 'Reynolds', rho: 'yoğunluk (kg/m³)', v: 'hız (m/s)', D: 'çap (m)', mu: 'dinamik viskozite (Pa·s; su 0.001)' }],
    ['Mühendislik', 'debi', 'Q = A*v', { Q: 'debi (m³/s)', A: 'kesit (m²)', v: 'hız (m/s)' }],
    ['Mühendislik', 'iletken direnci', 'R = rho*L/A', { R: 'direnç (Ω)', rho: 'özdirenç (Ω·m; bakır 1.68e-8)', L: 'uzunluk (m)', A: 'kesit (m²)' }],
    ['Mühendislik', 'ısıl genleşme', 'dL = alpha*L*dT', { dL: 'uzama (m)', alpha: 'genleşme katsayısı (1/K; çelik 1.2e-5)', L: 'boy (m)', dT: 'sıcaklık farkı (K)' }],
    ['Mühendislik', 'verim', 'eta = Pc/Pg*100', { eta: 'verim (%)', Pc: 'çıkış gücü (W)', Pg: 'giriş gücü (W)' }],
    ['Mimarlık', 'merdiven Blondel kuralı', '2*h + b = 63', { h: 'basamak yüksekliği (cm)', b: 'basamak genişliği (cm)' }],
    ['Mimarlık', 'rampa eğimi', 'e = h/L*100', { e: 'eğim (%; engelli rampası ≤ 8,3)', h: 'yükseklik farkı (m)', L: 'yatay uzunluk (m)' }],
    ['Mimarlık', 'oda alanı', 'A = a*b', { A: 'alan (m²)', a: 'en (m)', b: 'boy (m)' }],
    ['Mimarlık', 'oda hacmi', 'V = a*b*h', { V: 'hacim (m³)', a: 'en (m)', b: 'boy (m)', h: 'tavan yüksekliği (m)' }],
    ['Mimarlık', 'aydınlatma lümen ihtiyacı', 'phi = E*A/(0.6*0.8)', { phi: 'toplam ışık akısı (lm)', E: 'istenen aydınlık (lux; tedavi odası 500, bekleme 200)', A: 'alan (m²)' }],
    ['Mimarlık', 'boya miktarı', 'L = A*k/10', { L: 'boya (litre)', A: 'boyanacak alan (m²)', k: 'kat sayısı' }],
    ['Mimarlık', 'fayans adedi', 'N = A/(a*b)*1.1', { N: 'adet (%10 fire dahil)', A: 'alan (m²)', a: 'fayans eni (m)', b: 'fayans boyu (m)' }],
    ['Mimarlık', 'havalandırma debisi', 'Q = V*n', { Q: 'debi (m³/saat)', V: 'oda hacmi (m³)', n: 'saatlik hava değişimi (tedavi 6, spor salonu 8)' }],
    ['Mimarlık', 'ısı kaybı', 'Q = U*A*dT', { Q: 'ısı kaybı (W)', U: 'ısı geçirgenlik (W/m²K; yalıtımlı duvar 0.4, tek cam 5.8)', A: 'alan (m²)', dT: 'iç-dış sıcaklık farkı (K)' }],
    ['Biyoloji', 'vücut kitle indeksi', 'bmi = m/h^2', { bmi: 'VKİ (kg/m²)', m: 'kilo (kg)', h: 'boy (m)' }],
    ['Biyoloji', 'bazal metabolizma erkek (Mifflin)', 'BMR = 10*m + 6.25*h - 5*y + 5', { BMR: 'kcal/gün', m: 'kilo (kg)', h: 'boy (cm)', y: 'yaş' }],
    ['Biyoloji', 'bazal metabolizma kadın (Mifflin)', 'BMR = 10*m + 6.25*h - 5*y - 161', { BMR: 'kcal/gün', m: 'kilo (kg)', h: 'boy (cm)', y: 'yaş' }],
    ['Biyoloji', 'maksimum nabız (Tanaka)', 'HRmax = 208 - 0.7*y', { HRmax: 'atım/dk', y: 'yaş' }],
    ['Biyoloji', 'hedef nabız (Karvonen)', 'THR = (HRmax - HRr)*k + HRr', { THR: 'hedef nabız', HRmax: 'maks. nabız', HRr: 'dinlenme nabzı', k: 'yoğunluk (0,5–0,85)' }],
    ['Biyoloji', 'MET kalori', 'kcal = MET*3.5*m/200*t', { kcal: 'harcanan kalori', MET: 'MET değeri (yürüyüş 3,5)', m: 'kilo (kg)', t: 'süre (dk)' }],
    ['Biyoloji', '1 tekrar maksimum (Epley)', 'RM = w*(1 + r/30)', { RM: '1TM (kg)', w: 'kaldırılan ağırlık (kg)', r: 'tekrar sayısı' }],
    ['Biyoloji', '1 tekrar maksimum (Brzycki)', 'RM = w*36/(37 - r)', { RM: '1TM (kg)', w: 'kaldırılan ağırlık (kg)', r: 'tekrar sayısı' }],
    ['Biyoloji', 'yarı ömür bozunma', 'N = N0*0.5^(t/T)', { N: 'kalan miktar', N0: 'başlangıç', t: 'geçen süre', T: 'yarı ömür' }],
    ['Biyoloji', 'üstel büyüme', 'N = N0*exp(r*t)', { N: 'son nüfus', N0: 'başlangıç', r: 'büyüme hızı', t: 'süre' }],
    ['Biyoloji', 'lojistik büyüme', 'N = K/(1 + (K - N0)/N0*exp(-r*t))', { N: 'nüfus', K: 'taşıma kapasitesi', N0: 'başlangıç', r: 'büyüme hızı', t: 'süre' }],
    ['Biyoloji', 'bölünme (ikiye katlanma) süresi', 'g = t/log2(N/N0)', { g: 'katlanma süresi', t: 'süre', N: 'son sayı', N0: 'başlangıç' }],
    ['Biyoloji', 'Michaelis-Menten enzim hızı', 'v = Vmax*S/(Km + S)', { v: 'tepkime hızı', Vmax: 'maksimum hız', S: 'substrat derişimi', Km: 'Michaelis sabiti' }],
    ['Biyoloji', 'Hardy-Weinberg', 'q = sqrt(aa)', { q: 'çekinik alel sıklığı', aa: 'çekinik homozigot oranı (0–1)' }],
    ['Biyoloji', 'Henderson-Hasselbalch', 'pH = pKa + log(A/HA)', { pH: 'pH', pKa: 'pKa', A: 'baz derişimi', HA: 'asit derişimi' }],
    ['Kimya', 'mol sayısı', 'n = m/M', { n: 'mol', m: 'kütle (g)', M: 'mol kütlesi (g/mol)' }],
    ['Kimya', 'molarite', 'C = n/V', { C: 'derişim (mol/L)', n: 'mol', V: 'hacim (L)' }],
    ['Kimya', 'seyreltme', 'C1*V1 = C2*V2', { C1: 'ilk derişim', V1: 'ilk hacim', C2: 'son derişim', V2: 'son hacim' }],
    ['Kimya', 'pH güçlü asit', 'pH = -log(c)', { pH: 'pH', c: 'H⁺ derişimi (mol/L)' }],
    ['Kimya', 'pH güçlü baz', 'pH = 14 + log(c)', { pH: 'pH', c: 'OH⁻ derişimi (mol/L)' }],
    ['Kimya', 'Arrhenius', 'k = A*exp(-Ea/(8.314462618*T))', { k: 'hız sabiti', A: 'frekans faktörü', Ea: 'aktivasyon enerjisi (J/mol)', T: 'sıcaklık (K)' }],
    ['Kimya', 'Gibbs serbest enerjisi', 'G = H - T*S', { G: 'ΔG (J/mol)', H: 'ΔH (J/mol)', T: 'sıcaklık (K)', S: 'ΔS (J/mol·K)' }],
    ['Kimya', 'Nernst', 'E = E0 - 0.0592/n*log(Q)', { E: 'hücre potansiyeli (V)', E0: 'standart potansiyel (V)', n: 'elektron sayısı', Q: 'tepkime oranı' }],
    ['Kimya', 'Beer-Lambert', 'A = eps*l*c', { A: 'absorbans', eps: 'molar soğurma (L/mol·cm)', l: 'yol (cm)', c: 'derişim (mol/L)' }],
    ['Ekonomi', 'bileşik faiz', 'FV = PV*(1 + r/100)^n', { FV: 'gelecek değer', PV: 'bugünkü değer', r: 'dönemsel faiz (%)', n: 'dönem sayısı' }],
    ['Ekonomi', 'sürekli bileşik faiz', 'FV = PV*exp(r/100*t)', { FV: 'gelecek değer', PV: 'bugünkü değer', r: 'yıllık faiz (%)', t: 'yıl' }],
    ['Ekonomi', 'yıllık bileşik büyüme (CAGR)', 'c = ((FV/PV)^(1/n) - 1)*100', { c: 'CAGR (%)', FV: 'son değer', PV: 'ilk değer', n: 'yıl' }],
    ['Ekonomi', 'reel faiz (Fisher)', 'r = ((1 + i/100)/(1 + p/100) - 1)*100', { r: 'reel getiri (%)', i: 'nominal faiz (%)', p: 'enflasyon (%)' }],
    ['Ekonomi', 'başabaş noktası', 'Q = F/(P - V)', { Q: 'başabaş adedi (seans)', F: 'sabit gider (TL)', P: 'birim fiyat (TL)', V: 'birim değişken gider (TL)' }],
    ['Ekonomi', 'kredi taksiti', 'A = K*(r/100)/(1 - (1 + r/100)^(-n))', { A: 'taksit', K: 'kredi tutarı', r: 'dönem faizi (%)', n: 'taksit sayısı' }],
    ['Ekonomi', 'yatırım getirisi (ROI)', 'ROI = (G - C)/C*100', { ROI: 'getiri (%)', G: 'kazanç', C: 'maliyet' }],
    ['Ekonomi', 'kâr marjı', 'm = (P - C)/P*100', { m: 'marj (%)', P: 'satış fiyatı', C: 'maliyet' }],
    ['Ekonomi', 'doğrusal amortisman', 'D = (C - S)/n', { D: 'yıllık amortisman', C: 'alış bedeli', S: 'hurda değeri', n: 'faydalı ömür (yıl)' }],
    ['Ekonomi', 'fiyat esnekliği', 'e = (dQ/Q)/(dP/P)', { e: 'esneklik', dQ: 'talep değişimi', Q: 'ilk talep', dP: 'fiyat değişimi', P: 'ilk fiyat' }],
    ['Ekonomi', 'harcama çarpanı (Keynes)', 'k = 1/(1 - c)', { k: 'çarpan', c: 'marjinal tüketim eğilimi (0–1)' }],
    ['Ekonomi', 'paranın miktar teorisi', 'M*V = P*Y', { M: 'para arzı', V: 'dolaşım hızı', P: 'fiyat düzeyi', Y: 'reel çıktı' }],
    ['Ekonomi', 'enflasyonla değer kaybı', 'R = N/(1 + p/100)^n', { R: 'reel (bugünkü alım gücü)', N: 'nominal tutar', p: 'yıllık enflasyon (%)', n: 'yıl' }]
  ].map(([alan, ad, e, v]) => ({ alan, ad, e, v }));
  function findFormula(q) { const f = fold(q); let best = null, bs = 0; for (const x of LIB) { const words = fold(x.ad).split(/[^a-z0-9]+/).filter(w => w.length >= 3); const s = words.filter(w => f.includes(w)).length / words.length + (f.includes(fold(x.ad)) ? 1 : 0); if (s > bs) { bs = s; best = x; } } return bs >= 0.5 ? best : null; }
  const assigns = s => { const o = {}; for (const m of String(s).matchAll(/(?:^|[^A-Za-z0-9_])([A-Za-zα-ω][A-Za-z0-9α-ω]*)\s*=\s*(-?\d[\d.,]*(?:e[+-]?\d+)?)/g)) { const v = num(m[2].replace(/[.,]$/, '')); if (Number.isFinite(v)) o[m[1]] = v; } return o; };
  function solveFormula(eq, known, title) {
    const [l, r] = splitEq(eq), L = parse(l), R = parse(r), fn = O('-', L, R), vs = [...varsOf(fn)], miss = vs.filter(v => !(v in known));
    if (miss.length !== 1) throw Error(miss.length ? `bilinmeyen ${miss.length} tane (${miss.join(', ')}); biri hariç hepsinin değerini ver` : 'hepsi verilmiş, çözülecek bir şey yok');
    const x = miss[0], f = t => ev(fn, { ...known, [x]: t });
    let rs = roots(f, -1e12, 1e12); if (!rs.length) { const lr = [-1e15, 1e15]; rs = roots(f, ...lr); }
    if (!rs.length) throw Error('çözüm bulunamadı — değerleri ve birimleri kontrol et');
    const pos = rs.filter(v => v > 0); const pick = pos.length ? pos : rs;
    return { x, vals: pick, text: `${title ? title + '\n' : ''}${eq}\nVerilen: ${Object.entries(known).filter(([k]) => vs.includes(k)).map(([k, v]) => `${k} = ${fmt(v)}`).join(', ')}\n➡ ${x} = ${pick.slice(0, 3).map(v => fmt(clean(v), 7)).join(' veya ')}` };
  }
  function formulaCmd(q) {
    const F0 = findFormula(q); if (!F0) return null; const known = assigns(q);
    const vs = Object.keys(F0.v);
    if (!Object.keys(known).some(k => vs.includes(k))) return `📘 ${F0.ad} (${F0.alan})\n${F0.e}\n${vs.map(k => `• ${k}: ${F0.v[k]}`).join('\n')}\nÖrnek: “${F0.ad} ${vs.slice(1).map((k, i) => `${k}=${i + 2}`).join(' ')}”`;
    const r = solveFormula(F0.e, known, `📘 ${F0.ad} (${F0.alan})`); return r.text + `  — ${F0.v[r.x] || ''}`;
  }
  /* ======================= BİRİMLER ======================= */
  const U = {
    uzunluk: { mm: 1e-3, cm: 1e-2, dm: 0.1, m: 1, metre: 1, km: 1e3, inç: 0.0254, inc: 0.0254, in: 0.0254, inch: 0.0254, ft: 0.3048, feet: 0.3048, ayak: 0.3048, yd: 0.9144, yarda: 0.9144, mil: 1609.344, mile: 1609.344, deniz_mili: 1852, nm: 1e-9, um: 1e-6, mikron: 1e-6 },
    kütle: { mg: 1e-6, g: 1e-3, gram: 1e-3, kg: 1, kilo: 1, ton: 1e3, lb: 0.45359237, pound: 0.45359237, libre: 0.45359237, oz: 0.028349523125, ons: 0.028349523125 },
    zaman: { ms: 1e-3, s: 1, sn: 1, saniye: 1, dk: 60, dakika: 60, sa: 3600, saat: 3600, gün: 86400, gun: 86400, hafta: 604800, yıl: 31557600, yil: 31557600 },
    alan: { mm2: 1e-6, cm2: 1e-4, m2: 1, km2: 1e6, ha: 1e4, hektar: 1e4, dönüm: 1000, donum: 1000, akre: 4046.8564224, acre: 4046.8564224, ft2: 0.09290304 },
    hacim: { ml: 1e-3, cl: 1e-2, l: 1, lt: 1, litre: 1, m3: 1000, cm3: 1e-3, cc: 1e-3, galon: 3.785411784, gal: 3.785411784, bardak: 0.2 },
    hız: { 'm/s': 1, 'km/h': 1 / 3.6, 'km/sa': 1 / 3.6, kmh: 1 / 3.6, mph: 0.44704, knot: 0.514444, deniz_mili_saat: 0.514444 },
    basınç: { pa: 1, hpa: 100, kpa: 1e3, mpa: 1e6, bar: 1e5, mbar: 100, atm: 101325, psi: 6894.757, mmhg: 133.322, cmh2o: 98.0665 },
    enerji: { j: 1, kj: 1e3, mj: 1e6, cal: 4.184, kal: 4.184, kcal: 4184, kkal: 4184, wh: 3600, kwh: 3.6e6, ev: 1.602176634e-19, btu: 1055.06 },
    güç: { w: 1, kw: 1e3, mw: 1e6, hp: 745.6999, bg: 735.49875, beygir: 735.49875 },
    kuvvet: { n: 1, kn: 1e3, kgf: g0, lbf: 4.448222, dyn: 1e-5 },
    veri: { bit: 1 / 8, b: 1, bayt: 1, byte: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824 },
    açı: { derece: 1, deg: 1, '°': 1, rad: 180 / Math.PI, radyan: 180 / Math.PI, grad: 0.9 }
  };
  const TEMP = { c: 'C', '°c': 'C', celsius: 'C', santigrat: 'C', f: 'F', '°f': 'F', fahrenheit: 'F', k: 'K', kelvin: 'K' };
  const unorm = u => String(u).toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '_').replace(/^metrekare$/, 'm2').replace(/^metreküp$/, 'm3').replace(/^santimetre$/, 'cm').replace(/^milimetre$/, 'mm').replace(/^kilometre$/, 'km').replace(/^kilogram$/, 'kg');
  function convert(v, a, b) {
    const A = unorm(a), B = unorm(b);
    if (TEMP[A] && TEMP[B]) { const c = TEMP[A] === 'C' ? v : TEMP[A] === 'F' ? (v - 32) * 5 / 9 : v - 273.15; const r = TEMP[B] === 'C' ? c : TEMP[B] === 'F' ? c * 9 / 5 + 32 : c + 273.15; return `🌡 ${fmt(v)} °${TEMP[A]} = ${fmt(r)} ${TEMP[B] === 'K' ? 'K' : '°' + TEMP[B]}`; }
    for (const [cat, T] of Object.entries(U)) if (T[A] != null && T[B] != null) return `📏 ${fmt(v)} ${a} = ${fmt(v * T[A] / T[B], 7)} ${b} (${cat})`;
    return null;
  }
  /* ======================= FİNANS ======================= */
  const npv = (r, cf) => cf.reduce((s, c, t) => s + c / (1 + r) ** t, 0);
  function irr(cf) { const f = r => npv(r, cf); let lo = -0.99, hi = 10; if (Math.sign(f(lo)) === Math.sign(f(hi))) return NaN; for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === Math.sign(f(lo))) lo = m; else hi = m; } return (lo + hi) / 2; }
  function cashflow(r, cf) { const N = npv(r, cf), I = irr(cf); let cum = 0, pb = null; for (let t = 0; t < cf.length; t++) { const prev = cum; cum += cf[t]; if (pb == null && prev < 0 && cum >= 0) pb = t - 1 + (-prev / cf[t]); } return `💹 NAKİT AKIŞI ANALİZİ (iskonto %${fmt(r * 100)})\nAkış: ${cf.map(v => fmt(v)).join(' | ')}\nNBD (NPV) = ${fmt(N)} → ${N >= 0 ? '✓ yatırım bu iskonto oranında değer yaratıyor' : '✗ yatırım bu oranda değer kaybettiriyor'}\nİç verim oranı (IRR) = ${Number.isFinite(I) ? '%' + fmt(I * 100, 4) : 'hesaplanamadı'}\nGeri ödeme süresi: ${pb != null ? fmt(pb, 3) + ' dönem' : 'süre içinde geri dönmüyor'}${Number.isFinite(I) ? `\nYorum: sermaye maliyetin %${fmt(I * 100, 3)}’ün altındaysa yatırım kârlı.` : ''}`; }
  function loan(K, rPct, n) { const r = rPct / 100, A = r ? K * r / (1 - (1 + r) ** -n) : K / n, tot = A * n; let bal = K, rows = []; for (let i = 1; i <= n; i++) { const it = bal * r, pr = A - it; bal -= pr; if (i <= 3 || i === n) rows.push(`${i}. taksit: ${fmt(A)} (faiz ${fmt(it)}, anapara ${fmt(pr)}, kalan ${fmt(Math.max(0, bal))})`); else if (i === 4) rows.push('…'); } return `🏦 KREDİ (anüite)\nTutar ${fmt(K)} · dönem faizi %${fmt(rPct)} · ${n} taksit\nTaksit ${fmt(A)} · toplam geri ödeme ${fmt(tot)} · toplam faiz ${fmt(tot - K)} (%${fmt((tot - K) / K * 100, 3)})\n${rows.join('\n')}\nNot: BSMV/KKDF ve masraflar dahil değil.`; }

  /* ======================= GRAFİK ======================= */
  const nice = (lo, hi, n = 8) => { const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), st = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= step0); const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v); return out; };
  function plot(exprs, a = -10, b = 10) {
    const W = 1200, H = 760, M = { l: 80, r: 40, t: 70, b: 70 }, cols = ['#0e7c86', '#f5a623', '#c0392b', '#6c5ce7'];
    const fs = exprs.map(e => { const n = parse(e), x = pickVar([n]) || 'x'; return { e, n, x, f: t => { try { return ev(n, { [x]: t }); } catch { return NaN; } } }; });
    const N = 900, xs = Array.from({ length: N + 1 }, (_, i) => a + (b - a) * i / N), Y = fs.map(F0 => xs.map(F0.f));
    const all = Y.flat().filter(Number.isFinite).sort((p, q2) => p - q2); if (!all.length) throw Error('bu aralıkta çizilecek değer yok');
    let ylo = all[Math.floor(all.length * 0.02)], yhi = all[Math.floor(all.length * 0.98)]; if (ylo === yhi) { ylo -= 1; yhi += 1; } const pad = (yhi - ylo) * 0.12; ylo -= pad; yhi += pad;
    const X = v => M.l + (v - a) / (b - a) * (W - M.l - M.r), YY = v => H - M.b - (v - ylo) / (yhi - ylo) * (H - M.t - M.b);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, 'Segoe UI', Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fbfcfd"/>`;
    for (const t of nice(a, b)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${M.t}" y2="${H - M.b}" stroke="#e6ecef"/><text x="${X(t)}" y="${H - M.b + 26}" font-size="16" text-anchor="middle" fill="#5a6b73">${fmt(t, 4)}</text>`;
    for (const t of nice(ylo, yhi)) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${YY(t)}" y2="${YY(t)}" stroke="#e6ecef"/><text x="${M.l - 12}" y="${YY(t) + 5}" font-size="16" text-anchor="end" fill="#5a6b73">${fmt(t, 4)}</text>`;
    if (a < 0 && b > 0) s += `<line x1="${X(0)}" x2="${X(0)}" y1="${M.t}" y2="${H - M.b}" stroke="#0b2530" stroke-width="1.6"/>`; if (ylo < 0 && yhi > 0) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${YY(0)}" y2="${YY(0)}" stroke="#0b2530" stroke-width="1.6"/>`;
    const notes = [];
    fs.forEach((F0, k) => { let dpath = '', pen = false; Y[k].forEach((y, i) => { const ok = Number.isFinite(y) && y > ylo - (yhi - ylo) * 2 && y < yhi + (yhi - ylo) * 2; const jump = i && Number.isFinite(Y[k][i - 1]) && Math.abs(y - Y[k][i - 1]) > (yhi - ylo) * 0.8; if (!ok || jump) { pen = false; if (!ok) return; } dpath += (pen ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + YY(Math.max(ylo - (yhi - ylo), Math.min(yhi + (yhi - ylo), y))).toFixed(1); pen = true; });
      s += `<path d="${dpath}" fill="none" stroke="${cols[k % 4]}" stroke-width="3.5" stroke-linejoin="round" clip-path="url(#cp)"/>`;
      const rs = roots(F0.f, a, b).slice(0, 8); rs.forEach(r => { s += `<circle cx="${X(r)}" cy="${YY(0)}" r="6" fill="#fff" stroke="${cols[k % 4]}" stroke-width="3"/>`; });
      let ex = []; try { const df = S(d(F0.n, F0.x)); ex = roots(t => { try { return ev(df, { [F0.x]: t }); } catch { return NaN; } }, a, b).slice(0, 8).map(t => [t, F0.f(t)]).filter(([, y]) => Number.isFinite(y) && y >= ylo && y <= yhi); } catch {}
      ex.forEach(([t, y]) => { s += `<rect x="${X(t) - 5}" y="${YY(y) - 5}" width="10" height="10" fill="${cols[k % 4]}" transform="rotate(45 ${X(t)} ${YY(y)})"/>`; });
      notes.push(`${F0.e}: kökler ${rs.length ? rs.map(r => fmt(clean(r), 5)).join(', ') : 'yok'}${ex.length ? ' · ekstremumlar ' + ex.map(([t, y]) => `(${fmt(clean(t), 4)}; ${fmt(clean(y), 4)})`).join(', ') : ''}`); });
    s = s.replace('<rect width', `<defs><clipPath id="cp"><rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/></clipPath></defs><rect width`);
    s += fs.map((F0, k) => `<rect x="${M.l + k * 260}" y="24" width="26" height="6" rx="3" fill="${cols[k % 4]}"/><text x="${M.l + 34 + k * 260}" y="33" font-size="20" font-weight="600" fill="#0b2530">${String(F0.e).replace(/[<&]/g, '')}</text>`).join('') + `<text x="${W - M.r}" y="33" font-size="14" text-anchor="end" fill="#5a6b73">○ kök · ◆ ekstremum · SATÜRN</text></svg>`;
    return { svg: s, notes };
  }
  function showSvg(svg, title, text) { const st = window.jarvisStage; if (!st) return; st.show({ src: st.svgSrc(svg), svg, title, text, source: 'SATÜRN bilim' }); const n = bubble('ai', text); n.el.append(el('img', { src: st.svgSrc(svg), alt: title, class: 'genimg' }), el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => st.exportPng(svg, 'saturn-grafik') }, '⬇ PNG'), el('button', { type: 'button', onclick: () => st.dl(new Blob([svg], { type: 'image/svg+xml' }), 'saturn-grafik.svg') }, '⬇ SVG'))); }

  /* ======================= KOMUT ÇÖZÜCÜLER ======================= */
  const B = {
    hesapla(s) { s = String(s).trim(); if (/[a-zα-ω]\s*=/i.test(s) && /[;,]/.test(s)) { const [eq, ...rest] = s.split(/\s*;\s*|\s*,\s+(?=[A-Za-z]\w*\s*=)/); const known = assigns(rest.join(' ')); return solveFormula(eq, known).text; } const n = parse(s); const vs = [...varsOf(n)]; if (vs.length) throw Error(`ifadede bilinmeyen var (${vs.join(', ')}); türev/integral/çöz komutlarını dene`); const v = ev(n); return `🧮 ${str(n)} = ${fmt(clean(v), 12)}${Number.isFinite(v) && !Number.isInteger(v) && toFrac(v) ? `  (= ${toFrac(v)})` : ''}`; },
    turev(s, x, k = 1) { const n = parse(s), v = x || pickVar([n]) || 'x'; let r = n; const steps = []; for (let i = 0; i < k; i++) { r = S(d(r, v)); steps.push(r); } return `∂ ${k > 1 ? k + '. ' : ''}türev (d/d${v}):\n${k > 1 ? '' : 'f(' + v + ') = ' + str(S(n)) + '\n'}${steps.map((t, i) => `f${"'".repeat(i + 1)}(${v}) = ${str(t)}`).join('\n')}`; },
    integral(s, a, b) { const n = parse(s), x = pickVar([n]) || 'x', f = t => ev(n, { [x]: t }); const Fn = (() => { try { const r = I(S(n), x); return r && verify(S(r), n, x) ? S(r) : null; } catch { return null; } })();
      if (a == null) return Fn ? `∫ ${str(S(n))} d${x} = ${str(Fn)} + C\n(türev alınarak doğrulandı)` : `Belirsiz integral için kapalı form bulamadım (yerel motor; kısmi integrasyon/yerine koyma gerektirebilir). Sınır verirsen sayısal sonucu hesaplarım: “integral ${s} 0 ile 1”.`;
      const A = a, Bb = b; const val = Fn && Number.isFinite(A) && Number.isFinite(Bb) ? ev(Fn, { [x]: Bb }) - ev(Fn, { [x]: A }) : numInt(f, A, Bb); const chk = Number.isFinite(A) && Number.isFinite(Bb) ? numInt(f, A, Bb) : val;
      return `∫ ${fmt(A)}→${fmt(Bb)} ${str(S(n))} d${x} = ${fmt(clean(val), 10)}${Fn ? `\nTers türev: ${str(Fn)}` : ' (sayısal, uyarlamalı Simpson)'}${Fn && Math.abs(chk - val) > 1e-6 * (1 + Math.abs(val)) ? `\n⚠ sayısal kontrol ${fmt(chk, 8)} — aralıkta süreksizlik olabilir` : ''}`; },
    limit(s, a0) { const n = parse(s), x = pickVar([n]) || 'x', a = /^-?(inf|sonsuz|∞)/i.test(String(a0)) ? (String(a0).startsWith('-') ? -Infinity : Infinity) : ev(parse(String(a0))), f = t => { try { return ev(n, { [x]: t }); } catch { return NaN; } }; const r = limit(f, a);
      if (!Number.isFinite(a)) return `lim (${x}→${a > 0 ? '∞' : '−∞'}) ${str(S(n))} = ${Number.isNaN(r) ? 'yok (salınım/ıraksama)' : fmt(clean(r), 9)}`;
      const same0 = Number.isFinite(r.l) && Number.isFinite(r.r) ? Math.abs(r.l - r.r) < 1e-5 * (1 + Math.abs(r.l)) : r.l === r.r;
      return `lim (${x}→${fmt(a)}) ${str(S(n))} = ${same0 ? fmt(clean(Number.isFinite(r.l) ? r.l : r.r), 9) : `YOK — soldan ${fmt(r.l)}, sağdan ${fmt(r.r)}`}`; },
    taylor(s, a = 0, k = 5) { const n = parse(s), x = pickVar([n]) || 'x'; let cur = n; const terms = []; for (let i = 0; i <= k; i++) { const c = ev(cur, { [x]: a }) / fact(i); if (Math.abs(c) > 1e-12) terms.push({ i, c }); cur = S(d(cur, x)); } const xa = a === 0 ? x : `(${x} ${a > 0 ? '−' : '+'} ${fmt(Math.abs(a))})`; return `Σ Taylor serisi (${x}₀ = ${fmt(a)}, ${k}. dereceye kadar):\n${str(S(n))} ≈ ` + terms.map(({ i, c }, j) => { const sgn = c < 0 ? (j ? ' − ' : '−') : (j ? ' + ' : ''), ac = Math.abs(c), fr = toFrac(ac); if (i === 0) return sgn + (fr || fmt(ac, 6)); const pw = xa + (i > 1 ? '^' + i : ''); if (Math.abs(ac - 1) < 1e-12) return sgn + pw; if (fr) { const [p, qq] = fr.split('/'); return sgn + (p === '1' ? '' : p) + pw + '/' + qq; } const inv1 = 1 / ac; if (Math.abs(inv1 - Math.round(inv1)) < 1e-9) return sgn + pw + '/' + Math.round(inv1); return sgn + fmt(ac, 6) + pw; }).join(''); },
    matris(op, s) { const parts = String(s).split(/\s*\|\s*/), A = parseM(parts[0]); const o = fold(op || 'det');
      if (/ters|inv/.test(o)) { const R = inv(A); return R ? `A⁻¹ =\n${mstr(R)}` : 'Matris tekil (determinant 0) — tersi yok.'; }
      if (/coz|solve/.test(o)) { const b = parts[1] ? nums(parts[1]) : null; if (!b) throw Error('biçim: “matris çöz [[2,1],[1,-1]] | 5, 1”'); const x = gauss(A, b); return x ? 'Ax = b çözümü: ' + x.map((v, i) => `x${i + 1} = ${fmt(clean(v))}`).join(', ') : 'Tek çözüm yok.'; }
      if (/ozdeger|eigen/.test(o)) { const r = eig(A); return `Özdeğerler: ${r.vals.map(v => fmt(clean(v), 6)).join(', ')}${r.complex ? ' (⚠ karmaşık özdeğer çifti var; yaklaşık)' : ''}`; }
      if (/carp|mul/.test(o)) { const Bm = parseM(parts[1]); return `A·B =\n${mstr(mul(A, Bm))}`; }
      if (/devrik|transpoz|trans/.test(o)) return `Aᵀ =\n${mstr(A[0].map((_, j) => A.map(r => r[j])))}`;
      return `det(A) = ${fmt(clean(det(A)), 10)}`; }
  };
  /* ---- istatistik girişi ---- */
  const groupsOf = s => String(s).split(/\s*\|\s*/).map(g => nums(g.replace(/^[^\d-]*?:/, ''))).filter(g => g.length);
  function statCmd(kind, s) { const G = groupsOf(s);
    switch (kind) {
      case 'betimsel': return describe(G.flat());
      case 'tek': { const mu = (String(s).match(/(?:mu|μ|ortalama|hedef)\s*=?\s*(-?[\d.,]+)/i) || [])[1]; return tOne(nums(String(s).replace(/(?:mu|μ|ortalama|hedef)\s*=?\s*-?[\d.,]+/i, '')), mu ? num(mu) : 0); }
      case 'iki': if (G.length < 2) throw Error('iki grup “|” ile ayrılmalı'); return tWelch(G[0], G[1]);
      case 'eslesik': if (G.length < 2) throw Error('önce | sonra'); return tPaired(G[0], G[1]);
      case 'mann': return mannW(G[0], G[1]);
      case 'kor': return corr(G[0], G[1]);
      case 'reg': { const r = regress(G[0], G[1]); return r.text; }
      case 'anova': return anova(G);
      case 'ki': return chiSq(parseM(s.includes('[') ? s : '[' + String(s).split('|').map(r => '[' + nums(r).join(',') + ']').join(',') + ']'));
      case 'orneklem': { const o = {}; const g = (k, re) => { const m = String(s).match(re); if (m) o[k] = num(m[1]); }; g('d', /\bd\s*=\s*([\d.,]+)/i); g('alfa', /(?:alfa|alpha|α)\s*=\s*([\d.,]+)/i); g('guc', /(?:güç|guc|power)\s*=\s*([\d.,]+)/i); g('p1', /p1\s*=\s*([\d.,]+)/i); g('p2', /p2\s*=\s*([\d.,]+)/i); return sampleSize(o); }
    } }
  function regPlot(x, y) { const r = regress(x, y), W = 1200, H = 760, M = { l: 90, r: 40, t: 70, b: 80 }; const xl = Math.min(...x), xh = Math.max(...x), yl = Math.min(...y), yh = Math.max(...y), px = (xh - xl) * 0.08 || 1, py = (yh - yl) * 0.12 || 1; const X = v => M.l + (v - xl + px) / (xh - xl + 2 * px) * (W - M.l - M.r), Y = v => H - M.b - (v - yl + py) / (yh - yl + 2 * py) * (H - M.t - M.b);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, 'Segoe UI', Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fbfcfd"/>`;
    for (const t of nice(xl - px, xh + px)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${M.t}" y2="${H - M.b}" stroke="#e6ecef"/><text x="${X(t)}" y="${H - M.b + 28}" font-size="16" text-anchor="middle" fill="#5a6b73">${fmt(t, 4)}</text>`;
    for (const t of nice(yl - py, yh + py)) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e6ecef"/><text x="${M.l - 12}" y="${Y(t) + 5}" font-size="16" text-anchor="end" fill="#5a6b73">${fmt(t, 4)}</text>`;
    s += `<line x1="${X(xl - px)}" y1="${Y(r.b0 + r.b1 * (xl - px))}" x2="${X(xh + px)}" y2="${Y(r.b0 + r.b1 * (xh + px))}" stroke="#f5a623" stroke-width="4"/>` + x.map((v, i) => `<circle cx="${X(v)}" cy="${Y(y[i])}" r="8" fill="#0e7c86" fill-opacity=".85" stroke="#fff" stroke-width="2"/>`).join('');
    s += `<text x="${M.l}" y="40" font-size="24" font-weight="700" fill="#0b2530">y = ${fmt(r.b0, 4)} ${r.b1 >= 0 ? '+' : '−'} ${fmt(Math.abs(r.b1), 4)}·x   ·   R² = ${fmt(r.r2, 3)}</text><text x="${W - M.r}" y="40" font-size="14" text-anchor="end" fill="#5a6b73">SATÜRN · doğrusal regresyon</text></svg>`; return { svg: s, r }; }

  /* ======================= ARAÇLAR (yapay zekâ da kullanır) ======================= */
  const wrapT = fn => (...a) => { try { return fn(...a); } catch (e) { return '⚠ ' + e.message; } };
  Object.assign(TOOLS, {
    hesapla: { d: 'hesapla|ifade — KESİN hesap makinesi (sin, ln, sqrt, ^, !, π, e, derece için 30°) · “F=m*a; m=70; a=9.81” gibi denklemde bilinmeyeni çözer. Sayısal hiçbir sonucu kafadan verme, bunu kullan', run: wrapT(([e]) => B.hesapla(e)) },
    turev: { d: 'turev|ifade|değişken (boş: x)|kaçıncı türev (boş: 1) — sembolik türev', run: wrapT(([e, v, k]) => B.turev(e, v, +k || 1)) },
    integral: { d: 'integral|ifade|alt sınır|üst sınır (sınırsız: belirsiz integral; sonsuz için inf) — sembolik/sayısal integral', run: wrapT(([e, a, b]) => B.integral(e, a === undefined || a === '' ? null : /inf/.test(a) ? (a.startsWith('-') ? -Infinity : Infinity) : ev(parse(a)), b === undefined || b === '' ? null : /inf/.test(b) ? (b.startsWith('-') ? -Infinity : Infinity) : ev(parse(b)))) },
    limit: { d: 'limit|ifade|nokta (inf olabilir) — limit (sağ/sol kontrolüyle)', run: wrapT(([e, a]) => B.limit(e, a)) },
    coz: { d: 'coz|denklem (birden fazlaysa “;” ile) — denklem/sistem çözümü (karmaşık kökler dahil)', run: wrapT(([e]) => solve(e)) },
    taylor: { d: 'taylor|ifade|nokta (0)|derece (5) — Taylor serisi', run: wrapT(([e, a, k]) => B.taylor(e, a ? ev(parse(a)) : 0, +k || 5)) },
    matris: { d: 'matris|det/ters/coz/ozdeger/carp/devrik|[[1,2],[3,4]] (| ikinci matris ya da b vektörü)', run: wrapT(([o, m, m2]) => B.matris(o, m2 ? m + '|' + m2 : m)) },
    fonksiyon_ciz: { d: 'fonksiyon_ciz|f(x) (virgülle en fazla 4)|başlangıç|bitiş — fonksiyon grafiği (kökler, ekstremumlar)', run: wrapT(([e, a, b]) => { const p = plot(String(e).split(/\s*[;]\s*|\s*,\s*(?=[a-z(])/i).slice(0, 4), a ? +a : -10, b ? +b : 10); showSvg(p.svg, 'Fonksiyon grafiği', '📉 ' + p.notes.join('\n')); return p.notes.join('\n'); }) },
    istatistik: { d: 'istatistik|test (betimsel/tek/iki/eslesik/mann/kor/reg/anova/ki/orneklem)|veri (gruplar “|” yerine “/” ile) — betimsel, t testleri, Mann-Whitney, korelasyon, regresyon, ANOVA, ki-kare, örneklem büyüklüğü', run: wrapT(([k, v]) => statCmd(fold(k || 'betimsel'), String(v || '').replace(/\//g, '|'))) },
    klinik_istatistik: { d: 'klinik_istatistik — hastaların ilk-son ağrı (VAS) değişimi: eşleştirilmiş t testi, etki büyüklüğü, yanıt oranı, tanıya göre ANOVA', run: wrapT(() => clinicalStats()) },
    formul: { d: 'formul|formül adı veya konu ve değerler (ör. “kinetik enerji m=70 v=5”) — fizik, mühendislik, mimarlık, biyoloji, kimya, ekonomi formülleri; bilinmeyeni çözer', run: wrapT(([q]) => formulaCmd(q) || 'Formül bulunamadı. “formüller” ile listeyi gör.') },
    birim: { d: 'birim|değer|kaynak birim|hedef birim — birim çevirisi (uzunluk, kütle, alan, hacim, hız, basınç, enerji, güç, kuvvet, sıcaklık, veri, açı)', run: wrapT(([v, a, b]) => convert(num(v), a, b) || 'Bu birimler arasında çeviri yok.') },
    kimya: { d: 'kimya|mol/denklestir|formül veya tepkime (ör. “mol|C6H12O6”, “denklestir|C3H8 + O2 -> CO2 + H2O”)', run: wrapT(([k, s]) => /denk/.test(fold(k)) ? balance(s) : molar(s)) },
    finans: { d: 'finans|npv/irr/kredi|değerler — npv|%iskonto|akışlar (ilk yatırım eksi); kredi|tutar|dönem faizi %|taksit sayısı', run: wrapT(([k, a, b, c]) => /kredi/.test(fold(k)) ? loan(num(a), num(b), +c) : cashflow(num(String(a).replace('%', '')) / 100, nums(b))) }
  });
  TOOL_GROUPS.push([/hesapla|kaç eder|türev|turev|integral|limit|denklem|çöz|coz|matris|determinant|taylor|grafiğini|fonksiyon|istatistik|ortalama|standart sapma|t test|anova|korelasyon|regresyon|ki.?kare|p değeri|anlamlı|örneklem|formül|formul|fizik|kimya|mol|tepkime|mühendis|kiriş|kiris|gerilme|tork|basınç|enerji|ekonomi|faiz|enflasyon|npv|irr|kredi|yatırım|birim|çevir|biyoloji|nabız|vki|mimari|merdiven|rampa|aydınlatma/i, /^(hesapla|turev|integral|limit|coz|taylor|matris|fonksiyon_ciz|istatistik|klinik_istatistik|formul|birim|kimya|finans)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nBİLİM ÇEKİRDEĞİ (kesin, yerel): Matematik, calculus, istatistik, fizik, mühendislik, mimarlık, biyoloji, kimya ve ekonomi sorularında bir uzman bilim insanı gibi davran: önce yöntemi ve varsayımları kısaca söyle, HER sayısal sonucu araçla hesapla (hesapla, turev, integral, limit, coz, taylor, matris, istatistik, formul, birim, kimya, finans, fonksiyon_ciz) — kafadan aritmetik yapma. Birimleri her adımda yaz, sonucu mantık kontrolünden geçir (büyüklük sırası, işaret, birim tutarlılığı), sonunda 1-2 cümle yorum ve sınırlılık ekle. İstatistikte etki büyüklüğü ve güven aralığını da ver; korelasyonu nedensellik gibi sunma.`;

  /* ======================= DOĞAL DİL KOMUTLARI ======================= */
  const reply = fn => { try { return fn(); } catch (e) { return '⚠ ' + e.message; } };
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t); let m;
    if ((m = t.match(/^(?:hesapla|hesap|calc|=)\s*[:\s]\s*(.+)$/i))) return reply(() => B.hesapla(m[1]));
    if ((m = t.match(/^(-?[\d.,]+)\s*([a-zA-Z°µ/²³_ ]{1,14}?)\s*(?:kaç|kac|to|->|=|→|ne kadar)\s*([a-zA-Z°µ/²³_ ]{1,14}?)\s*(?:eder|yapar|olur)?\s*\??$/i))) { const r = convert(num(m[1]), m[2].trim(), m[3].trim()); if (r) return r; }
    if ((m = t.match(/^(?:çevir|cevir)\s*[:\s]\s*(-?[\d.,]+)\s*(\S+)\s+(?:to|->|→|=|kaç|kac)?\s*(\S+)$/i))) { const r = convert(num(m[1]), m[2], m[3]); if (r) return r; }
    if (/^[\d\s.,+\-*/^()!%πe√²³×÷]+=?\s*\??$/.test(t) && /\d\s*[+\-*/^×÷!]\s*[\d(]|√|\d\s*!/.test(t) && !/^\d{1,2}[.:]\d{2}$/.test(t)) return reply(() => B.hesapla(t.replace(/[=?]\s*$/, '')));
    if ((m = t.match(/^(?:türev(?:i)?|turev(?:i)?|türevini al|turevini al|d\/dx)\s*(?:(\d)\.?\s*)?[:\s]\s*(.+?)(?:\s+(\w)\s*['’]?(?:y?e|y?a)\s+göre)?$/i))) return reply(() => B.turev(m[2], m[3], +m[1] || 1));
    if ((m = t.match(/^(.+?)\s+(?:fonksiyonunun\s+)?(\d\.\s*)?türevi(?:ni al)?$/i))) return reply(() => B.turev(m[1], null, parseInt(m[2]) || 1));
    if ((m = t.match(/^(?:integral|integrali|∫)\s*[:\s]\s*(.+?)(?:\s+(-?[\w.,π]+)\s*(?:ile|den|dan|ten|tan|'den|’den|,|\.\.|to)\s*(-?[\w.,π]+)(?:\s*(?:arası|arasinda|arasında))?)?$/i))) return reply(() => B.integral(m[1], m[2] != null ? (/inf|sonsuz/.test(m[2]) ? (m[2].startsWith('-') ? -Infinity : Infinity) : ev(parse(m[2]))) : null, m[3] != null ? (/inf|sonsuz/.test(m[3]) ? (m[3].startsWith('-') ? -Infinity : Infinity) : ev(parse(m[3]))) : null));
    if ((m = t.match(/^(?:limit|lim)\s*[:\s]?\s*(?:(?:x|t)\s*(?:->|→|giderken)\s*(\S+)\s+(.+)|(.+?)\s+(?:x|t)\s*(?:->|→|giderken)\s*(\S+))$/i))) return reply(() => B.limit(m[2] || m[3], m[1] || m[4]));
    if ((m = t.match(/^(?:çöz|coz|denklem(?:i çöz)?|denklemi coz)\s*[:\s]\s*(.+)$/i))) return reply(() => solve(m[1]));
    if ((m = t.match(/^taylor\s*[:\s]\s*(.+?)(?:\s+(?:x0|a|nokta)\s*=\s*(-?[\w.]+))?(?:\s+(\d+)\.?\s*(?:derece|terim)?)?$/i))) return reply(() => B.taylor(m[1], m[2] ? ev(parse(m[2])) : 0, +m[3] || 5));
    if ((m = t.match(/^(?:matris|matrix)\s*(det|determinant|ters|tersi|çöz|coz|özdeğer|ozdeger|çarp|carp|devrik)?\s*[:\s]\s*(.+)$/i))) return reply(() => B.matris(m[1] || 'det', m[2]));
    if ((m = t.match(/^(?:determinant)\s*[:\s]\s*(.+)$/i))) return reply(() => B.matris('det', m[1]));
    if ((m = t.match(/^(?:grafiğini çiz|grafigini ciz|fonksiyon çiz|fonksiyon ciz|çiz|ciz|plot)\s*[:\s]\s*(.+?)(?:\s+(?:x\s*=|aralık|aralik)?\s*(-?[\d.]+)\s*(?:\.\.|ile|,|den|dan)\s*(-?[\d.]+))?$/i)) && /[x(]|sin|cos|ln|exp/.test(m[1])) return reply(() => TOOLS.fonksiyon_ciz.run([m[1], m[2], m[3]]));
    if ((m = t.match(/^(?:betimsel istatistik|istatistik|istatistiksel analiz|analiz et)\s*[:\s]\s*(.+)$/i)) && /\d/.test(m[1])) return reply(() => statCmd('betimsel', m[1]));
    if ((m = t.match(/^(?:tek örneklem t|tek orneklem t)(?:\s*testi)?\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('tek', m[1]));
    if ((m = t.match(/^(?:eşleştirilmiş t|eslestirilmis t|eşli t|esli t|önce sonra|once sonra)(?:\s*testi)?\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('eslesik', m[1]));
    if ((m = t.match(/^(?:t testi|t-testi|bağımsız t|bagimsiz t|iki grup)(?:\s*testi)?\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('iki', m[1]));
    if ((m = t.match(/^(?:mann whitney|mann-whitney|u testi)\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('mann', m[1]));
    if ((m = t.match(/^(?:korelasyon|ilişki|iliski)\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('kor', m[1]));
    if ((m = t.match(/^(?:regresyon|doğrusal regresyon|dogrusal regresyon|trend)\s*[:\s]\s*(.+)$/i))) return reply(() => { const G = groupsOf(m[1]); const p = regPlot(G[0], G[1]); showSvg(p.svg, 'Regresyon', p.r.text); return p.r.text; });
    if ((m = t.match(/^(?:anova|varyans analizi)\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('anova', m[1]));
    if ((m = t.match(/^(?:ki kare|ki-kare|chi kare|ki²)\s*(?:testi)?\s*[:\s]\s*(.+)$/i))) return reply(() => statCmd('ki', m[1]));
    if ((m = t.match(/^(?:örneklem büyüklüğü|orneklem buyuklugu|kaç kişi gerekir|kac kisi gerekir)\s*[:\s]?\s*(.*)$/i))) return reply(() => statCmd('orneklem', m[1]));
    if (/^(klinik istatistik|tedavi istatistigi|klinik sonuc istatistigi|hastalarimin istatistigi|tedavi sonuclarim anlamli mi|sonuclarim istatistiksel)/.test(f)) return reply(clinicalStats);
    if ((m = t.match(/^(?:mol kütlesi|mol kutlesi|molar kütle|molar kutle|mol ağırlığı|mol agirligi|molekül ağırlığı)\s*[:\s]?\s*(\S+)$/i)) || (m = t.match(/^(\S+)\s+(?:mol kütlesi|molar kütlesi|mol kutlesi)$/i))) return reply(() => molar(m[1]));
    if ((m = t.match(/^(?:denkleştir|denklestir|tepkimeyi denkleştir|tepkime denkleştir|tepkime)\s*[:\s]\s*(.+)$/i))) return reply(() => balance(m[1]));
    if ((m = t.match(/^(?:npv|nbd|net bugünkü değer)\s*%?\s*([\d.,]+)\s*%?\s*[:\s]\s*(.+)$/i))) return reply(() => cashflow(num(m[1]) / 100, nums(m[2])));
    if ((m = t.match(/^(?:irr|iç verim|ic verim)\s*[:\s]\s*(.+)$/i))) return reply(() => cashflow(0.1, nums(m[1])));
    if ((m = t.match(/^kredi\s*[:\s]\s*([\d.,]+)\s*(?:tl)?\s*%\s*([\d.,]+)\s*(?:aylık|aylik)?\s*(\d+)\s*(?:ay|taksit)?$/i))) return reply(() => loan(num(m[1]), num(m[2]), +m[3]));
    if (/^(formuller|formul listesi|bilim formulleri)(\s+\S+)?$/.test(f)) { const area = f.split(' ')[1]; const L = LIB.filter(x => !area || fold(x.alan).startsWith(area)); const by = {}; L.forEach(x => (by[x.alan] ||= []).push(x.ad)); return '📘 FORMÜL KÜTÜPHANESİ (' + L.length + ')\n' + Object.entries(by).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n\n') + '\n\nKullanım: “kinetik enerji m=70 v=5” — bilinmeyen hangisiyse onu çözer.'; }
    if ((m = t.match(/^(?:formül|formul)\s*[:\s]\s*(.+)$/i))) return reply(() => formulaCmd(m[1]) || 'Formül bulunamadı. “formüller” ile listeyi gör.');
    if (/[a-zA-Z]\w*\s*=\s*-?[\d.,]/.test(t) && t.length < 140) { const r = (() => { try { return formulaCmd(t); } catch (e) { return findFormula(t) ? '⚠ ' + e.message : null; } })(); if (r) return r; }
    return _lc(t0);
  };
  window.jarvisBilim = { parse, ev, str, S, d, I, simpson, numInt, limit, roots, solve, describe, tOne, tWelch, tPaired, mannW, corr, regress, anova, chiSq, sampleSize, clinicalStats, molar, balance, formula, LIB, convert, cashflow, loan, plot, regPlot, B, fmt, Phi, zInv, tP2, chiP, fP, det, inv, eig, showSvg, nums, nice };
})();
