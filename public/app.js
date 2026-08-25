/* ===== Delhi Hindi — client ===== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  var TZ = new Date().getTimezoneOffset();

  var state = { user: null, content: null, flat: [], progress: { answers: {}, checks: {}, chapters: {} },
                view: "dash", chapter: null, stats: null, quiz: null, lessons: null };

  // ------------------------------------------------------------------ api
  function api(path, opts) {
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" }, credentials: "same-origin" }, opts))
      .then(function (r) { return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; }); });
  }
  var post = function (p, body) { return api(p, { method: "POST", body: JSON.stringify(body || {}) }); };

  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ----------------------------------------------------------------- gate
  var gateMode = "login";
  function showGate(policy) {
    $("#app").classList.remove("show");
    $("#gate").classList.add("show");
    var first = policy && policy.first;
    if (first) gateMode = "signup";
    renderGate(policy);
  }
  function renderGate(policy) {
    var signup = gateMode === "signup";
    var first = policy && policy.first;
    $("#gateTitle").textContent = first ? "Set up your account" : signup ? "Create your account" : "Welcome back";
    $("#gateSub").textContent = first
      ? "You're the first user here, so this account becomes the admin."
      : signup ? "Your progress, streak and review schedule live with your account."
               : "Sign in to pick up where you left off.";
    $("#fName").style.display = signup ? "" : "none";
    $("#fInvite").style.display = signup && policy && policy.inviteRequired ? "" : "none";
    $("#gateBtn").textContent = signup ? "Create account" : "Sign in";
    $("#gPass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    $("#gateSwap").innerHTML = first ? "" : signup
      ? 'Already have an account? <a id="swapLink">Sign in</a>'
      : (policy && policy.allowed ? 'First time here? <a id="swapLink">Create an account</a>' : "");
    if ($("#swapLink")) $("#swapLink").onclick = function () {
      gateMode = signup ? "login" : "signup"; $("#gateErr").style.display = "none"; renderGate(policy);
    };
    $("#gateNote").textContent = first
      ? "Everything stays on your server. No account data leaves this machine."
      : "";
  }
  $("#gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#gateBtn"); btn.disabled = true;
    var body = { email: $("#gEmail").value, password: $("#gPass").value };
    if (gateMode === "signup") { body.name = $("#gName").value || $("#gEmail").value.split("@")[0]; body.invite = $("#gInvite").value; }
    post("/api/auth/" + (gateMode === "signup" ? "signup" : "login"), body)
      .then(function (r) { state.user = r.user; $("#gate").classList.remove("show"); boot(); })
      .catch(function (err) { var e2 = $("#gateErr"); e2.textContent = err.message; e2.style.display = ""; })
      .then(function () { btn.disabled = false; });
  });

  // -------------------------------------------------------------- content
  function buildFlat() {
    state.flat = [];
    state.content.books.forEach(function (b) {
      b.chapters.forEach(function (c) {
        state.flat.push({ id: c.id, title: c.title, num: c.num, kind: c.kind, week: c.week,
                          book: b.title, bookKey: b.key });
      });
    });
  }

  var index = null;
  function buildIndex() {
    if (index) return index;
    index = state.flat.map(function (c) {
      var raw = state.content.chapters[c.id] || "";
      var txt = raw.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
        .replace(/&mdash;/g, "—").replace(/&middot;/g, "·").replace(/\s+/g, " ").trim();
      return { c: c, txt: txt, low: txt.toLowerCase() };
    });
    return index;
  }
  function search(q) {
    q = q.trim(); if (q.length < 2) return [];
    var low = q.toLowerCase(), out = [];
    buildIndex().forEach(function (e) {
      var hits = [], from = 0, i;
      while ((i = e.low.indexOf(low, from)) !== -1 && hits.length < 4) { hits.push(i); from = i + low.length; }
      var titleHit = e.c.title.toLowerCase().indexOf(low) !== -1;
      if (!hits.length && !titleHit) return;
      out.push({ c: e.c, n: hits.length + (titleHit ? 3 : 0), snips: hits.slice(0, 2).map(function (i) {
        var s = Math.max(0, i - 50), t = e.txt.slice(s, i + low.length + 70);
        return (s > 0 ? "…" : "") + esc(t.slice(0, i - s)) + "<mark>" + esc(t.substr(i - s, low.length)) +
               "</mark>" + esc(t.slice(i - s + low.length)) + "…";
      }) });
    });
    return out.sort(function (a, b) { return b.n - a.n; }).slice(0, 40);
  }

  function buildNav() {
    var h = "";
    state.content.books.forEach(function (b) {
      h += '<div class="navbook">' + esc(b.title) + "</div>";
      b.chapters.forEach(function (c) {
        var done = state.progress.chapters[c.id] && state.progress.chapters[c.id].done;
        h += '<a class="navitem" data-id="' + c.id + '" href="#read/' + c.id + '">' +
             (c.num ? '<span class="n">' + esc(c.num) + "</span>" : "") +
             "<span>" + esc(c.title) + "</span>" +
             (done ? '<span class="tick">✓</span>' : "") + "</a>";
      });
    });
    $("#nav").innerHTML = h;
    markNav();
  }
  function markNav() {
    $$(".navitem").forEach(function (a) { a.classList.toggle("active", a.dataset.id === state.chapter); });
  }

  // ------------------------------------------------------------ heartbeat
  var lastActive = Date.now();
  ["mousemove", "keydown", "scroll", "touchstart", "click"].forEach(function (ev) {
    document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (!state.user) return;
    if (document.hidden) return;
    if (Date.now() - lastActive > 120000) return;      // idle: don't inflate the numbers
    post("/api/progress/tick", { seconds: 30, chapterId: state.view === "read" ? state.chapter : null, tzOffset: TZ })
      .catch(function () {});
  }, 30000);

  // ------------------------------------------------------------ dashboard
  function fmtMin(m) {
    if (m < 60) return m + "m";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  function barChart(series, goal) {
    var W = 720, H = 170, pad = { l: 30, r: 8, t: 10, b: 22 };
    var n = series.length, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var max = Math.max(goal * 1.25, 10, Math.max.apply(null, series.map(function (d) { return d.minutes; })));
    var bw = Math.max(4, iw / n - 3);
    var ticks = [0, Math.round(max / 2), Math.round(max)];
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Minutes studied per day, last 30 days">';
    s += '<g class="grid">' + ticks.map(function (t) {
      var y = pad.t + ih - (t / max) * ih;
      return '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
             '<text x="' + (pad.l - 6) + '" y="' + (y + 3.5) + '" text-anchor="end">' + t + "</text>";
    }).join("") + "</g>";
    var gy = pad.t + ih - (goal / max) * ih;
    s += '<line class="goalline" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + gy + '" y2="' + gy + '"/>';
    s += '<text x="' + (W - pad.r) + '" y="' + (gy - 5) + '" text-anchor="end" style="fill:var(--accent)">goal ' + goal + "m</text>";
    series.forEach(function (d, i) {
      var h = d.minutes > 0 ? Math.max(3, (d.minutes / max) * ih) : 0;
      var x = pad.l + i * (iw / n) + 1.5, y = pad.t + ih - h;
      if (h) s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
                  '" height="' + h.toFixed(1) + '" rx="3" data-tip="' + esc(d.day + " · " + d.minutes + " min · " + d.reviewed + " reviews") + '"/>';
    });
    s += '<line class="axis" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + (pad.t + ih) + '" y2="' + (pad.t + ih) + '"/>';
    s += '<text x="' + pad.l + '" y="' + (H - 6) + '">' + series[0].day.slice(5) + "</text>";
    s += '<text x="' + (W - pad.r) + '" y="' + (H - 6) + '" text-anchor="end">today</text>';
    return s + "</svg>";
  }

  function trendChart(series) {
    var pts = series.filter(function (d) { return d.reviewed >= 3; })
                    .map(function (d) { return { day: d.day, v: Math.round((d.correct / d.reviewed) * 100) }; });
    if (pts.length < 2) return '<p class="small">Answer a few more practice questions and your accuracy trend appears here.</p>';
    var W = 720, H = 150, pad = { l: 32, r: 8, t: 10, b: 20 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var xs = function (i) { return pad.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw); };
    var ys = function (v) { return pad.t + ih - (v / 100) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Accuracy trend">';
    s += '<g class="grid">' + [0, 50, 100].map(function (t) {
      return '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + ys(t) + '" y2="' + ys(t) + '"/>' +
             '<text x="' + (pad.l - 6) + '" y="' + (ys(t) + 3.5) + '" text-anchor="end">' + t + "%</text>";
    }).join("") + "</g>";
    s += '<path class="trend" d="' + pts.map(function (p, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1); }).join(" ") + '"/>';
    pts.forEach(function (p, i) {
      s += '<circle class="dot" cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.v).toFixed(1) + '" r="4" data-tip="' +
           esc(p.day + " · " + p.v + "% correct") + '"/>';
    });
    return s + "</svg>";
  }

  function heatmap(heat) {
    var cols = [], cur = [];
    heat.forEach(function (d, i) {
      var dow = new Date(d.day + "T00:00:00Z").getUTCDay();
      if (i === 0) for (var k = 0; k < dow; k++) cur.push(null);
      cur.push(d);
      if (dow === 6) { cols.push(cur); cur = []; }
    });
    if (cur.length) cols.push(cur);
    var lvl = function (m) { return m === 0 ? "" : m < 10 ? " l1" : m < 20 ? " l2" : m < 40 ? " l3" : " l4"; };
    var h = '<div class="heat">';
    cols.forEach(function (col) {
      h += '<div class="heatcol">';
      for (var i = 0; i < 7; i++) {
        var d = col[i];
        h += d ? '<div class="heatcell' + lvl(d.minutes) + '" data-tip="' +
                 esc(d.day + " · " + (d.minutes ? d.minutes + " min" : "nothing logged")) + '"></div>'
               : '<div class="heatcell" style="visibility:hidden"></div>';
      }
      h += "</div>";
    });
    h += "</div>";
    h += '<div class="heatlegend"><span>less</span><div class="heatcell"></div><div class="heatcell l1"></div>' +
         '<div class="heatcell l2"></div><div class="heatcell l3"></div><div class="heatcell l4"></div><span>more</span>' +
         '<span style="margin-left:auto">last 26 weeks</span></div>';
    return h;
  }

  function renderDash() {
    var s = state.stats;
    var el = $("#content"); el.className = "dash wide";
    var t = s.today, mixTotal = s.mix.perfect + s.mix.close + s.mix.wrong;

    var h = "<h1>" + esc(state.user.name.split(" ")[0]) + ", week " + s.plan.week + " of 26</h1>";
    h += '<div class="lede">' + (t.goalMet
      ? "Today's goal is done. Anything more is a bonus."
      : "You're " + Math.max(0, t.goal - t.minutes) + " minutes from today's goal.") + "</div>";

    h += '<div class="kpis">';
    h += '<div class="tile hero"><div class="k">Current streak</div><div class="v">' + s.streak.current +
         '<small>' + (s.streak.current === 1 ? "day" : "days") + "</small></div>" +
         '<div class="d">Longest: ' + s.streak.longest + " days</div></div>";
    h += '<div class="tile"><div class="k">Studied today</div><div class="v">' + t.minutes + '<small>min</small></div>' +
         '<div class="d">Goal ' + t.goal + " min</div></div>";
    h += '<div class="tile"><div class="k">Words known</div><div class="v">' + s.srs.strong + "</div>" +
         '<div class="d">' + s.srs.learning + " learning · " + s.srs.shaky + " shaky</div></div>";
    h += '<div class="tile"><div class="k">Due to review</div><div class="v">' + s.srs.due + "</div>" +
         '<div class="d">' + (s.srs.due ? "Practice clears these" : "All caught up") + "</div></div>";
    h += '<div class="tile"><div class="k">Total time</div><div class="v">' + s.totals.hours + '<small>hrs</small></div>' +
         '<div class="d">' + s.totals.days + " active days</div></div>";
    h += '<div class="tile"><div class="k">Chapters done</div><div class="v">' + s.totals.chapters +
         '<small>/ 116</small></div><div class="d">' + (s.totals.accuracy == null ? "—" : s.totals.accuracy + "% lifetime accuracy") + "</div></div>";
    h += "</div>";

    h += '<div class="card"><div class="goalrow"><div class="ring" style="--p:' + t.pct + '"><span>' + t.pct + "%</span></div>" +
         '<div class="txt"><b>Today: ' + fmtMin(t.minutes) + " of " + t.goal + " min</b>" +
         "<div class=\"sub\" style=\"margin:4px 0 0\">" + t.reviewed + " questions answered" +
         (t.reviewed ? " · " + Math.round((t.correct / t.reviewed) * 100) + "% right" : "") +
         ". A day counts toward your streak at " + t.goal + " minutes <i>or</i> 30 questions.</div></div>" +
         '<button class="btn" style="width:auto;padding:11px 18px" onclick="location.hash=\'#quiz\'">Practice now</button></div></div>';

    h += '<div class="card"><h2>Every day since you started</h2><div class="sub">Darker means more minutes.</div>' + heatmap(s.heat) + "</div>";

    h += '<div class="card"><h2>Minutes per day</h2><div class="sub">Last 30 days, against your ' + t.goal + '-minute goal.</div>' +
         barChart(s.series, t.goal) + "</div>";

    if (mixTotal) {
      var pc = function (n) { return mixTotal ? (n / mixTotal) * 100 : 0; };
      h += '<div class="card"><h2>How this week\'s answers landed</h2>' +
           '<div class="sub">' + mixTotal + " answers in the last 7 days.</div>" +
           '<div class="mixbar">' +
           '<i class="mix-perfect" style="width:' + pc(s.mix.perfect) + '%"></i>' +
           '<i class="mix-close" style="width:' + pc(s.mix.close) + '%"></i>' +
           '<i class="mix-wrong" style="width:' + pc(s.mix.wrong) + '%"></i></div>' +
           '<div class="mixkey">' +
           '<span><i class="swatch mix-perfect"></i>✓ Spot on <b>' + s.mix.perfect + "</b></span>" +
           '<span><i class="swatch mix-close"></i>≈ Close, accepted <b>' + s.mix.close + "</b></span>" +
           '<span><i class="swatch mix-wrong"></i>✗ Missed <b>' + s.mix.wrong + "</b></span></div></div>";
    }

    h += '<div class="card"><h2>Accuracy trend</h2><div class="sub">Percent correct on days you practised.</div>' +
         trendChart(s.series) + "</div>";

    if (s.weakest.length) {
      h += '<div class="card"><h2>Your stubborn ones</h2><div class="sub">Missed at least twice — practice targets these first.</div><div class="weaklist">';
      s.weakest.forEach(function (w) {
        h += "<div><span class=\"p\">" + esc(w.prompt.slice(0, 30)) + '</span><span class="e">' + esc(w.expected.slice(0, 46)) +
             '</span><span class="m">' + w.misses + " miss" + (w.misses === 1 ? "" : "es") + "</span></div>";
      });
      h += "</div></div>";
    }

    h += '<div class="card"><h2>Milestones</h2><div class="sub">Tied to real moments in the course, not points.</div><div class="badges">';
    s.milestones.forEach(function (m) {
      h += '<div class="badge' + (m.earnedAt ? " on" : "") + '"><div class="bn">' + esc(m.name) + "</div>" +
           '<div class="bb">' + esc(m.blurb) + "</div>" +
           (m.earnedAt ? '<div class="bd">' + m.earnedAt.slice(0, 10) + "</div>" : "") + "</div>";
    });
    h += "</div></div>";

    el.innerHTML = h;
    wireTips(el);
    s.milestones.filter(function (m) { return m.isNew; }).forEach(function (m) {
      setTimeout(function () { toast("Milestone unlocked — " + m.name); }, 400);
    });
  }

  function wireTips(root) {
    var tip = $("#tip");
    $$("[data-tip]", root).forEach(function (n) {
      n.addEventListener("mouseenter", function (e) {
        tip.textContent = n.dataset.tip; tip.classList.add("show");
        var r = n.getBoundingClientRect();
        tip.style.left = Math.min(window.innerWidth - 170, Math.max(8, r.left + r.width / 2 - 70)) + "px";
        tip.style.top = Math.max(8, r.top - 34) + "px";
      });
      n.addEventListener("mouseleave", function () { tip.classList.remove("show"); });
    });
  }

  // ----------------------------------------------------------------- read
  function wrapTables(root) {
    $$("table.wtable, table.gtable, table.tracker, table.writegrid", root).forEach(function (t) {
      if (t.parentNode.classList.contains("tablewrap") || t.closest(".diagrow")) return;
      var w = document.createElement("div"); w.className = "tablewrap";
      t.parentNode.insertBefore(w, t); w.appendChild(t);
    });
  }
  function hydrate(root, id) {
    $$("div.writeline", root).forEach(function (d, i) {
      var inp = document.createElement("input");
      inp.type = "text"; inp.className = d.className; inp.dataset.k = id + ":" + i;
      inp.value = state.progress.answers[inp.dataset.k] || "";
      inp.setAttribute("autocomplete", "off"); inp.setAttribute("spellcheck", "false");
      d.parentNode.replaceChild(inp, d);
    });
    $$("span.checkbox", root).forEach(function (s, i) {
      var k = id + ":c" + i; s.dataset.k = k;
      if (state.progress.checks[k]) s.classList.add("done");
      s.setAttribute("role", "checkbox"); s.setAttribute("tabindex", "0");
    });
  }

  function renderRead(id) {
    var idx = state.flat.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return renderHome();
    var c = state.flat[idx];
    state.chapter = id;
    var el = $("#content"); el.className = "";
    el.innerHTML = state.content.chapters[id] || "<p>Missing.</p>";
    wrapTables(el); hydrate(el, id);

    var done = state.progress.chapters[id] && state.progress.chapters[id].done;
    var bar = document.createElement("div"); bar.className = "donebar";
    bar.innerHTML = '<div class="t">' + (done ? "You marked this chapter done." : "Finished reading this one?") + "</div>" +
      '<button class="btn ghost" style="width:auto;padding:9px 16px" id="doneBtn">' +
      (done ? "Mark unread" : "Mark as done") + "</button>";
    el.appendChild(bar);
    $("#doneBtn").onclick = function () {
      var next = !done;
      post("/api/progress/chapter", { chapterId: id, done: next, tzOffset: TZ }).then(function () {
        state.progress.chapters[id] = Object.assign(state.progress.chapters[id] || {}, { done: next });
        toast(next ? "Marked done" : "Marked unread");
        buildNav(); renderRead(id);
      });
    };

    var prev = state.flat[idx - 1], next = state.flat[idx + 1];
    var nav = document.createElement("div"); nav.className = "chapnav";
    nav.innerHTML = (prev ? '<a href="#read/' + prev.id + '"><span class="lbl">Previous</span>' + esc(prev.title) + "</a>" : '<a class="empty"></a>') +
                    (next ? '<a class="next" href="#read/' + next.id + '"><span class="lbl">Next</span>' + esc(next.title) + "</a>" : '<a class="empty next"></a>');
    el.appendChild(nav);
    markNav();
    document.title = c.title + " · Delhi Hindi";
    $("#main").scrollTop = 0;
    document.body.classList.remove("navopen");
  }

  function renderHome() {
    state.chapter = null;
    var el = $("#content"); el.className = "home";
    var h = '<div class="hero"><div class="dv">दिल्ली की हिन्दी</div><h1>The Course</h1>' +
            "<p>146 chapters across five books — searchable, and it keeps your place.</p></div>";
    h += '<div class="cards">';
    state.content.books.forEach(function (b) {
      var done = b.chapters.filter(function (c) {
        return state.progress.chapters[c.id] && state.progress.chapters[c.id].done; }).length;
      var pct = Math.round((done / b.chapters.length) * 100);
      h += '<a class="bcard" href="#read/' + b.chapters[0].id + '"><div class="k">' + esc(b.key) + "</div>" +
           '<div class="t">' + esc(b.title) + '</div><div class="d">' + esc(b.blurb) + "</div>" +
           '<div class="pbar"><i style="width:' + pct + '%"></i></div>' +
           '<div class="d" style="margin-top:6px">' + done + " of " + b.chapters.length + " done</div></a>";
    });
    h += "</div>";
    el.innerHTML = h;
    markNav();
    document.title = "Delhi Hindi";
  }

  // ----------------------------------------------------------------- quiz
  var QMODES = [
    { key: "recognise", label: "Read it", blurb: "Devanagari → meaning" },
    { key: "produce", label: "Say it", blurb: "English → roman Hindi" },
    { key: "script", label: "Write it", blurb: "English → Devanagari" },
    { key: "sentence", label: "Translate", blurb: "Hindi sentence → English" },
    { key: "sentenceHi", label: "Into Hindi", blurb: "English sentence → Hindi" },
    { key: "combo", label: "Mix it up", blurb: "fresh sentences built from your lessons" },
  ];
  var qcfg = { size: 15, modes: ["recognise", "produce", "script", "sentence"], onlyDue: false, scope: "all" };

  // the tracked next-question Enter listener — see showVerdict
  var qEnter = null;
  function clearQEnter() {
    if (qEnter) { document.removeEventListener("keydown", qEnter); qEnter = null; }
  }

  function devOn() {
    return !!(state.user && state.user.settings && state.user.settings.devanagari === "on");
  }
  function applyDevPref() {
    document.body.classList.toggle("nodev", !devOn());
    if (!devOn()) {
      var i = qcfg.modes.indexOf("script");
      if (i >= 0) qcfg.modes.splice(i, 1);
      if (!qcfg.modes.length) qcfg.modes = ["produce"];
    }
  }

  function renderQuizSetup() {
    clearQEnter();
    var el = $("#content"); el.className = "";
    var dv = devOn();
    var due = state.stats ? state.stats.srs.due : 0;
    var h = '<div class="quizwrap qsetup"><h1 class="chapter"><span class="chnum">Practice</span>What shall we drill?</h1>';
    h += "<p>" + (due ? "<b>" + due + "</b> item" + (due === 1 ? " is" : "s are") + " due for review. Those come first automatically."
                      : "Nothing is due right now — this will be fresh material.") + "</p>";
    if (state.lessons && state.lessons.length) {
      h += '<div class="card"><h2>What material?</h2><div class="sub">My Lessons = only what your teacher has covered.</div><div class="opts">' +
           '<button class="chip' + (qcfg.scope === "all" ? " on" : "") + '" data-scope="all">Whole course</button>' +
           '<button class="chip' + (qcfg.scope === "mine" ? " on" : "") + '" data-scope="mine">My Lessons</button>' +
           "</div></div>";
    }
    h += '<div class="card"><h2>Question types</h2><div class="sub">Typed answers. Near-misses are accepted with a note, never marked wrong for a stray space.</div><div class="opts">';
    QMODES.forEach(function (m) {
      if (m.key === "script" && !dv) return;
      var blurb = m.key === "recognise" && !dv ? "Hindi → meaning" : m.blurb;
      h += '<button class="chip' + (qcfg.modes.indexOf(m.key) >= 0 ? " on" : "") + '" data-mode="' + m.key + '">' +
           esc(m.label) + ' <span style="opacity:.65;font-size:12px">' + esc(blurb) + "</span></button>";
    });
    h += "</div></div>";
    h += '<div class="card"><h2>Devanagari script</h2><div class="sub">Off = no Write-it drills, and every prompt comes in roman letters. Per-account — flip it on when you start learning the script.</div><div class="opts">' +
         '<button class="chip' + (dv ? " on" : "") + '" data-dev="on">On</button>' +
         '<button class="chip' + (!dv ? " on" : "") + '" data-dev="off">Off</button></div></div>';
    h += '<div class="card"><h2>How many?</h2><div class="opts">' +
         [10, 15, 25, 40].map(function (n) {
           return '<button class="chip' + (qcfg.size === n ? " on" : "") + '" data-size="' + n + '">' + n + "</button>"; }).join("") +
         '<button class="chip' + (qcfg.onlyDue ? " on" : "") + '" data-due="1">Only what\'s due</button></div></div>';
    h += '<button class="btn" id="startQuiz">Start</button></div>';
    el.innerHTML = h;

    $$("[data-mode]").forEach(function (b) { b.onclick = function () {
      var k = b.dataset.mode, i = qcfg.modes.indexOf(k);
      if (i >= 0) { if (qcfg.modes.length > 1) qcfg.modes.splice(i, 1); } else qcfg.modes.push(k);
      renderQuizSetup(); }; });
    $$("[data-size]").forEach(function (b) { b.onclick = function () { qcfg.size = +b.dataset.size; renderQuizSetup(); }; });
    var dueBtn = $("[data-due]"); if (dueBtn) dueBtn.onclick = function () { qcfg.onlyDue = !qcfg.onlyDue; renderQuizSetup(); };
    $$("[data-scope]").forEach(function (b) { b.onclick = function () { qcfg.scope = b.dataset.scope; renderQuizSetup(); }; });
    $$("[data-dev]").forEach(function (b) { b.onclick = function () {
      var want = b.dataset.dev === "on";
      if (want === devOn()) return;
      var s = Object.assign({}, (state.user && state.user.settings) || {});
      s.devanagari = want ? "on" : "off";
      post("/api/auth/settings", { settings: s }).then(function (r) {
        state.user = r.user; applyDevPref();
        toast(want ? "Devanagari on — script drills are available again" : "Devanagari off — roman letters everywhere");
        renderQuizSetup();
      }).catch(function (e) { toast(e.message); });
    }; });
    $("#startQuiz").onclick = startQuiz;
  }

  function startQuiz() {
    $("#startQuiz").disabled = true;
    var decks = qcfg.scope === "mine" && state.lessons && state.lessons.length
      ? state.lessons.map(function (L) { return L.code; })
      : undefined;
    post("/api/quiz/session", { size: qcfg.size, modes: qcfg.modes, onlyDue: qcfg.onlyDue, decks: decks, tzOffset: TZ })
      .then(function (r) {
        if (!r.items.length) { toast("Nothing to practise with those settings."); $("#startQuiz").disabled = false; return; }
        state.quiz = { items: r.items, i: 0, results: [], startedAt: Date.now() };
        renderQuestion();
      })
      .catch(function (e) { toast(e.message); $("#startQuiz").disabled = false; });
  }

  function renderQuestion() {
    clearQEnter();
    var q = state.quiz, it = q.items[q.i];
    if (!it) return renderQuizDone();
    q.phase = "question";
    var el = $("#content"); el.className = "";
    var isDevAnswer = it.answerMode === "dev";
    var promptIsDev = /[ऀ-ॿ]/.test(it.prompt);

    var h = '<div class="quizwrap"><div class="qbar"><span>' + (q.i + 1) + " / " + q.items.length + "</span>" +
            '<div class="qprog"><i style="width:' + ((q.i / q.items.length) * 100) + '%"></i></div>' +
            "<span>" + (it.isReview ? "review" : "new") + "</span>" +
            '<button class="tbtn" id="qquit" title="End this round — answers so far are saved">✕ End</button></div>';
    h += '<div class="qcard"><div class="qmode">' + esc(it.label) + "</div>";
    h += '<div class="qprompt' + (promptIsDev ? " dev" : it.prompt.length > 34 ? " small" : "") + '">' + esc(it.prompt) + "</div>";
    if (it.sub) h += '<div class="qsub">' + esc(it.sub) + "</div>";
    h += '<div class="qhint">' + esc(it.hint) + "</div>";
    h += '<input class="qinput" id="qin" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
         'placeholder="' + (isDevAnswer ? "type in roman — it becomes Devanagari" : "your answer") + '">';
    if (isDevAnswer) h += '<div class="devpreview" id="qprev"></div>';
    h += '<div class="qactions"><button class="btn ghost" id="qskip">Skip</button>' +
         '<button class="btn" id="qcheck">Check</button></div>';
    h += '<div id="qverdict"></div></div></div>';
    el.innerHTML = h;

    $("#qquit").onclick = function () {
      clearQEnter(); state.quiz = null; renderQuizSetup();
    };

    var input = $("#qin");
    var tl = null;
    if (isDevAnswer) tl = window.Translit.attach(input, $("#qprev"));
    input.focus();
    var t0 = Date.now();

    function submit() {
      var given = isDevAnswer ? tl.value() : input.value;
      if (!given.trim()) { input.focus(); return; }
      $("#qcheck").disabled = true; $("#qskip").disabled = true; input.disabled = true;
      post("/api/quiz/answer", { itemId: it.itemId, mode: it.mode, given: given, ms: Date.now() - t0, tzOffset: TZ })
        .then(function (r) { showVerdict(r, given); })
        .catch(function (e) { toast(e.message); $("#qcheck").disabled = false; input.disabled = false; });
    }
    $("#qcheck").onclick = submit;
    $("#qskip").onclick = function () {
      post("/api/quiz/answer", { itemId: it.itemId, mode: it.mode, given: "", ms: Date.now() - t0, tzOffset: TZ })
        .then(function (r) { input.disabled = true; $("#qcheck").disabled = true; $("#qskip").disabled = true; showVerdict(r, ""); });
    };
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  }

  function diffHTML(spans, dev) {
    if (!spans) return "";
    return '<div class="vdiff' + (dev ? " " : "") + '">' + spans.map(function (s) {
      var cls = s.op === "same" ? "" : s.op;
      var inner = '<span class="' + cls + (dev ? " dv" : "") + '">' + esc(s.text) + "</span>";
      return inner;
    }).join("") + "</div>";
  }

  function showVerdict(r, given) {
    var q = state.quiz, it = q.items[q.i];
    q.phase = "verdict";
    q.results.push(r.verdict);
    var icon = r.verdict === "perfect" ? "✓" : r.verdict === "close" ? "≈" : "✗";
    var word = r.verdict === "perfect" ? "Spot on" : r.verdict === "close" ? "Close enough — counted correct" : "Not quite";
    var isDev = it.answerMode === "dev";

    var h = '<div class="verdict ' + r.verdict + '">';
    h += '<div class="vhead"><span class="vicon">' + icon + "</span>" + word + "</div>";
    if (r.note) h += '<div class="vnote">' + esc(r.note) + "</div>";
    else if (r.verdict === "wrong" && given) h += '<div class="vnote">You wrote &ldquo;' + esc(given) + '&rdquo;.</div>';
    if (r.verdict !== "perfect" && r.diff) h += diffHTML(r.diff, isDev);
    h += '<div class="vref">' +
         (it.reveal.dev ? '<div><span class="dv">' + esc(it.reveal.dev) + '</span></div>' : "") +
         '<div><span class="r">' + esc(it.reveal.rom) + '</span>' +
         (it.reveal.phon ? ' <span class="p">[' + esc(it.reveal.phon) + "]</span>" : "") + "</div>" +
         "<div>" + esc(it.reveal.eng) + "</div>" +
         (it.reveal.note ? '<div style="color:var(--accent);font-size:13px;margin-top:4px">' + esc(it.reveal.note) + "</div>" : "") +
         "</div>";
    if (r.judgedBy === "ai") h += '<div class="vsmall">Judged by your local model.</div>';
    h += '<div class="vsmall">Next review: ' + esc(r.next) + "</div>";
    if (r.verdict === "wrong" && given) h += '<button class="tbtn" id="ovr" style="margin-top:9px">I was right — count it</button>';
    h += "</div>";
    h += '<div class="qactions"><button class="btn" id="qnext">' +
         (q.i + 1 >= q.items.length ? "See results" : "Next") + "</button></div>";
    $("#qverdict").innerHTML = h;

    if ($("#ovr")) $("#ovr").onclick = function () {
      post("/api/quiz/override", { attemptId: r.attemptId }).then(function () {
        q.results[q.results.length - 1] = "close";
        $("#ovr").textContent = "Counted ✓"; $("#ovr").disabled = true;
      });
    };
    var nxt = $("#qnext");
    nxt.focus();
    // One advance per verdict, whichever way it's triggered. The Enter listener
    // is tracked module-wide and removed on every path — a leaked copy is what
    // used to skip questions and paste old verdicts onto fresh ones.
    var advanced = false;
    function advance() {
      if (advanced) return; advanced = true;
      clearQEnter();
      if (state.quiz !== q || state.view !== "quiz") return;
      q.i++; renderQuestion();
    }
    qEnter = function (e) { if (e.key === "Enter") { e.preventDefault(); advance(); } };
    document.addEventListener("keydown", qEnter);
    nxt.onclick = advance;
  }

  function renderQuizDone() {
    clearQEnter();
    var q = state.quiz;
    var ok = q.results.filter(function (v) { return v !== "wrong"; }).length;
    var pct = Math.round((ok / q.results.length) * 100);
    var mins = Math.round((Date.now() - q.startedAt) / 60000);
    var el = $("#content"); el.className = "";
    var counts = { perfect: 0, close: 0, wrong: 0 };
    q.results.forEach(function (v) { counts[v]++; });
    el.innerHTML = '<div class="quizwrap"><div class="qcard qdone">' +
      '<div class="big">' + pct + "%</div>" +
      "<p>" + ok + " of " + q.results.length + " right" + (mins ? " · " + mins + " min" : "") + "</p>" +
      '<div class="mixkey" style="justify-content:center">' +
      '<span><i class="swatch mix-perfect"></i>✓ Spot on <b>' + counts.perfect + "</b></span>" +
      '<span><i class="swatch mix-close"></i>≈ Close <b>' + counts.close + "</b></span>" +
      '<span><i class="swatch mix-wrong"></i>✗ Missed <b>' + counts.wrong + "</b></span></div>" +
      '<div class="qactions" style="margin-top:20px"><button class="btn ghost" id="againBtn">Another round</button>' +
      '<button class="btn" id="dashBtn">See progress</button></div></div></div>';
    $("#againBtn").onclick = renderQuizSetup;
    $("#dashBtn").onclick = function () { location.hash = "#dash"; };
    state.quiz = null;
  }

  // ------------------------------------------------------------ my lessons
  function lessonByCode(code) {
    return (state.lessons || []).filter(function (L) { return L.code === code; })[0] || null;
  }

  function drillLesson(codes) {
    var modes = ["produce", "sentence", "sentenceHi", "recognise"];
    if (devOn()) modes.push("script");
    post("/api/quiz/session", { size: qcfg.size, modes: modes, decks: codes, tzOffset: TZ })
      .then(function (r) {
        if (!r.items.length) { toast("Nothing to drill here yet."); return; }
        state.quiz = { items: r.items, i: 0, results: [], startedAt: Date.now() };
        setView("quiz");
        location.hash = "#quiz";
        renderQuestion();
      })
      .catch(function (e) { toast(e.message); });
  }

  // one place to review everything: by lesson, or aggregated words / rules / sentences
  var lessonsFilter = { q: "", tag: "" };

  function lessonTabs(active) {
    var tabs = [["", "By lesson"], ["words", "All words"], ["rules", "Rules"], ["sentences", "Sentences"]];
    return '<div class="opts ltabs">' + tabs.map(function (t) {
      return '<button class="chip' + ((active || "") === t[0] ? " on" : "") + '" data-lt="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>";
  }
  function wireLessonTabs() {
    $$("[data-lt]").forEach(function (b) { b.onclick = function () {
      location.hash = b.dataset.lt ? "#lessons/" + b.dataset.lt : "#lessons";
    }; });
  }

  function renderAllWords() {
    var el = $("#content"); el.className = "dash wide";
    var Ls = state.lessons || [];
    var words = [];
    Ls.forEach(function (L) { (L.vocab || []).forEach(function (v) { words.push({ code: L.code, v: v }); }); });
    var tagCount = {};
    words.forEach(function (w) { (w.v.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
    var tags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).slice(0, 8);
    if (lessonsFilter.tag && tags.indexOf(lessonsFilter.tag) === -1) lessonsFilter.tag = "";

    var h = "<h1>Every word so far</h1>" +
      '<div class="lede">' + words.length + " words from " + Ls.length + " lessons — search, or tap a tag.</div>" +
      lessonTabs("words");
    h += '<div class="card">';
    h += '<input class="lfilter" id="wq" placeholder="Find a word — English, Hindi or notes…" autocomplete="off" spellcheck="false">';
    h += '<div class="opts" style="margin-bottom:6px"><button class="chip' + (lessonsFilter.tag ? "" : " on") + '" data-tag="">all</button>' +
      tags.map(function (t) {
        return '<button class="chip' + (lessonsFilter.tag === t ? " on" : "") + '" data-tag="' + esc(t) + '">' +
               esc(t) + ' <span style="opacity:.6">' + tagCount[t] + "</span></button>";
      }).join("") + "</div>";
    h += '<div class="tablewrap"><table class="ltable"><tr><th></th><th>English</th><th>Hindi</th><th></th><th>Notes</th></tr>' +
         '<tbody id="wrows"></tbody></table></div></div>';
    el.innerHTML = h;
    wireLessonTabs();

    function rows() {
      var q = lessonsFilter.q.toLowerCase().trim(), tag = lessonsFilter.tag;
      var out = words.filter(function (w) {
        if (tag && (w.v.tags || []).indexOf(tag) === -1) return false;
        if (!q) return true;
        return (w.v.en + " " + w.v.rom + " " + (w.v.note || "")).toLowerCase().indexOf(q) !== -1;
      }).map(function (w) {
        return '<tr><td class="mut">' + esc(w.code) + "</td><td>" + esc(w.v.en) + '</td><td class="hi">' + esc(w.v.rom) +
               '</td><td class="dv">' + esc(w.v.dev || "") + '</td><td class="mut">' + esc(w.v.note || "") + "</td></tr>";
      }).join("");
      return out || '<tr><td colspan="5" class="mut">Nothing matches that.</td></tr>';
    }
    var wrows = $("#wrows");
    wrows.innerHTML = rows();
    var wq = $("#wq");
    wq.value = lessonsFilter.q;
    wq.oninput = function () { lessonsFilter.q = wq.value; wrows.innerHTML = rows(); };
    $$("[data-tag]").forEach(function (b) { b.onclick = function () {
      lessonsFilter.tag = b.dataset.tag;
      $$("[data-tag]").forEach(function (x) { x.classList.toggle("on", x === b); });
      wrows.innerHTML = rows();
    }; });
    document.title = "Every word · Delhi Hindi";
  }

  function renderAllRules() {
    var el = $("#content"); el.className = "dash wide";
    var Ls = state.lessons || [];
    var h = "<h1>The rules so far</h1>" +
      '<div class="lede">Every pattern, grid and watch-out, in the order you learned them.</div>' +
      lessonTabs("rules");
    Ls.forEach(function (L) {
      h += '<div class="card"><h2>' + esc(L.title) + "</h2>";
      if (L.pattern) {
        if (L.pattern.template) h += '<div class="formula">' + esc(L.pattern.template) + "</div>";
        if (L.pattern.notes && L.pattern.notes.length) {
          h += '<ul class="asklist">' + L.pattern.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
        }
      }
      (L.grids || []).forEach(function (g) {
        h += '<div class="sub" style="margin-top:12px"><b>' + esc(g.title) + '</b></div><div class="tablewrap"><table class="ltable"><tr>' +
             g.headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr>" +
             g.rows.map(function (row) {
               return "<tr>" + row.map(function (cell) { return "<td>" + esc(cell) + "</td>"; }).join("") + "</tr>";
             }).join("") + "</table></div>";
      });
      if (L.watch_out && L.watch_out.length) {
        h += '<div class="sub" style="margin-top:12px"><b>Watch out</b></div><ul class="asklist">' +
             L.watch_out.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
      }
      h += '<div style="margin-top:10px"><a href="#lessons/' + esc(L.code) + '">Open ' + esc(L.code) + " →</a></div></div>";
    });
    if (!Ls.length) h += '<div class="card"><p>No lessons yet.</p></div>';
    el.innerHTML = h;
    wireLessonTabs();
    document.title = "Rules · Delhi Hindi";
  }

  function renderAllSentences() {
    var el = $("#content"); el.className = "dash wide";
    var Ls = state.lessons || [];
    var n = 0;
    var h = "";
    var rows = "";
    Ls.forEach(function (L) {
      (L.sentences || []).forEach(function (s) {
        n++;
        rows += '<tr><td class="mut">' + esc(L.code) + "</td><td>" + esc(s.en) +
          (s.confirmed === false ? ' <span class="warn">unconfirmed</span>' : "") +
          '</td><td class="hi">' + esc(s.rom) + (s.note ? '<div class="mut">' + esc(s.note) + "</div>" : "") + "</td></tr>";
      });
    });
    h += "<h1>Every sentence</h1>" +
      '<div class="lede">' + n + " sentences from class, oldest first. Unconfirmed ones stay out of graded drills.</div>" +
      lessonTabs("sentences");
    h += '<div class="card"><div class="tablewrap"><table class="ltable"><tr><th></th><th>English</th><th>Hindi</th></tr>' +
         rows + "</table></div></div>";
    if (!n) h += '<div class="card"><p>No lessons yet.</p></div>';
    el.innerHTML = h;
    wireLessonTabs();
    document.title = "Every sentence · Delhi Hindi";
  }

  function renderLessons(sub) {
    if (sub === "words") return renderAllWords();
    if (sub === "rules") return renderAllRules();
    if (sub === "sentences") return renderAllSentences();
    var el = $("#content"); el.className = "dash wide";
    var Ls = state.lessons || [];
    var h = "<h1>My Lessons</h1>" +
      '<div class="lede">Everything your teacher has covered, straight from your notebook. Drill it here; use Read for the deep dives.</div>' +
      lessonTabs("");
    if (!Ls.length) {
      h += '<div class="card"><p>No lessons yet. After class, photo your notebook pages into the Hindi Learning project and say "new lesson" — they land here with the next update.</p></div>';
      el.innerHTML = h;
      wireLessonTabs();
      document.title = "My Lessons · Delhi Hindi";
      return;
    }
    var words = 0, sents = 0, chall = 0;
    Ls.forEach(function (L) { words += L.counts.words; sents += L.counts.sentences; chall += L.counts.challenges; });
    h += '<div class="lstats"><span>' + Ls.length + " lessons · " + words + " words · " + sents + " sentences" +
         (chall ? " · " + chall + " waiting on your teacher" : "") + "</span>" +
         '<button class="btn" id="drillAll" style="width:auto;padding:10px 18px;margin-left:auto">Drill everything</button></div>';
    h += '<div class="lcards">';
    Ls.forEach(function (L) {
      h += '<a class="lcard" href="#lessons/' + esc(L.code) + '">' +
        '<div class="lk">' + esc(L.code) + (L.date ? " · " + esc(L.date) : "") + "</div>" +
        '<div class="lt">' + esc(L.title) + "</div>" +
        '<div class="ld">' + esc(L.topic) + "</div>" +
        '<div class="lc">' + L.counts.words + " words · " + L.counts.sentences + " sentences" +
        (L.counts.challenges ? ' · <span class="warn">' + L.counts.challenges + " unconfirmed</span>" : "") + "</div></a>";
    });
    h += "</div>";
    var asks = [];
    Ls.forEach(function (L) { (L.ask_next_time || []).forEach(function (a) { asks.push({ code: L.code, text: a }); }); });
    if (asks.length) {
      h += '<div class="card flagbox"><h2>Bring to your teacher</h2><div class="sub">Open questions from every lesson — glance at this before class.</div><ul class="asklist">';
      asks.forEach(function (a) { h += '<li><span class="lk">' + esc(a.code) + "</span> " + esc(a.text) + "</li>"; });
      h += "</ul></div>";
    }
    el.innerHTML = h;
    wireLessonTabs();
    var da = $("#drillAll");
    if (da) da.onclick = function () { drillLesson(Ls.map(function (L) { return L.code; })); };
    document.title = "My Lessons · Delhi Hindi";
  }

  function renderLesson(code) {
    var L = lessonByCode(code);
    if (!L) return renderLessons();
    var el = $("#content"); el.className = "dash wide";
    var h = '<div class="lback"><a href="#lessons">← All lessons</a></div>';
    h += "<h1>" + esc(L.title) + "</h1>" + (L.topic ? '<div class="lede">' + esc(L.topic) + "</div>" : "");
    h += '<div class="lstats"><span>' + L.counts.words + " words · " + L.counts.sentences + " sentences" +
         (L.counts.challenges ? " · " + L.counts.challenges + " unconfirmed" : "") + "</span>" +
         '<button class="btn" id="drillOne" style="width:auto;padding:10px 18px;margin-left:auto">Drill this lesson</button></div>';
    if (L.pattern) {
      h += '<div class="card"><h2>' + esc(L.pattern.name || "The pattern") + "</h2>" +
           (L.pattern.template ? '<div class="formula">' + esc(L.pattern.template) + "</div>" : "");
      if (L.pattern.notes && L.pattern.notes.length) {
        h += '<ul class="asklist">' + L.pattern.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      }
      h += "</div>";
    }
    (L.grids || []).forEach(function (g) {
      h += '<div class="card"><h2>' + esc(g.title) + '</h2><div class="tablewrap"><table class="ltable"><tr>' +
           g.headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr>" +
           g.rows.map(function (row) {
             return "<tr>" + row.map(function (cell) { return "<td>" + esc(cell) + "</td>"; }).join("") + "</tr>";
           }).join("") + "</table></div></div>";
    });
    if (L.vocab && L.vocab.length) {
      h += '<div class="card"><h2>Words</h2><div class="tablewrap"><table class="ltable"><tr><th>English</th><th>Hindi</th><th></th><th>Notes</th></tr>';
      L.vocab.forEach(function (v) {
        h += "<tr><td>" + esc(v.en) + '</td><td class="hi">' + esc(v.rom) + '</td><td class="dv">' + esc(v.dev || "") +
             '</td><td class="mut">' + esc(v.note || "") + "</td></tr>";
      });
      h += "</table></div></div>";
    }
    if (L.sentences && L.sentences.length) {
      h += '<div class="card"><h2>Sentences from class</h2><div class="tablewrap"><table class="ltable"><tr><th>English</th><th>Hindi</th></tr>';
      L.sentences.forEach(function (s) {
        h += "<tr><td>" + esc(s.en) + (s.confirmed === false ? ' <span class="warn">unconfirmed</span>' : "") +
             '</td><td class="hi">' + esc(s.rom) + (s.note ? '<div class="mut">' + esc(s.note) + "</div>" : "") + "</td></tr>";
      });
      h += "</table></div></div>";
    }
    if (L.watch_out && L.watch_out.length) {
      h += '<div class="card"><h2>Watch out</h2><ul class="asklist">' +
           L.watch_out.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>";
    }
    if (L.ask_next_time && L.ask_next_time.length) {
      h += '<div class="card flagbox"><h2>Ask next time</h2><ul class="asklist">' +
           L.ask_next_time.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></div>";
    }
    el.innerHTML = h;
    $("#drillOne").onclick = function () { drillLesson([L.code]); };
    document.title = L.title + " · Delhi Hindi";
  }

  // ---------------------------------------------------------------- router
  function setView(v) {
    state.view = v;
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t.dataset.view === v); });
  }

  function route() {
    var hash = location.hash.slice(1) || "dash";
    var parts = hash.split("/");
    if (parts[0] === "read") {
      setView("read");
      if (parts[1]) renderRead(parts[1]); else renderHome();
    } else if (parts[0] === "lessons") {
      setView("lessons");
      if (parts[1] === "words" || parts[1] === "rules" || parts[1] === "sentences") renderLessons(parts[1]);
      else if (parts[1]) renderLesson(parts[1]);
      else renderLessons();
    } else if (parts[0] === "quiz") {
      setView("quiz");
      if (!state.quiz) renderQuizSetup();
      else {
        // Coming back mid-quiz: a shown verdict was already recorded, so resume
        // on the next question rather than re-asking (and re-grading) this one.
        if (state.quiz.phase === "verdict") state.quiz.i++;
        renderQuestion();
      }
    } else {
      setView("dash");
      api("/api/stats?tz=" + TZ).then(function (s) { state.stats = s; renderDash(); });
    }
    $("#main").scrollTop = 0;
    document.body.classList.remove("navopen");
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    $("#app").classList.add("show");
    $("#whoami").textContent = state.user.name;
    applyDevPref();
    Promise.all([
      api("/api/content"),
      api("/api/progress"),
      api("/api/lessons").catch(function () { return { lessons: [] }; }),
    ]).then(function (r) {
      state.content = r[0]; state.progress = r[1]; state.lessons = r[2].lessons || [];
      buildFlat(); buildNav(); route();
    });
  }

  // prefs
  var prefs = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  var theme = prefs.get("dh_theme", null) ||
    (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  $("#themebtn").textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
  var dev = prefs.get("dh_dev", 1.14);
  document.documentElement.style.setProperty("--devsize", dev + "em");
  if (prefs.get("dh_hidekeys", false)) { document.body.classList.add("hidekeys"); $("#keybtn").classList.add("on"); }

  $("#themebtn").onclick = function () {
    var t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t; prefs.set("dh_theme", t);
    this.textContent = t === "dark" ? "☀ Light" : "☾ Dark";
    if (state.view === "dash" && state.stats) renderDash();
  };
  $("#keybtn").onclick = function () {
    var on = document.body.classList.toggle("hidekeys");
    this.classList.toggle("on", on); prefs.set("dh_hidekeys", on);
  };
  $("#devbtn").onclick = function () {
    dev = dev >= 1.7 ? 0.98 : Math.round((dev + 0.18) * 100) / 100;
    document.documentElement.style.setProperty("--devsize", dev + "em"); prefs.set("dh_dev", dev);
  };
  $("#outbtn").onclick = function () {
    post("/api/auth/logout").then(function () { location.reload(); });
  };
  $("#menubtn").onclick = function () { document.body.classList.toggle("navopen"); };
  $("#scrim").onclick = function () { document.body.classList.remove("navopen"); };
  $("#brand").onclick = function () { location.hash = "#read"; };
  $$(".tab").forEach(function (t) { t.onclick = function () { location.hash = "#" + t.dataset.view; }; });

  var qEl = $("#q"), qTimer = null;
  qEl.addEventListener("input", function () {
    clearTimeout(qTimer); var v = this.value;
    qTimer = setTimeout(function () {
      var box = $("#results"), nav = $("#nav");
      if (v.trim().length < 2) { box.classList.remove("show"); nav.style.display = ""; return; }
      var r = search(v);
      box.classList.add("show"); nav.style.display = "none";
      box.innerHTML = r.length
        ? '<div class="rescount">' + r.length + " chapter" + (r.length > 1 ? "s" : "") + "</div>" +
          r.map(function (x) {
            return '<a class="res" href="#read/' + x.c.id + '"><div class="rt">' + esc(x.c.bookKey) + " · " + esc(x.c.title) +
                   "</div>" + x.snips.map(function (s) { return '<div class="rs">' + s + "</div>"; }).join("") + "</a>";
          }).join("")
        : '<div class="rescount">No matches for “' + esc(v) + '”</div>';
    }, 130);
  });
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { this.value = ""; $("#results").classList.remove("show"); $("#nav").style.display = ""; this.blur(); }
    if (e.key === "Enter") { var f = $("#results .res"); if (f) f.click(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && ["INPUT", "TEXTAREA"].indexOf(document.activeElement.tagName) === -1) {
      e.preventDefault(); qEl.focus(); qEl.select();
    }
    if (state.view !== "read" || !state.chapter) return;
    if (["INPUT", "TEXTAREA"].indexOf(document.activeElement.tagName) >= 0) return;
    var i = state.flat.findIndex(function (c) { return c.id === state.chapter; });
    if (e.key === "ArrowRight" && state.flat[i + 1]) location.hash = "#read/" + state.flat[i + 1].id;
    if (e.key === "ArrowLeft" && state.flat[i - 1]) location.hash = "#read/" + state.flat[i - 1].id;
  });

  var saveT = null, pending = {};
  document.addEventListener("input", function (e) {
    if (!e.target.classList || !e.target.classList.contains("writeline")) return;
    pending[e.target.dataset.k] = e.target.value;
    state.progress.answers[e.target.dataset.k] = e.target.value;
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      Object.keys(pending).forEach(function (k) { post("/api/progress/answer", { key: k, value: pending[k] }).catch(function () {}); });
      pending = {};
    }, 700);
  });
  document.addEventListener("click", function (e) {
    var cb = e.target.closest ? e.target.closest(".checkbox") : null;
    if (cb && cb.dataset.k) {
      var on = cb.classList.toggle("done");
      state.progress.checks[cb.dataset.k] = on;
      post("/api/progress/check", { key: cb.dataset.k, on: on }).catch(function () {});
      return;
    }
    var key = e.target.closest ? e.target.closest("body.hidekeys ol.key") : null;
    if (key) key.classList.toggle("reveal");
  });

  window.addEventListener("hashchange", route);

  // go
  api("/api/auth/me").then(function (r) {
    if (r.user) { state.user = r.user; boot(); }
    else showGate(r.policy);
  }).catch(function () { showGate({ allowed: true, first: false }); });
})();
