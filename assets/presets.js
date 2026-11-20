/* 整周五日预设：独立于主应用，减少与并行改动的冲突 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mealprep.dual.state';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function app() { return window.__MEALPREP__; }

  function toolNames(ids) {
    var data = window.MEALPREP;
    return (ids || []).map(function (id) {
      var tool = (data.equipment || []).filter(function (item) { return item.id === id; })[0];
      return tool ? tool.name : id;
    });
  }

  function isActive(preset, settings) {
    if (!preset || !settings) return false;
    var s = preset.settings || {};
    return settings.style === s.style &&
      settings.rotation === s.rotation &&
      !!settings.shortcut === !!s.shortcut &&
      settings.riceType === s.riceType &&
      settings.riceAddIn === s.riceAddIn;
  }

  function render() {
    var data = window.MEALPREP;
    var appState = app();
    var root = document.getElementById('presets');
    if (!data || !appState || !root) return;
    var settings = appState.state.settings;
    var presets = data.weekPresets || [];
    if (!presets.length) { root.innerHTML = ''; return; }

    root.innerHTML = presets.map(function (preset) {
      var active = isActive(preset, settings);
      var missing = (preset.requiresTools || []).filter(function (id) {
        return settings.tools && settings.tools[id] === false;
      });
      return '<button type="button" class="preset-card' + (active ? ' is-active' : '') + (missing.length ? ' is-missing' : '') +
        '" data-preset="' + esc(preset.id) + '" aria-pressed="' + active + '">' +
        '<span class="preset-kicker">整周五日方案</span>' +
        '<strong class="preset-title">' + esc(preset.label) + '</strong>' +
        '<span class="preset-note">' + esc(preset.note) + '</span>' +
        '<span class="preset-meta">' + (active ? '当前方案' : '点一下套用') +
        ((preset.requiresTools || []).length ? ' · 需要 ' + esc(toolNames(preset.requiresTools).join('、')) : '') +
        '</span>' +
        (missing.length ? '<span class="preset-warning">当前缺少 ' + esc(toolNames(missing).join('、')) + '；切换预设不会自动打开工具开关</span>' : '') +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(root.querySelectorAll('[data-preset]'), function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-preset'));
      });
    });
  }

  function apply(id) {
    var data = window.MEALPREP;
    var appState = app();
    var preset = (data.weekPresets || []).filter(function (item) { return item.id === id; })[0];
    if (!preset) return;
    var current = appState.state.settings;
    var merged = appState.model.settingsFrom({
      days: 5,
      adults: current.adults,
      kidAge: current.kidAge,
      exclude: current.exclude,
      tools: current.tools,
      meals: current.meals,
      lunchMode: current.lunchMode,
      salt: current.salt,
      texture: current.texture,
      onigiri: current.onigiri,
      containerPref: current.containerPref,
      style: preset.settings.style,
      rotation: preset.settings.rotation,
      shortcut: preset.settings.shortcut,
      riceType: preset.settings.riceType,
      riceAddIn: preset.settings.riceAddIn,
      breakfastOverrides: {},
      dinnerOverrides: {}
    });
    appState.state.settings = merged;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        settings: merged,
        edits: appState.state.edits,
        checks: appState.state.checks
      }));
    } catch (err) { /* 忽略存储失败 */ }
    appState.render();
    render();
    var applied = document.getElementById('presetStatus');
    if (applied) applied.textContent = '已套用「' + preset.label + '」；人数、儿童年龄、过敏原和工具开关保持不变。';
    var next = document.querySelector('[data-preset="' + id + '"]');
    if (next) next.focus({ preventScroll: true });
  }

  function init() {
    if (!app()) {
      window.setTimeout(init, 60);
      return;
    }
    render();
    var status = document.createElement('p');
    status.id = 'presetStatus';
    status.className = 'preset-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var root = document.getElementById('presets');
    if (root && root.parentNode) root.parentNode.insertBefore(status, root.nextSibling);

    var summary = document.getElementById('setupSummary');
    if (summary && window.MutationObserver) {
      new MutationObserver(render).observe(summary, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
