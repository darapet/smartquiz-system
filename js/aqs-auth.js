/* aqs-auth.js — Login & Register form handler for XZILY AI
   Depends on: window.aqsAjax (set by aqs-firebase.js module, available by DOMContentLoaded) */
(function () {
    'use strict';

    /* ── helpers ── */
    function showAlert(id, msg, isError) {
        var el = document.getElementById(id);
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
    function hideAlert(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
    function setBtn(id, text, disabled) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.disabled = !!disabled;
    }

    /* ── password toggle ── */
    function setupPasswordToggles() {
        document.querySelectorAll('.aqs-pw-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = document.getElementById(btn.getAttribute('data-target'));
                if (!target) return;
                target.type = target.type === 'password' ? 'text' : 'password';
            });
        });
    }

    /* ── password strength ── */
    function setupPasswordStrength() {
        var pwInput = document.getElementById('reg-password');
        var bar = document.getElementById('reg-pw-strength-bar');
        if (!pwInput || !bar) return;
        pwInput.addEventListener('input', function () {
            var pw = pwInput.value;
            var score = 0;
            if (pw.length >= 6) score++;
            if (pw.length >= 10) score++;
            if (/[A-Z]/.test(pw)) score++;
            if (/[0-9]/.test(pw)) score++;
            if (/[^A-Za-z0-9]/.test(pw)) score++;
            var pct = Math.min(100, score * 20);
            var color = score <= 1 ? '#ef4444' : score <= 2 ? '#f59e0b' : score <= 3 ? '#eab308' : '#22c55e';
            bar.style.width = pct + '%';
            bar.style.background = color;
            bar.style.height = '100%';
            bar.style.borderRadius = '3px';
            bar.style.transition = 'width .3s,background .3s';
        });
    }

    /* ── role chips ── */
    function setupRoleChips() {
        var chips = document.querySelectorAll('.aqs-role-chip');
        var hidden = document.getElementById('reg-role');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                chips.forEach(function (c) { c.classList.remove('active'); c.style.background = ''; c.style.color = ''; c.style.border = ''; });
                chip.classList.add('active');
                chip.style.background = 'rgba(99,102,241,0.25)';
                chip.style.color = '#a5b4fc';
                chip.style.border = '1px solid rgba(99,102,241,0.6)';
                if (hidden) hidden.value = chip.getAttribute('data-role') || '';
            });
        });
    }

    /* ── login form ── */
    function setupLoginForm() {
        var form = document.getElementById('aqs-login-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert('aqs-login-alert');
            var identifier = (document.getElementById('login-identifier') || {}).value || '';
            var password   = (document.getElementById('login-password') || {}).value || '';
            if (!identifier || !password) {
                showAlert('aqs-login-alert', 'Please enter your email/username and password.', true);
                return;
            }
            setBtn('aqs-login-submit', 'Signing in…', true);
            window._aqsIsLoggingIn = true;
            if (typeof window.aqsAjax !== 'function') {
                showAlert('aqs-login-alert', 'Firebase is still loading. Please wait a moment and try again.', true);
                setBtn('aqs-login-submit', 'Sign In', false);
                window._aqsIsLoggingIn = false;
                return;
            }
            window.aqsAjax(
                { action: 'aqs_login', username: identifier, password: password },
                function (res) {
                    if (res && res.success && res.data && res.data.redirect) {
                        showAlert('aqs-login-alert', '✓ Signed in! Redirecting…', false);
                        setTimeout(function () { window.location.href = res.data.redirect; }, 800);
                    } else {
                        var msg = (res && res.data) ? (typeof res.data === 'string' ? res.data : (res.data.message || 'Login failed.')) : 'Login failed.';
                        showAlert('aqs-login-alert', msg, true);
                        setBtn('aqs-login-submit', 'Sign In', false);
                        window._aqsIsLoggingIn = false;
                    }
                },
                function (err) {
                    showAlert('aqs-login-alert', (err && err.message) || 'Login failed. Please try again.', true);
                    setBtn('aqs-login-submit', 'Sign In', false);
                    window._aqsIsLoggingIn = false;
                }
            );
        });
    }

    function setupPasswordReset() {
        var button = document.getElementById('aqs-forgot-password');
        if (!button) return;
        button.addEventListener('click', function () {
            var identifier = (document.getElementById('login-identifier') || {}).value || '';
            if (identifier.indexOf('@') === -1) {
                showAlert('aqs-login-alert', 'Enter your email address first, then select Forgot password.', true);
                return;
            }
            button.disabled = true;
            button.textContent = 'Sending reset email…';
            window.aqsAjax({ action: 'aqs_reset_password', email: identifier }, function (res) {
                button.disabled = false;
                button.textContent = 'Forgot password?';
                if (res && res.success) {
                    showAlert('aqs-login-alert', 'If an account exists for that email, a password reset link has been sent.', false);
                } else {
                    showAlert('aqs-login-alert', (res && res.data) || 'Could not send a reset email.', true);
                }
            }, function (err) {
                button.disabled = false;
                button.textContent = 'Forgot password?';
                showAlert('aqs-login-alert', (err && err.message) || 'Could not send a reset email.', true);
            });
        });
    }

    /* ── register form ── */
    function setupRegisterForm() {
        var form = document.getElementById('aqs-register-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert('aqs-register-alert');
            var name     = (document.getElementById('reg-name') || {}).value || '';
            var username = (document.getElementById('reg-username') || {}).value || '';
            var email    = (document.getElementById('reg-email') || {}).value || '';
            var role     = (document.getElementById('reg-role') || {}).value || 'student';
            var password = (document.getElementById('reg-password') || {}).value || '';
            var confirm  = (document.getElementById('reg-confirm') || {}).value || '';
            var terms    = document.getElementById('reg-terms');

            if (!name || !username || !email || !password) {
                showAlert('aqs-register-alert', 'Please fill in all required fields.', true);
                return;
            }
            if (password.length < 6) {
                showAlert('aqs-register-alert', 'Password must be at least 6 characters.', true);
                return;
            }
            if (password !== confirm) {
                showAlert('aqs-register-alert', 'Passwords do not match.', true);
                return;
            }
            if (terms && !terms.checked) {
                showAlert('aqs-register-alert', 'Please accept the Terms of Service to continue.', true);
                return;
            }
            /* Mark the flow before the first Firestore request. The auth
               guard must not redirect while username validation or Firebase
               account creation is still in progress. */
            window._aqsIsRegistering = true;
            setBtn('aqs-register-submit', 'Creating account…', true);
            if (typeof window.aqsAjax !== 'function') {
                showAlert('aqs-register-alert', 'Firebase is still loading. Please wait a moment and try again.', true);
                setBtn('aqs-register-submit', 'Create Account', false);
                window._aqsIsRegistering = false;
                return;
            }
            window.aqsAjax(
                { action: 'aqs_register', name: name, username: username, email: email, role: role, password: password },
                function (res) {
                    if (res && res.success) {
                        var dest = (res.data && res.data.redirect) || 'user-dashboard.html';
                        var otpRequired = !!(res.data && res.data.otp_required);
                        if (otpRequired) {
                            window._aqsRegistrationRedirect = dest;
                            var otpMessage = '✓ Account created. Check your inbox for the verification code.';
                            if (res.data.otp_sent && res.data.otp_accepted && res.data.otp_message_id) {
                                otpMessage = '✓ Brevo accepted the verification email. Check your inbox, spam, or Promotions.';
                            }
                            showAlert(
                                'aqs-register-alert',
                                res.data.otp_sent
                                    ? otpMessage
                                    : '✓ Account created. We could not send the code yet—use Resend when email settings are ready.',
                                !res.data.otp_sent
                            );
                            var otpPanel = document.getElementById('aqs-otp-panel');
                            if (otpPanel) otpPanel.hidden = false;
                            setBtn('aqs-register-submit', 'Account created', true);
                            return;
                        }
                        var msg = (res.data && res.data.message) || '✓ Account created! Redirecting…';
                        showAlert('aqs-register-alert', msg, false);
                        /* Let the protected page wait for this newly-created
                           Firebase session instead of redirecting back here. */
                        try {
                            sessionStorage.setItem('aqs_registration_complete', String(Date.now()));
                        } catch (_) {}
                        setTimeout(function () { window.location.replace(dest); }, 1200);
                    } else {
                        var errMsg = (res && res.data) ? (typeof res.data === 'string' ? res.data : (res.data.message || 'Registration failed.')) : 'Registration failed.';
                        showAlert('aqs-register-alert', errMsg, true);
                        setBtn('aqs-register-submit', 'Create Account', false);
                        window._aqsIsRegistering = false;
                    }
                },
                function (err) {
                    showAlert('aqs-register-alert', (err && err.message) || 'Registration failed. Please try again.', true);
                    setBtn('aqs-register-submit', 'Create Account', false);
                    window._aqsIsRegistering = false;
                }
            );
        });
    }

    /* ── email OTP verification ── */
    function setupOtpVerification() {
        var panel = document.getElementById('aqs-otp-panel');
        var input = document.getElementById('aqs-register-otp');
        var verify = document.getElementById('aqs-verify-otp-btn');
        var resend = document.getElementById('aqs-resend-otp-btn');
        var status = document.getElementById('aqs-otp-status');
        if (!panel || !input || !verify || !resend) return;

        function setOtpStatus(message, isError) {
            if (!status) return;
            status.textContent = message || '';
            status.style.color = isError ? '#fca5a5' : '#bbf7d0';
        }
        function sendOtp() {
            verify.disabled = true;
            resend.disabled = true;
            setOtpStatus('Sending a new code…', false);
            window.aqsAjax({ action: 'aqs_send_otp' }, function (res) {
                verify.disabled = false;
                resend.disabled = false;
                if (res && res.success && res.data && res.data.sent) {
                    var accepted = res.data.accepted && res.data.messageId;
                    setOtpStatus(
                        accepted
                            ? 'Brevo accepted the new code. Check inbox, spam, or Promotions.'
                            : 'A new code has been accepted by the email service.',
                        false
                    );
                } else {
                    setOtpStatus((res && res.data && res.data.message) || 'Could not send a code.', true);
                }
            }, function (err) {
                verify.disabled = false;
                resend.disabled = false;
                setOtpStatus((err && err.message) || 'Could not send a code.', true);
            });
        }
        verify.addEventListener('click', function () {
            var code = (input.value || '').replace(/\D/g, '');
            if (code.length !== 6) {
                setOtpStatus('Enter the 6-digit code from your email.', true);
                return;
            }
            verify.disabled = true;
            resend.disabled = true;
            setOtpStatus('Verifying…', false);
            window.aqsAjax({ action: 'aqs_verify_otp', otp: code }, function (res) {
                if (res && res.success && res.data && res.data.verified) {
                    setOtpStatus('Email verified. Redirecting…', false);
                    try { sessionStorage.setItem('aqs_registration_complete', String(Date.now())); } catch (_) {}
                    window.setTimeout(function () {
                        window.location.replace(window._aqsRegistrationRedirect || 'user-dashboard.html');
                    }, 700);
                    return;
                }
                verify.disabled = false;
                resend.disabled = false;
                setOtpStatus((res && res.data && res.data.message) || 'That code is not valid.', true);
            }, function (err) {
                verify.disabled = false;
                resend.disabled = false;
                setOtpStatus((err && err.message) || 'That code is not valid.', true);
            });
        });
        resend.addEventListener('click', sendOtp);
    }

    /* ── logout buttons ── */
    function setupLogoutBtns() {
        var ids = ['aqs-user-logout-btn', 'aqs-user-logout-btn2'];
        ids.forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', function () {
                if (typeof window.aqsAjax === 'function') {
                    window.aqsAjax({ action: 'aqs_logout' }, function () {
                        window.location.href = 'login.html';
                    }, function () {
                        window.location.href = 'login.html';
                    });
                } else {
                    window.location.href = 'login.html';
                }
            });
        });
    }

    /* ── user dashboard account info ── */
    function setupDashboardInfo() {
        var nameEl  = document.getElementById('aqs-user-display-name');
        var initEl  = document.getElementById('aqs-user-avatar-initial');
        var acName  = document.getElementById('aqs-account-name');
        var acEmail = document.getElementById('aqs-account-email');
        var acRole  = document.getElementById('aqs-account-role');
        var badge   = document.getElementById('aqs-user-role-badge');
        if (!nameEl) return;

        /* Wait for Firebase auth to resolve */
        document.addEventListener('aqs:authchange', function (ev) {
            var user = ev.detail && ev.detail.user;
            if (!user) return;
            var displayName = user.displayName || user.email || 'User';
            if (nameEl)  nameEl.textContent  = 'Hello, ' + displayName + '!';
            if (initEl)  initEl.textContent  = displayName.charAt(0).toUpperCase();
            if (acName)  acName.textContent  = displayName;
            if (acEmail) acEmail.textContent = user.email || '—';
            if (acRole)  acRole.textContent  = (window.AQS && window.AQS.current_user_role) || 'Member';
            if (badge)   badge.textContent   = (window.AQS && window.AQS.current_user_role) || 'Member';
        });
    }


      /* ── Google / Social sign-in button ── */
      function setupGoogleSignIn() {
          var btn = document.getElementById('aqs-google-login');
          if (!btn) return;
          var alertId = document.getElementById('aqs-login-alert') ? 'aqs-login-alert'
                      : document.getElementById('aqs-register-alert') ? 'aqs-register-alert' : null;

          function resetBtn() {
              btn.disabled = false;
              btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg> Continue with Google';
          }

          btn.addEventListener('click', function () {
              btn.disabled = true;
              btn.textContent = 'Opening Google…';
              window._aqsIsLoggingIn = true;
              if (alertId) showAlert(alertId, 'Opening Google sign-in…', false);
              if (typeof window.aqsAjax !== 'function') {
                  setTimeout(function () {
                      resetBtn();
                      window._aqsIsLoggingIn = false;
                      if (alertId) showAlert(alertId, 'Still loading — please try again.', true);
                  }, 1500);
                  return;
              }
              window.aqsAjax(
                  function (res) {
                      /* Firebase redirect flow navigates away immediately. */
                      if (res && res.success && res.data && res.data.redirect_started) {
                          if (alertId) showAlert(alertId, 'Redirecting to Google sign-in…', false);
                          return;
                      }
                      if (res && res.success && res.data && res.data.redirect) {
                          if (alertId) showAlert(alertId, '✓ Signed in as ' + (res.data.user_name || 'you') + '! Redirecting…', false);
                          setTimeout(function() { window.location.replace(res.data.redirect); }, 150);
                      } else {
                          resetBtn();
                          window._aqsIsLoggingIn = false;
                      }
                  },
                  function (err) {
                      resetBtn();
                      window._aqsIsLoggingIn = false;
                      if (alertId) showAlert(alertId, (err && err.message) || 'Google sign-in failed. Try again.', true);
                  }
              );
          });
      }

      document.addEventListener('aqs:googleautherror', function (event) {
          var alertEl = document.getElementById('aqs-login-alert') || document.getElementById('aqs-register-alert');
          if (alertEl) showAlert(alertEl.id, event.detail && event.detail.message || 'Google sign-in failed. Try again.', true);
      });
  
    document.addEventListener('DOMContentLoaded', function () {
        setupPasswordToggles();
        setupPasswordStrength();
        setupPasswordReset();
        setupRoleChips();
        setupLoginForm();
        setupRegisterForm();
        setupOtpVerification();
        setupLogoutBtns();
        setupDashboardInfo();
    });
})();
