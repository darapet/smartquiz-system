/* aqs-otp.js — Email OTP verification via Firebase Cloud Functions + Brevo
   Drop-in for register.html. No Replit server needed — runs entirely on Firebase.
*/
(function () {
    'use strict';

    /* Firebase Functions base URL for project smartquiz-darapet */
    var FN = 'https://us-central1-smartquiz-darapet.cloudfunctions.net';

    var _otpVerifiedEmail = null;
    var _otpCooldown = false;
    var _resendTimer = null;

    function getEl(id) { return document.getElementById(id); }

    function showOtpAlert(msg, isError) {
        var el = getEl('aqs-otp-alert');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '8px';
        el.style.marginBottom = '12px';
        el.style.fontSize = '.9rem';
        if (isError) {
            el.style.background = 'rgba(239,68,68,0.12)';
            el.style.color = '#f87171';
            el.style.border = '1px solid rgba(239,68,68,0.25)';
        } else {
            el.style.background = 'rgba(34,197,94,0.12)';
            el.style.color = '#4ade80';
            el.style.border = '1px solid rgba(34,197,94,0.25)';
        }
    }

    function hideOtpAlert() {
        var el = getEl('aqs-otp-alert');
        if (el) el.style.display = 'none';
    }

    function startResendCountdown(seconds) {
        var btn = getEl('aqs-send-otp-btn');
        if (!btn) return;
        _otpCooldown = true;
        var remaining = seconds;
        btn.disabled = true;
        btn.textContent = 'Resend in ' + remaining + 's';
        clearInterval(_resendTimer);
        _resendTimer = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
                clearInterval(_resendTimer);
                _otpCooldown = false;
                btn.disabled = false;
                btn.textContent = 'Resend OTP';
            } else {
                btn.textContent = 'Resend in ' + remaining + 's';
            }
        }, 1000);
    }

    function sendOtp() {
        if (_otpCooldown) return;
        var emailInput = getEl('reg-email');
        if (!emailInput) return;
        var email = emailInput.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showOtpAlert('Please enter a valid email address first.', true);
            emailInput.focus();
            return;
        }

        hideOtpAlert();
        var btn = getEl('aqs-send-otp-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

        fetch(FN + '/sendOtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                showOtpAlert('Code sent! Check your inbox (and spam folder).', false);
                showOtpInput(email);
                startResendCountdown(60);
            } else {
                showOtpAlert(data.message || 'Failed to send code. Try again.', true);
                if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
            }
        })
        .catch(function () {
            showOtpAlert('Network error. Please check your connection.', true);
            if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
        });
    }

    function showOtpInput(email) {
        var wrap = getEl('aqs-otp-input-wrap');
        if (!wrap) return;
        wrap.style.display = 'block';
        wrap.style.animation = 'aqsOtpFadeIn .3s ease';
        wrap.setAttribute('data-email', email);
        var first = getEl('otp-d0');
        if (first) setTimeout(function () { first.focus(); }, 100);
    }

    function getEnteredOtp() {
        return ['otp-d0','otp-d1','otp-d2','otp-d3','otp-d4','otp-d5'].map(function (id) {
            var el = getEl(id);
            return el ? el.value : '';
        }).join('');
    }

    function verifyOtp() {
        var wrap = getEl('aqs-otp-input-wrap');
        var email = wrap ? wrap.getAttribute('data-email') : '';
        var otp = getEnteredOtp();

        if (otp.length < 6) {
            showOtpAlert('Please enter all 6 digits.', true);
            return;
        }

        var verifyBtn = getEl('aqs-verify-otp-btn');
        if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…'; }
        hideOtpAlert();

        fetch(FN + '/verifyOtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, otp: otp })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                _otpVerifiedEmail = email;
                try { sessionStorage.setItem('_aqs_otp_verified', email); } catch(e) {}
                showOtpAlert('Email verified!', false);
                showVerifiedState(email);
            } else {
                showOtpAlert(data.message || 'Invalid code. Try again.', true);
                if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'Verify Code'; }
                var box = getEl('aqs-otp-boxes');
                if (box) { box.style.animation = 'none'; box.offsetWidth; box.style.animation = 'aqsOtpShake .4s ease'; }
                ['otp-d0','otp-d1','otp-d2','otp-d3','otp-d4','otp-d5'].forEach(function (id) {
                    var el = getEl(id); if (el) el.value = '';
                });
                var first = getEl('otp-d0'); if (first) first.focus();
            }
        })
        .catch(function () {
            showOtpAlert('Network error. Please try again.', true);
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'Verify Code'; }
        });
    }

    function showVerifiedState(email) {
        var wrap = getEl('aqs-otp-input-wrap');
        if (wrap) wrap.style.display = 'none';

        var badge = getEl('aqs-email-verified-badge');
        if (badge) { badge.style.display = 'flex'; badge.style.animation = 'aqsOtpFadeIn .3s ease'; }

        var emailInput = getEl('reg-email');
        if (emailInput) { emailInput.value = email; emailInput.readOnly = true; emailInput.style.opacity = '0.7'; }

        var otpStep = getEl('aqs-otp-step');
        if (otpStep) { otpStep.style.opacity = '0.5'; otpStep.style.pointerEvents = 'none'; }

        var regForm = getEl('aqs-register-form-fields');
        if (regForm) { regForm.style.display = 'block'; regForm.style.animation = 'aqsOtpFadeIn .4s ease'; }

        var regSubmit = getEl('aqs-register-submit');
        if (regSubmit) regSubmit.disabled = false;
    }

    function setupOtpDigitInputs() {
        var ids = ['otp-d0','otp-d1','otp-d2','otp-d3','otp-d4','otp-d5'];
        ids.forEach(function (id, idx) {
            var el = getEl(id);
            if (!el) return;
            el.addEventListener('input', function () {
                var val = el.value.replace(/\D/g, '');
                el.value = val.slice(-1);
                if (val && idx < ids.length - 1) { var next = getEl(ids[idx + 1]); if (next) next.focus(); }
                if (getEnteredOtp().length === 6) setTimeout(verifyOtp, 120);
            });
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && !el.value && idx > 0) {
                    var prev = getEl(ids[idx - 1]); if (prev) { prev.value = ''; prev.focus(); }
                }
                if (e.key === 'Enter') verifyOtp();
            });
            el.addEventListener('paste', function (e) {
                e.preventDefault();
                var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                paste.split('').forEach(function (char, i) { var t = getEl(ids[i]); if (t) t.value = char; });
                var last = getEl(ids[Math.min(paste.length, ids.length - 1)]); if (last) last.focus();
                if (paste.length === 6) setTimeout(verifyOtp, 120);
            });
        });
    }

    function hookRegisterForm() {
        var form = document.getElementById('aqs-register-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            if (!_otpVerifiedEmail) {
                e.preventDefault();
                e.stopImmediatePropagation();
                showOtpAlert('Please verify your email before creating your account.', true);
                var otpStep = getEl('aqs-otp-step');
                if (otpStep) otpStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, true);
    }

    /* Called after successful Firebase registration — adds user to Brevo list */
    window._aqsOtpAddContact = function (email, name) {
        if (!email) return;
        fetch(FN + '/addContact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, name: name || '' })
        }).catch(function () { /* silent */ });
    };

    window._aqsGetVerifiedEmail = function () { return _otpVerifiedEmail; };

    document.addEventListener('DOMContentLoaded', function () {
        var sendBtn = getEl('aqs-send-otp-btn');
        if (sendBtn) sendBtn.addEventListener('click', sendOtp);

        var verifyBtn = getEl('aqs-verify-otp-btn');
        if (verifyBtn) verifyBtn.addEventListener('click', verifyOtp);

        setupOtpDigitInputs();
        hookRegisterForm();

        /* Restore verified state if user navigated away briefly */
        try {
            var saved = sessionStorage.getItem('_aqs_otp_verified');
            if (saved) { _otpVerifiedEmail = saved; showVerifiedState(saved); }
        } catch(e) {}
    });

    /* Keyframe animations */
    var style = document.createElement('style');
    style.textContent = '@keyframes aqsOtpFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}'
        + '@keyframes aqsOtpShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}';
    document.head.appendChild(style);
})();
