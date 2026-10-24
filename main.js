(function () {
  'use strict';

  var html = document.documentElement;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cl(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ---------- Cards rise in once as they scroll into view ---------- */

  function setupReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('.reveal');
    // Hide first without a transition, then turn transitions on, so nothing fades out on load.
    html.classList.add('reveal-init');
    void html.offsetHeight;
    html.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Hero: the marionette and the scroll fade ---------- */

  // 2D affine matrices as [a, b, c, d, e, f], the same order as CSS matrix().
  function mul(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function rot(c, t) {
    var co = Math.cos(t), si = Math.sin(t);
    return [co, si, -si, co, c[0] - co * c[0] + si * c[1], c[1] - si * c[0] - co * c[1]];
  }
  function ap(M, p) { return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]; }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function ang(p, c) { return Math.atan2(p[1] - c[1], p[0] - c[0]); }
  function cssMatrix(m) { return 'matrix(' + m.map(function (n) { return +n.toFixed(5); }).join(',') + ')'; }

  // Where the puppet sits on the 1920×1080 photo.
  var k = 0.7137428543105442;
  var G = [k, 0, 0, k, 954.1754287413673, 356.0380001982619];
  // Part image offsets, in puppet source pixels.
  var PT = { skirt: [91, 375], torso: [148, 214], faL: [87, 363], faR: [219, 363], uaL: [87, 228], uaR: [275, 228], head: [141, 69] };
  // Joints and string eyelets, in puppet source pixels.
  var J = {
    W: [214, 392], N: [213, 240], C: [212, 72],
    SL: [141, 237], SR: [296, 237],
    JL: [128, 264], JR: [300, 264],
    EL: [110, 377], ER: [318, 377],
    HL: [156, 440], HR: [277, 444],
    KL: [158, 566], KR: [269, 566]
  };

  function setupHero(hero) {
    var main = document.getElementById('top');
    var bg = hero.querySelector('.hero-bg');
    var stage = hero.querySelector('.stage');
    var grip = hero.querySelector('.grip');
    var copy = hero.querySelector('.hero-copy');
    var dim = hero.querySelector('.hero-dim');
    var parts = {};
    hero.querySelectorAll('[data-part]').forEach(function (el) { parts[el.getAttribute('data-part')] = el; });

    function zero() { return { tau: 0, hd: 0, a1L: 0, a2L: 0, a1R: 0, a2R: 0 }; }
    var q = zero(), v = zero(), tg = zero(), drv = {};
    var view = { W: 1440, H: 900 };
    var L = layout();
    var active = null, hover = null, raf = 0, last = 0;
    var progress = -1, scrollRaf = 0;

    var strings = [
      { id: 'crown', part: 'head', p: J.C, dx: -10, m: [12, -170], d1: 6, d2: 30 },
      { id: 'shL', part: 'torso', p: J.SL, dx: -55, m: [-55, -150], d1: 10, d2: 40 },
      { id: 'shR', part: 'torso', p: J.SR, dx: 60, m: [60, -140], d1: 10, d2: 40 },
      { id: 'hL', part: 'faL', p: J.HL, dx: -95, m: [-50, 95], d1: 22, d2: 20 },
      { id: 'hR', part: 'faR', p: J.HR, dx: 120, m: [55, 110], d1: 22, d2: 20 },
      { id: 'kL', part: 'skirt', p: J.KL, dx: -165, m: [-45, 140], d1: 8, d2: 20 },
      { id: 'kR', part: 'skirt', p: J.KR, dx: 175, m: [50, 135], d1: 8, d2: 20 }
    ];

    strings.forEach(function (s) {
      var a = ap(G, s.p);
      s.U = [a[0] + s.dx, -30];          // ceiling anchor
      s.M = [a[0] + s.m[0], a[1] + s.m[1]]; // grip / sag point
      s.vM = [0, 0];
      s.h = 0;                            // how taut the string is while held (0..1)
      s.lit = false;
      s.line = hero.querySelector('[data-string="' + s.id + '"]');
      s.hit = hero.querySelector('[data-hit="' + s.id + '"]');
      if (!s.hit) return;
      s.hit.addEventListener('pointerdown', function (e) { onDown(s, e); });
      // Browsers ignore touch-action on SVG shapes, so stop a touch that starts on a string from scrolling the page.
      s.hit.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
      s.hit.addEventListener('pointerenter', function () { hover = s.id; render(); });
      s.hit.addEventListener('pointerleave', function () { if (hover === s.id) { hover = null; render(); } });
    });

    hero.addEventListener('pointermove', function (e) {
      if (!active) return;
      active.ptr = toCanvas(e);
      kick();
    });
    hero.addEventListener('pointerup', onUp);
    hero.addEventListener('pointercancel', onUp);

    function onUp(e) {
      if (!active) return;
      try { hero.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      active = null;
      hero.classList.remove('is-dragging');
      kick();
    }

    function onDown(s, e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var c = toCanvas(e);
      var M = mats();
      active = { s: s, start: c, ptr: c, A: ap(G, ap(M[s.part], s.p)) };
      try { hero.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      hero.classList.add('is-dragging');
      kick();
    }

    // Cover-fit the 1920×1080 scene; on narrow screens slide the crop so the puppet sits clear of the headline.
    function layout() {
      var W = view.W, H = view.H;
      var s = Math.max(W / 1920, H / 1080);
      var frac = 0.58 + 0.16 * cl((1200 - W) / 500, 0, 1);
      var x = cl(W * frac - 1108 * s, W - 1920 * s, 0);
      return { s: s, x: x, y: (H - 1080 * s) * 0.5 };
    }

    function applyLayout() {
      L = layout();
      bg.style.objectPosition = L.x.toFixed(2) + 'px ' + L.y.toFixed(2) + 'px';
      stage.style.transform = 'translate(' + L.x.toFixed(2) + 'px, ' + L.y.toFixed(2) + 'px) scale(' + L.s.toFixed(5) + ')';
      stage.style.visibility = 'visible';
    }

    function measure() {
      var W = hero.clientWidth, H = hero.clientHeight;
      if (W && H && (W !== view.W || H !== view.H || stage.style.visibility !== 'visible')) {
        view = { W: W, H: H };
        applyLayout();
        onScroll();
      }
    }

    function toCanvas(e) {
      var r = hero.getBoundingClientRect();
      return [(e.clientX - r.left - L.x) / L.s, (e.clientY - r.top - L.y) / L.s];
    }

    function toSrc(c) { return [(c[0] - G[4]) / G[0], (c[1] - G[5]) / G[3]]; }

    function kick() {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function tick(now) {
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      var n = Math.max(1, Math.ceil(dt * 240));
      for (var i = 0; i < n; i++) step(dt / n);
      render();
      raf = (active || !settled()) ? requestAnimationFrame(tick) : 0;
    }

    function mats() {
      var Mt = rot(J.W, q.tau);
      var MuL = mul(Mt, rot(J.JL, q.a1L));
      var MuR = mul(Mt, rot(J.JR, q.a1R));
      return {
        skirt: [1, 0, 0, 1, 0, 0],
        torso: Mt,
        head: mul(Mt, rot(J.N, q.hd)),
        uaL: MuL, faL: mul(MuL, rot(J.EL, q.a2L)),
        uaR: MuR, faR: mul(MuR, rot(J.ER, q.a2R))
      };
    }

    // Two-bone reach: shoulder -> elbow -> wrist ring toward T (source px).
    function ik(T, Jp, E, H) {
      var j = ap(rot(J.W, q.tau), Jp);
      var L1 = Math.hypot(E[0] - Jp[0], E[1] - Jp[1]), L2 = Math.hypot(H[0] - E[0], H[1] - E[1]);
      var t10 = ang(E, Jp), t20 = ang(H, E), p0 = ang(H, Jp);
      var sg = wrap(t10 - p0) >= 0 ? 1 : -1;
      var vx = T[0] - j[0], vy = T[1] - j[1];
      var d = cl(Math.hypot(vx, vy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
      var phi = Math.atan2(vy, vx);
      var al = Math.acos(cl((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      var t1 = phi + sg * al;
      var e = [j[0] + L1 * Math.cos(t1), j[1] + L1 * Math.sin(t1)];
      var h = [j[0] + d * Math.cos(phi), j[1] + d * Math.sin(phi)];
      var t2 = ang(h, e);
      var r1 = wrap(t1 - t10), r2 = wrap(t2 - t20);
      // Wooden elbows only fold so far.
      return [wrap(r1 - q.tau), cl(wrap(r2 - r1), -1.75, 1.75)];
    }

    function targets() {
      var tau = 0, hd = null, Lr = null, Rr = null;
      drv = {};
      if (active) {
        var T = toSrc([active.A[0] + active.ptr[0] - active.start[0], active.A[1] + active.ptr[1] - active.start[1]]);
        var id = active.s.id;
        if (id === 'crown') {
          var Nw = ap(rot(J.W, q.tau), J.N);
          var raw = wrap(ang(T, Nw) - ang(J.C, J.N));
          tau = cl(raw * 0.3, -0.22, 0.22);
          hd = cl(raw - tau, -0.5, 0.5);
          drv.tau = drv.hd = true;
        } else if (id === 'shL' || id === 'shR') {
          var S = id === 'shL' ? J.SL : J.SR;
          // Sideways drag swings the shoulder round the waist; lifting a shoulder tips the body toward the other side.
          var side = id === 'shL' ? 1 : -1;
          var lift = (S[1] - T[1]) * 0.002 * side;
          tau = cl(wrap(ang(T, J.W) - ang(S, J.W)) + lift, -0.34, 0.34);
          drv.tau = true;
        } else if (id === 'hL') { Lr = ik(T, J.JL, J.EL, J.HL); drv.a1L = drv.a2L = true; }
        else if (id === 'hR') { Rr = ik(T, J.JR, J.ER, J.HR); drv.a1R = drv.a2R = true; }
      }
      tg.tau = tau;
      tg.hd = hd === null ? -0.3 * q.tau : hd;
      if (Lr) { tg.a1L = Lr[0]; tg.a2L = Lr[1]; } else { tg.a1L = -0.85 * q.tau; tg.a2L = 0.12 * q.tau; }
      if (Rr) { tg.a1R = Rr[0]; tg.a2R = Rr[1]; } else { tg.a1R = -0.85 * q.tau; tg.a2R = 0.12 * q.tau; }
    }

    // Damped springs pull every joint toward its target; driven joints are stiffer.
    function step(dt) {
      targets();
      for (var key in q) {
        var K = drv[key] ? 150 : 52, C = drv[key] ? 20 : 6.2;
        var t = q[key] + wrap(tg[key] - q[key]);
        v[key] += (K * (t - q[key]) - C * v[key]) * dt;
        q[key] += v[key] * dt;
      }
      var M = mats();
      for (var i = 0; i < strings.length; i++) {
        var s = strings[i];
        var A = ap(G, ap(M[s.part], s.p));
        if (active && active.s === s) {
          s.M = [active.ptr[0], active.ptr[1]];
          s.vM = [0, 0];
          s.h += (1 - s.h) * Math.min(1, dt * 16);
        } else {
          var goal = [A[0] + s.m[0], A[1] + s.m[1]];
          for (var c = 0; c < 2; c++) {
            s.vM[c] += (70 * (goal[c] - s.M[c]) - 7 * s.vM[c]) * dt;
            s.M[c] += s.vM[c] * dt;
          }
          s.h += (0 - s.h) * Math.min(1, dt * 6);
        }
      }
    }

    function settled() {
      for (var key in q) if (Math.abs(v[key]) > 0.003 || Math.abs(q[key] - tg[key]) > 0.002) return false;
      var M = mats();
      for (var i = 0; i < strings.length; i++) {
        var s = strings[i];
        var A = ap(G, ap(M[s.part], s.p));
        if (Math.abs(s.vM[0]) + Math.abs(s.vM[1]) > 0.5) return false;
        if (Math.abs(s.M[0] - A[0] - s.m[0]) + Math.abs(s.M[1] - A[1] - s.m[1]) > 0.5) return false;
        if (s.h > 0.01) return false;
      }
      return true;
    }

    // A string runs eyelet A -> grip/sag point M -> ceiling anchor U, and pulls straighter while held.
    function path(s, A) {
      var M = s.M, U = s.U, h = s.h;
      var f = function (n) { return n.toFixed(1); };
      var tx = (U[0] - A[0]) * 0.1 * (1 - h), ty = (U[1] - A[1]) * 0.1 * (1 - h);
      var d1 = s.d1 * (1 - h) + 2 * h, d2 = s.d2 * (1 - h) + 38 * h;
      var c1 = [A[0] + (M[0] - A[0]) * 0.33, A[1] + (M[1] - A[1]) * 0.33 + d1];
      var c2 = [M[0] - tx, M[1] - ty + d1 * 0.6];
      var c3 = [M[0] + tx, M[1] + ty + d2 * 0.5];
      var c4 = [U[0] + (M[0] - U[0]) * 0.33, U[1] + (M[1] - U[1]) * 0.33 + d2];
      return 'M' + f(A[0]) + ' ' + f(A[1]) + 'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(M[0]) + ' ' + f(M[1]) +
        'C' + f(c3[0]) + ' ' + f(c3[1]) + ' ' + f(c4[0]) + ' ' + f(c4[1]) + ' ' + f(U[0]) + ' ' + f(U[1]);
    }

    function render() {
      var M = mats();
      for (var key in PT) {
        var o = PT[key];
        parts[key].style.transform = cssMatrix(mul(M[key], [1, 0, 0, 1, o[0], o[1]]));
      }
      strings.forEach(function (s) {
        var d = path(s, ap(G, ap(M[s.part], s.p)));
        s.line.setAttribute('d', d);
        if (!s.hit) return;
        s.hit.setAttribute('d', d);
        var lit = active ? active.s === s : hover === s.id;
        if (lit !== s.lit) { s.lit = lit; s.line.classList.toggle('is-lit', lit); }
      });
      if (active) {
        grip.setAttribute('cx', active.ptr[0].toFixed(1));
        grip.setAttribute('cy', active.ptr[1].toFixed(1));
        grip.style.opacity = '1';
      } else {
        grip.style.opacity = '0';
      }
    }

    // As the work panel slides up over the hero, the hero dims and its copy lifts away.
    function onScroll() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        var p = cl(-main.getBoundingClientRect().top / Math.max(1, view.H), 0, 1);
        if (Math.abs(p - progress) <= 0.002) return;
        progress = p;
        dim.style.opacity = (p * 0.72).toFixed(3);
        copy.style.transform = 'translate3d(0, ' + (-p * 90).toFixed(1) + 'px, 0)';
        copy.style.opacity = Math.max(0, 1 - p * 1.4).toFixed(3);
      });
    }

    render();
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(hero);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  setupReveal();
  var hero = document.querySelector('.hero');
  if (hero) setupHero(hero);
})();
