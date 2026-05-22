/* ============================================================
   AQS Splash Screen — Loader / Intro Animation
   © Darapet Technology / XZILY AI System
============================================================ */
(function () {
    'use strict';

    var cfg = window.AQS_SPLASH || {};

    /* Guard: disabled or already shown this session */
    if (!cfg.enabled || cfg.enabled === '0') return;
    if (cfg.once === '1' && sessionStorage.getItem('aqs_splash_shown')) return;

    var template  = parseInt(cfg.template  || '1', 10);
    var appName   = cfg.app_name   || 'XZILY AI';
    var tagline   = cfg.tagline    || 'Powered by Darapet Technology';
    var logoUrl   = cfg.logo_url   || '';
    var primary   = cfg.color_primary || '#6366f1';
    var bgColor   = cfg.color_bg     || '';
    var textColor = cfg.color_text   || '';
    var duration  = parseFloat(cfg.duration || '3');
    var sound     = cfg.sound !== '0';
    var musicUrl  = cfg.music_url || '';

    /* Clamp duration */
    if (duration < 1.5) duration = 1.5;
    if (duration > 10)  duration = 10;

    /* ── Default bg colours per template ── */
    var defaultBg = {
        1: '#ffffff', 2: '#050816', 3: '#4f46e5',
        4: '#0d0d0d', 5: '#f8fafc', 6: '#ffffff',
        7: '#0a0a0a', 8: '#0f172a', 9: '#0a0800',
        10: '#0c4a6e'
    };
    var defaultText = {
        1:'#1e293b',2:'#ffffff',3:'#ffffff',
        4:'#ffffff',5:'#1e293b',6:'#1e293b',
        7:'#ffffff',8:'#ffffff',9:'#ffd700',10:'#ffffff'
    };
    if (!bgColor)   bgColor   = defaultBg[template]   || '#ffffff';
    if (!textColor) textColor = defaultText[template]  || '#1e293b';

    /* ── Neon default primary per template ── */
    if (!primary || primary === '#6366f1') {
        var tPrimary = {4:'#00f5ff', 7:'#39ff14', 9:'#ffd700'};
        if (tPrimary[template]) primary = tPrimary[template];
    }

    /* ── Build logo HTML ── */
    var logoHtml = logoUrl
        ? '<img src="' + logoUrl + '" alt="' + escH(appName) + '" />'
        : '<div class="aqs-splash-icon-default">⬡</div>';

    /* ── Build orbit rings for template 8 ── */
    var orbitHtml = (template === 8)
        ? '<div class="aqs-t8-orbit-wrap">'
            + '<div class="aqs-t8-orbit aqs-t8-orbit-1"></div>'
            + '<div class="aqs-t8-orbit aqs-t8-orbit-2"></div>'
            + '<div class="aqs-t8-orbit aqs-t8-orbit-3"></div>'
            + logoHtml
          + '</div>'
        : '<div class="aqs-splash-logo-wrap">' + logoHtml + '</div>';

    /* ── Extra ripple div for template 10 ── */
    var rippleHtml = (template === 10) ? '<div class="aqs-t10-extra-ripple"></div>' : '';

    /* ── Build the splash element ── */
    var el = document.createElement('div');
    el.id        = 'aqs-splash';
    el.className = 'aqs-t' + template;
    el.setAttribute('style',
        '--sp-primary:' + primary + ';' +
        '--sp-bg:'      + bgColor   + ';' +
        '--sp-text:'    + textColor + ';' +
        '--aqs-splash-dur:' + duration + 's;'
    );
    el.innerHTML =
        rippleHtml +
        '<canvas id="aqs-splash-canvas"></canvas>' +
        '<div class="aqs-splash-content">' +
            orbitHtml +
            '<div class="aqs-splash-name" data-text="' + escH(appName) + '">' + escH(appName) + '</div>' +
            '<div class="aqs-splash-tagline">' + escH(tagline) + '</div>' +
            '<div class="aqs-splash-bar-wrap"><div class="aqs-splash-bar-fill"></div></div>' +
        '</div>';

    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(el);

    /* ── Canvas effects (stars for t2, particles for t6, matrix for t7) ── */
    setTimeout(function () { initCanvas(template, el, primary, bgColor); }, 50);

    /* ── Sound ── */
    if (sound) {
        setTimeout(function () { playBootChime(primary, musicUrl); }, 150);
    }

    /* ── Dismiss after duration ── */
    setTimeout(function () { hideSplash(el); }, duration * 1000);

    /* ── Also dismiss on first tap/click (after min 1 s) ── */
    setTimeout(function () {
        el.addEventListener('click',      function () { hideSplash(el); }, { once: true });
        el.addEventListener('touchstart', function () { hideSplash(el); }, { once: true, passive: true });
    }, 1000);

    sessionStorage.setItem('aqs_splash_shown', '1');

    /* ======================================================
       HIDE SPLASH
    ====================================================== */
    function hideSplash(node) {
        if (!node || node._hiding) return;
        node._hiding = true;
        node.style.pointerEvents = 'none';
        node.classList.add('aqs-splash-hiding');
        setTimeout(function () {
            if (node.parentNode) node.parentNode.removeChild(node);
            document.documentElement.style.overflow = '';
        }, 700);
    }

    /* ======================================================
       CANVAS EFFECTS
    ====================================================== */
    function initCanvas(t, container, pri, bg) {
        var canvas = document.getElementById('aqs-splash-canvas');
        if (!canvas) return;
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (t === 2) drawStars(canvas, ctx);
        if (t === 6) drawParticles(canvas, ctx, pri);
        if (t === 7) drawMatrix(canvas, ctx, pri);
    }

    /* Stars for Cosmic template */
    function drawStars(canvas, ctx) {
        var stars = [];
        for (var i = 0; i < 180; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.5 + 0.3,
                a: Math.random(),
                da: (Math.random() - 0.5) * 0.008
            });
        }
        /* Shooting stars */
        var shoots = [];
        function addShoot() {
            shoots.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, vx: 6 + Math.random()*4, vy: 3 + Math.random()*2, life: 1 });
        }
        addShoot(); addShoot();

        function tick() {
            if (!document.getElementById('aqs-splash-canvas')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach(function (s) {
                s.a += s.da;
                if (s.a > 1) s.da = -Math.abs(s.da);
                if (s.a < 0) s.da =  Math.abs(s.da);
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(255,255,255,' + s.a + ')';
                ctx.fill();
            });
            shoots.forEach(function (sh, i) {
                ctx.beginPath();
                ctx.moveTo(sh.x, sh.y);
                ctx.lineTo(sh.x - sh.vx * 10, sh.y - sh.vy * 10);
                ctx.strokeStyle = 'rgba(255,255,255,' + sh.life + ')';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.018;
                if (sh.life <= 0) { shoots.splice(i, 1); addShoot(); }
            });
            requestAnimationFrame(tick);
        }
        tick();
    }

    /* Particles for Burst template */
    function drawParticles(canvas, ctx, pri) {
        var hsl = hexToHsl(pri);
        var particles = [];
        var cx = canvas.width / 2, cy = canvas.height / 2;
        for (var i = 0; i < 80; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 3 + Math.random() * 6;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: 3 + Math.random() * 5,
                color: 'hsl(' + (hsl[0] + Math.random()*60 - 30) + ',' + hsl[1] + '%,' + (40 + Math.random()*30) + '%)',
                life: 1,
                dl: 0.012 + Math.random() * 0.008
            });
        }
        function tick() {
            if (!document.getElementById('aqs-splash-canvas')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(function (p) {
                p.x += p.vx; p.y += p.vy;
                p.vy += 0.12;
                p.life -= p.dl;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color.replace('hsl', 'hsla').replace(')', ',' + p.life + ')');
                ctx.fill();
            });
            particles = particles.filter(function(p){ return p.life > 0; });
            if (particles.length > 0) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    /* Matrix rain for Glitch template */
    function drawMatrix(canvas, ctx, pri) {
        var cols = Math.floor(canvas.width / 18);
        var drops = Array.from({ length: cols }, function () { return Math.random() * -50; });
        var chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノABCDEF0123456789';
        function tick() {
            if (!document.getElementById('aqs-splash-canvas')) return;
            ctx.fillStyle = 'rgba(10,10,10,0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = pri || '#39ff14';
            ctx.font = '14px monospace';
            drops.forEach(function (y, i) {
                var ch = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(ch, i * 18, y * 18);
                if (y * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i] += 0.5;
            });
            requestAnimationFrame(tick);
        }
        tick();
    }

    /* ======================================================
       BOOT CHIME (Web Audio API)
    ====================================================== */
    function playBootChime(primary, musicUrl) {
        try {
            /* Play background music for the entire splash duration, then fade out */
            if (musicUrl) {
                var a = new Audio(musicUrl);
                a.volume = 0.45;
                a.loop = false;
                a.play().catch(function () {});
                /* Fade out 600ms before splash ends */
                var fadeStart = Math.max(0, (duration - 0.6)) * 1000;
                setTimeout(function () {
                    var steps = 12;
                    var stepTime = 50;
                    var vol = a.volume;
                    var dec = vol / steps;
                    var iv = setInterval(function () {
                        try {
                            a.volume = Math.max(0, a.volume - dec);
                            if (a.volume <= 0) { clearInterval(iv); a.pause(); a.currentTime = 0; }
                        } catch(e) { clearInterval(iv); }
                    }, stepTime);
                }, fadeStart);
                return;
            }
            /* Fallback: synthesised chime (C5 → E5 → G5) */
            var actx = new (window.AudioContext || window.webkitAudioContext)();
            var master = actx.createGain();
            master.gain.setValueAtTime(0, actx.currentTime);
            master.gain.linearRampToValueAtTime(0.22, actx.currentTime + 0.05);
            master.connect(actx.destination);

            [[523.25, 0], [659.25, 0.18], [783.99, 0.36]].forEach(function (pair) {
                var osc  = actx.createOscillator();
                var gain = actx.createGain();
                osc.type = 'sine';
                osc.frequency.value = pair[0];
                gain.gain.setValueAtTime(0.15, actx.currentTime + pair[1]);
                gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + pair[1] + 0.9);
                osc.connect(gain);
                gain.connect(master);
                osc.start(actx.currentTime + pair[1]);
                osc.stop(actx.currentTime + pair[1] + 1);
            });
        } catch (e) {}
    }

    /* ── Helpers ── */
    function escH(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function hexToHsl(hex) {
        var r=0,g=0,b=0;
        if (!hex) return [240,70,60];
        hex = hex.replace('#','');
        if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
        r=parseInt(hex.slice(0,2),16)/255;
        g=parseInt(hex.slice(2,4),16)/255;
        b=parseInt(hex.slice(4,6),16)/255;
        var max=Math.max(r,g,b),min=Math.min(r,g,b),h,s,l=(max+min)/2;
        if(max===min){h=s=0;}else{var d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}h/=6;}
        return [Math.round(h*360),Math.round(s*100),Math.round(l*100)];
    }
})();
