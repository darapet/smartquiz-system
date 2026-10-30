/* ============================================================
     AQS Ad Popup — Templates + Typing + Intro/Outro  v1.0
  ============================================================ */
  (function ($) {
      'use strict';

      window.AQSAds = { showForTrigger: showForTrigger, showAd: showAd };

      var _shownTriggers = {};

      function showForTrigger(trigger, context) {
          context = context || 'both';
          if (_shownTriggers[trigger]) return;
          $.ajax({
              url: AQS.ajax_url, type: 'POST', dataType: 'json',
              data: { action: 'aqs_get_active_ads', nonce: AQS.public_nonce, trigger: trigger, context: context },
              success: function (res) {
                  if (!res || !res.success || !res.data || !res.data.length) return;
                  var ad = res.data[0];
                  var key = 'aqs_ad_' + ad.id;
                  var seen = parseInt(localStorage.getItem(key) || '0', 10);
                  var hrs  = (Date.now() - seen) / 3600000;
                  if (seen && hrs < (parseInt(ad.show_again_hours) || 24)) return;
                  _shownTriggers[trigger] = true;
                  showAd(ad);
              }
          });
      }

      function showAd(ad) {
          var tpl      = Math.min(10, Math.max(1, parseInt(ad.template) || 1));
          var posClass = 'pos-' + (ad.position || 'center').replace(/_/g,'-');
          var introClass = 'aqs-ai-' + (ad.intro_anim || 'fadeIn');

          var mediaHtml = '';
          if (ad.image_url) {
              if (ad.media_type === 'video') {
                  mediaHtml = '<video class="aqs-ad-vid" src="' + escH(ad.image_url) +
                              '" autoplay muted loop playsinline></video>';
              } else {
                  mediaHtml = '<img class="aqs-ad-img" src="' + escH(ad.image_url) +
                              '" alt="' + escH(ad.title) + '" />';
              }
          }

          var ctaHtml = (ad.button_label && ad.button_url)
              ? '<a href="' + escH(ad.button_url) + '" target="_blank" rel="noopener" class="aqs-ad-cta">' +
                escH(ad.button_label) + '</a>'
              : '';

          var overlay = $('<div class="aqs-ad-overlay ' + posClass +
                          (tpl === 8 ? ' aqs-t8' : '') + '" role="dialog" aria-modal="true"></div>');
          var box = $('<div class="aqs-ad-box aqs-t' + tpl + ' ' + introClass + '"></div>');
          box.html(
              '<button class="aqs-ad-close" aria-label="Close ad">&times;</button>' +
              mediaHtml +
              '<div class="aqs-ad-content">' +
                  '<h3 class="aqs-ad-title">' + escH(ad.title) + '</h3>' +
                  '<p class="aqs-ad-body"></p>' +
                  ctaHtml +
              '</div>'
          );
          overlay.append(box);
          $('body').append(overlay);

          // Body text
          var bodyEl = box.find('.aqs-ad-body')[0];
          if (parseInt(ad.typing_effect) && ad.body_text) {
              typeText(bodyEl, ad.body_text);
          } else {
              $(bodyEl).text(ad.body_text || '');
          }

          // Track
          if (ad.id) {
              $.post(AQS.ajax_url, { action: 'aqs_track_impression', ad_id: ad.id });
              localStorage.setItem('aqs_ad_' + ad.id, Date.now().toString());
          }

          // Auto-close
          var autoTimer = null;
          var autoSecs  = parseInt(ad.auto_close) || 0;
          if (autoSecs > 0) autoTimer = setTimeout(function () { dismiss(); }, autoSecs * 1000);

          function dismiss() {
              if (autoTimer) clearTimeout(autoTimer);
              var outClass = 'aqs-ao-' + (ad.outro_anim || 'fadeOut');
              box.addClass(outClass);
              overlay.animate({ opacity: 0 }, 380, function () { overlay.remove(); });
          }

          box.find('.aqs-ad-close').on('click', dismiss);
          overlay.on('click', function (e) { if ($(e.target).is(overlay)) dismiss(); });
      }

      function typeText(el, text) {
          el.textContent = '';
          var cursor = document.createElement('span');
          cursor.className = 'aqs-cursor';
          el.appendChild(cursor);
          var i = 0;
          (function next() {
              if (i < text.length) {
                  el.insertBefore(document.createTextNode(text[i++]), cursor);
                  setTimeout(next, 28 + Math.random() * 16);
              } else {
                  setTimeout(function () {
                      if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
                  }, 1600);
              }
          })();
      }

      function escH(s) {
          return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
  })(jQuery);
  