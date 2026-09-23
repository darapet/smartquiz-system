/* aqs-auth.js — password login and staged SmartQuiz registration */
(function () {
    'use strict';

    var DRAFT_KEY = 'aqs_registration_draft';
    var registrationStep = 1;
    var registrationDraft = {
        account: {},
        education: {},
        photos: {}
    };

    function showAlert(id, msg, isError) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = 'block';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '8px';
        el.style.marginBottom = '12px';
        el.style.fontSize = '.9rem';
        el.style.background = isError ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
        el.style.color = isError ? '#f87171' : '#4ade80';
        el.style.border = isError ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(34,197,94,0.25)';
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

    function responseMessage(res, fallback) {
        if (!res || !res.data) return fallback;
        if (typeof res.data === 'string') return res.data;
        return res.data.message || fallback;
    }

    function setupPasswordToggles() {
        document.querySelectorAll('.aqs-pw-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = document.getElementById(btn.getAttribute('data-target'));
                if (!target) return;
                var visible = target.type === 'password';
                target.type = visible ? 'text' : 'password';
                btn.textContent = visible ? 'Hide' : 'Show';
                btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
            });
        });
    }

    function setupPasswordStrength() {
        var pwInput = document.getElementById('reg-password');
        var bar = document.getElementById('reg-pw-strength-bar');
        if (!pwInput || !bar) return;
        pwInput.addEventListener('input', function () {
            var pw = pwInput.value;
            var score = 0;
            if (pw.length >= 8) score++;
            if (pw.length >= 12) score++;
            if (/[A-Z]/.test(pw)) score++;
            if (/[0-9]/.test(pw)) score++;
            if (/[^A-Za-z0-9]/.test(pw)) score++;
            bar.style.width = Math.min(100, score * 20) + '%';
            bar.style.background = score <= 1 ? '#ef4444' : score <= 3 ? '#f59e0b' : '#22c55e';
        });
    }

    function setupLoginForm() {
        var form = document.getElementById('aqs-login-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert('aqs-login-alert');
            var identifier = (document.getElementById('login-identifier') || {}).value || '';
            var password = (document.getElementById('login-password') || {}).value || '';
            if (!identifier || !password) {
                showAlert('aqs-login-alert', 'Please enter your email or username and password.', true);
                return;
            }
            if (typeof window.aqsAjax !== 'function') {
                showAlert('aqs-login-alert', 'Firebase is still loading. Please wait a moment and try again.', true);
                return;
            }
            setBtn('aqs-login-submit', 'Signing in…', true);
            window._aqsIsLoggingIn = true;
            window.aqsAjax({ action: 'aqs_login', username: identifier, password: password }, function (res) {
                if (res && res.success && res.data && res.data.redirect) {
                    showAlert('aqs-login-alert', res.data.registration_incomplete ? 'Finish setting up your profile first.' : 'Signed in. Redirecting…', false);
                    window.setTimeout(function () { window.location.replace(res.data.redirect); }, 250);
                    return;
                }
                window._aqsIsLoggingIn = false;
                setBtn('aqs-login-submit', 'Sign In', false);
                showAlert('aqs-login-alert', responseMessage(res, 'Login failed.'), true);
            }, function (err) {
                window._aqsIsLoggingIn = false;
                setBtn('aqs-login-submit', 'Sign In', false);
                showAlert('aqs-login-alert', (err && err.message) || 'Login failed. Please try again.', true);
            });
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
            if (typeof window.aqsAjax !== 'function') {
                showAlert('aqs-login-alert', 'Firebase is still loading. Please wait a moment and try again.', true);
                return;
            }
            button.disabled = true;
            button.textContent = 'Sending reset email…';
            window.aqsAjax({ action: 'aqs_reset_password', email: identifier }, function (res) {
                button.disabled = false;
                button.textContent = 'Forgot password?';
                showAlert('aqs-login-alert', res && res.success
                    ? 'If an account exists for that email, a password reset link has been sent.'
                    : responseMessage(res, 'Could not send a reset email.'), !res || !res.success);
            }, function (err) {
                button.disabled = false;
                button.textContent = 'Forgot password?';
                showAlert('aqs-login-alert', (err && err.message) || 'Could not send a reset email.', true);
            });
        });
    }

    function saveRegistrationDraft() {
        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify(registrationDraft));
        } catch (_) {}
    }

    function loadRegistrationDraft() {
        try {
            var saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                registrationDraft = {
                    account: saved.account || {},
                    education: saved.education || {},
                    photos: saved.photos || {}
                };
            }
        } catch (_) {}
    }

    function setValue(id, value) {
        var el = document.getElementById(id);
        if (el && value !== undefined && value !== null) el.value = value;
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el && value !== undefined && value !== null) el.textContent = value;
    }

    function fillSelect(id, values, selected, placeholder) {
        var select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        var empty = document.createElement('option');
        empty.value = '';
        empty.textContent = placeholder || 'Choose an option';
        select.appendChild(empty);
        (values || []).forEach(function (value) {
            var option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            option.selected = value === selected;
            select.appendChild(option);
        });
    }

    function fillNigerianSchools(selected) {
        var type = (document.getElementById('reg-institution-type') || {}).value || 'university';
        var data = window.AQS_EDUCATION_DATA || {};
        var schools = data.nigeria && data.nigeria[type] ? data.nigeria[type] : [];
        var query = ((document.getElementById('reg-school-search') || {}).value || '').toLowerCase().trim();
        var filtered = schools.filter(function (school) { return !query || school.toLowerCase().indexOf(query) !== -1; });
        fillSelect('reg-school-name', filtered, selected, 'Select a school');
    }

    function fillStudyLevels(selected) {
        var data = window.AQS_EDUCATION_DATA || {};
        fillSelect('reg-study-level', data.higherStudyLevels || [], selected, 'Choose your level');
    }

    function fillGrades(educationLevel, selected) {
        var data = window.AQS_EDUCATION_DATA || {};
        fillSelect('reg-grade', (data.grades && data.grades[educationLevel]) || [], selected, 'Choose your grade');
    }

    function toggleEducationFields() {
        var level = (document.getElementById('reg-education-level') || {}).value || '';
        var isHigher = level === 'higher_institution';
        var isSchool = level === 'primary' || level === 'secondary';
        var higher = document.getElementById('aqs-higher-fields');
        var school = document.getElementById('aqs-school-level-fields');
        if (higher) higher.hidden = !isHigher;
        if (school) school.hidden = !(isSchool || level === 'graduate' || level === 'masters' || level === 'phd');
        if (isHigher) {
            fillStudyLevels((registrationDraft.education || {}).study_level);
            fillNigerianSchools((registrationDraft.education || {}).school_name);
        } else {
            fillGrades(level, (registrationDraft.education || {}).grade);
        }
    }

    function toggleSchoolCountry(country) {
        var value = country || 'nigeria';
        setValue('reg-school-country-value', value);
        document.querySelectorAll('#reg-school-country .aqs-choice').forEach(function (button) {
            button.classList.toggle('active', button.getAttribute('data-country') === value);
        });
        var nigeriaField = document.getElementById('aqs-nigeria-school-field');
        var otherField = document.getElementById('aqs-other-school-field');
        if (nigeriaField) nigeriaField.hidden = value !== 'nigeria';
        if (otherField) otherField.hidden = value === 'nigeria';
    }

    function updateProgress(step) {
        registrationStep = step;
        if (step >= 1 && step <= 5) {
            try { sessionStorage.setItem('aqs_registration_step', String(step)); } catch (_) {}
        }
        document.querySelectorAll('.aqs-register-step').forEach(function (panel) {
            panel.hidden = Number(panel.getAttribute('data-step')) !== step;
        });
        document.querySelectorAll('[data-flow-step]').forEach(function (item) {
            var itemStep = Number(item.getAttribute('data-flow-step'));
            item.classList.toggle('active', itemStep <= step);
            item.classList.toggle('current', itemStep === step);
        });
        var bar = document.getElementById('aqs-flow-progress-bar');
        if (bar) bar.style.width = Math.max(0, Math.min(100, ((step - 1) / 4) * 100)) + '%';
        var title = document.getElementById('aqs-register-title');
        var subtitle = document.getElementById('aqs-register-subtitle');
        var copy = {
            1: ['Create your account', 'A few quick steps and you are ready to learn.'],
            2: ['Verify your email', 'This keeps your SmartQuiz account secure.'],
            3: ['Create your password', 'Your email is verified. Choose a password for your account.'],
            4: ['Build your learning profile', 'Tell us enough to make your study experience useful.'],
            5: ['Add your photos', 'You can skip either photo and add it later.'],
            6: ['Welcome to SmartQuiz', 'Your profile is complete and ready to use.']
        };
        if (title && copy[step]) title.textContent = copy[step][0];
        if (subtitle && copy[step]) subtitle.textContent = copy[step][1];
        window.scrollTo(0, 0);
    }

    function restoreRegistrationForm() {
        var account = registrationDraft.account || {};
        var education = registrationDraft.education || {};
        setValue('reg-email', account.email);
        setText('aqs-register-email-copy', account.email || 'your email');
        setValue('reg-name', education.name);
        setValue('reg-age', education.age);
        setValue('reg-education-level', education.education_level);
        setValue('reg-institution-type', education.institution_type);
        setValue('reg-school-name-other', education.school_name);
        setValue('reg-school-name-general', education.school_name);
        setValue('reg-school-country-value', education.school_country || 'nigeria');
        toggleEducationFields();
        toggleSchoolCountry(education.school_country || 'nigeria');
        setValue('reg-school-search', '');
        setValue('reg-study-level', education.study_level);
        setValue('reg-grade', education.grade);
        fillNigerianSchools(education.school_name);
        if (registrationDraft.photos && registrationDraft.photos.profile_picture) {
            setPhotoPreview('reg-profile-preview', registrationDraft.photos.profile_picture);
        }
        if (registrationDraft.photos && registrationDraft.photos.contact_picture) {
            setPhotoPreview('reg-contact-preview', registrationDraft.photos.contact_picture);
        }
    }

    function setPhotoPreview(id, dataUrl) {
        var preview = document.getElementById(id);
        if (!preview || !dataUrl) return;
        preview.innerHTML = '';
        var img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Selected photo preview';
        preview.appendChild(img);
    }

    function readCompressedImage(file) {
        return new Promise(function (resolve, reject) {
            if (!file) return resolve('');
            if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file.'));
            if (file.size > 8 * 1024 * 1024) return reject(new Error('Images must be smaller than 8 MB.'));
            var reader = new FileReader();
            reader.onload = function () {
                var image = new Image();
                image.onload = function () {
                    var max = 640;
                    var scale = Math.min(1, max / Math.max(image.width, image.height));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.width * scale));
                    canvas.height = Math.max(1, Math.round(image.height * scale));
                    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.78));
                };
                image.onerror = function () { reject(new Error('This image could not be read.')); };
                image.src = reader.result;
            };
            reader.onerror = function () { reject(new Error('This image could not be read.')); };
            reader.readAsDataURL(file);
        });
    }

    function setupPhotoPicker(inputId, previewId, draftKey) {
        var input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (!file) return;
            readCompressedImage(file).then(function (dataUrl) {
                registrationDraft.photos[draftKey] = dataUrl;
                setPhotoPreview(previewId, dataUrl);
                saveRegistrationDraft();
                hideAlert('aqs-register-alert');
            }).catch(function (err) {
                input.value = '';
                showAlert('aqs-register-alert', err.message, true);
            });
        });
    }

    function setupRegistrationFlow() {
        var accountForm = document.getElementById('aqs-register-account-form');
        if (!accountForm) return;
        loadRegistrationDraft();
        restoreRegistrationForm();
        var savedStep = Number(sessionStorage.getItem('aqs_registration_step') || 1);
        var savedAccount = registrationDraft.account || {};
        if (savedStep >= 2 && !savedAccount.challenge_id) savedStep = 1;
        if (savedStep >= 3 && !savedAccount.otp_verified) savedStep = 2;
        updateProgress(Math.max(1, Math.min(6, savedStep)));

        accountForm.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert('aqs-register-alert');
            var email = ((document.getElementById('reg-email') || {}).value || '').trim().toLowerCase();
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert('aqs-register-alert', 'Enter a valid email address.', true);
            if (typeof window.aqsAjax !== 'function') return showAlert('aqs-register-alert', 'Firebase is still loading. Please try again in a moment.', true);
            registrationDraft.account.email = email;
            registrationDraft.account.challenge_id = '';
            registrationDraft.account.otp_verified = false;
            saveRegistrationDraft();
            setBtn('aqs-register-account-submit', 'Sending code…', true);
            window.aqsAjax({ action: 'aqs_send_registration_otp', email: email }, function (res) {
                if (res && res.success && res.data && res.data.challengeId) {
                    registrationDraft.account.challenge_id = res.data.challengeId;
                    setText('aqs-register-email-copy', email);
                    saveRegistrationDraft();
                    showAlert('aqs-register-alert', 'Verification code sent. Check your inbox, spam, or Promotions.', false);
                    sessionStorage.setItem('aqs_registration_step', '2');
                    updateProgress(2);
                    setBtn('aqs-register-account-submit', 'Send verification code', false);
                    return;
                }
                setBtn('aqs-register-account-submit', 'Send verification code', false);
                showAlert('aqs-register-alert', responseMessage(res, 'Could not send a verification code.'), true);
            }, function (err) {
                setBtn('aqs-register-account-submit', 'Send verification code', false);
                showAlert('aqs-register-alert', (err && err.message) || 'Could not send a verification code. Please try again.', true);
            });
        });

        var otpInput = document.getElementById('aqs-register-otp');
        var verify = document.getElementById('aqs-verify-otp-btn');
        var resend = document.getElementById('aqs-resend-otp-btn');
        var otpStatus = document.getElementById('aqs-otp-status');
        var setOtpStatus = function (message, error) {
            if (otpStatus) {
                otpStatus.textContent = message || '';
                otpStatus.style.color = error ? '#fca5a5' : '#bbf7d0';
            }
        };
        if (otpInput) otpInput.addEventListener('input', function () { otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6); });
        if (verify) verify.addEventListener('click', function () {
            var code = (otpInput.value || '').replace(/\D/g, '');
            if (code.length !== 6) return setOtpStatus('Enter the 6-digit code from your email.', true);
            verify.disabled = true;
            if (resend) resend.disabled = true;
            setOtpStatus('Verifying…', false);
            var account = registrationDraft.account || {};
            window.aqsAjax({
                action: 'aqs_verify_registration_otp',
                email: account.email,
                challenge_id: account.challenge_id,
                otp: code
            }, function (res) {
                if (res && res.success && res.data && res.data.verified) {
                    registrationDraft.account.otp_verified = true;
                    saveRegistrationDraft();
                    setOtpStatus('Email verified. Continue by creating your password.', false);
                    sessionStorage.setItem('aqs_registration_step', '3');
                    updateProgress(3);
                    if (resend) resend.disabled = false;
                    return;
                }
                verify.disabled = false;
                if (resend) resend.disabled = false;
                setOtpStatus(responseMessage(res, 'That code is not valid.'), true);
            }, function (err) {
                verify.disabled = false;
                if (resend) resend.disabled = false;
                setOtpStatus((err && err.message) || 'That code is not valid.', true);
            });
        });
        if (resend) resend.addEventListener('click', function () {
            verify.disabled = true;
            resend.disabled = true;
            setOtpStatus('Sending a new code…', false);
            var email = (registrationDraft.account || {}).email || ((document.getElementById('reg-email') || {}).value || '').trim().toLowerCase();
            window.aqsAjax({ action: 'aqs_send_registration_otp', email: email }, function (res) {
                verify.disabled = false;
                resend.disabled = false;
                if (res && res.success && res.data && res.data.challengeId) {
                    registrationDraft.account.challenge_id = res.data.challengeId;
                    registrationDraft.account.otp_verified = false;
                    saveRegistrationDraft();
                    setOtpStatus('A new code was sent. Check your inbox, spam, or Promotions.', false);
                    return;
                }
                setOtpStatus(responseMessage(res, 'Could not send a code.'), true);
            }, function (err) {
                verify.disabled = false;
                resend.disabled = false;
                setOtpStatus((err && err.message) || 'Could not send a code.', true);
            });
        });
        var otpBack = document.getElementById('aqs-otp-back-btn');
        if (otpBack) otpBack.addEventListener('click', function () { updateProgress(1); });

        var passwordForm = document.getElementById('aqs-register-password-form');
        if (passwordForm) passwordForm.addEventListener('submit', function (e) {
            e.preventDefault();
            hideAlert('aqs-register-alert');
            var account = registrationDraft.account || {};
            var password = (document.getElementById('reg-password') || {}).value || '';
            var confirm = (document.getElementById('reg-confirm') || {}).value || '';
            var terms = document.getElementById('reg-terms');
            if (!account.email || !account.challenge_id || !account.otp_verified) {
                return showAlert('aqs-register-alert', 'Verify your email before creating your account.', true);
            }
            if (password.length < 8) return showAlert('aqs-register-alert', 'Password must be at least 8 characters.', true);
            if (password !== confirm) return showAlert('aqs-register-alert', 'Passwords do not match.', true);
            if (terms && !terms.checked) return showAlert('aqs-register-alert', 'Please accept the Terms of Service to continue.', true);
            if (typeof window.aqsAjax !== 'function') return showAlert('aqs-register-alert', 'Firebase is still loading. Please try again in a moment.', true);
            setBtn('aqs-register-password-submit', 'Creating account…', true);
            window._aqsIsRegistering = true;
            window.aqsAjax({
                action: 'aqs_register',
                email: account.email,
                password: password,
                challenge_id: account.challenge_id
            }, function (res) {
                if (res && res.success) {
                    window._aqsIsRegistering = false;
                    showAlert('aqs-register-alert', 'Account created. Continue setting up your profile.', false);
                    sessionStorage.setItem('aqs_registration_step', '4');
                    updateProgress(4);
                    setBtn('aqs-register-password-submit', 'Create account', false);
                    return;
                }
                window._aqsIsRegistering = false;
                setBtn('aqs-register-password-submit', 'Create account', false);
                showAlert('aqs-register-alert', responseMessage(res, 'Could not create your account.'), true);
            }, function (err) {
                window._aqsIsRegistering = false;
                setBtn('aqs-register-password-submit', 'Create account', false);
                showAlert('aqs-register-alert', (err && err.message) || 'Could not create your account. Please try again.', true);
            });
        });
        var passwordBack = document.getElementById('aqs-password-back-btn');
        if (passwordBack) passwordBack.addEventListener('click', function () { updateProgress(2); });

        var educationForm = document.getElementById('aqs-register-education-form');
        var educationLevel = document.getElementById('reg-education-level');
        var institutionType = document.getElementById('reg-institution-type');
        var schoolSearch = document.getElementById('reg-school-search');
        if (educationLevel) educationLevel.addEventListener('change', toggleEducationFields);
        if (institutionType) institutionType.addEventListener('change', function () { fillNigerianSchools(); });
        if (schoolSearch) schoolSearch.addEventListener('input', function () { fillNigerianSchools(); });
        document.querySelectorAll('#reg-school-country .aqs-choice').forEach(function (button) {
            button.addEventListener('click', function () { toggleSchoolCountry(button.getAttribute('data-country')); });
        });
        if (educationForm) educationForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var level = (educationLevel || {}).value || '';
            var name = ((document.getElementById('reg-name') || {}).value || '').trim();
            var age = Number((document.getElementById('reg-age') || {}).value || 0);
            if (name.length < 2) return showAlert('aqs-register-alert', 'Enter your full name.', true);
            if (!Number.isInteger(age) || age < 5 || age > 120) return showAlert('aqs-register-alert', 'Enter an age between 5 and 120.', true);
            if (!level) return showAlert('aqs-register-alert', 'Choose your education level.', true);
            var education = { name: name, age: age, education_level: level };
            if (level === 'higher_institution') {
                var country = (document.getElementById('reg-school-country-value') || {}).value || 'nigeria';
                var type = (institutionType || {}).value || '';
                var school = country === 'nigeria'
                    ? ((document.getElementById('reg-school-name') || {}).value || '')
                    : ((document.getElementById('reg-school-name-other') || {}).value || '').trim();
                var study = (document.getElementById('reg-study-level') || {}).value || '';
                if (!type || !school || !study) return showAlert('aqs-register-alert', 'Choose your institution type, school, and study level.', true);
                education.institution_type = type;
                education.school_country = country;
                education.school_name = school;
                education.study_level = study;
            } else {
                var grade = (document.getElementById('reg-grade') || {}).value || '';
                if (!grade) return showAlert('aqs-register-alert', 'Choose your grade, class, or programme.', true);
                education.grade = grade;
                education.school_name = ((document.getElementById('reg-school-name-general') || {}).value || '').trim();
            }
            registrationDraft.education = education;
            saveRegistrationDraft();
            sessionStorage.setItem('aqs_registration_step', '5');
            updateProgress(5);
        });
        var educationBack = document.getElementById('aqs-education-back-btn');
        if (educationBack) educationBack.addEventListener('click', function () { updateProgress(3); });
        var photosBack = document.getElementById('aqs-photos-back-btn');
        if (photosBack) photosBack.addEventListener('click', function () { updateProgress(4); });
        setupPhotoPicker('reg-profile-picture', 'reg-profile-preview', 'profile_picture');
        setupPhotoPicker('reg-contact-picture', 'reg-contact-preview', 'contact_picture');
        var photosForm = document.getElementById('aqs-register-photos-form');
        if (photosForm) photosForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (typeof window.aqsAjax !== 'function') return showAlert('aqs-register-alert', 'Firebase is still loading. Please try again in a moment.', true);
            saveRegistrationDraft();
            setBtn('aqs-finish-registration-btn', 'Saving profile…', true);
            window.aqsAjax({
                action: 'aqs_complete_registration',
                profile: registrationDraft.education,
                profile_picture: registrationDraft.photos.profile_picture || '',
                contact_picture: registrationDraft.photos.contact_picture || ''
            }, function (res) {
                if (res && res.success) {
                    sessionStorage.removeItem(DRAFT_KEY);
                    sessionStorage.removeItem('aqs_registration_step');
                    window._aqsIsRegistering = false;
                    updateProgress(6);
                    showAlert('aqs-register-alert', 'Profile saved successfully.', false);
                    var open = document.getElementById('aqs-open-profile-btn');
                    if (open) open.onclick = function () { window.location.replace((res.data && res.data.redirect) || 'user-dashboard.html'); };
                    window.setTimeout(function () { window.location.replace((res.data && res.data.redirect) || 'user-dashboard.html'); }, 900);
                    return;
                }
                setBtn('aqs-finish-registration-btn', 'Finish setup', false);
                showAlert('aqs-register-alert', responseMessage(res, 'Could not save your profile.'), true);
            }, function (err) {
                setBtn('aqs-finish-registration-btn', 'Finish setup', false);
                showAlert('aqs-register-alert', (err && err.message) || 'Could not save your profile.', true);
            });
        });
    }

    function setupLogoutBtns() {
        ['aqs-user-logout-btn', 'aqs-user-logout-btn2'].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', function () {
                if (typeof window.aqsAjax === 'function') {
                    window.aqsAjax({ action: 'aqs_logout' }, function () { window.location.href = 'login.html'; }, function () { window.location.href = 'login.html'; });
                } else {
                    window.location.href = 'login.html';
                }
            });
        });
    }

    function setupDashboardInfo() {
        var nameEl = document.getElementById('aqs-user-display-name');
        if (!nameEl) return;
        document.addEventListener('aqs:authchange', function (ev) {
            var user = ev.detail && ev.detail.user;
            if (!user) return;
            var displayName = user.displayName || user.email || 'User';
            nameEl.textContent = 'Hello, ' + displayName + '!';
            var initEl = document.getElementById('aqs-user-avatar-initial');
            var acName = document.getElementById('aqs-account-name');
            var acEmail = document.getElementById('aqs-account-email');
            var acRole = document.getElementById('aqs-account-role');
            var badge = document.getElementById('aqs-user-role-badge');
            if (initEl) initEl.textContent = displayName.charAt(0).toUpperCase();
            if (acName) acName.textContent = displayName;
            if (acEmail) acEmail.textContent = user.email || '—';
            if (acRole) acRole.textContent = (window.AQS && window.AQS.current_user_role) || 'Member';
            if (badge) badge.textContent = (window.AQS && window.AQS.current_user_role) || 'Member';
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        setupPasswordToggles();
        setupPasswordStrength();
        setupPasswordReset();
        setupLoginForm();
        setupRegistrationFlow();
        setupLogoutBtns();
        setupDashboardInfo();
    });
}());