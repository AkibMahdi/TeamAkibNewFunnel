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

  /** Qualified = accepts the calendar standard + ready to start now or within 30 days. */
  function isQualifiedLead(data) {
    if (!data) return false;
    if (data.show_up_confirmation !== 'yes') return false;
    if (data.investment_readiness !== 'ready-now' && data.investment_readiness !== '30-days') return false;
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

  var VSL_MEDIA_ID = 'yryb89qho1';

  /** Wistia may send 0–1 or 0–100; normalize to 0–1. */
  function normalizePercent(n) {
    if (n == null || n === '') return null;
    var v = Number(n);
    if (isNaN(v)) return null;
    return v > 1 ? v / 100 : v;
  }

  function onVslPast25(detail) {
    var pct = normalizePercent(
      detail.percent != null ? detail.percent : detail.percentWatched
    );
    var last = normalizePercent(
      detail.lastPercent != null ? detail.lastPercent : detail.lastPercentWatched
    );
    if (pct == null) return;
    if (last != null && last >= 0.25) return;
    if (pct >= 0.25) trackVsl25();
  }

  function bindAuroraPlayer(player) {
    if (!player || player.__taVslBound) return;
    player.__taVslBound = true;
    player.addEventListener('percent-watched-change', function (event) {
      onVslPast25(event.detail || {});
    });
  }

  function initVslWatch() {
    var selector = 'wistia-player[media-id="' + VSL_MEDIA_ID + '"]';

    function attachToPlayer() {
      var player = document.querySelector(selector);
      if (!player) return;
      bindAuroraPlayer(player);
      player.addEventListener('api-ready', function () {
        bindAuroraPlayer(player);
      }, { once: true });
    }

    if (global.customElements && global.customElements.whenDefined) {
      global.customElements.whenDefined('wistia-player').then(attachToPlayer).catch(attachToPlayer);
    } else {
      attachToPlayer();
    }

    /* Legacy embed API fallback */
    global._wq = global._wq || [];
    global._wq.push({
      id: VSL_MEDIA_ID,
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
