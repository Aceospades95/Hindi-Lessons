/**
 * Live roman → Devanagari transliteration in THIS course's romanization, so the
 * learner can type Hindi script with no Hindi keyboard installed:
 *   namaste -> नमस्ते     main Theek hoon -> मैं ठीक हूँ     laRkaa -> लड़का
 *
 * The hard part is that our romanization applies schwa deletion (laRkaa, not
 * laRakaa), so two adjacent consonants are ambiguous: they might be a true
 * conjunct (नमस्ते) or just a deleted schwa (लड़का). We resolve it with an
 * explicit conjunct list plus gemination, defaulting to the inherent vowel.
 * Type "_" to force a halant anywhere the guess is wrong — the live preview
 * means a wrong guess is always visible before it matters.
 */
(function (global) {
  "use strict";

  var CONS = [
    ["chh", "छ"], ["Chh", "छ"], ["ksh", "क्ष"],
    ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"],
    ["Th", "ठ"], ["Dh", "ढ"], ["Rh", "ढ़"],
    ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"],
    ["sh", "श"], ["Sh", "ष"],
    ["T", "ट"], ["D", "ड"], ["N", "ण"], ["R", "ड़"], ["S", "ष"],
    ["k", "क"], ["g", "ग"], ["c", "च"], ["j", "ज"],
    ["t", "त"], ["d", "द"], ["n", "न"],
    ["p", "प"], ["b", "ब"], ["m", "म"],
    ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["w", "व"],
    ["s", "स"], ["h", "ह"],
    ["z", "ज़"], ["f", "फ़"], ["q", "क़"], ["x", "क्ष"]
  ];

  var VOW = [
    ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"],
    ["ee", "ई", "ी"], ["oo", "ऊ", "ू"], ["ri", "ऋ", "ृ"],
    ["ii", "ई", "ी"], ["uu", "ऊ", "ू"],
    ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"],
    ["e", "ए", "े"], ["o", "ओ", "ो"]
  ];

  /** Consonant pairs that really do form a conjunct in everyday Hindi. */
  var CONJUNCT = new Set((
    "st sth sk sp sn sm sv sy shr shv shch shT sht skr str " +
    "kt kr kl ky kv ksh gr gl gy gv ghr " +
    "chy chr jy jv jn " +
    "tr tv ty thy tm " +
    "dr dv dy dhy dhv dm " +
    "nt nd nk ng nch nj nm ny nv nh ns " +
    "pr pl py ps phr " +
    "br bl by bhr bhy " +
    "mr ml my mh mb " +
    "rk rg rch rj rT rD rt rd rn rp rb rm ry rv rs rsh rh rth rw " +
    "lk lp lm ly lv lh " +
    "vy vr " +
    "hm hy hr hv hn " +
    "Tr Dr Tv TT DD NT ND NDh " +
    "gd gn dn tn"
  ).split(/\s+/));

  var HALANT = "्", ANUSVAR = "ं", CANDRA = "ँ";

  /** n/m before these becomes the nasal dot rather than a full letter. */
  var NASAL_BEFORE = new Set(["k", "kh", "g", "gh", "ch", "chh", "j", "jh",
    "T", "Th", "D", "Dh", "t", "th", "d", "dh", "p", "ph", "b", "bh"]);

  /** Which nasal mark a nasalized vowel takes (Hindi convention). */
  var CANDRA_VOWELS = new Set(["aa", "oo", "e", "o", "au"]);   // हाँ हूँ दाएँ
  // ee/ai/i/u take the plain dot: नहीं, मैं, हैं

  function transliterate(input) {
    var s = String(input == null ? "" : input);
    var out = "", i = 0;
    var lastCons = null;      // roman key of a consonant awaiting its vowel

    function matchAt(table, pos) {
      for (var k = 0; k < table.length; k++) if (s.startsWith(table[k][0], pos)) return table[k];
      return null;
    }

    while (i < s.length) {
      var ch = s[i];

      if (/\s/.test(ch)) { out += ch; i++; lastCons = null; continue; }
      if (ch === ".") { out += "।"; i++; lastCons = null; continue; }
      if (/[0-9?!,;:'"()\-–—]/.test(ch)) { out += ch; i++; lastCons = null; continue; }
      if (ch === "_") { if (lastCons) out += HALANT; i++; lastCons = null; continue; }
      if (s.startsWith("(n)", i)) { out += CANDRA; i += 3; lastCons = null; continue; }

      var c = matchAt(CONS, i);
      if (c) {
        // n/m acting as the nasal shadow before a stop: rang -> रंग, andar -> अंदर
        if ((c[0] === "n" || c[0] === "m") && !lastCons && out && !/\s$/.test(out)) {
          var nxt = matchAt(CONS, i + 1);
          if (nxt && NASAL_BEFORE.has(nxt[0]) && !matchAt(VOW, i + 1)) {
            out += ANUSVAR; i += 1; lastCons = null; continue;
          }
        }
        if (lastCons) {
          var pair = lastCons + c[0];
          // gemination, including the aspirated kind our spelling writes as
          // plain+aspirate: achchhaa, baiThnaa, uddeshya
          var geminate = lastCons === c[0] || c[0] === lastCons + "h" || lastCons === c[0] + "h";
          if (geminate || CONJUNCT.has(pair)) out += HALANT;
          // else: inherent 'a' between them — laRkaa, matlab, sadak
        }
        out += c[1];
        i += c[0].length;
        lastCons = c[0];
        continue;
      }

      var v = matchAt(VOW, i);
      if (v) {
        out += lastCons ? v[2] : v[1];
        i += v[0].length;
        lastCons = null;
        // nasalized vowel: haan, hoon, naheen, main, hain
        // A nasalized vowel only when the n/m actually ends the word —
        // mid-word it is either the nasal dot (andar) or a real letter (dhanyavaad).
        if (/^[nm](\s|$|[.,!?;:।])/.test(s.slice(i))) {
          out += CANDRA_VOWELS.has(v[0]) ? CANDRA : ANUSVAR;
          i += 1;
        }
        continue;
      }

      out += ch; i++; lastCons = null;
    }
    return out;
  }

  /** Wire an <input> to a live Devanagari preview. */
  function attach(input, preview, onChange) {
    function update() {
      var dev = transliterate(input.value);
      if (preview) preview.textContent = dev || "";
      if (onChange) onChange(dev);
      return dev;
    }
    input.addEventListener("input", update);
    update();
    return { update: update, value: function () { return transliterate(input.value); } };
  }

  global.Translit = { transliterate: transliterate, attach: attach };
})(typeof window !== "undefined" ? window : globalThis);
