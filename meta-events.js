/**
 * Meta Pixel event ladder (browser).
 * Tune VALUES from CAC / close rate. In Events Manager, create custom conversions:
 *   ViewContent + content_name = FormStart
 *   ViewContent + content_name = VSL25
 * Contact (setter answered) and Purchase (closed) are manual / CAPI — not fired here.
 */
(function (global) {
  'use strict';

  var VALUES = {
    FormStart: 3,
    Lead: 12,
    SubmitApplication: 35,
    Schedule: 100,
    VSL25: 20
  };

  var SK = {
    formStart: 'meta_form_start_fired',
    scheduleEventId: 'meta_schedule_event_id',
    vsl25: 'meta_vsl25_fired'
  };

  function track(eventName, customData, eventId) {
    if (typeof global.fbq !== 'function') return;
    var payload = Object.assign({ currency: 'USD' }, customData || {});
    if (eventId) {
      global.fbq('track', eventName, payload, { eventID: eventId });
    } else {
      global.fbq('track', eventName, payload);
    }
  }

  /** Qualified = show-up yes, commitment 7+, budget above $0–1k tier. */
  function isQualifiedLead(data) {
    if (!data) return false;
    if (data.show_up_confirmation !== 'yes') return false;
    var commitment = parseInt(data.commitment_score, 10);
    if (isNaN(commitment) || commitment < 7) return false;
    if (data.investment_readiness === 'ready') return false;
    return true;
  }

  function trackFormStart() {
    try {
      if (sessionStorage.getItem(SK.formStart)) return;
      sessionStorage.setItem(SK.formStart, '1');
    } catch (_) { /* ignore */ }
    track('ViewContent', {
      content_name: 'FormStart',
      content_category: 'Qualifier',
      value: VALUES.FormStart
    });
  }

  function trackLeadComplete(data, eventId) {
    track('Lead', {
      content_name: 'QualifierComplete',
      value: VALUES.Lead
    }, eventId);

    if (isQualifiedLead(data)) {
      track('SubmitApplication', {
        content_name: 'QualifiedApplication',
        value: VALUES.SubmitApplication
      }, eventId + ':submit');
    }
  }

  function newEventId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function getOrCreateScheduleEventId() {
    try {
      var existing = sessionStorage.getItem(SK.scheduleEventId);
      if (existing) return existing;
      var id = newEventId();
      sessionStorage.setItem(SK.scheduleEventId, id);
      return id;
    } catch (_) {
      return newEventId();
    }
  }

  function trackScheduleQualified(data, eventId) {
    if (!isQualifiedLead(data)) return;
    var eid = eventId || getOrCreateScheduleEventId();
    try {
      sessionStorage.setItem(SK.scheduleEventId, eid);
    } catch (_) { /* ignore */ }
    track('Schedule', {
      content_name: 'QualifiedCallBooked',
      value: VALUES.Schedule
    }, eid);
  }

  function trackVsl25() {
    try {
      if (sessionStorage.getItem(SK.vsl25)) return;
      sessionStorage.setItem(SK.vsl25, '1');
    } catch (_) { /* ignore */ }
    track('ViewContent', {
      content_name: 'VSL25',
      content_category: 'ThankYouVSL',
      value: VALUES.VSL25
    });
  }

  function getStoredFormData() {
    try {
      var raw = sessionStorage.getItem('formData');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function initVslWatch() {
    global._wq = global._wq || [];
    global._wq.push({
      id: 'yryb89qho1',
      onReady: function (video) {
        var fired = false;
        video.bind('percentwatchedchanged', function (pct) {
          if (fired || pct < 0.25) return;
          fired = true;
          trackVsl25();
        });
      }
    });
  }

  global.TeamAkibMeta = {
    VALUES: VALUES,
    isQualifiedLead: isQualifiedLead,
    trackFormStart: trackFormStart,
    trackLeadComplete: trackLeadComplete,
    trackScheduleQualified: trackScheduleQualified,
    trackVsl25: trackVsl25,
    getOrCreateScheduleEventId: getOrCreateScheduleEventId,
    getStoredFormData: getStoredFormData,
    initVslWatch: initVslWatch
  };
})(window);
