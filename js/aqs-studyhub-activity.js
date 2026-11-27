(function () {
  'use strict';
  var KEY = 'aqs_sh_act_log_v1';
  window.aqsTrackStudyHubActivity = function (kind, detail) {
    if (!kind) return false;
    try {
      var entries = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(entries)) entries = [];
      entries.push({
        k: String(kind),
        at: Date.now(),
        detail: String(detail || '').slice(0, 180)
      });
      localStorage.setItem(KEY, JSON.stringify(entries.slice(-500)));
      window.dispatchEvent(new CustomEvent('aqs:studyhub:activity', {
        detail: { kind: String(kind), at: Date.now() }
      }));
      return true;
    } catch (error) {
      console.warn('[StudyHub] Activity could not be saved:', error);
      return false;
    }
  };
})();