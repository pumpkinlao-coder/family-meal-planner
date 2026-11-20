/* =========================================================
   家庭早晚餐规划 V3 — 界面与交互
   ========================================================= */
(function () {
  'use strict';

  var DATA = window.MEALPREP;
  var M = window.MealPrepModel;
  var STORAGE_KEY = 'mealprep.dual.state';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var TABS = [
    { id: 'menu', label: '菜单', icon: 'i-check-circle' },
    { id: 'nutrition', label: '营养' },
    { id: 'shopping', label: '采购' },
    { id: 'timeline', label: '时间线' },
    { id: 'modules', label: '备餐模块' },
    { id: 'storage', label: '储存与复热' },
    { id: 'alternatives', label: '替换与筛选' },
    { id: 'about', label: '说明与来源' }
  ];

  var state = {
    settings: M.settingsFrom(null),
    edits: {},
    checks: {},
    tab: 'menu'
  };

  /* 餐次与午餐模式：界面层的契约常量。
     新模型会提供 settings.meals / settings.lunchMode / settings.lunchOverrides；
     旧模型没有这些字段时，界面按“早餐+晚餐、午餐关闭”降级，保证两餐功能不受影响。 */
  var MEAL_SLOTS = [
    { id: 'breakfast', label: '早餐' },
    { id: 'lunch', label: '午餐' },
    { id: 'dinner', label: '晚餐' }
  ];
  var SLOT_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
  var SLOT_PLACEHOLDER = { breakfast: '按风格', lunch: '按轮换', dinner: '按轮换' };
  var OVERRIDE_KEY = {
    breakfast: 'breakfastOverrides',
    lunch: 'lunchOverrides',
    dinner: 'dinnerOverrides'
  };
  var LUNCH_MODE_LABEL = {
    packed: '带饭（不额外开火）',
    cook: '现做（单独开火）'
  };

  var dialogContext = null;
  var toastTimer = null;

  /* ---------------- 本地存储 ---------------- */

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      state.settings = normalizeMealSettings(M.settingsFrom(saved.settings || null));
      ensureOverrideMaps();
      state.edits = sanitizeEdits(saved.edits);
      state.checks = saved.checks && typeof saved.checks === 'object' ? saved.checks : {};
    } catch (err) {
      // 隐私模式或禁用 localStorage 时静默降级
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        settings: state.settings,
        edits: state.edits,
        checks: state.checks
      }));
    } catch (err) { /* 忽略写入失败 */ }
  }

  /* 所有 settings 重建都走这里：模型默认值 + 界面需要保留的三餐开关。 */
  function applySettings(raw) {
    state.settings = normalizeMealSettings(M.settingsFrom(raw || null));
    ensureOverrideMaps();
    return state.settings;
  }

  function sanitizeEdits(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (dishId) {
      if (!DATA.dishes[dishId] || !raw[dishId] || typeof raw[dishId] !== 'object') return;
      var valid = {};
      Object.keys(raw[dishId]).forEach(function (ingredientId) {
        var dish = DATA.dishes[dishId];
        var has = dish.parts.some(function (part) { return part.ingredient === ingredientId; });
        var value = Number(raw[dishId][ingredientId]);
        if (has && isFinite(value)) valid[ingredientId] = Math.min(2000, Math.max(0, value));
      });
      if (Object.keys(valid).length) out[dishId] = valid;
    });
    return out;
  }

  /* ---------------- 餐次设置 ---------------- */

  function defaultMeals() {
    return { breakfast: true, lunch: false, dinner: true };
  }

  /* 把 settings.meals / lunchMode / lunchOverrides 规整成界面可用的形状。
     至少保留一餐；模型返回的值优先，缺失时按默认早餐+晚餐。 */
  function normalizeMealSettings(settings) {
    settings = settings || state.settings;
    if (!settings.meals || typeof settings.meals !== 'object' || Array.isArray(settings.meals)) {
      settings.meals = defaultMeals();
    }
    var meals = settings.meals;
    meals.breakfast = meals.breakfast !== false;
    meals.dinner = meals.dinner !== false;
    meals.lunch = meals.lunch === true;
    /* 与模型一致：全部关闭时只强制打开早餐（界面禁止操作到这一步，这里兜底）。 */
    if (!meals.breakfast && !meals.lunch && !meals.dinner) meals.breakfast = true;
    if (settings.lunchMode !== 'cook' && settings.lunchMode !== 'packed') settings.lunchMode = 'packed';
    if (!settings.lunchOverrides || typeof settings.lunchOverrides !== 'object' || Array.isArray(settings.lunchOverrides)) {
      settings.lunchOverrides = {};
    }
    return settings;
  }

  function ensureMealSettings() {
    return normalizeMealSettings(state.settings);
  }

  function lunchMode() {
    return state.settings.lunchMode === 'cook' ? 'cook' : 'packed';
  }

  function lunchPacked() {
    return lunchMode() === 'packed';
  }

  /* 带饭需要当天晚餐作为来源：晚餐关闭时模型会自动把午餐按现做处理，界面同步。 */
  function effectiveLunchMode(plan) {
    /* 模型给出的 plan.lunchMode 是实际生效模式（晚餐关闭时带饭会降级为现做）。 */
    if (plan && (plan.lunchMode === 'packed' || plan.lunchMode === 'cook')) return plan.lunchMode;
    if (!lunchPacked()) return 'cook';
    var enabled = planMealEnabled(plan);
    return enabled.dinner ? 'packed' : 'cook';
  }

  function lunchPackedFor(plan) {
    return effectiveLunchMode(plan) === 'packed';
  }

  function mealCountWord(count) {
    return count === 1 ? '一餐' : count === 2 ? '两餐' : count === 3 ? '三餐' : count + ' 餐';
  }

  /* plan.mealsEnabled 可能是对象或数组；缺失时退回 settings.meals。 */
  function planMealEnabled(plan) {
    var source = plan && plan.mealsEnabled;
    if (Array.isArray(source)) {
      var fromArray = {};
      MEAL_SLOTS.forEach(function (slot) { fromArray[slot.id] = source.indexOf(slot.id) >= 0; });
      if (fromArray.breakfast || fromArray.lunch || fromArray.dinner) return fromArray;
    } else if (source && typeof source === 'object') {
      return {
        breakfast: source.breakfast !== false,
        lunch: source.lunch === true,
        dinner: source.dinner !== false
      };
    }
    return (state.settings.meals || defaultMeals());
  }

  function planSlots(plan) {
    var enabled = planMealEnabled(plan);
    return MEAL_SLOTS.filter(function (slot) { return !!enabled[slot.id]; });
  }

  function planSlotCount(plan) {
    return planSlots(plan).length;
  }

  function planMealWord(plan) {
    return mealCountWord(planSlotCount(plan));
  }

  /* 菜单里的餐次标题：午餐按“实际生效”模式显示带饭/现做。 */
  function slotHeading(slot, plan) {
    if (slot === 'lunch') return lunchPackedFor(plan) ? '午餐 · 带饭' : '午餐 · 现做';
    return SLOT_LABEL[slot] || slot;
  }

  function slotLabel(slot) {
    return SLOT_LABEL[slot] || slot;
  }

  /* ---------------- 小工具 ---------------- */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(value, digits) {
    var d = digits == null ? 0 : digits;
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function signed(value, digits) {
    return (value > 0 ? '+' : '') + fmt(value, digits);
  }

  function icon(name) {
    return '<svg class="icon" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  function tag(text, className, iconName) {
    return '<span class="dish-tag ' + className + '">' + (iconName ? icon(iconName) : '') + esc(text) + '</span>';
  }

  function gramsText(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return fmt(n, n % 1 ? 1 : 0);
  }

  function rangeText(range, unit) {
    if (!range) return '—';
    if (range[0] === range[1]) return fmt(range[0]) + ' ' + unit;
    return fmt(range[0]) + '–' + fmt(range[1]) + ' ' + unit;
  }

  function nutrientText(key, value) {
    if (key === 'kcal') return fmt(value) + ' kcal';
    if (key === 'sodium' || key === 'calcium' || key === 'iron') return fmt(value) + ' mg';
    return fmt(value, 1) + ' g';
  }

  function percentOf(value, target) {
    if (!target) return 0;
    return Math.min(160, Math.round(value / target * 100));
  }

  function equipmentName(id) {
    var tool = (DATA.equipment || []).filter(function (item) { return item.id === id; })[0];
    return tool ? tool.name : id;
  }

  function allergenBadges(allergens) {
    return allergens.slice(0, 3).map(function (id) {
      return tag(M.allergenLabel(id), 'tag-allergen');
    }).join('');
  }

  function storageTag(storage) {
    return storage ? tag(storage.label, storage.tag, storage.icon) : '';
  }

  function showToast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------------- 待选餐与逐天替换 ---------------- */

  function isPendingMeal(meal) {
    return !!(meal && meal.pending === true);
  }

  function mealOverrideMap(slot) {
    var key = OVERRIDE_KEY[slot] || 'dinnerOverrides';
    if (!state.settings[key] || typeof state.settings[key] !== 'object' || Array.isArray(state.settings[key])) {
      state.settings[key] = {};
    }
    return state.settings[key];
  }

  function ensureOverrideMaps() {
    MEAL_SLOTS.forEach(function (slot) { mealOverrideMap(slot.id); });
  }

  function mealDisplayName(mealId) {
    if (DATA.meals[mealId]) return DATA.meals[mealId].name;
    return typeof M.mealDisplayName === 'function' ? M.mealDisplayName(mealId) : mealId;
  }

  /* 逐天替换只列出最终配方不触发排除的餐；旧模型没有 mealFits 时退回 fitsFilters。 */
  function mealFits(mealId, settings) {
    settings = settings || state.settings;
    if (typeof M.mealFits === 'function') return M.mealFits(mealId, settings, state.edits);
    if (typeof M.fitsFilters === 'function') return M.fitsFilters(mealId, settings.exclude);
    return true;
  }

  function planPendingCount(plan) {
    if (plan && typeof plan.pendingCount === 'number') return plan.pendingCount;
    if (!plan || !plan.days) return 0;
    var slots = planSlots(plan);
    return plan.days.reduce(function (count, day) {
      return count + slots.reduce(function (sum, slot) {
        return sum + (isPendingMeal(day[slot.id]) ? 1 : 0);
      }, 0);
    }, 0);
  }

  function planDayAt(plan, index) {
    return plan && plan.days ? plan.days[index] || null : null;
  }

  function slotPending(plan, dayIndex, slot) {
    var day = planDayAt(plan, dayIndex);
    return isPendingMeal(day ? day[slot] : null);
  }

  /* 菜单/营养页共用：当天各餐是否已确定，以及“已计早餐、晚餐，午餐待选”等状态文案。
     餐次集合完全来自 plan.mealsEnabled，因此 2 餐和 3 餐都能用。 */
  function dayMealStatus(plan, nutritionDay) {
    var index = nutritionDay && typeof nutritionDay.index === 'number' ? nutritionDay.index : 0;
    var day = planDayAt(plan, index);
    var slots = planSlots(plan);
    var pending = {};
    var confirmedFallback = 0;
    slots.forEach(function (slot) {
      var key = slot.id + 'Pending';
      var flag;
      if (nutritionDay && typeof nutritionDay[key] === 'boolean') flag = nutritionDay[key];
      else flag = slotPending(plan, index, slot.id);
      pending[slot.id] = flag;
      if (!flag) confirmedFallback += 1;
    });
    var confirmed;
    if (nutritionDay && typeof nutritionDay.confirmedMeals === 'number') confirmed = nutritionDay.confirmedMeals;
    else confirmed = confirmedFallback;
    var complete = nutritionDay && typeof nutritionDay.complete === 'boolean'
      ? nutritionDay.complete : confirmed === slots.length;
    var pendingSlots = slots.filter(function (slot) { return pending[slot.id]; });
    var doneSlots = slots.filter(function (slot) { return !pending[slot.id]; });
    var label;
    if (!pendingSlots.length) label = '已计' + planWordForCount(slots.length) + '餐';
    else if (!doneSlots.length) label = planWordForCount(slots.length) + '餐待选';
    else label = '已计' + doneSlots.map(function (slot) { return slot.label; }).join('、') + '，' +
      pendingSlots.map(function (slot) { return slot.label; }).join('、') + '待选';
    return {
      index: index,
      day: day,
      slots: slots,
      pending: pending,
      breakfastPending: !!pending.breakfast,
      lunchPending: !!pending.lunch,
      dinnerPending: !!pending.dinner,
      confirmedMeals: confirmed,
      totalMeals: slots.length,
      complete: complete,
      label: label
    };
  }

  function planWordForCount(count) {
    return count === 3 ? '三' : count === 2 ? '两' : '一';
  }

  function planTotals(plan, nutrition) {
    var fallbackSlots = plan ? planSlots(plan) : MEAL_SLOTS.slice(0, 2);
    var fallbackTotal = plan ? plan.days.length * fallbackSlots.length : 0;
    var fallbackConfirmed = 0;
    if (plan) {
      plan.days.forEach(function (day) {
        fallbackSlots.forEach(function (slot) {
          if (!isPendingMeal(day[slot.id])) fallbackConfirmed += 1;
        });
      });
    }
    var total = (nutrition && nutrition.total) || {};
    var confirmedMeals = typeof total.confirmedMeals === 'number' ? total.confirmedMeals : fallbackConfirmed;
    var totalMeals = typeof total.totalMeals === 'number' ? total.totalMeals
      : (plan && typeof plan.totalMeals === 'number' ? plan.totalMeals : fallbackTotal);
    return {
      confirmedMeals: confirmedMeals,
      totalMeals: totalMeals,
      complete: confirmedMeals >= totalMeals
    };
  }

  function confirmedMealsText(meta) {
    return '已计 ' + meta.confirmedMeals + '/' + meta.totalMeals + ' 餐';
  }

  /* 采购、时间线、备餐模块、储存页共用：当前已计餐数与已开启餐次。 */
  function mealCountLine(plan, nutrition) {
    var meta = planTotals(plan, nutrition);
    var names = planSlots(plan).map(function (slot) { return slot.label; }).join('、');
    return '当前' + confirmedMealsText(meta) + '（已开启' + names + '）。';
  }

  /* 带饭午餐在采购/时间线/分装页只展示模型算好的增量，不重复计算。 */
  function lunchPackedNotice(plan, text) {
    if (!(state.settings.meals && state.settings.meals.lunch) || !lunchPackedFor(plan)) return '';
    return '<div class="notice info">' + icon('i-leaf') + '<div><p><strong>带饭午餐：</strong>' +
      esc(text || '午餐复用当天晚餐同款、多做一份；采购与分装已包含这份增量，不额外开火。') + '</p></div></div>';
  }

  /* 采购、时间线、分装/容器、储存页共用的未计入提示。 */
  function pendingNotice(plan, extra) {
    var count = planPendingCount(plan);
    if (!count) return '';
    return '<div class="notice warn pending-notice">' + icon('i-warning') + '<div>' +
      '<p><strong>有 ' + count + ' 餐待选</strong>，未计入采购/时间线/分装/容器。</p>' +
      '<p>补选后会自动恢复采购、时间线和分装的计算' +
      (extra ? '；' + esc(extra) : '') + '。</p></div></div>';
  }

  function pendingMealCard(label, slot, pending, dayIndex, plan) {
    var safe = isPendingMeal(pending) ? pending : {};
    var conflicts = (safe.conflictAllergens || []).map(function (item) {
      return DATA.allergens.some(function (a) { return a.id === item; }) ? M.allergenLabel(item) : String(item);
    });
    var reason = safe.reason || (conflicts.length ? '含' + conflicts.join('、') : '需要确认');
    var reco = safe.recommendation || null;
    var html = '<article class="meal pending-card pending-meal" data-pending-meal="' + slot + '" data-day="' + dayIndex + '" aria-label="第 ' + (dayIndex + 1) + ' 天' + label + '待选">' +
      '<div class="meal-head pending-head"><span>' + label + ' · 待选</span>' +
      '<span class="pending-flag">' + icon('i-warning') + '待确定</span></div>' +
      '<p class="pending-reason">原因：' + esc(reason) + '。已排除冲突未解决，这一餐暂不计入营养、采购和时间线。</p>';
    if (reco) {
      html += '<div class="pending-reco">' +
        '<p class="pending-reco-name"><strong>推荐：</strong>' + esc(reco.name || mealDisplayName(reco.id)) + '</p>' +
        (reco.reason ? '<p class="pending-reco-note">替换原因：' + esc(reco.reason) + '</p>' : '') +
        (conflicts.length ? '<p class="pending-reco-note">冲突食材：' + conflicts.map(function (name) {
          return tag(name, 'tag-allergen');
        }).join('') + '</p>' : '') +
        (reco.sharedIngredients && reco.sharedIngredients.length ? '<p class="pending-reco-note">可复用食材：' +
          esc(reco.sharedIngredients.join('、')) + '</p>' : '') +
        '<button type="button" class="btn primary small" data-action="confirm-recommendation" data-day="' + dayIndex +
        '" data-meal-type="' + slot + '" data-meal-id="' + esc(reco.id) + '">使用推荐</button>' +
        '</div>';
    } else {
      html += '<p class="pending-empty">没有合规候选，请放宽筛选或手动选菜。</p>';
    }
    html += '<p class="pending-hint">' + (slot === 'lunch' && lunchPackedFor(plan)
      ? '带饭午餐跟随当天晚餐；先确认晚餐，采购会按“多做一份”自动增加，不额外开火。'
      : '也可以用下方的「' + slotLabel(slot) + '」下拉逐天替换；补选后会重新计入营养、采购、时间线和分装。') + '</p></article>';
    return html;
  }

  /* ---------------- 三餐开关与午餐模式 ---------------- */

  function ensureMealSetup() {
    var root = document.getElementById('mealSetup');
    if (!root) {
      /* index.html 没带容器时兜底：插到 #presets 前。 */
      root = document.createElement('div');
      root.id = 'mealSetup';
      root.className = 'meal-setup';
      root.setAttribute('aria-label', '这周吃哪几餐');
      var presets = document.getElementById('presets');
      if (presets && presets.parentNode) presets.parentNode.insertBefore(root, presets);
      else {
        var setup = document.querySelector('.setup');
        if (setup) setup.appendChild(root);
      }
    }
    if (!root) return null;
    if (!root.dataset.mealSetupBound) {
      root.addEventListener('click', onMealSetupClick);
      root.dataset.mealSetupBound = 'true';
    }
    return root;
  }

  function mealSlotNote(slotId) {
    var found = (DATA.mealSlots || []).filter(function (item) { return item.id === slotId; })[0];
    return found && found.note ? found.note : '';
  }

  function lunchModeEntry(id) {
    return (DATA.lunchModes || []).filter(function (item) { return item.id === id; })[0] || null;
  }

  /* 首页 setup-head 下方、preset-grid 上方的独立三餐控制条（在“调整细节”折叠区之外，首屏可见）。 */
  function renderMealSetup() {
    var root = ensureMealSetup();
    if (!root) return;
    var settings = ensureMealSettings();
    var meals = settings.meals;
    var activeCount = MEAL_SLOTS.filter(function (slot) { return meals[slot.id]; }).length;
    var toggles = MEAL_SLOTS.map(function (slot) {
      var on = !!meals[slot.id];
      var sub = '';
      if (slot.id === 'lunch') {
        sub = on ? (lunchPacked() ? (meals.dinner ? '带饭' : '带饭自动改现做') : '现做') : '可带饭或现做';
      }
      else sub = on ? '已开启' : '未开启';
      return '<button type="button" class="meal-toggle' + (on ? ' is-active' : '') + '" data-action="toggle-meal" data-meal="' +
        slot.id + '" aria-pressed="' + on + '"' + (on && activeCount === 1 ? ' title="至少要保留一餐，不能全部关闭"' : '') + '>' +
        '<strong>' + esc(slot.label) + '</strong><span>' + esc(sub) + '</span></button>';
    }).join('');

    var lunchOn = !!meals.lunch;
    var modeHtml = '';
    if (lunchOn) {
      var current = lunchMode();
      var entry = lunchModeEntry(current);
      var buttons = ['packed', 'cook'].map(function (id) {
        var active = current === id;
        return '<button type="button" data-action="set-lunch-mode" data-value="' + id + '"' +
          (active ? ' class="is-active"' : '') + ' aria-pressed="' + active + '">' +
          esc(LUNCH_MODE_LABEL[id]) + '</button>';
      }).join('');
      var note = entry && entry.note ? entry.note
        : (current === 'packed'
          ? '午餐复用当天晚餐同款，多做一份装便当；采购增加一份，时间线只加装盒，不增加锅次。'
          : '午餐从晚餐菜库里独立选一道，采购和时间线都按单独一餐计算。');
      if (current === 'packed' && !meals.dinner) {
        note += ' 当前晚餐未开启，带饭会自动按现做处理；想带饭请同时开启晚餐。';
      }
      modeHtml = '<div class="lunch-mode-row" id="lunchModeRow">' +
        '<span class="field-label" id="lunchModeLabel">午餐怎么吃</span>' +
        '<div class="segmented compact" id="lunchMode" role="group" aria-labelledby="lunchModeLabel">' + buttons + '</div>' +
        '<p class="lunch-mode-note" id="lunchModeNote">' + esc(note) + '</p></div>';
    }

    var slotNotes = MEAL_SLOTS.filter(function (slot) { return !meals[slot.id]; }).map(function (slot) {
      return slot.label;
    });
    root.innerHTML = '<div class="meal-setup-inner">' +
      '<div class="meal-setup-head"><span class="meal-setup-title">这周吃哪几餐</span>' +
      '<p class="meal-setup-hint">早餐、午餐、晚餐可独立开关，至少保留一餐；关闭的餐不进入菜单、营养和采购。' +
      (slotNotes.length ? '当前未选：' + esc(slotNotes.join('、')) + '。' : '') + '</p></div>' +
      '<div class="meal-toggles" role="group" aria-label="这周吃哪几餐">' + toggles + '</div>' +
      modeHtml + '</div>';
  }

  function bindMealSetup() {
    ensureMealSetup();
  }

  function focusMealSetup(selector) {
    var root = document.getElementById('mealSetup');
    if (!root || !selector) return;
    var el = root.querySelector(selector);
    if (el && el.focus) el.focus({ preventScroll: true });
  }

  function onMealSetupClick(event) {
    var toggle = event.target.closest('[data-action="toggle-meal"]');
    if (toggle) {
      setMealEnabled(toggle.getAttribute('data-meal'));
      return;
    }
    var modeButton = event.target.closest('[data-action="set-lunch-mode"]');
    if (modeButton) setLunchMode(modeButton.getAttribute('data-value'));
  }

  /* 至少保留一餐：最后一个开启的餐次不允许关闭，给出提示而不是静默失败。 */
  function setMealEnabled(id) {
    if (!SLOT_LABEL[id]) return;
    var meals = ensureMealSettings().meals;
    if (meals[id]) {
      var activeCount = MEAL_SLOTS.filter(function (slot) { return meals[slot.id]; }).length;
      if (activeCount <= 1) {
        showToast('至少保留一餐：早餐、午餐、晚餐不能全部关闭');
        focusMealSetup('[data-action="toggle-meal"][data-meal="' + id + '"]');
        return;
      }
      meals[id] = false;
    } else {
      meals[id] = true;
    }
    save();
    render();
    focusMealSetup('[data-action="toggle-meal"][data-meal="' + id + '"]');
    showToast((meals[id] ? '已开启：' : '已关闭：') + SLOT_LABEL[id] +
      (id === 'lunch' ? '（' + (lunchPacked() ? '带饭' : '现做') + '）' : ''));
  }

  function setLunchMode(value) {
    if (value !== 'packed' && value !== 'cook') return;
    if (state.settings.lunchMode === value) {
      focusMealSetup('[data-action="set-lunch-mode"][data-value="' + value + '"]');
      return;
    }
    state.settings.lunchMode = value;
    ensureMealSettings();
    save();
    render();
    focusMealSetup('[data-action="set-lunch-mode"][data-value="' + value + '"]');
    showToast('午餐模式：' + LUNCH_MODE_LABEL[value]);
  }

  /* ---------------- 设置同步 ---------------- */

  function syncControls() {
    var s = state.settings;
    $$('#days button').forEach(function (btn) {
      var active = Number(btn.dataset.value) === s.days;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $('#adults').value = String(s.adults);
    $('#kidAge').value = s.kidAge;
    $('#style').value = s.style;
    $('#shortcut').checked = s.shortcut;
    $('#shortcut').closest('.switch').title = '';
    $('#onigiriSize').value = String(s.onigiri.size);
    $('#onigiriPieces').value = String(s.onigiri.pieces);
    $('#riceType').value = s.riceType;
    $('#riceAddIn').value = s.riceAddIn;
    $('#riceAddIn').disabled = s.riceType === 'instant';
    var onigiriEnabled = !['oat','frozen'].includes(s.style);
    $('#onigiriSize').disabled = !onigiriEnabled;
    $('#onigiriPieces').disabled = !onigiriEnabled;
    $('#onigiriSize').title = onigiriEnabled ? '' : '当前早餐风格不含饭团';
    $('#onigiriPieces').title = onigiriEnabled ? '' : '当前早餐风格不含饭团';
    $$('#salt button').forEach(function (btn) {
      var active = btn.dataset.value === s.salt;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $$('#texture button').forEach(function (btn) {
      var active = btn.dataset.value === s.texture;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $$('#allergens .chip').forEach(function (chip) {
      var active = s.exclude.indexOf(chip.dataset.allergen) >= 0;
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var kidLabels = { '4-6': '4–6 岁', '7-10': '7–10 岁', '11-13': '11–13 岁' };
    var peopleLabel = s.adults + ' 位成人' +
      (s.kidAge === 'none' ? '，无儿童' : ' + 1 位 ' + (kidLabels[s.kidAge] || '儿童'));
    var notes = [];
    notes.push(s.days + ' 天 · ' + peopleLabel +
      (s.kidAge === 'none' ? '（不计算儿童份量）' : ' · 儿童份量系数 ' + fmt(M.kidFactor(s), 2)));
    var enabledNames = planSlots(null).map(function (slot) { return slot.label; }).join('、');
    notes.push('餐次：' + enabledNames +
      (s.meals.lunch ? '（午餐' + (lunchPackedFor(null) ? '带饭' : '现做') + '）' : ''));
    notes.push('早餐：' + DATA.plans[s.style].label + '；晚餐：' + DATA.rotations[s.rotation].label);
    notes.push('盐量：' + (s.salt === 'low' ? '减盐' : '标准') + '；儿童口感：' + (s.texture === 'soft' ? '软烂易嚼' : '标准'));
    notes.push(['oat','frozen'].includes(s.style) ? '饭团：本周不吃饭团' : '饭团：每位成人 ' + s.onigiri.pieces + ' 个 × ' + s.onigiri.size + ' g 米饭' +
      (s.kidAge === 'none' ? '' : '；儿童约 ' + fmt(s.onigiri.pieces * M.kidFactor(s), 1) + ' 个'));
    var riceType = DATA.riceTypes.filter(function (item) { return item.id === s.riceType; })[0];
    var addIn = DATA.riceAddIns.filter(function (item) { return item.id === s.riceAddIn; })[0];
    notes.push('晚餐米饭：' + (riceType ? riceType.label : '白米饭') +
      (s.riceType === 'instant' ? '（饭团仍用白米）' : addIn && addIn.id !== 'none' ? '；同煮：' + addIn.label : ''));
    if (s.exclude.length) notes.push('已排除：' + M.allergenList(s).join('、'));
    $('#setupSummary').textContent = s.days+' 天 · '+peopleLabel+' · '+enabledNames+(s.exclude.length?' · 已排除 '+M.allergenList(s).join('、'):'');
  }

  function renderRiceOptions() {
    $('#riceType').innerHTML = DATA.riceTypes.map(function (item) {
      return '<option value="' + item.id + '">' + esc(item.label) + '</option>';
    }).join('');
    $('#riceAddIn').innerHTML = DATA.riceAddIns.map(function (item) {
      return '<option value="' + item.id + '">' + esc(item.label) + '</option>';
    }).join('');
  }

  function renderAllergenChips() {
    $('#allergens').innerHTML = DATA.allergens.map(function (allergen) {
      return '<button type="button" class="chip" data-allergen="' + allergen.id + '" aria-pressed="false" title="' + esc(allergen.detail) + '">' + esc(allergen.label) + '</button>';
    }).join('');
  }

  /* ---------------- 计算与状态查询 ---------------- */

  function build() {
    var settings = state.settings;
    var plan = M.buildPlan(settings, state.edits);
    var nutrition = M.planNutrition(plan, settings, state.edits);
    var shopping = M.buildShopping(plan, settings, state.edits);
    var timeline = M.buildTimeline(plan, settings, state.edits);
    var containers = M.buildContainerPlan(plan, settings);
    var equipment = M.buildEquipmentUsage(plan, settings);
    return { plan: plan, nutrition: nutrition, shopping: shopping, timeline: timeline, containers: containers, equipment: equipment };
  }

  function dishNutri(dishId) {
    return M.dishNutrition(dishId, state.settings, state.edits);
  }

  function uncheckedCount(shopping) {
    return shopping.rows.filter(function (row) {
      return !row.pantry && state.checks[M.shoppingKey(row)] !== true;
    }).length;
  }

  /* ---------------- 顶部分区 ---------------- */

  function renderTabs(model) {
    var counts = {
      menu: state.settings.days,
      shopping: uncheckedCount(model.shopping)
    };
    $('#tabs').innerHTML = TABS.map(function (tab) {
      var count = counts[tab.id];
      var active = state.tab === tab.id;
      return '<button class="tab" role="tab" id="tab-' + tab.id +
        '" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-tab="' + tab.id + '">' +
        esc(tab.label) +
        (count != null ? '<span class="count">' + fmt(count) + '</span>' : '') +
        '</button>';
    }).join('');
    $$('#tabs .tab').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTab(btn.dataset.tab); });
      btn.addEventListener('keydown', function (event) {
        var idx = TABS.map(function (t) { return t.id; }).indexOf(btn.dataset.tab);
        var next = -1;
        if (event.key === 'ArrowRight') next = (idx + 1) % TABS.length;
        if (event.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = TABS.length - 1;
        if (next >= 0) {
          event.preventDefault();
          var target = $('#tab-' + TABS[next].id);
          if (target) target.focus();
        }
      });
    });
  }

  function selectTab(tabId, focusPanel) {
    if (!TABS.some(function (t) { return t.id === tabId; })) return;
    var changed = state.tab !== tabId;
    state.tab = tabId;
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + tabId);
      }
    } catch (err) { /* 某些浏览器的 file:// 限制 */ }
    render();
    if (changed) scrollToTabs();
    var activeTab = $('#tab-' + tabId);
    if (activeTab && activeTab.scrollIntoView) {
      activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    var panel = $('#panel-' + tabId);
    if (focusPanel && panel) panel.focus({ preventScroll: true });
    else if (activeTab) activeTab.focus({ preventScroll: true });
  }

  /* ---------------- 主渲染 ---------------- */

  function scrollToTabs() {
    var tabs = $('#tabs');
    if (!tabs) return;
    var y = tabs.getBoundingClientRect().top + window.scrollY - 6;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  }

  function captureViewFocus() {
    var el = document.activeElement;
    if (!el || !el.closest || !el.closest('#views')) return null;
    return {
      action: el.getAttribute('data-action'),
      value: el.getAttribute('data-value'),
      key: el.getAttribute('data-key'),
      mealSwap: el.getAttribute('data-meal-swap'),
      day: el.getAttribute('data-day'),
      mealType: el.getAttribute('data-meal-type'),
      mealId: el.getAttribute('data-meal-id'),
      dinnerSwap: el.getAttribute('data-dinner-swap')
    };
  }

  function restoreViewFocus(spec) {
    if (!spec) return;
    var el = null;
    if (spec.mealSwap != null) {
      el = $$('#views select[data-meal-swap="' + spec.mealSwap + '"]').filter(function (node) {
        return spec.day == null || node.getAttribute('data-day') === spec.day;
      })[0] || null;
    } else if (spec.dinnerSwap != null) {
      el = $('#views select[data-dinner-swap="' + spec.dinnerSwap + '"]');
    } else if (spec.action) {
      el = $$('#views [data-action="' + spec.action + '"]').filter(function (node) {
        if (spec.key != null && node.getAttribute('data-key') !== spec.key) return false;
        if (spec.value != null && node.getAttribute('data-value') !== spec.value) return false;
        if (spec.mealType != null && node.getAttribute('data-meal-type') !== spec.mealType) return false;
        if (spec.day != null && node.getAttribute('data-day') !== spec.day) return false;
        if (spec.mealId != null && node.getAttribute('data-meal-id') !== spec.mealId) return false;
        return true;
      })[0];
    }
    if (el && el.focus) el.focus({ preventScroll: true });
  }

  function render() {
    ensureMealSettings();
    var model = build();
    syncControls();
    renderMealSetup();
    renderTabs(model);
    var focusSpec = captureViewFocus();
    var view = $('#views');
    var scroll = window.scrollY;
    var html = '';
    switch (state.tab) {
      case 'nutrition': html = viewNutrition(model); break;
      case 'shopping': html = viewShopping(model); break;
      case 'timeline': html = viewTimeline(model); break;
      case 'modules': html = viewModules(model); break;
      case 'storage': html = viewStorage(model); break;
      case 'alternatives': html = viewAlternatives(model); break;
      case 'about': html = viewAbout(); break;
      default: html = viewMenu(model);
    }
    if ((state.tab === 'nutrition' || state.tab === 'menu') && model.plan.days.some(function(day) {
      return day.breakfast && /^bf_frozen_/.test(day.breakfast.id || '');
    })) {
      html = '<p class="notice info" role="note">本周选有超市冷冻早餐。成品缺少具体商品营养标签，显示的小计仅含已知食材，成品热量与营养尚未计入当天和全周总量。</p>' + html;
    }
    view.innerHTML = '<section class="view" id="panel-' + state.tab + '" role="tabpanel" aria-labelledby="tab-' + state.tab + '" tabindex="-1">' + html + '</section>';
    renderBuildNote();
    window.scrollTo(0, scroll);
    restoreViewFocus(focusSpec);
    if (state.tab === 'menu' || state.tab === 'nutrition') {
      // 为移动端的 sticky 顶栏留出焦点位置
      var panel = $('#panel-' + state.tab);
      if (panel) panel.setAttribute('tabindex', '-1');
    }
  }

  function renderBuildNote() {
    $('#buildNote').textContent = 'V' + DATA.meta.version + ' · 数据更新 ' + DATA.meta.updated +
      ' · 所有计算在本机完成，不上传任何数据 · 设置保存在当前浏览器';
  }

  /* =========================================================
     菜单
     ========================================================= */

  function mealSlotPrintLabels(plan) {
    return planSlots(plan).map(function (slot) {
      if (slot.id !== 'lunch') return slot.label;
      return '午餐（' + (lunchPackedFor(plan) ? '带饭' : '现做') + '）';
    }).join('、');
  }

  function printHeader(model) {
    var s = state.settings;
    var rice = DATA.riceTypes.filter(function (item) { return item.id === s.riceType; })[0];
    var meta = planTotals(model.plan, model.nutrition);
    var pendingCount = planPendingCount(model.plan);
    return '<div class="print-only print-head"><strong>' + esc(M.describePlan(model.plan, s)) + '</strong>' +
      ' · 餐次：' + esc(mealSlotPrintLabels(model.plan)) +
      ' · ' + esc(confirmedMealsText(meta)) +
      ' · 盐量：' + (s.salt === 'low' ? '减盐' : '标准') +
      ' · 口感：' + (s.texture === 'soft' ? '软烂' : '标准') +
      ' · 晚餐米饭：' + esc(rice ? rice.label : '白米饭') +
      (pendingCount ? ' · 有 ' + pendingCount + ' 餐待选未计入' : '') +
      '。<br>克数为每位成人；儿童按系数缩放。打印于 ' + new Date().toLocaleDateString('zh-CN') + '。</div>';
  }

  /* 菜单页直接提示缺少的关键工具：不能只在备餐模块里提示。 */
  function missingToolsNotice(model) {
    var missing = (model.equipment && model.equipment.missing) || [];
    if (!missing.length) return '';
    var rows = missing.map(function (tool) {
      var affected = [];
      model.plan.days.forEach(function (day) {
        planSlots(model.plan).forEach(function (slot) {
          var meal = day[slot.id];
          if (!meal || meal.pending) return;
          (meal.dishes || []).forEach(function (d) {
            var dish = DATA.dishes[d.id];
            if (!dish || (dish.equipment || []).indexOf(tool.id) < 0) return;
            if (affected.indexOf(dish.name) < 0) affected.push(dish.name);
          });
        });
      });
      return '<p><strong>缺少' + esc(tool.name) + '：</strong>' +
        (affected.length ? '会影响 ' + esc(affected.slice(0, 4).join('、')) + (affected.length > 4 ? ' 等' : '') + '。' : '') +
        esc(tool.alternative || '需要换工具或调整菜单。') + '</p>';
    }).join('');
    return '<div class="notice warn menu-tool-notice">' + icon('i-warning') + '<div>' +
      '<p><strong>当前菜单需要你还没有的工具</strong></p>' + rows +
      '<p>请到「备餐模块」打开对应工具，或在每天菜单底部逐天换餐。</p></div></div>';
  }

  function viewMenu(model) {
    var plan = model.plan;
    var settings = state.settings;
    var notices = missingToolsNotice(model) + warningsHtml(plan, model);
    var slots = planSlots(plan);
    var threeMeals = slots.length === 3;
    var titleWord = threeMeals ? '三餐' : (slots.length === 1 ? slots[0].label : '早晚餐');

    var expanded = new Set(Array.from(document.querySelectorAll('.menu-day[open]')).map(function(el){return el.dataset.day;}));
    var cards = plan.days.map(function (day) {
      var nutritionDay = model.nutrition.days[day.index];
      var status = dayMealStatus(plan, nutritionDay);
      var storageCounts = countStorage(day);
      var wide = settings.days % 2 === 1 && day.index === settings.days - 1;
      var summary = slots.map(function(slot){
        var meal = day[slot.id];
        var names = meal && !meal.pending ? meal.dishes.map(function(d){return d.name;}).join('、') : '待选';
        return '<span class="overview-row" data-slot="'+esc(slot.id)+'"><small>'+esc(slot.label)+'</small>'+esc(names)+'</span>';
      }).join('');
      return '<details class="day-card menu-day" data-day="'+day.index+'" '+(expanded.has(String(day.index))?'open':'')+'><summary><b>第 '+(day.index+1)+' 天</b><span class="detail-label"><span class="when-closed">详情 / 换餐</span><span class="when-open">收起详情</span></span>'+summary+'</summary>'+
        '<div class="day-meals' + (threeMeals ? ' is-three' : '') + '">' + dayMealsHtml(model, day) + '</div>' +
        '<footer class="day-foot">' + dayFootHtml(model, day, status) + '</footer>' +
        '</details>';
    }).join('');

    return printHeader(model) + '<section class="section">' +
      '<div class="section-head"><div><h2>这周的' + esc(titleWord) + '</h2>' +
      '<p class="section-sub">点击任意菜品可调整每位成人的克数；改动会同步到营养、采购和分装。菜单允许重复，重复的菜通常更省时间。点每天卡片底部的按钮换' +
      esc(slots.map(function (slot) { return slot.label; }).join('、')) + '，下拉里只列出不触发过敏原排除的餐。' +
      (threeMeals && !lunchPackedFor(plan) ? '午餐从晚餐菜库独立选一道。' : '') + '</p></div>' +
      '<div class="section-actions"><button type="button" class="btn secondary small" data-action="print">' + icon('i-print') + '打印菜单</button></div></div>' +
      notices +
      '<div class="day-grid" style="--days:' + settings.days + '">' + cards + '</div>' +
      '</section>' +
      '<section class="section">' +
      lunchMenuNotice(slots, plan) +
      '<div class="notice info">' + icon('i-warning') + '<div><p><strong>儿童餐提示：</strong>饭团做小、海苔剪成小片，玉米和毛豆压碎，鱼肉去刺；每道菜的儿童与软烂提示在份量弹窗里。</p></div></div>' +
      '</section>';
  }

  /* 菜单页底部：按午餐开关/模式解释营养与采购口径。 */
  function lunchMenuNotice(slots, plan) {
    var lunchOn = slots.some(function (slot) { return slot.id === 'lunch'; });
    var head = '<div class="notice info">' + icon('i-leaf') + '<div>';
    if (!lunchOn) {
      var planning = slots.map(function (slot) { return slot.label; }).join('、');
      return head + '<p><strong>午餐未开启：</strong>本页只规划' + esc(planning) + '，午餐、加餐和饮料没有计入营养和采购；需要时在顶部「这周吃哪几餐」打开午餐。</p></div></div>';
    }
    if (lunchPackedFor(plan)) {
      return head + '<p><strong>午餐是带饭模式：</strong>复用当天晚餐同款、多做一份装便当，不额外开火；采购按多做一份自动增加，营养按实际吃掉的餐计入。</p></div></div>';
    }
    if (lunchPacked()) {
      return head + '<p><strong>午餐按现做处理：</strong>当前没有开启晚餐，带饭没有可复制的来源，所以午餐改为从晚餐菜库单独选一道、单独开火；营养、采购、时间线和分装都按独立一餐计算。想带饭就同时开启晚餐。</p></div></div>';
    }
    return head + '<p><strong>午餐是现做模式：</strong>午餐从晚餐菜库单独选一道，单独开火；营养、采购、时间线和分装都按独立一餐计算。可在每天卡片底部逐天替换。</p></div></div>';
  }

  function dayMealsHtml(model, day) {
    var nutritionDay = model.nutrition.days[day.index];
    var html = '';
    planSlots(model.plan).forEach(function (slot) {
      var meal = day[slot.id];
      var nutri = nutritionDay ? nutritionDay[slot.id] : null;
      var label = slotHeading(slot.id, model.plan);
      if (isPendingMeal(meal)) html += pendingMealCard(label, slot.id, meal, day.index, model.plan);
      else if (meal) html += mealBlock(label, slot.id, meal, nutri, day.index, model.plan);
    });
    return html;
  }

  function dayFootHtml(model, day, status) {
    var nutritionDay = model.nutrition.days[day.index] || {};
    var adult = nutritionDay.adult || { kcal: 0 };
    var kid = nutritionDay.kid;
    var count = status.slots.length;
    var word = mealCountWord(count);
    var text;
    if (status.confirmedMeals >= count) {
      text = word + '合计 <strong>' + fmt(adult.kcal) + '</strong> kcal / 成人' +
        (kid ? ' · 儿童约 ' + fmt(kid.kcal) : '');
    } else if (status.confirmedMeals > 0) {
      var doneLabels = status.slots.filter(function (slot) { return !status.pending[slot.id]; })
        .map(function (slot) { return slot.label; }).join('、');
      var pendingLabels = status.slots.filter(function (slot) { return status.pending[slot.id]; })
        .map(function (slot) { return slot.label; }).join('、');
      text = '已计' + esc(doneLabels) + ' <strong>' + fmt(adult.kcal) + '</strong> kcal / 成人' +
        ' · <span class="pending-inline">' + esc(pendingLabels) + '待选</span>';
    } else {
      text = word + '待选，暂无可计热量';
    }
    var swaps = status.slots.map(function (slot) { return swapSelect(slot.id, day.index, model.plan); }).join('');
    return '<span class="day-total' + (status.complete ? '' : ' is-incomplete') + '">' + text + '</span>' +
      '<div class="meal-swaps">' + swaps + '</div>';
  }

  function countStorage(day) {
    var counts = { freeze: 0, fridge: 0, prep: 0, fresh: 0 };
    MEAL_SLOTS.forEach(function (slot) {
      var meal = day[slot.id];
      (meal && meal.dishes ? meal.dishes : []).forEach(function (dish) {
        if (dish.storage && counts[dish.storage.key] != null) counts[dish.storage.key] += 1;
      });
    });
    return counts;
  }

  function storageSummary(counts) {
    var bits = [];
    if (counts.freeze) bits.push('冷冻 ' + counts.freeze);
    if (counts.fridge) bits.push('冷藏 ' + counts.fridge);
    if (counts.prep) bits.push('现做 ' + counts.prep);
    if (counts.fresh) bits.push('现加 ' + counts.fresh);
    return bits.join(' · ') || '—';
  }

  function mealBlock(label, slot, meal, nutrition, dayIndex, plan) {
    if (!meal || isPendingMeal(meal)) return '';
    nutrition = nutrition || { adult: { kcal: 0 } };
    var dishes = (meal.dishes || []).map(function (dish) {
      var dn = dishNutri(dish.id);
      var parts = dn.parts;
      var summary = parts.slice(0, 3).map(function (part) {
        var ing = DATA.ingredients[part.ingredient];
        return (ing ? ing.name : part.ingredient) + ' ' + gramsText(part.grams) + ' g';
      }).join(' · ') + (parts.length > 3 ? ' 等 ' + parts.length + ' 项' : '');
      var edited = M.hasEdits(dish.id, state.edits);
      var allergens = dish.allergens || [];
      var soft = state.settings.texture === 'soft' && DATA.dishes[dish.id] && DATA.dishes[dish.id].softNote
        ? '<span class="dish-soft">软烂：' + esc(DATA.dishes[dish.id].softNote) + '</span>' : '';
      return '<button type="button" class="dish-row" data-action="open-dish" data-dish="' + dish.id + '" data-day="' + dayIndex + '" data-meal="' + slot + '" title="' + esc('点击调整份量') + '">' +
        '<span><span class="dish-name">' + esc(dish.name) + (dish.swappedFrom ? '（烤鸡替换）' : '') + '</span>' +
        '<span class="dish-meta">' + esc(summary) +
        storageTag(dish.storage) +
        (edited ? tag('已调整', 'tag-low', 'i-pencil') : '') +
        allergenBadges(allergens) +
        (dishHasUnknownNutrition(dish.id) ? tag('过敏原待核', 'tag-allergen', 'i-warning') : '') +
        '</span>' + soft + '</span>' +
        '<span class="dish-kcal">' + (DATA.dishes[dish.id].kind === 'commercialFrozen' ? '营养待核' : fmt(dn.adult.kcal) + ' kcal') + '</span></button>';
    }).join('');

    var packed = slot === 'lunch' && lunchPackedFor(plan);
    var packedNote = packed
      ? '<p class="meal-note">复用当天晚餐，多做一份；不额外开火。</p>' : '';

    return '<div class="meal' + (slot === 'lunch' ? (packed ? ' is-packed' : ' is-cooked') : '') + '" data-meal-slot="' + slot + '">' +
      '<div class="meal-head"><span>' + esc(label) + '</span><span class="meal-kcal">' + (/^bf_frozen_/.test(meal.id) ? '已知配餐约 ' : '约 ') + fmt(nutrition.adult.kcal) + ' kcal</span></div>' +
      packedNote +
      dishes + '</div>';
  }

  /* 逐天替换选项：只保留 M.mealFits 为真的餐；当前 override 仍然选中。
     午餐现做时只用 M.lunchMealIds()（晚餐菜库）+ M.mealFits 过滤。 */
  function swapOptions(slot, dayIndex) {
    var settings = state.settings;
    var override = mealOverrideMap(slot)[dayIndex] || '';
    var placeholder = SLOT_PLACEHOLDER[slot] || '按轮换';
    var entries = [];
    if (slot === 'lunch') {
      var ids = typeof M.lunchMealIds === 'function' ? M.lunchMealIds() : [];
      if (!ids || !ids.length) {
        ids = Object.keys(DATA.meals).filter(function (id) { return DATA.meals[id].type === 'dinner'; });
      }
      ids.forEach(function (id) {
        var meal = DATA.meals[id];
        if (!meal || !mealFits(id, settings)) return;
        entries.push({ id: id, name: meal.name });
      });
    } else {
      Object.keys(DATA.meals).forEach(function (id) {
        var meal = DATA.meals[id];
        if (!meal || meal.type !== slot) return;
        if (!mealFits(id, settings)) return;
        entries.push({ id: id, name: meal.name });
      });
    }
    var html = '<option value=""' + (override ? '' : ' selected') + '>' + placeholder + '</option>';
    if (override && !entries.some(function (entry) { return entry.id === override; })) {
      html += '<option value="' + esc(override) + '" selected>' + esc(mealDisplayName(override)) + '（与当前排除冲突，待重选）</option>';
    }
    html += entries.map(function (entry) {
      return '<option value="' + esc(entry.id) + '"' + (entry.id === override ? ' selected' : '') + '>' +
        esc(entry.name) + '</option>';
    }).join('');
    return html;
  }

  function swapSelect(slot, dayIndex, plan) {
    var label = SLOT_LABEL[slot] || slot;
    /* 带饭午餐跟随当天晚餐，不需要单独的替换下拉。 */
    if (slot === 'lunch' && lunchPackedFor(plan)) {
      return '<span class="swap-static" data-lunch-packed="' + dayIndex + '">' +
        '<span>' + esc(label) + '</span><span class="swap-static-note">带饭：跟随晚餐</span></span>';
    }
    var dropdown = '<label class="swap-label"><span>' + esc(label) + '</span>' +
      '<select data-meal-swap="' + slot + '" data-day="' + dayIndex + '"' +
      (slot === 'dinner' ? ' data-dinner-swap="' + dayIndex + '"' : '') +
      ' aria-label="第 ' + (dayIndex + 1) + ' 天' + esc(label) + '">' +
      swapOptions(slot, dayIndex) + '</select></label>';
    if (!window.simpleView) return dropdown;
    var current = plan.days[dayIndex][slot];
    var choices = Object.keys(DATA.meals).filter(function(id) {
      return DATA.meals[id].type === (slot === 'lunch' ? 'dinner' : slot) &&
        (!current || current.id !== id) && mealFits(id, state.settings);
    });
    if (choices.length) { var offset = (dayIndex * 3) % choices.length; choices = choices.slice(offset).concat(choices.slice(0, offset)).slice(0, 3); }
    return '<details class="swap-picker"><summary>换' + esc(label) + '</summary>' +
      choices.map(function(id){return '<button type="button" class="btn secondary small" data-quick-choice="' + esc(id) + '">' + esc(DATA.meals[id].name) + '</button>';}).join('') +
      dropdown.replace('<span>' + esc(label) + '</span>', '<span>全部可选餐</span>') + '</details>';

  }

  function warningsHtml(plan, model) {
    var groups = {};
    var modeNotes = [];
    plan.warnings.forEach(function (warning) {
      // 待选餐由独立卡片说明原因，不再沿用旧的“已保留原餐”文案。
      if (warning.pending) return;
      // 晚餐关闭但选择了带饭午餐：模型会自动按现做处理，这里只做说明。
      if (!warning.from && !warning.to) {
        if (warning.reason) modeNotes.push({ day: warning.day, meal: warning.meal, reason: warning.reason });
        return;
      }
      var kindKey = warning.to ? 'swap:' + warning.from + '>' + warning.to : 'miss:' + warning.from;
      if (!groups[kindKey]) {
        groups[kindKey] = {
          tone: warning.to ? 'warn' : 'danger',
          kind: 'replace',
          from: warning.from,
          to: warning.to,
          days: [],
          meal: warning.meal
        };
      }
      groups[kindKey].days.push(warning.day + 1);
    });

    var messages = Object.keys(groups).map(function (key) {
      var group = groups[key];
      if (group.text) return group;
      var days = group.days.sort(function (a, b) { return a - b; });
      var dayText = '第 ' + days.join('、') + ' 天' + (SLOT_LABEL[group.meal] || '晚餐');
      if (group.to) {
        return {
          tone: 'warn', kind: 'replace',
          text: dayText + '：为避开已排除的过敏原，已把「' + mealDisplayName(group.from) + '」换成「' + mealDisplayName(group.to) + '」。'
        };
      }
      return {
        tone: 'danger', kind: 'replace',
        text: dayText + '：找不到同时满足排除条件的替换，已标为待选。请用「使用推荐」或逐天换餐确认；待选餐未计入营养、采购和时间线。'
      };
    });

    if (modeNotes.length) {
      var noteDays = modeNotes.map(function (item) { return '第 ' + (item.day + 1) + ' 天'; }).join('、');
      messages.unshift({
        tone: 'warn', kind: 'lunch-mode',
        text: noteDays + '：' + (modeNotes[0].reason || '晚餐未选，午餐按现做处理') + '。可在顶部把午餐改成现做，或先给当天选一道晚餐。'
      });
    }

    var highSodium = model.nutrition.days.filter(function (day) { return day.adult && day.adult.sodium >= 1150; });
    if (highSodium.length) {
      messages.push({
        tone: 'warn', kind: 'sodium',
        text: '有 ' + highSodium.length + ' 天的成人已选餐次钠已达到 1,150 mg 以上（全天上限 2,300 mg 的一半）：第 ' +
          highSodium.map(function (day) { return day.index + 1; }).join('、') + ' 天。可开启减盐，或减少酱油、味噌和盐的用量。'
      });
    }

    var pendingCount = planPendingCount(plan);
    if (pendingCount > 0) {
      var recoCount = 0;
      var slots = planSlots(plan);
      plan.days.forEach(function (day) {
        slots.forEach(function (slot) {
          var meal = day[slot.id];
          if (isPendingMeal(meal) && meal.recommendation && meal.recommendation.id) recoCount += 1;
        });
      });
      messages.unshift({
        tone: 'warn', kind: 'pending',
        text: '为避开已排除的过敏原，有 ' + pendingCount + ' 餐待选' +
          (recoCount > 0
            ? '（其中 ' + recoCount + ' 餐有推荐替代，可一键确认）'
            : '（没有合规推荐，可在菜单里手动补选）') +
          '；待选餐未计入营养合计、采购、时间线和分装，补选后恢复。'
      });
    }

    function notice(message) {
      return '<div class="notice ' + message.tone + '">' + icon(message.tone === 'danger' ? 'i-warning' : 'i-check-circle') +
        '<div><p>' + esc(message.text) + '</p></div></div>';
    }

    var replacements = messages.filter(function (message) { return message.kind === 'replace'; });
    var others = messages.filter(function (message) { return message.kind !== 'replace'; });
    var html = '';
    if (replacements.length > 2) {
      html += '<details class="calc replace-notices"><summary><span>为避开已排除的过敏原，已自动替换 ' + replacements.length +
        ' 餐（点击查看明细）</span>' + icon('i-chevron') + '</summary><div class="calc-body">' +
        replacements.map(notice).join('') + '</div></details>';
    } else {
      html += replacements.map(notice).join('');
    }
    html += others.map(notice).join('');
    return html;
  }

  /* =========================================================
     营养
     ========================================================= */

  /* 含未核实标签成品的餐：营养不能按 0 当实测值，也不能标成营养完整。 */
  function dishHasUnknownNutrition(dishId) {
    var dish = DATA.dishes[dishId];
    if (!dish) return false;
    if (dish.kind === 'commercialFrozen') return true;
    return M.resolveParts(dishId, state.settings, state.edits).some(function (part) {
      return ingredientNutritionUnknown(DATA.ingredients[part.ingredient]);
    });
  }

  function mealHasUnknownNutrition(meal) {
    if (!meal || meal.pending) return false;
    return (meal.dishes || []).some(function (d) { return dishHasUnknownNutrition(d.id); });
  }

  function planUnknownMealCount(plan) {
    var count = 0;
    plan.days.forEach(function (day) {
      planSlots(plan).forEach(function (slot) {
        if (mealHasUnknownNutrition(day[slot.id])) count += 1;
      });
    });
    return count;
  }

  function dayHasUnknownNutrition(plan, day) {
    return planSlots(plan).some(function (slot) { return mealHasUnknownNutrition(day[slot.id]); });
  }

  function viewNutrition(model) {
    var days = model.nutrition.days;
    var plan = model.plan;
    var settings = state.settings;
    var refs = M.referenceFor(settings);
    var n = days.length;
    var slots = planSlots(plan);
    var slotCount = slots.length;
    var word = mealCountWord(slotCount);
    var enabledLabels = slots.map(function (slot) { return slot.label; }).join('、');
    var disabledSlots = MEAL_SLOTS.filter(function (slot) {
      return !slots.some(function (open) { return open.id === slot.id; });
    });
    var lunchOn = slots.some(function (slot) { return slot.id === 'lunch'; });
    var meta = planTotals(plan, model.nutrition);
    var pendingCount = planPendingCount(plan);
    var unknownMealCount = planUnknownMealCount(plan);
    var countText = confirmedMealsText(meta);
    var caveat = '即使 ' + meta.totalMeals + '/' + meta.totalMeals + ' 也只代表已选的' + enabledLabels +
      (lunchOn ? '，不含加餐、饮料和零食。' : '；午餐、加餐和饮料没有计入。') +
      (unknownMealCount ? '含超市成品营养待核时，营养合计也不完整。' : '');
    var disabledNote = disabledSlots.length
      ? disabledSlots.map(function (slot) { return slot.label; }).join('、') + '未开启，在表里按“未选”处理，不计入营养。'
      : '';
    var statuses = days.map(function (day) { return dayMealStatus(plan, day); });
    var completeDays = days.filter(function (day, index) { return statuses[index].complete; });
    var statDays = completeDays.length ? completeDays : days;
    var avg = {
      adult: averageNutrients(statDays.map(function (day) { return day.adult; })),
      kid: statDays[0] && statDays[0].kid ? averageNutrients(statDays.map(function (day) { return day.kid; })) : null
    };
    var avgNote = pendingCount
      ? '仅按已计' + word + '的 ' + statDays.length + ' 天平均，待选餐未计入'
      : (unknownMealCount ? '含 ' + unknownMealCount + ' 餐成品待核，营养不完整' : '未含加餐和饮料');

    var stats = [
      { label: word + '能量 / 天', value: fmt(avg.adult.kcal), unit: 'kcal', sub: (avg.kid ? '儿童约 ' + fmt(avg.kid.kcal) + ' kcal · ' : '') + avgNote },
      { label: '蛋白质 / 天', value: fmt(avg.adult.protein, 1), unit: 'g', sub: '成人参考 ' + rangeText(refs.adult.protein, 'g'), bar: percentOf(avg.adult.protein, refs.adult.protein[0]) },
      { label: '钙 / 天', value: fmt(avg.adult.calcium), unit: 'mg', sub: '成人参考 ' + rangeText(refs.adult.calcium, 'mg'), bar: percentOf(avg.adult.calcium, refs.adult.calcium[0]) },
      { label: '铁 / 天', value: fmt(avg.adult.iron, 1), unit: 'mg', sub: '成人参考 ' + rangeText(refs.adult.iron, 'mg'), bar: percentOf(avg.adult.iron, refs.adult.iron[0]) },
      { label: '膳食纤维 / 天', value: fmt(avg.adult.fiber, 1), unit: 'g', sub: '成人常见参考 ' + rangeText(refs.adult.fiber || [25, 38], 'g') },
      { label: '钠 / 天', value: fmt(avg.adult.sodium), unit: 'mg', sub: '成人全天上限 ' + fmt(refs.adult.sodiumMax) + ' mg', bar: percentOf(avg.adult.sodium, refs.adult.sodiumMax), over: avg.adult.sodium > refs.adult.sodiumMax / 2 }
    ];

    var statHtml = stats.map(function (stat) {
      return '<div class="stat"><div class="stat-label">' + esc(stat.label) + '</div>' +
        '<div class="stat-value">' + esc(stat.value) + '<small>' + esc(stat.unit) + '</small></div>' +
        (stat.bar != null ? '<div class="bar ' + (stat.over ? 'is-over' : '') + '"><span style="width:' + Math.min(100, stat.bar) + '%"></span></div>' : '') +
        '<div class="stat-sub">' + esc(stat.sub) + '</div></div>';
    }).join('');

    /* 日表列数随开启餐次变化；关闭的餐在状态列注明“未选”，待选显示“待选”。 */
    var headCells = slots.map(function (slot) {
      return '<th class="num" data-meal-column="' + slot.id + '">' + esc(slot.label) + ' kcal</th>';
    }).join('');

    var dayRows = days.map(function (day, index) {
      var status = statuses[index];
      var unknownDay = dayHasUnknownNutrition(plan, day);
      var adult = day.adult || {};
      var slotCells = slots.map(function (slot) {
        var pending = !!status.pending[slot.id];
        var mealNutri = day[slot.id];
        var attr = ' data-meal-cell="' + slot.id + '"';
        if (pending) return '<td class="num is-pending"' + attr + '>待选</td>';
        if (!mealNutri) return '<td class="num is-unused"' + attr + '>未选</td>';
        return '<td class="num"' + attr + '>' + fmt(mealNutri.adult ? mealNutri.adult.kcal : 0) + '</td>';
      }).join('');
      var totalCell;
      if (status.confirmedMeals === 0 && !status.complete) {
        totalCell = '<td class="num is-pending">待选</td>';
      } else if (!status.complete) {
        var doneLabels = status.slots.filter(function (slot) { return !status.pending[slot.id]; })
          .map(function (slot) { return slot.label; }).join('、');
        totalCell = '<td class="num"><strong>' + fmt(adult.kcal) + '</strong><small class="cell-note">已计' +
          esc(doneLabels) + '</small></td>';
      } else {
        totalCell = '<td class="num"><strong>' + fmt(adult.kcal) + '</strong></td>';
      }
      var nutrientCells = ['protein', 'calcium', 'iron', 'fiber', 'sodium'].map(function (key) {
        if (status.confirmedMeals === 0) return '<td class="num is-pending">—</td>';
        var digits = key === 'protein' || key === 'iron' || key === 'fiber' ? 1 : 0;
        return '<td class="num">' + fmt(adult[key], digits) + '</td>';
      }).join('');
      var unusedNote = disabledSlots.length
        ? '<small class="cell-note">' + esc(disabledSlots.map(function (slot) { return slot.label; }).join('、')) + '未选</small>'
        : '';
      if (unknownDay) {
        totalCell = totalCell.replace('</td>', '<small class="cell-note">含待核成品</small></td>');
      }
      var statusText = status.label + (unknownDay ? ' · 营养待核' : '');
      return '<tr' + ((!status.complete || unknownDay) ? ' class="is-incomplete"' : '') + '><td>第 ' + (day.index + 1) + ' 天</td>' +
        slotCells + totalCell + nutrientCells +
        '<td class="status-cell' + ((!status.complete || unknownDay) ? ' is-pending' : '') + '">' + esc(statusText) + unusedNote + '</td></tr>';
    }).join('');

    var totals = sumNutrients(days.map(function (d) { return d.adult; }));

    var hasKid = settings.kidAge !== 'none';
    var personRows = [
      ['蛋白质', 'protein', 'g', refs.adult.protein, hasKid ? refs.kid.protein : null, 1],
      ['钙', 'calcium', 'mg', refs.adult.calcium, hasKid ? refs.kid.calcium : null, 0],
      ['铁', 'iron', 'mg', refs.adult.iron, hasKid ? refs.kid.iron : null, 1],
      ['膳食纤维', 'fiber', 'g', refs.adult.fiber || [25, 38], hasKid && refs.kid.fiber ? refs.kid.fiber : null, 1],
      ['钠', 'sodium', 'mg', [refs.adult.sodiumMax, refs.adult.sodiumMax], null, 0]
    ].map(function (row) {
      var key = row[1];
      var adultAvg = avg.adult[key];
      var kidAvg = hasKid && avg.kid ? avg.kid[key] : null;
      var ref = row[3];
      return '<tr><td>' + row[0] + '</td>' +
        '<td class="num">' + fmt(adultAvg, row[5]) + ' ' + row[2] + '</td>' +
        '<td class="num">' + (ref ? rangeText(ref, row[2]) : '—') + '</td>' +
        (hasKid ? '<td class="num">' + (kidAvg == null ? '—' : fmt(kidAvg, row[5]) + ' ' + row[2]) + '</td>' +
          '<td class="num">' + (row[4] ? rangeText(row[4], row[2]) : '—') + '</td>' : '') +
        '</tr>';
    }).join('');

    var coverageRows = days.map(function (day, index) {
      var coverage = dayCoverage(day, statuses[index]);
      return '<tr><td>第 ' + (day.index + 1) + ' 天</td>' +
        '<td>' + coverage.protein.join('、') + '</td>' +
        '<td class="num">' + coverage.veg.length + ' 种</td>' +
        '<td class="num">' + coverage.fruit.length + ' 种</td>' +
        '<td>' + coverage.dairySoy.join('、') + '</td>' +
        '<td>' + (coverage.hasLeafy ? '有' : '无') + '</td>' +
        '<td>' + coverage.flags.join(' · ') + '</td></tr>';
    }).join('');

    var calcDetails = days.map(function (day, index) {
      var status = statuses[index];
      var planDay = planDayAt(plan, day.index) || {};
      var calcRows = slots.map(function (slot) {
        var id = slot.id;
        var label = slotHeading(id, plan);
        if (status.pending[id]) return pendingCalcRow(label, planDay[id], day.index);
        if (id === 'lunch' && lunchPackedFor(plan)) {
          var kcal = day.lunch && day.lunch.adult ? day.lunch.adult.kcal : 0;
          return '<tr class="is-packed"><td>' + esc(label) + '</td><td colspan="10">' +
            esc('复用当天晚餐同款，多做一份装便当；营养已按这份午餐计入日合计（约 ' + fmt(kcal) + ' kcal），不重复计算锅次。') +
            '</td></tr>';
        }
        return mealCalcRows(day[id], label);
      }).join('');
      return '<details class="calc"><summary><span>第 ' + (day.index + 1) + ' 天计算过程</span>' + icon('i-chevron') + '</summary>' +
        '<div class="calc-body">' +
        '<p class="section-sub">每餐按「每位成人克数」计算；儿童按 ×' + fmt(M.kidFactor(settings), 2) + '，全家采购按 ×' + fmt(M.familyFactor(settings), 2) + ' 汇总。营养成分来自每 100 g 参考值，未计烹调损失。</p>' +
        (status.complete ? '' : '<p class="section-sub is-pending">本日' + esc(status.label) + '，表中合计只含已计餐次。</p>') +
        '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>餐次</th><th>菜品</th><th>食材</th><th class="num">成人 g</th><th class="num">儿童 g</th><th class="num">kcal</th><th class="num">蛋白 g</th><th class="num">钙 mg</th><th class="num">铁 mg</th><th class="num">纤维 g</th><th class="num">钠 mg</th></tr></thead><tbody>' +
        calcRows + '</tbody></table></div></div></details>';
    }).join('');

    var pendingNotice = pendingCount
      ? '<div class="notice warn pending-notice">' + icon('i-warning') + '<div>' +
        '<p><strong>有 ' + pendingCount + ' 餐待选</strong>：营养合计只统计已确定的餐次（' + esc(countText) + '）。</p>' +
        '<p>' + esc(caveat) + '待选餐补选后会自动重算。</p></div></div>'
      : '';
    var unknownNotice = unknownMealCount
      ? '<div class="notice warn">' + icon('i-warning') + '<div>' +
        '<p><strong>有 ' + unknownMealCount + ' 餐含超市成品，成品营养未知。</strong>' +
        '这些餐的成品营养未计入合计，也不会按 0 当作实测值。' +
        '即使' + esc(countText) + '，营养仍不完整；请以包装标签为准。</p></div></div>'
      : '';

    return printHeader(model) + '<section class="section"><div class="section-head"><div><h2>' + esc(word) + '营养估算</h2>' +
      '<p class="section-sub">逐食材按克数计算，而不是套用整餐模板。参考值只用于判断“已选餐次的贡献”，不能据此说全天达标：' +
      esc(enabledLabels) + '以外的餐次和饮料都没有计入。彩椒作为维生素 C 来源提示，本页不计算维生素 C 毫克数。</p></div></div>' +
      pendingNotice +
      unknownNotice +
      '<div class="stat-grid">' + statHtml + '</div>' +
      '<p class="stat-note">' + esc(countText) + '（已开启' + esc(enabledLabels) + '）。' +
      (unknownMealCount ? '含 ' + unknownMealCount + ' 餐成品营养待核，合计不完整；' : '') +
      '条形按参考范围下限绘制，钠按 2,300 mg 上限；只比较已计餐次，不能代表全天。</p>' +
      '<p class="mobile-hint">手机上表格可左右滑动查看全部列。</p>' +
      '<div class="notice info">' + icon('i-leaf') + '<div><p>' + esc(refs.adult.energyNote) + '</p>' +
      '<p>' + (hasKid
        ? '儿童参考：' + esc(refs.kid ? refs.kid.label : '') + '。儿童份量系数 ' + fmt(M.kidFactor(settings), 2) + ' 是界面规划假设，不是膳食建议。'
        : '未设置儿童：本页只按成人份量计算，不显示儿童列。') + '</p></div></div>' +
      '</section>' +
      '<section class="section"><div class="section-head"><div><h2>每天的' + esc(word) + '</h2><p class="section-sub">数值均为每位成人；钠的参考上限为全天 2,300 mg。' + esc(countText) + '，待选餐在单元格里显示“待选”，不按 0 kcal 计入。' + esc(disabledNote) + '</p></div></div>' +
      '<div class="table-wrap"><table><caption>每日' + esc(word) + '合计（每位成人）</caption><thead><tr><th>天</th>' + headCells + '<th class="num">合计 kcal</th><th class="num">蛋白质 g</th><th class="num">钙 mg</th><th class="num">铁 mg</th><th class="num">纤维 g</th><th class="num">钠 mg</th><th>餐次</th></tr></thead><tbody>' +
      dayRows + '<tr class="total-row"><td>合计 / ' + n + ' 天</td>' + slots.map(function () { return '<td class="num">—</td>'; }).join('') +
      '<td class="num">' + fmt(totals.kcal) + '</td><td class="num">' + fmt(totals.protein, 1) + '</td><td class="num">' + fmt(totals.calcium) + '</td><td class="num">' + fmt(totals.iron, 1) + '</td><td class="num">' + fmt(totals.fiber, 1) + '</td><td class="num">' + fmt(totals.sodium) + '</td><td class="status-cell">' + esc(countText) + '</td></tr>' +
      '</tbody></table><p class="table-note">合计只统计已计餐次：' + esc(countText) + '。' + esc(caveat) +
      (disabledNote ? esc(disabledNote) : '') +
      (pendingCount ? '待选餐未计入，补选后会自动重算。' : '') + '</p></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>' + esc(word) + '对全天参考的贡献</h2><p class="section-sub">成人参考值取 19–50 岁常用范围；铁的上限 18 mg 对应女性较高需求，男性约 8 mg。儿童参考按所选年龄段给出范围。</p></div></div>' +
      '<div class="table-wrap"><table><caption>平均每天的' + esc(word) + '合计</caption><thead><tr><th>指标</th><th class="num">每位成人</th><th class="num">成人全天参考</th>' + (hasKid ? '<th class="num">每位儿童</th><th class="num">儿童全天参考</th>' : '') + '</tr></thead><tbody>' +
      personRows + '</tbody></table><p class="table-note">' + esc(countText) + '。“贡献”不等于达标：本页' +
      esc(lunchOn ? '未含加餐、饮料和零食' : '缺少午餐与加餐') + '，也没有按性别、体型和活动量精算能量。</p></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>食物多样性检查</h2><p class="section-sub">只统计已开启餐次的食材种类，用来提醒搭配，不是评分；待选餐未参与统计。</p></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>天</th><th>蛋白质来源</th><th class="num">蔬菜</th><th class="num">水果</th><th>奶或豆制品</th><th>绿叶菜</th><th>提示</th></tr></thead><tbody>' +
      coverageRows + '</tbody></table></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>便便公式（通俗版）</h2>' +
      '<p class="section-sub">这是帮助你理解纤维、油脂、碳水和水分搭配的通俗说法，不是医学诊断。持续便秘、腹泻、便血、体重下降或腹痛，请就医。</p></div></div>' +
      '<div class="grid-2">' + DATA.digestive.map(function (item, index) {
        return '<div class="alt-card"><h3>' + (index + 1) + '. ' + esc(item.symbol + ' ' + item.label) + '</h3>' +
          '<p><strong>' + esc(item.formula) + '</strong></p><p>' + esc(item.note) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="notice info" style="margin-top:12px">' + icon('i-leaf') + '<div><p>' + esc(DATA.tips.hydration) +
      ' 绿叶菜每天轮换，快炒或焯水；只吃纤维不喝水，反而可能更干。</p></div></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>计算过程</h2><p class="section-sub">展开可看到每道菜、每种食材的克数与营养值；每个食材在“说明与来源”里附有数据库编号。</p></div></div>' +
      calcDetails + '</section>';
  }

  function pendingCalcRow(label, pending, dayIndex) {
    var reason = pending && pending.reason ? pending.reason : '待确认';
    return '<tr class="is-incomplete"><td>' + label + '</td><td class="is-pending" colspan="10">' +
      esc('待选：' + reason + '。确定前不按 0 g 菜谱计算；用推荐或下拉补选后显示逐食材过程。') + '</td></tr>';
  }

  function averageNutrients(list) {
    var total = sumNutrients(list);
    var n = list.length || 1;
    var out = {};
    Object.keys(total).forEach(function (key) { out[key] = total[key] / n; });
    return out;
  }

  function sumNutrients(list) {
    var out = {};
    M.NUTRIENTS.forEach(function (key) { out[key] = 0; });
    list.forEach(function (item) {
      M.NUTRIENTS.forEach(function (key) { out[key] += item[key] || 0; });
    });
    return out;
  }

  function dayCoverage(day, status) {
    var protein = [];
    var veg = [];
    var fruit = [];
    var dairySoy = [];
    var flags = [];
    var hasPepper = false;
    var hasMushroom = false;
    var hasLeafy = false;
    MEAL_SLOTS.forEach(function (slot) {
      var meal = day[slot.id];
      ((meal && meal.items) || []).forEach(function (item) {
        M.resolveParts(item.dish, state.settings, state.edits).forEach(function (part) {
          var ing = DATA.ingredients[part.ingredient];
          if (!ing) return;
          if (ing.group === '肉、鱼、蛋' && protein.indexOf(ing.name) < 0) protein.push(ing.name);
          if (ing.group === '豆制品') {
            if (protein.indexOf(ing.name) < 0) protein.push(ing.name);
            if (dairySoy.indexOf(ing.name) < 0) dairySoy.push(ing.name);
          }
          if (ing.group === '奶类' && dairySoy.indexOf(ing.name) < 0) dairySoy.push(ing.name);
          if (ing.group === '蔬菜' && veg.indexOf(ing.name) < 0) veg.push(ing.name);
          if (ing.group === '水果' && fruit.indexOf(ing.name) < 0) fruit.push(ing.name);
          if (part.ingredient === 'pepper_red') hasPepper = true;
          if (part.ingredient === 'mushroom') hasMushroom = true;
          if (['spinach', 'pak_choi', 'nai_bai', 'you_dong_cai'].indexOf(part.ingredient) >= 0) hasLeafy = true;
        });
      });
    });
    if (!fruit.length) flags.push('无水果');
    if (veg.length < 2) flags.push('蔬菜偏少');
    if (!dairySoy.length) flags.push('无奶/豆');
    if (hasPepper) flags.push('彩椒（维C来源）');
    if (hasMushroom) flags.push('菇类纤维');
    if (status && !status.complete) {
      flags = flags.filter(function (flag) { return flag !== '搭配较完整'; });
      flags.unshift(status.label + '，未参与完整搭配统计');
    } else if (!flags.length) {
      flags.push('搭配较完整');
    }
    return { protein: protein, veg: veg, fruit: fruit, dairySoy: dairySoy, flags: flags, hasLeafy: hasLeafy };
  }

  function mealCalcRows(meal, label) {
    var html = '';
    label = label || '';
    ((meal && meal.items) || []).forEach(function (item) {
      var dn = dishNutri(item.dish);
      var dish = DATA.dishes[item.dish];
      var dishName = dish ? dish.name : item.dish;
      dn.parts.forEach(function (part, index) {
        var ing = DATA.ingredients[part.ingredient];
        if (!ing) return;
        var kid = state.settings.kidAge === 'none' ? null : part.grams * M.kidFactor(state.settings);
        var per = ing.per100;
        html += '<tr>' +
          '<td>' + (index === 0 ? esc(label) : '') + '</td>' +
          '<td>' + (index === 0 ? esc(dishName) : '') + '</td>' +
          '<td>' + esc(ing.name) + (part.ingredient !== part.originalIngredient ? '（减盐）' : '') + '</td>' +
          '<td class="num">' + gramsText(part.grams) + '</td>' +
          '<td class="num">' + (kid == null ? '—' : gramsText(kid)) + '</td>' +
          '<td class="num">' + fmt(per.kcal * part.grams / 100) + '</td>' +
          '<td class="num">' + fmt(per.protein * part.grams / 100, 1) + '</td>' +
          '<td class="num">' + fmt(per.calcium * part.grams / 100) + '</td>' +
          '<td class="num">' + fmt(per.iron * part.grams / 100, 1) + '</td>' +
          '<td class="num">' + fmt(per.fiber * part.grams / 100, 1) + '</td>' +
          '<td class="num">' + fmt(per.sodium * part.grams / 100) + '</td></tr>';
      });
    });
    return html;
  }

  /* =========================================================
     采购
     ========================================================= */

  function optionalShoppingHtml() {
    var items = DATA.optionalShopping || [];
    if (!items.length) return '';
    var rows = items.map(function (item) {
      var key = 'optional:' + item.id;
      var checked = state.checks[key] === true;
      return '<div class="shop-item' + (checked ? ' is-done' : '') + '">' +
        '<button type="button" class="shop-check" role="checkbox" aria-checked="' + (checked ? 'true' : 'false') +
        '" aria-label="标记 ' + esc(item.label) + ' 已购买" data-action="check-optional" data-key="' + esc(key) + '">' + icon('i-check') + '</button>' +
        '<div><div class="shop-name">' + esc(item.label) + ' <span class="muted">可选</span></div>' +
        '<div class="shop-note">' + esc(item.amount + ' · ' + item.channels + ' · ' + item.note) + '</div></div>' +
        '<div class="shop-qty">冷冻<small>不计入营养</small></div></div>';
    }).join('');
    return '<div class="shop-group optional-group"><h3>冷冻便利菜（可选）</h3><div class="shop-list">' + rows + '</div>' +
      '<p class="hint">这些是按你的常买渠道补充的便利项，不计入菜单营养、已买进度和时间线；买回来可直接微波或焯水。</p></div>';
  }

  var shoppingScope = 'todo';
  function visibleShoppingRows(rows) {
    return rows.filter(function(row) {
      if (shoppingScope === 'all') return true;
      if (shoppingScope === 'pantry') return row.pantry;
      return !row.pantry && state.checks[M.shoppingKey(row)] !== true;
    });
  }

  function viewShopping(model) {
    var shopping = model.shopping;
    var tracked = shopping.rows.filter(function (row) { return !row.pantry; });
    var done = tracked.length - uncheckedCount(shopping);
    var pantryCount = shopping.rows.length - tracked.length;
    var progress = tracked.length ? Math.round(done / tracked.length * 100) : 0;

    var groups = shopping.groups.map(function (group) {
      var visible = visibleShoppingRows(group.items);
      if (!visible.length) return "";
      var items = visible.map(function (row) {
        var key = M.shoppingKey(row);
        var checked = state.checks[key] === true;
        var notes = [];
        if (row.id === 'rice_cooked') {
          notes.push('约需生米 ' + row.info.buyLabel + (row.info.cups ? '（约 ' + fmt(row.info.cups, 1) + ' 杯）' : ''));
          notes.push('约合熟饭 ' + fmt(row.grams / 1000, 2) + ' kg');
        } else {
          notes.push(row.info.mode === 'count' ? '约需 ' + row.info.buyLabel : '需要 ' + row.info.buyLabel);
          if (row.info.leftoverLabel) notes.push(row.info.leftoverLabel);
        }
        if (row.note) notes.push(row.note);
        var ing = DATA.ingredients[row.id];
        return '<div class="shop-item' + (checked ? ' is-done' : '') + '">' +
          '<button type="button" class="shop-check" role="checkbox" aria-checked="' + (checked ? 'true' : 'false') +
          '" aria-label="标记 ' + esc(row.name) + ' 已购买" data-action="check-shop" data-key="' + esc(key) + '">' + icon('i-check') + '</button>' +
          '<div><div class="shop-name">' + esc(row.name) + (row.state ? ' <span class="muted">' + esc(row.state) + '</span>' : '') + '</div>' +
          '<div class="shop-note">' + esc(notes.filter(Boolean).join(' · ')) + '</div></div>' +
          '<div class="shop-qty">' + esc(row.info.suggestion) + '<small>' + (ing && ing.pantry ? '家中常有' : '建议购买') + '</small></div>' +
          '</div>';
      }).join('');
      return '<div class="shop-group"><h3>' + esc(group.name) + ' · ' + visible.length + ' 项</h3><div class="shop-list">' + items + '</div></div>';
    }).join('');

    return printHeader(model) + '<section class="section"><div class="section-head"><div><h2>采购清单</h2>' +
      '<p class="section-sub">按当前份量、成人数量、儿童系数和减盐替换自动汇总；已折算可食部与生熟比，并向上取整到常见包装。' +
      esc(mealCountLine(model.plan, model.nutrition)) + '</p></div>' +
      '<div class="section-actions"><button class="btn secondary small" data-action="print">' + icon('i-print') + '打印</button>' +
      '<button class="btn secondary small" data-action="copy-list">' + icon('i-copy') + '复制</button>' +
      '<button class="btn ghost small" data-action="reset-checks">' + icon('i-reset') + '清除勾选</button></div></div>' +
      pendingNotice(model.plan, '待选餐的食材现在不会出现在采购清单里') +
      lunchPackedNotice(model.plan, '采购量已包含“复用晚餐多做一份”的增量，不需要再单独买午餐食材。') +
      '<div class="progress"><span class="progress-track"><span style="width:' + progress + '%"></span></span>' +
      '<span class="progress-text">已买 ' + done + ' / ' + tracked.length + (pantryCount ? '（另有 ' + pantryCount + ' 项家中常有）' : '') + '</span></div>' +
      '<div class="shop-filters" aria-label="采购显示范围">' +
      [['todo','待买 '+(tracked.length-done)],['pantry','核对常备 '+pantryCount],['all','全部']].map(function(pair){
        return '<button class="btn small" data-action="shop-scope" data-scope="'+pair[0]+'" aria-pressed="'+(shoppingScope===pair[0])+'">'+pair[1]+'</button>';
      }).join('')+'</div>' +
      (groups || '<p class="notice">此分组暂无项目。</p>') +
      (shoppingScope === "all" ? optionalShoppingHtml() : "") +
      '</section>' +
      '<div class="notice"><p>“约”是按数据库平均值或常见规格的估算，实际包装、可食部和品牌差异会改变数量。米饭按生米折算，水果按可食部折算；勾选状态只保存在本机浏览器。</p></div>';
  }

  /* =========================================================
     时间线
     ========================================================= */

  function viewTimeline(model) {
    var timeline = model.timeline;
    var lanes = timeline.lanes.map(function (lane, index) {
      var blocks = lane.blocks.map(function (block) {
        return '<div class="block' + (block.critical ? ' critical' : '') + '">' +
          '<span class="block-time">' + esc(block.time) + '</span>' +
          '<div><strong>' + esc(block.title) + '</strong><p>' + esc(block.detail) + '</p></div></div>';
      }).join('');
      return '<div class="lane"><div class="lane-head">' + esc(lane.name) + '</div><div class="lane-track">' + blocks + '</div></div>';
    }).join('');

    var t = timeline.stats;
    var stats = [];
    function stat(label, value, unit, sub) {
      stats.push('<div class="stat"><div class="stat-label">' + esc(label) + '</div>' +
        '<div class="stat-value">' + esc(value) + '<small>' + esc(unit) + '</small></div>' +
        (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '') + '</div>');
    }
    if (t.riceRawKg > 0) stat('生米', fmt(t.riceRawKg, 2), 'kg', '约 ' + fmt(t.riceCups, 1) + ' 杯 · 熟饭 ' + fmt(t.riceCookedKg, 2) + ' kg');
    if (t.onigiriCount > 0) stat('饭团', '约 ' + fmt(t.onigiriCount), '个');
    if (t.chickenKg > 0) stat('鸡腿（照烧）', fmt(t.chickenKg, 2), 'kg');
    if (t.onigiriChickenKg > 0) stat('鸡腿（饭团）', fmt(t.onigiriChickenKg, 2), 'kg');
    if (t.rotisserieKg > 0) stat('现成烤鸡', fmt(t.rotisserieKg, 2), 'kg');
    if (t.beefKg > 0) stat('牛肉', fmt(t.beefKg, 2), 'kg');
    if (t.salmonKg > 0) stat('三文鱼', fmt(t.salmonKg, 2), 'kg');
    if (t.shrimpKg > 0) stat('虾仁', fmt(t.shrimpKg, 2), 'kg');
    if (t.tofuKg > 0) stat('豆腐', fmt(t.tofuKg, 2), 'kg');
    if (t.vegKg > 0) stat('蔬菜', fmt(t.vegKg, 2), 'kg');
    if (t.stewKg > 0) stat('炖菜肉', fmt(t.stewKg, 2), 'kg');
    if (t.instantRiceKg > 0) stat('叮叮饭', fmt(t.instantRiceKg, 2), 'kg');

    return printHeader(model) + '<section class="section"><div class="section-head"><div><h2>集中制作时间线</h2>' +
      '<p class="section-sub">从开始备餐起计时，电饭煲、烤箱、炉灶和分装并行。时间是顺序示例，不是固定时长；按自家设备功率调整。' +
      esc(mealCountLine(model.plan, model.nutrition)) + '</p></div></div>' +
      pendingNotice(model.plan, '待选餐没有确定菜品，暂时不会出现在时间线里') +
      lunchPackedNotice(model.plan, '时间线只为午餐增加“装午餐便当”步骤，不会生成第二套烹饪块。') +
      '<div class="stat-grid four">' + stats.join('') + '</div>' +
      '<div class="timeline">' + lanes + '</div>' +
      '<div class="notice warn" style="margin-top:12px">' + icon('i-warning') + '<div><p><strong>两条不能省的安全线：</strong>米饭理想在 1 小时内快速冷却，冷藏不超过 24 小时；复热必须让中心达到 74°C。时间线里的分钟数不能替代温度计。</p></div></div>' +
      '</section>' +
      '<section class="section"><div class="notice info">' + icon('i-leaf') + '<div><p>并行策略：米饭先煮，因为需要冷却和分装；三文鱼和蔬菜可以同炉烤；鸡腿用平底锅煎，肉类和豆制品分锅炒；虾仁最后快炒。米饭、饭团和后面几天的晚餐在制作当天直接冷冻，非米饭类的前 1–2 天晚餐冷藏。</p></div></div></section>';
  }

  /* =========================================================
     储存与复热
     ========================================================= */

  function viewModules(model) {
    var s = state.settings;
    var equipment = model.equipment;
    var containers = model.containers;
    var toolChips = equipment.tools.map(function (tool) {
      return '<button type="button" class="chip tool-chip" data-action="toggle-tool" data-value="' + tool.id +
        '" aria-pressed="' + tool.available + '" title="' + esc(tool.note) + '"><strong>' + esc(tool.name) + '</strong>' +
        '<span>' + (tool.used ? tool.used + ' 次' : '本周未用') + '</span></button>';
    }).join('');
    var missing = equipment.missing.map(function (tool) {
      return '<div class="notice warn">' + icon('i-warning') + '<div><p><strong>缺少' + esc(tool.name) + '：</strong>' +
        esc(tool.alternative || '需要换工具或调整菜单。') + '</p></div></div>';
    }).join('');

    var containerPrefs = DATA.containerPrefs.map(function (pref) {
      return '<button type="button" data-action="set-container" data-value="' + pref.id + '" class="' + (s.containerPref === pref.id ? 'is-active' : '') +
        '" aria-pressed="' + (s.containerPref === pref.id) + '">' + esc(pref.label) + '</button>';
    }).join('');
    var containerRows = containers.rows.map(function (row) {
      return '<tr><td>' + esc(row.name) + '</td><td class="num">' + fmt(row.count) + '</td>' +
        '<td>' + (row.fridge ? '冷藏 ' + row.fridge : '') + (row.fridge && row.freeze ? ' · ' : '') +
        (row.freeze ? '冷冻 ' + row.freeze : '') + '</td>' +
        '<td>' + esc(row.note) + '</td></tr>';
    }).join('');

    var marinadeMap = {};
    model.plan.days.forEach(function (day) {
      MEAL_SLOTS.forEach(function (slot) {
        ((day[slot.id] && day[slot.id].dishes) || []).forEach(function (dish) {
          var raw = DATA.dishes[dish.id];
          var marinade = raw && raw.marinade;
          if (marinade && DATA.marinades[marinade]) {
            if (!marinadeMap[marinade]) marinadeMap[marinade] = { data: DATA.marinades[marinade], dishes: [] };
            if (marinadeMap[marinade].dishes.indexOf(dish.name) < 0) marinadeMap[marinade].dishes.push(dish.name);
          }
        });
      });
    });
    var marinadeRows = Object.keys(marinadeMap).map(function (key) {
      var entry = marinadeMap[key];
      return '<tr><td>' + esc(entry.data.name) + '</td><td>' + esc(entry.data.time) + '</td>' +
        '<td>' + esc(entry.data.ingredients) + '</td><td>' + esc(entry.data.note) + '</td>' +
        '<td>' + esc(entry.dishes.join('、')) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">当前菜单没有需要腌制的菜；试试彩椒鸡片、味噌牛肉或照烧鸡腿。</td></tr>';

    var stews = Object.keys(DATA.dishes).filter(function (id) { return DATA.dishes[id].kind === 'stew'; }).map(function (id) {
      var dish = DATA.dishes[id];
      var dn = dishNutri(id);
      return '<div class="alt-row"><div><strong>' + esc(dish.name) + '</strong><p>' +
        esc(fmt(dn.adult.kcal) + ' kcal · 蛋白 ' + fmt(dn.adult.protein, 1) + ' g · 纤维 ' + fmt(dn.adult.fiber, 1) +
          ' g / 成人；汤约 ' + dish.brothMl + ' ml（约 ' + Math.ceil(dish.brothMl / 30) + ' 块）') +
        '</p></div><button class="btn secondary small" data-action="set-rotation" data-value="stew">看炖菜周</button></div>';
    }).join('');

    var quick = DATA.quickMeals[0];
    var vegIds = ['pepper_chicken', 'bell_pepper_side', 'miso_butter_mushroom'];
    var vegCards = vegIds.map(function (id) {
      var dishe = DATA.dishes[id];
      var dn = dishNutri(id);
      return '<div class="alt-card"><h3>' + esc(dishe.name) + '</h3><p>' +
        esc(fmt(dn.adult.kcal) + ' kcal · 蛋白 ' + fmt(dn.adult.protein, 1) + ' g · 纤维 ' + fmt(dn.adult.fiber, 1) + ' g / 成人') +
        '</p><div class="alt-list">' + dishe.parts.map(function (part) {
          var ing = DATA.ingredients[part.ingredient];
          return '<div class="alt-row"><div><strong>' + esc(ing ? ing.name : part.ingredient) + '</strong><p>' +
            esc(gramsText(part.grams) + ' g / 成人' + (ing && ing.highlight ? ' · ' + ing.highlight : '')) + '</p></div></div>';
        }).join('') + '</div></div>';
    }).join('');

    var riceType = DATA.riceTypes.filter(function (item) { return item.id === s.riceType; })[0];
    var addIn = DATA.riceAddIns.filter(function (item) { return item.id === s.riceAddIn; })[0];

    return printHeader(model) + '<section class="section"><div class="section-head"><div><h2>备餐模块</h2>' +
      '<p class="section-sub">工具、容器、腌制、米饭和炖菜是同一套计划的不同模块；改动会同步到时间线、采购与储存。所有估算值都在数据表里标明来源类型。' +
      esc(mealCountLine(model.plan, model.nutrition)) + '</p></div></div>' +
      pendingNotice(model.plan, '待选餐尚未确定菜品，容器与分装数量只统计已计餐次') +
      lunchPackedNotice(model.plan, '容器与分装数量已包含午餐便当的那一份，不需要额外添加容器。') +
      '<div class="grid-2">' +
      '<div class="alt-card"><h3>厨房工具</h3><p>点一下标记家里有没有；时间线会改用替代做法，缺少关键工具时会提示。</p>' +
      '<div class="tool-grid">' + toolChips + '</div>' + missing +
      '<p class="hint">复热方式：微波 ' + equipment.reheats.microwave + ' 份 · 蒸锅 ' + equipment.reheats.steam + ' 份 · 无需加热 ' + equipment.reheats.none + ' 份。</p></div>' +
      '<div class="alt-card"><h3>容器计划</h3><p>按当前菜单和每道菜的容器类型估算；同一餐的米饭和主菜可以合并到 1 L 盒，实际数量会少一些。</p>' +
      '<div class="segmented compact" style="margin:12px 0" role="group" aria-label="容器偏好">' + containerPrefs + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>容器</th><th class="num">数量</th><th>用途</th><th>说明</th></tr></thead><tbody>' +
      containerRows + '</tbody></table></div>' +
      '<p class="hint">共约 ' + containers.total + ' 件。' + esc(containers.note) + '</p></div>' +
      '</div></section>' +
      '<section class="section"><div class="section-head"><div><h2>腌制计划</h2><p class="section-sub">腌料全部冷藏；腌汁不要重复使用。时间从 10 分钟到一晚不等，按肉的种类和厚度调整。</p></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>腌料</th><th>时间</th><th>配料</th><th>要点</th><th>用于</th></tr></thead><tbody>' +
      marinadeRows + '</tbody></table></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>米饭方案</h2><p class="section-sub">当前：' + esc(riceType ? riceType.label : '白米饭') +
      (s.riceType === 'instant' ? '' : '；同煮：' + esc(addIn && addIn.id !== 'none' ? addIn.label : '不加')) +
      '。叮叮饭用于所有含米饭的餐次，饭团仍用白米。</p></div></div>' +
      '<div class="grid-2"><div class="alt-card"><h3>为什么加料</h3><ul class="rule-list">' +
      DATA.tips.rices.map(function (tip) { return '<li>' + esc(tip) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="alt-card"><h3>当前选择</h3><ul class="rule-list">' +
      '<li>' + esc(riceType ? riceType.note : '') + '</li>' +
      '<li>' + esc(addIn && addIn.id !== 'none' ? addIn.label + '：' + addIn.note : '同煮不加料。') + '</li>' +
      '<li>' + (s.riceType === 'instant'
        ? '本周约需叮叮饭 ' + fmt(model.timeline.stats.instantRiceKg, 2) + ' kg（按 200 g/盒估算）。'
        : '本周约需生米 ' + fmt(model.timeline.stats.riceCups, 1) + ' 杯（按 1 杯 150 g 折算）。') + '</li>' +
      '<li>1 杯生米 ≈ 150 g ≈ 2.3 杯熟饭；1.5 杯 ≈ 225 g；2 杯 ≈ 300 g。</li>' +
      '<li>需要调整时回到顶部“晚餐米饭 / 同煮加料”。</li></ul></div></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>炖菜与汤块</h2><p class="section-sub">炖菜分肉和汤：肉按份冷冻，汤过滤后冻成 30 ml 汤块，煮面或焯菜时取用。</p></div>' +
      '<div class="section-actions"><button class="btn secondary small" data-action="set-rotation" data-value="stew">使用炖菜周</button></div></div>' +
      '<div class="grid-2"><div class="alt-card"><h3>五种炖菜</h3><div class="alt-list">' + stews + '</div></div>' +
      '<div class="alt-card"><h3>' + esc(quick.name) + ' <span class="muted">' + esc(quick.time) + '</span></h3>' +
      '<p>' + esc(quick.formula) + '</p><ol class="rule-list" style="list-style:none;padding-left:0">' +
      quick.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' +
      '<p class="hint">' + esc(quick.note) + '</p></div></div>' +
      '<div class="notice info" style="margin-top:12px">' + icon('i-leaf') + '<div><p>' + esc(DATA.tips.stews.join(' ')) + '</p></div></div></section>' +
      '<section class="section"><div class="section-head"><div><h2>彩椒、菇类与纤维</h2><p class="section-sub">彩椒是维生素 C 来源；菇类提供纤维和鲜味。本页不逐项计算维生素 C 毫克数。</p></div></div>' +
      '<div class="alt-grid">' + vegCards + '</div>' +
      '<div class="notice info" style="margin-top:12px">' + icon('i-leaf') + '<div><p>' + esc(DATA.tips.vegetables.concat(DATA.tips.greens).join(' ')) + '</p></div></div></section>';
  }

  function viewStorage(model) {
    var tiers = ['microwave', 'steam', 'onigiri'];
    var tierHtml = tiers.map(function (key) {
      var list = DATA.reheatTiers[key];
      var titles = { microwave: '微波炉', steam: '蒸锅', onigiri: '饭团' };
      var cards = list.map(function (item) {
        return '<div class="tier"><strong>' + esc(item.label) + '<span>' + esc(item.amount) + '</span></strong>' +
          '<p><b>' + esc(item.start) + '</b></p><p>' + esc(item.detail) + '</p></div>';
      }).join('');
      return '<div class="safety-card"><h3>' + icon(key === 'microwave' ? 'i-microwave' : key === 'steam' ? 'i-steam' : 'i-snow') + esc(titles[key]) + '复热</h3>' +
        '<p>以下分钟数只是起点，必须以中心 74°C 为准。</p><div class="tier-grid">' + cards + '</div></div>';
    }).join('');

    var planDishes = collectPlanDishes(model.plan);
    var dishRows = planDishes.map(function (entry) {
      var dish = DATA.dishes[entry.id];
      return '<tr><td>' + esc(dish.name) + '</td><td class="num">' + entry.days.length + ' 次</td>' +
        '<td>' + esc(entry.storageLabel || '—') + '</td>' +
        '<td>' + esc(DATA.reheat[dish.reheat] ? DATA.reheat[dish.reheat].label : '—') + '</td>' +
        '<td>' + esc(entry.storageNote || '') + '</td></tr>';
    }).join('');

    var safetyCards = [
      { title: '冷却与保存', iconName: 'i-fridge', items: DATA.safety.cooling },
      { title: '复热', iconName: 'i-microwave', items: DATA.safety.reheating },
      { title: '现加与儿童', iconName: 'i-leaf', items: DATA.safety.fresh },
      { title: '过敏原与交叉接触', iconName: 'i-warning', items: DATA.safety.allergies }
    ].map(function (card) {
      return '<div class="safety-card"><h3>' + icon(card.iconName) + esc(card.title) + '</h3><ul class="rule-list">' +
        card.items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul></div>';
    }).join('');

    var toolNotices = (model.equipment.missing || []).map(function (tool) {
      return '<div class="notice warn">' + icon('i-warning') + '<div><p><strong>缺少' + esc(tool.name) + '：</strong>' +
        esc(tool.alternative || '需要换工具。') + '</p></div></div>';
    }).join('');
    return printHeader(model) + '<section class="section"><div class="section-head"><div><h2>储存与复热</h2>' +
      '<p class="section-sub">一般熟食与米饭/饭团分开处理。这里的规则来自公开食品安全指引，具体食品仍以包装说明为准。' +
      esc(mealCountLine(model.plan, model.nutrition)) + '</p></div>' +
      '<div class="section-actions"><span class="temp-badge">' + icon('i-warning') + '中心 74°C</span></div></div>' +
      pendingNotice(model.plan, '待选餐补选后才会出现在分装清单里') +
      lunchPackedNotice(model.plan, '分装时把当天晚餐同款多装一份午餐便当；清单里的出现次数已包含这份。') +
      toolNotices + '<div class="grid-2">' + tierHtml + '</div></section>' +
      '<section class="section"><div class="section-head"><div><h2>本菜单的分装清单</h2><p class="section-sub">按当前菜单自动统计；同一道菜出现多次只列一次。' +
      (planPendingCount(model.plan) ? '有餐待选时只列已计餐次。' : '') + '</p></div></div>' +
      '<p class="mobile-hint">手机上表格可左右滑动查看全部列。</p><div class="table-wrap"><table><thead><tr><th>菜品</th><th class="num">出现次数</th><th>保存方式</th><th>复热</th><th>说明</th></tr></thead><tbody>' +
      dishRows + '</tbody></table></div></section>' +
      '<section class="section"><div class="safety-grid">' + safetyCards + '</div></section>';
  }

  function collectPlanDishes(plan) {
    var map = {};
    var order = ['freeze', 'fridge', 'prep', 'fresh'];
    plan.days.forEach(function (day) {
      MEAL_SLOTS.forEach(function (slot) {
        var meal = day[slot.id];
        (meal ? meal.dishes : []).forEach(function (dish) {
          if (!map[dish.id]) map[dish.id] = { id: dish.id, days: [], storages: {} };
          if (map[dish.id].days.indexOf(day.index) < 0) map[dish.id].days.push(day.index);
          if (dish.storage) map[dish.id].storages[dish.storage.key] = dish.storage;
        });
      });
    });
    return Object.keys(map).map(function (id) {
      var entry = map[id];
      entry.storageKeys = Object.keys(entry.storages).sort(function (a, b) {
        return order.indexOf(a) - order.indexOf(b);
      });
      entry.storageLabel = entry.storageKeys.map(function (key) { return entry.storages[key].label; }).join(' / ');
      entry.storageNote = entry.storageKeys.length === 1
        ? entry.storages[entry.storageKeys[0]].note
        : '按天数分开：前 1–2 天冷藏，之后冷冻；米饭/饭团冷藏不超过 24 小时。';
      entry.storage = entry.storages[entry.storageKeys[0]] || null;
      return entry;
    });
  }

  /* =========================================================
     替换与筛选
     ========================================================= */

  function viewAlternatives(model) {
    var s = state.settings;
    var rotationCards = Object.keys(DATA.rotations).map(function (key) {
      var rotation = DATA.rotations[key];
      var active = s.rotation === key;
      return '<div class="alt-row"><div><strong>' + esc(rotation.label) + (active ? ' · 当前' : '') + '</strong><p>' + esc(rotation.note) + '</p></div>' +
        '<button type="button" class="btn ' + (active ? 'ghost' : 'secondary') + ' small" data-action="set-rotation" data-value="' + key + '" aria-pressed="' + active + '">' + (active ? '当前' : '使用') + '</button></div>';
    }).join('');

    var proteinCards = [
      {
        title: '鱼：三文鱼', allergen: 'fish', note: '富含脂肪与蛋白质。换成鸡腿或豆腐后脂肪与口感都会变；儿童版必须检查鱼刺。',
        items: [['三文鱼', '120 g / 成人', '维生素 D、Omega-3；复热到 74°C'], ['鸡腿', '130 g / 成人', '过敏原更少，脂肪略低'], ['豆腐', '150 g / 成人', '植物蛋白；钙凝固豆腐钙更高']]
      },
      {
        title: '虾：甲壳类', allergen: 'shellfish', note: '虾仁快炒时间短，复热容易变韧；含保水剂的虾仁钠可能偏高。',
        items: [['虾仁', '120 g / 成人', '购买时看配料表是否含磷酸盐'], ['鸡腿', '130 g / 成人', '更耐复热'], ['豆腐', '150 g / 成人', '完全避开甲壳类']]
      },
      {
        title: '豆腐：大豆', allergen: 'soy', note: '豆腐、毛豆、酱油和味噌都含大豆；排除大豆时需同时替换调味料。',
        items: [['北豆腐（钙凝固）', '150 g / 成人', '钙含量高，但品牌差异大'], ['鸡腿', '130 g / 成人', '排除大豆的替代'], ['牛肉末', '100 g / 成人', '铁更高，脂肪也更高']]
      },
      {
        title: '烤鸡：省事，钠看标签', allergen: 'soy/wheat', note: '现成烤鸡调味料可能含大豆和小麦，钠取决于配方；本页按 USDA 烤鸡胸肉数据估计。',
        items: [['现成烤鸡', '100 g 可食肉', '去皮可减少一部分脂肪与钠'], ['自制鸡腿', '130 g 生重', '酱汁可自行减盐'], ['豆腐', '150 g', '完全避开肉类']]
      }
    ].map(function (card) {
      var rows = card.items.map(function (item) {
        return '<div class="alt-row"><div><strong>' + esc(item[0]) + '</strong><p>' + esc(item[1]) + ' · ' + esc(item[2]) + '</p></div></div>';
      }).join('');
      return '<div class="alt-card"><h3>' + esc(card.title) + '</h3><p>' + esc(card.note) + '</p>' +
        '<div class="alt-badges">' + (card.allergen.split('/').map(function (a) {
          return tag(a === 'soy' ? '大豆' : a === 'wheat' ? '小麦' : a === 'fish' ? '鱼' : '甲壳类', 'tag-allergen');
        }).join('')) + '</div><div class="alt-list">' + rows + '</div></div>';
    }).join('');

    return '<section class="section"><div class="section-head"><div><h2>换菜与筛选</h2>' +
      '<p class="section-sub">先用轮换换整体晚餐方向，再在菜单页逐天换开启的餐次；过敏原、盐量和儿童口感会同时影响菜单、营养与采购。排除过敏原后没有合规候选的餐会标成“待选”，并给出可确认的推荐。</p></div></div>' +
      '<div class="grid-2">' +
      '<div class="alt-card"><h3>晚餐轮换</h3><p>轮换只改变晚餐蛋白质主菜，早餐风格在顶部单独设置。</p><div class="alt-list">' + rotationCards + '</div></div>' +
      '<div class="alt-card"><h3>过敏原排除</h3><p>选择后会把含该过敏原的整餐标成“待选”，并在菜单卡片里给出推荐、冲突食材和替换原因；逐天下拉只列出不触发排除的餐。</p>' +
      '<div class="chips" style="margin-top:12px">' + DATA.allergens.map(function (a) {
        var active = s.exclude.indexOf(a.id) >= 0;
        return '<button type="button" class="chip" data-action="toggle-allergen" data-value="' + a.id + '" aria-pressed="' + (active ? 'true' : 'false') + '" title="' + esc(a.detail) + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>' +
      '<p class="hint">当前：' + (s.exclude.length ? esc(M.allergenList(s).join('、')) : '未排除任何过敏原') + '。替换仅基于配料表，不覆盖品牌交叉污染。</p></div>' +
      '</div></section>' +
      '<section class="section"><div class="section-head"><div><h2>蛋白质替换参考</h2><p class="section-sub">等量替换不是等营养替换，替换后请以页面重新计算的数值为准。</p></div></div>' +
      '<div class="alt-grid">' + proteinCards + '</div></section>' +
      '<section class="section"><div class="grid-2">' +
      '<div class="alt-card"><h3>盐量</h3><p>减盐会换用低钠酱油和低盐味噌、省略饭团用盐；现成烤鸡是否更咸取决于调味，请按包装判断。</p>' +
      '<div class="segmented compact" style="margin:12px 0" role="group" aria-label="盐量">' +
      '<button type="button" data-action="set-salt" data-value="standard" class="' + (s.salt === 'standard' ? 'is-active' : '') + '" aria-pressed="' + (s.salt === 'standard') + '">标准</button>' +
      '<button type="button" data-action="set-salt" data-value="low" class="' + (s.salt === 'low' ? 'is-active' : '') + '" aria-pressed="' + (s.salt === 'low') + '">减盐</button></div>' +
      '<ul class="rule-list">' + DATA.tips.salt.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="alt-card"><h3>儿童口感</h3><p>软烂模式不改变克数，而是调整切配、蒸煮时间与复热检查提示。</p>' +
      '<div class="segmented compact" style="margin:12px 0" role="group" aria-label="儿童口感">' +
      '<button type="button" data-action="set-texture" data-value="standard" class="' + (s.texture === 'standard' ? 'is-active' : '') + '" aria-pressed="' + (s.texture === 'standard') + '">标准</button>' +
      '<button type="button" data-action="set-texture" data-value="soft" class="' + (s.texture === 'soft' ? 'is-active' : '') + '" aria-pressed="' + (s.texture === 'soft') + '">软烂易嚼</button></div>' +
      '<ul class="rule-list">' + DATA.tips.texture.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div></section>' +
      '<section class="section"><div class="grid-2">' +
      '<div class="alt-card"><h3>储存技巧</h3><ul class="rule-list">' +
      DATA.tips.storage.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="alt-card"><h3>本周安排</h3><ul class="rule-list">' +
      DATA.tips.planning.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div></section>';
  }

  /* =========================================================
     说明与来源
     ========================================================= */

  function viewAbout() {
    var sources = DATA.sources.map(function (source) {
      return '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener">' + esc(source.title) + '</a><span>' + esc(source.note) + '</span></li>';
    }).join('');

    var ingredientRows = Object.keys(DATA.ingredients).map(function (id) {
      var ing = DATA.ingredients[id];
      var source = ing.source || {};
      var srcLabel = source.type === 'SR Legacy' ? 'USDA FDC #' + source.fdcId : (source.type || '') + (source.mext ? ' ' + source.mext : '');
      var srcCell = source.type === 'SR Legacy'
        ? '<a href="https://fdc.nal.usda.gov/food-details/' + source.fdcId + '/nutrients" target="_blank" rel="noopener">' + esc(srcLabel) + '</a>'
        : esc(srcLabel);
      return '<tr><td>' + esc(ing.name) + '</td><td>' + esc(ing.state || '') + '</td>' +
        '<td class="num">' + fmt(ing.per100.kcal) + '</td><td class="num">' + fmt(ing.per100.protein, 1) + '</td>' +
        '<td class="num">' + fmt(ing.per100.calcium) + '</td><td class="num">' + fmt(ing.per100.iron, 1) + '</td>' +
        '<td class="num">' + fmt(ing.per100.sodium) + '</td><td>' + srcCell + '</td></tr>';
    }).join('');

    return '<section class="section prose"><h2>这个页面怎么算</h2>' +
      '<p>V3 把 V2 的整餐模板拆成“菜品 + 食材 + 克数”：同一道菜可以单独调整份量，营养、采购和分装会同步重算。所有数据在浏览器本地运行，不需要服务器或账号。</p>' +
      '<h3>数据模型</h3>' +
      '<ul><li><strong>食材</strong>：每 100 g 能量、蛋白质、脂肪、碳水、纤维、钙、铁、钠，以及采购单位、可食部、生熟折算与过敏原。</li>' +
      '<li><strong>菜品</strong>：每位成人的基准克数、保存方式、复热方式、儿童与软烂提示、做法步骤。</li>' +
      '<li><strong>菜单</strong>：顶部开关决定本周吃早餐/午餐/晚餐；早餐风格与晚餐轮换决定吃什么，带饭午餐复用当天晚餐，现做午餐从晚餐菜库另选；饭团米饭克数由“大小 × 个数”决定。</li>' +
      '<li><strong>份量</strong>：成人按 1 份；儿童按年龄段系数（4–6 岁 0.55、7–10 岁 0.70、11–13 岁 0.85）；全家采购按成人数量加儿童系数汇总。</li></ul>' +
      '<h3>精度与假设</h3>' +
      '<ul><li>营养值按食材生重或标明的熟重整份计算，未计烹调损失、吸油差异和酱汁残留；假设配好的酱汁全部吃掉。</li>' +
      '<li>采购量按可食部与生熟比折算后向上取整到常见包装，因此会有余量；“约”表示估算。</li>' +
      '<li>儿童系数只是份量规划假设，不是该年龄段的膳食建议。未开启的餐次以及加餐、饮料未计入。</li>' +
      '<li>低盐味噌没有现成 USDA 条目，按普通味噌钠含量的 60% 估算；购买时请以包装标签为准。</li>' +
      '<li>叮叮饭、杂粮饭、粗粮和奶白菜/油冬菜使用近似值；猪排骨、牛腱、牛腩、梅花肉、猪肉末、牛肉片、菠菜、小青菜和面条使用 USDA 条目。</li>' +
      '<li>炖菜汤块与汤块蔬菜面是方法卡，汤的脂肪和钠未逐项计入营养；鲜面不在本周采购清单里。</li>' +
      '<li>普通燕麦可能含小麦交叉污染；乳糜泻或小麦过敏请使用认证无麸质燕麦，页面会自动排除燕麦餐。</li>' +
      '<li>过敏原按配料推断，无法覆盖品牌配方、交叉污染和“可能含”标识；严重过敏请以包装与专业建议为准。</li>' +
      '<li>设备功率、容器形状和初温都会改变复热时间；页面给的分钟数只是起点，中心 74°C 才是标准。</li></ul>' +
      '<h3>食材数据表</h3>' +
      '<div class="table-wrap"><table class="about-table"><thead><tr><th>食材</th><th>状态</th><th class="num">kcal</th><th class="num">蛋白 g</th><th class="num">钙 mg</th><th class="num">铁 mg</th><th class="num">钠 mg</th><th>来源</th></tr></thead><tbody>' +
      ingredientRows + '</tbody></table><p class="table-note">每 100 g 数值。USDA SR Legacy 为 2019 年发布的数据集；海苔采用日本食品标准成分表 2020 年版。品牌食品请以包装营养标签为准。</p></div>' +
      '<h3>版本变化</h3>' +
      '<ul><li>新增逐食材营养、克数编辑与计算过程；改份量后采购、营养与分装同步更新。</li>' +
      '<li>新增鱼、虾、豆腐、烤鸡替换方案，以及过敏原、盐量、儿童口感筛选。</li>' +
      '<li>新增饭团规格（大小 × 个数）、冷藏/冷冻/现加分类、微波与蒸锅分量分级操作卡。</li>' +
      '<li>V3.1 新增白米/杂粮/叮叮饭、米杯换算、同煮加料，以及米杯显示和肉类克数显示。</li>' +
      '<li>V3.1 新增工具开关、容器计划、腌制计划、五种炖菜与汤块冰格、汤块蔬菜面。</li>' +
      '<li>V3.1 新增每日绿叶菜、彩椒/菇类菜品、膳食纤维列和通俗便便公式（非医学诊断）。</li>' +
       '<li>V3.2 新增早餐/午餐/晚餐独立开关与午餐带饭/现做两种模式；总餐次、营养、采购、时间线和分装按实际餐次联动。</li>' +
      '<li>V3.2 新增逐天早餐/午餐/晚餐替换和“待选”机制：排除过敏原后没有合规候选时不再假装给了完整菜单，营养、采购、时间线和分装都会标明未计入的餐次，补选后自动恢复。</li>' +
      '<li>V3.2 新增首页三套整周预设，切换时保留家庭人数、儿童年龄、过敏原、餐次和工具开关。</li>' +
      '<li>保留 V2 的五天菜单思路与食品安全边界，删除无法核实的“精确到克”话术。</li></ul>' +
      '<h3>资料与来源</h3><ul class="sources">' + sources + '</ul>' +
      '<h3>隐私</h3><p>设置、份量改动和采购勾选只写入当前浏览器的 localStorage，不上传、不联网同步。清除浏览器数据或换浏览器后会恢复默认。</p>' +
      '</section>';
  }

  /* =========================================================
     份量编辑弹窗
     ========================================================= */

  /* 成品/预包装食材没有可靠营养标签时，不能用 0 代替未知值。 */
  function ingredientNutritionUnknown(ing) {
    if (!ing) return true;
    if (ing.labelUnknown) return true;
    return !ing.per100 || !Object.keys(ing.per100).length;
  }

  function dialogHasUnknownNutrition(dishId, edits) {
    var dish = DATA.dishes[dishId];
    if (!dish) return false;
    if (dish.kind === 'commercialFrozen') return true;
    return M.resolveParts(dishId, state.settings, edits == null ? state.edits : edits).some(function (part) {
      return ingredientNutritionUnknown(DATA.ingredients[part.ingredient]);
    });
  }

  /* 弹窗用：按最终配方汇总“含”与“可能含”过敏原（ing.allergens / ing.mayContain，
     兼容旧数据里的 dish.mayContain）；0 g 或减盐移除的食材不计入。
     含未核实标签的成品时，unknown=true，不能把空白显示成“无”。 */
  function finalDialogAllergens(dishId, edits) {
    var data = DATA.dishes[dishId];
    var contains = [];
    var mayContain = [];
    var unknown = false;
    function add(list, id) {
      if (list.indexOf(id) < 0) list.push(id);
    }
    var parts = M.resolveParts(dishId, state.settings, edits == null ? state.edits : edits);
    parts.forEach(function (part) {
      var ing = DATA.ingredients[part.ingredient];
      if (!ing) return;
      if (ingredientNutritionUnknown(ing)) unknown = true;
      (ing.allergens || []).forEach(function (id) { add(contains, id); });
      (ing.mayContain || []).forEach(function (id) { add(mayContain, id); });
    });
    if (data && data.mayContain && parts.length) {
      data.mayContain.forEach(function (id) { add(mayContain, id); });
    }
    var order = function (id) {
      for (var i = 0; i < DATA.allergens.length; i++) if (DATA.allergens[i].id === id) return i;
      return 99;
    };
    contains.sort(function (a, b) { return order(a) - order(b); });
    mayContain = mayContain.filter(function (id) { return contains.indexOf(id) < 0; });
    mayContain.sort(function (a, b) { return order(a) - order(b); });
    return { contains: contains, mayContain: mayContain, unknown: unknown };
  }

  function dialogAllergenText(edits) {
    if (!dialogContext) return '';
    var found = finalDialogAllergens(dialogContext.dishId, edits);
    var text;
    if (found.unknown) {
      text = found.contains.length
        ? '含：' + found.contains.map(M.allergenLabel).join('、') + '；成品过敏原未知，需核对包装'
        : '含：未知（成品包装未核对，请以标签为准）';
      if (found.mayContain.length) text += '；可能含：' + found.mayContain.map(M.allergenLabel).join('、');
    } else {
      text = '含：' + (found.contains.length ? found.contains.map(M.allergenLabel).join('、') : '无');
      if (found.mayContain.length) text += '；可能含：' + found.mayContain.map(M.allergenLabel).join('、');
    }
    return text;
  }

  function openDishDialog(dishId, dayIndex, slot) {
    var dish = DATA.dishes[dishId];
    if (!dish) return;
    dialogContext = { dishId: dishId, day: dayIndex, slot: slot };
    $('#dishDialogTitle').textContent = dish.name;
    $('#dishDialogKicker').textContent = '第 ' + (dayIndex + 1) + ' 天 · ' + (slot === 'breakfast' ? '早餐' : '晚餐') + ' · 每人份量';
    renderDialogBody();
    var dialog = $('#dishDialog');
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  function clampGrams(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.min(2000, Math.max(0, n));
  }

  function currentDialogGrams() {
    if (!dialogContext) return null;
    var inputs = $$('#dishBody [data-ingredient]');
    var grams = {};
    inputs.forEach(function (input) {
      grams[input.dataset.ingredient] = clampGrams(input.value);
    });
    return grams;
  }

  function renderDialogBody() {
    if (!dialogContext) return;
    var dishId = dialogContext.dishId;
    var settings = state.settings;
    var dish = DATA.dishes[dishId];
    var current = M.resolveParts(dishId, settings, state.edits);

    var rows = current.map(function (part) {
      var ing = DATA.ingredients[part.ingredient];
      var original = DATA.ingredients[part.originalIngredient];
      var value = part.grams;
      var per = ing ? ing.per100 : {};
      var name = ing ? ing.name : part.ingredient;
      var sub = [];
      if (part.originalIngredient !== part.ingredient && original) sub.push('减盐替换自' + original.name);
      if (part.role === 'rice' && dish.kind === 'onigiri') {
        sub.push(settings.onigiri.pieces + ' 个 × ' + settings.onigiri.size + ' g 米饭');
      } else if (part.note) {
        sub.push(part.note);
      }
      var perLine = ingredientNutritionUnknown(ing)
        ? '营养待核（以包装标签为准）'
        : '此份 ' + fmt(per.kcal * value / 100) + ' kcal · 蛋白 ' + fmt(per.protein * value / 100, 1) +
          ' g · 钙 ' + fmt(per.calcium * value / 100) + ' mg · 铁 ' + fmt(per.iron * value / 100, 1) +
          ' mg · 钠 ' + fmt(per.sodium * value / 100) + ' mg';
      return '<div class="ing-row">' +
        '<div class="ing-name">' + esc(name) + (sub.length ? '<small>' + esc(sub.join(' · ')) + '</small>' : '') + '</div>' +
        '<div class="ing-input"><input type="number" min="0" max="2000" step="1" inputmode="decimal" value="' + value + '" data-ingredient="' + esc(part.originalIngredient) + '" aria-label="' + esc(name) + '克数"><span>g</span></div>' +
        '<div class="ing-nutri" data-row="' + esc(part.originalIngredient) + '">' + esc(perLine) + '</div></div>';
    }).join('');

    /* 过敏原按最终配方显示：用 resolveParts 枚举实际食材（改克数、减盐替换、0 g 移除都生效），
       合并 ing.allergens（含）、ing.mayContain（可能含）以及 dish.mayContain（兼容旧数据）。 */
    var finalAllergens = finalDialogAllergens(dishId);
    var allergenText = dialogAllergenText();
    var unknownNutrition = dialogHasUnknownNutrition(dishId);
    var kidNotes = [];
    if (dish.kidNote) kidNotes.push('儿童：' + dish.kidNote);
    if (settings.texture === 'soft' && dish.softNote) kidNotes.push('软烂：' + dish.softNote);

    $('#dishBody').innerHTML =
      '<p class="hint" style="margin-top:0">这里改的是<strong>每位成人</strong>的克数，会同步到本周所有同名菜品、营养估算和采购清单。儿童份量按全局系数自动缩放。</p>' +
      (unknownNutrition ? '<div class="notice warn"><div><p><strong>成品营养与过敏原未知：</strong>这里显示“待核”，不按 0 计算；请以包装标签为准，过敏家庭先核对配料。</p></div></div>' : '') +
      rows +
      '<div class="sheet-summary" id="dialogSummary"></div>' +
      (kidNotes.length ? '<div class="hint dish-notes"><strong>儿童与口感</strong><br>' + esc(kidNotes.join(' ')) + '</div>' : '') +
      '<div class="hint">过敏原：<span id="dialogAllergenNote">' + esc(allergenText) + '</span>' +
      '。保存方式：' + esc(DATA.storage[dish.storage] ? DATA.storage[dish.storage].label : '—') +
      '。复热：' + esc(DATA.reheat[dish.reheat] ? DATA.reheat[dish.reheat].label : '—') +
      '。工具：' + esc((dish.equipment || []).map(equipmentName).join('、') || '无') +
      '。容器：' + esc(dish.container && DATA.containers[dish.container] ? DATA.containers[dish.container].name : '现加/无需') +
      (dish.marinade && DATA.marinades[dish.marinade] ? '。腌制：' + esc(DATA.marinades[dish.marinade].name + ' ' + DATA.marinades[dish.marinade].time) : '') + '。</div>' +
      (dish.steps ? '<details class="calc" style="margin-top:12px"><summary><span>做法与安全提示</span>' + icon('i-chevron') + '</summary><div class="calc-body"><ol class="rule-list" style="list-style:none">' +
        dish.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol></div></details>' : '');

    updateDialogSummary();
    $$('#dishBody [data-ingredient]').forEach(function (input) {
      input.addEventListener('input', updateDialogSummary);
    });
  }

  function updateDialogRows(tempEdits) {
    var parts = M.resolveParts(dialogContext.dishId, state.settings, tempEdits);
    var byOriginal = {};
    parts.forEach(function (part) { byOriginal[part.originalIngredient] = part; });
    $$('#dishBody .ing-nutri[data-row]').forEach(function (el) {
      var part = byOriginal[el.getAttribute('data-row')];
      if (!part) return;
      var ing = DATA.ingredients[part.ingredient];
      if (!ing) return;
      var per = ing.per100 || {};
      var value = part.grams;
      if (ingredientNutritionUnknown(ing)) {
        el.textContent = '营养待核（以包装标签为准）';
        return;
      }
      el.textContent = '此份 ' + fmt(per.kcal * value / 100) + ' kcal · 蛋白 ' + fmt(per.protein * value / 100, 1) +
        ' g · 钙 ' + fmt(per.calcium * value / 100) + ' mg · 铁 ' + fmt(per.iron * value / 100, 1) +
        ' mg · 钠 ' + fmt(per.sodium * value / 100) + ' mg';
    });
  }

  function updateDialogSummary() {
    if (!dialogContext) return;
    var grams = currentDialogGrams();
    var tempEdits = {};
    tempEdits[dialogContext.dishId] = grams;
    var dn = M.dishNutrition(dialogContext.dishId, state.settings, tempEdits);
    updateDialogRows(tempEdits);
    var allergenNote = $('#dialogAllergenNote');
    if (allergenNote) allergenNote.textContent = dialogAllergenText(tempEdits);
    var childLabel = state.settings.kidAge === 'none' ? '无儿童' : '每位儿童';
    if (dialogHasUnknownNutrition(dialogContext.dishId, tempEdits)) {
      $('#dialogSummary').innerHTML =
        '<div><span>成人</span><b>待核</b><small>kcal</small></div>' +
        '<div><span>蛋白</span><b>待核</b><small>g</small></div>' +
        '<div><span>钙</span><b>待核</b><small>mg</small></div>' +
        '<div><span>铁</span><b>待核</b><small>mg</small></div>' +
        '<div><span>钠</span><b>待核</b><small>mg</small></div>' +
        '<div><span>' + childLabel + '</span><b>待核</b><small>kcal</small></div>';
      return;
    }
    var kid = dn.kid;
    $('#dialogSummary').innerHTML =
      '<div><span>成人</span><b>' + fmt(dn.adult.kcal) + '</b><small>kcal</small></div>' +
      '<div><span>蛋白</span><b>' + fmt(dn.adult.protein, 1) + '</b><small>g</small></div>' +
      '<div><span>钙</span><b>' + fmt(dn.adult.calcium) + '</b><small>mg</small></div>' +
      '<div><span>铁</span><b>' + fmt(dn.adult.iron, 1) + '</b><small>mg</small></div>' +
      '<div><span>钠</span><b>' + fmt(dn.adult.sodium) + '</b><small>mg</small></div>' +
      '<div><span>' + childLabel + '</span><b>' + (kid ? fmt(kid.kcal) : '—') + '</b><small>kcal</small></div>';
  }

  function saveDialog() {
    if (!dialogContext) return;
    var dishId = dialogContext.dishId;
    var resolvedDefaults = M.resolveParts(dishId, state.settings, {});
    var defaults = {};
    resolvedDefaults.forEach(function (part) { defaults[part.originalIngredient] = part.grams; });
    var grams = currentDialogGrams();
    var differences = {};
    Object.keys(grams).forEach(function (ingredientId) {
      if (defaults[ingredientId] != null && Math.abs(grams[ingredientId] - defaults[ingredientId]) > 0.001) {
        differences[ingredientId] = grams[ingredientId];
      }
    });
    if (Object.keys(differences).length) state.edits[dishId] = differences;
    else delete state.edits[dishId];
    var ctx = dialogContext;
    save();
    closeDialog();
    render();
    var opener = $$('.dish-row').filter(function (row) {
      return row.getAttribute('data-dish') === ctx.dishId &&
        row.getAttribute('data-day') === String(ctx.day) && row.getAttribute('data-meal') === ctx.slot;
    })[0];
    if (opener) opener.focus({ preventScroll: true });
    showToast(Object.keys(differences).length ? '已更新份量，营养与采购已重算' : '已恢复默认份量');
  }

  function resetDialog() {
    if (!dialogContext) return;
    delete state.edits[dialogContext.dishId];
    save();
    renderDialogBody();
    render();
    showToast('已恢复这道菜的默认份量');
  }

  function closeDialog() {
    var dialog = $('#dishDialog');
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
    dialogContext = null;
  }

  /* =========================================================
     事件绑定
     ========================================================= */

  function bindSetup() {
    $$('#days button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.days = Number(btn.dataset.value);
        pruneOverrides();
        save(); render();
      });
    });
    $('#adults').addEventListener('change', function (event) {
      applySettings(Object.assign({}, state.settings, { adults: Number(event.target.value) }));
      save(); render();
    });
    $('#kidAge').addEventListener('change', function (event) {
      state.settings.kidAge = event.target.value;
      save(); render();
    });
    $('#style').addEventListener('change', function (event) {
      state.settings.style = event.target.value;
      state.settings.breakfastOverrides = {};
      save(); render();
    });
    $('#shortcut').addEventListener('change', function (event) {
      state.settings.shortcut = event.target.checked;
      save(); render();
    });
    $('#onigiriSize').addEventListener('change', function (event) {
      state.settings.onigiri.size = Number(event.target.value);
      clearOnigiriRiceEdits();
      save(); render();
    });
    $('#onigiriPieces').addEventListener('change', function (event) {
      state.settings.onigiri.pieces = Number(event.target.value);
      clearOnigiriRiceEdits();
      save(); render();
    });
    $('#riceType').addEventListener('change', function (event) {
      state.settings.riceType = event.target.value;
      delete state.edits.rice_bowl;
      save(); render();
    });
    $('#riceAddIn').addEventListener('change', function (event) {
      state.settings.riceAddIn = event.target.value;
      delete state.edits.rice_bowl;
      save(); render();
    });
    $$('#salt button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.salt = btn.dataset.value;
        save(); render();
      });
    });
    $$('#texture button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.texture = btn.dataset.value;
        save(); render();
      });
    });
    $$('#allergens .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        toggleAllergen(chip.dataset.allergen);
      });
    });
    $('#resetAll').addEventListener('click', function () {
      if (!window.confirm('恢复默认设置会清除份量改动和采购勾选，确定继续？')) return;
      applySettings(null);
      state.edits = {};
      state.checks = {};
      save();
      render();
      showToast('已恢复默认设置');
    });
  }

  function pruneOverrides() {
    MEAL_SLOTS.forEach(function (slotEntry) {
      var slot = slotEntry.id;
      var overrides = mealOverrideMap(slot);
      Object.keys(overrides).forEach(function (key) {
        if (Number(key) >= state.settings.days) delete overrides[key];
      });
    });
  }

  function clearOnigiriRiceEdits() {
    Object.keys(state.edits).forEach(function (dishId) {
      var dish = DATA.dishes[dishId];
      if (!dish || dish.kind !== 'onigiri') return;
      delete state.edits[dishId].rice_cooked;
      if (!Object.keys(state.edits[dishId]).length) delete state.edits[dishId];
    });
  }

  function toggleAllergen(id) {
    var list = state.settings.exclude;
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
    applySettings(state.settings);
    MEAL_SLOTS.forEach(function (slotEntry) {
      var overrides = mealOverrideMap(slotEntry.id);
      Object.keys(overrides).forEach(function (dayKey) {
        if (!mealFits(overrides[dayKey], state.settings)) delete overrides[dayKey];
      });
    });
    save();
    render();
    showToast(index >= 0 ? '已取消排除：' + M.allergenLabel(id) : '已排除：' + M.allergenLabel(id));
  }

  function setRotation(value) {
    if (state.settings.rotation === value) { showToast('已经在使用「' + DATA.rotations[value].label + '」'); return; }
    state.settings.rotation = value;
    state.settings.dinnerOverrides = {};
    ensureOverrideMaps();
    save(); render();
    showToast('晚餐轮换已切换为「' + DATA.rotations[value].label + '」');
  }

  function bindView() {
    $('#views').addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;
      if (action === 'open-dish') {
        openDishDialog(target.dataset.dish, Number(target.dataset.day), target.dataset.meal);
      } else if (action === 'shop-scope') {
        shoppingScope = target.dataset.scope; render();
      } else if (action === 'check-shop') {
        var key = target.dataset.key;
        state.checks[key] = state.checks[key] !== true;
        save();
        render();
      } else if (action === 'check-optional') {
        var optionalKey = target.dataset.key;
        state.checks[optionalKey] = state.checks[optionalKey] !== true;
        save(); render();
      } else if (action === 'reset-checks') {
        state.checks = {};
        save(); render();
        showToast('已清除采购勾选');
      } else if (action === 'copy-list') {
        copyShopping();
      } else if (action === 'print') {
        window.print();
      } else if (action === 'set-rotation') {
        setRotation(target.dataset.value);
      } else if (action === 'toggle-allergen') {
        toggleAllergen(target.dataset.value);
      } else if (action === 'set-salt') {
        state.settings.salt = target.dataset.value; save(); render();
      } else if (action === 'set-texture') {
        state.settings.texture = target.dataset.value; save(); render();
      } else if (action === 'toggle-tool') {
        var toolId = target.dataset.value;
        state.settings.tools[toolId] = state.settings.tools[toolId] === false;
        save();
        render();
        var tool = (DATA.equipment || []).filter(function (item) { return item.id === toolId; })[0];
        showToast((state.settings.tools[toolId] ? '已启用：' : '已停用：') + (tool ? tool.name : toolId));
      } else if (action === 'set-container') {
        state.settings.containerPref = target.dataset.value;
        save();
        render();
        showToast('容器偏好已更新');
      } else if (action === 'confirm-recommendation') {
        confirmRecommendation(Number(target.dataset.day), target.dataset.mealType, target.dataset.mealId);
      }
    });

    $('#views').addEventListener('change', function (event) {
      var select = event.target.closest('[data-meal-swap]') || event.target.closest('[data-dinner-swap]');
      if (!select) return;
      var rawSlot = select.getAttribute('data-meal-swap') || (select.hasAttribute('data-dinner-swap') ? 'dinner' : 'breakfast');
      var slot = SLOT_LABEL[rawSlot] ? rawSlot : 'dinner';
      var dayIndex = Number(select.getAttribute('data-day') != null ? select.getAttribute('data-day') : select.getAttribute('data-dinner-swap'));
      if (!isFinite(dayIndex)) return;
      var label = SLOT_LABEL[slot];
      var overrides = mealOverrideMap(slot);
      if (select.value) overrides[dayIndex] = select.value;
      else delete overrides[dayIndex];
      save(); render();
      showToast(select.value ? '已替换第 ' + (dayIndex + 1) + ' 天' + label
        : '已恢复' + (slot === 'breakfast' ? '早餐风格' : slot === 'lunch' ? '午餐轮换' : '晚餐轮换'));
    });
  }

  function confirmRecommendation(dayIndex, slot, mealId) {
    if (!isFinite(dayIndex) || !SLOT_LABEL[slot] || !mealId) return;
    mealOverrideMap(slot)[dayIndex] = mealId;
    save();
    render();
    var select = $$('#views select[data-meal-swap="' + slot + '"]').filter(function (node) {
      return node.getAttribute('data-day') === String(dayIndex);
    })[0];
    if (select) select.focus({ preventScroll: true });
    showToast('已采用推荐：第 ' + (dayIndex + 1) + ' 天' + SLOT_LABEL[slot] +
      '「' + mealDisplayName(mealId) + '」');
  }

  function copyShopping() {
    var model = build();
    var lines = ['采购清单 · ' + M.describePlan(model.plan, state.settings), ''];
    model.shopping.groups.forEach(function (group) {
      var visible = visibleShoppingRows(group.items);
      if (!visible.length) return;
      lines.push('【' + group.name + '】');
      visible.forEach(function (row) {
        if (row.id === 'rice_cooked') {
          lines.push('- ' + row.name + '（生米采购）：' + row.info.suggestion + '（约需生米 ' + row.info.buyLabel +
            (row.info.cups ? '，约 ' + fmt(row.info.cups, 1) + ' 杯' : '') + '；约合熟饭 ' + fmt(row.grams / 1000, 2) + ' kg）');
        } else {
          lines.push('- ' + row.name + '：' + row.info.suggestion + '（' + row.info.buyLabel + (row.pantry ? '，家中常有' : '') + '）');
        }
      });
      lines.push('');
    });
    if (shoppingScope === 'all' && (DATA.optionalShopping || []).length) {
      lines.push('【冷冻便利菜（可选，不计入营养）】');
      DATA.optionalShopping.forEach(function (item) {
        lines.push('- ' + item.label + '：' + item.amount + '（' + item.channels + '）');
      });
      lines.push('');
    }
    var text = lines.join('\n');
    var done = function () { showToast('采购清单已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(text).then(done, fallback);
      } catch (err) {
        fallback();
      }
    } else {
      fallback();
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand('copy')) done();
        else showToast('复制失败，请手动选择清单');
      } catch (err) { showToast('复制失败，请手动选择清单'); }
      document.body.removeChild(area);
    }
  }

  function bindDialog() {
    $('#dishClose').addEventListener('click', closeDialog);
    $('#dishCancel').addEventListener('click', closeDialog);
    $('#dishReset').addEventListener('click', resetDialog);
    $('#dishSave').addEventListener('click', saveDialog);
    $('#dishDialog').addEventListener('close', function () { dialogContext = null; });
    $('#dishDialog').addEventListener('cancel', function () { dialogContext = null; });
    $('#dishDialog').addEventListener('click', function (event) {
      if (event.target === $('#dishDialog')) closeDialog();
    });
    $('#dishForm').addEventListener('submit', function (event) {
      event.preventDefault();
      saveDialog();
    });
  }

  function bindTabsHash() {
    var hash = (window.location.hash || '').replace('#', '');
    if (TABS.some(function (t) { return t.id === hash; })) state.tab = hash;
    window.addEventListener('hashchange', function () {
      var next = (window.location.hash || '').replace('#', '');
      if (TABS.some(function (t) { return t.id === next; }) && next !== state.tab) {
        selectTab(next, true);
      }
    });
    window.addEventListener('scroll', function () {
      var tabs = $('#tabs');
      if (!tabs) return;
      tabs.classList.toggle('is-stuck', tabs.getBoundingClientRect().top <= 1);
    }, { passive: true });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    load();
    ensureOverrideMaps();
    ensureMealSetup();
    bindMealSetup();
    renderAllergenChips();
    renderRiceOptions();
    bindSetup();
    bindView();
    document.getElementById('views').addEventListener('click', function(event){
      var btn = event.target.closest('[data-quick-choice]');
      if (!btn) return;
      var select = btn.closest('.swap-picker').querySelector('select');
      select.value = btn.dataset.quickChoice;
      select.dispatchEvent(new Event('change', {bubbles:true}));
    });
    bindDialog();
    bindTabsHash();
    render();
    var initialTab = $('#tab-' + state.tab);
    if (initialTab && initialTab.scrollIntoView) {
      initialTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    if ((window.location.hash || '').length > 1) scrollToTabs();
    window.__MEALPREP__ = {
      state: state,
      build: build,
      render: render,
      model: M,
      data: DATA,
      selectTab: selectTab,
      openDishDialog: openDishDialog,
      saveDialog: saveDialog
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
