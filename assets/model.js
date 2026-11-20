/* =========================================================
   家庭早晚餐规划 V3 — 计算层（不依赖 DOM）
   只做三件事：把设置变成菜单、把菜单变成营养、把菜单变成采购。
   ========================================================= */
(function (global) {
  'use strict';

  var DATA = global.MEALPREP;
  if (!DATA) throw new Error('MEALPREP 数据未加载，请先引入 data.js');

  var NUTRIENTS = ['kcal', 'protein', 'fat', 'carb', 'fiber', 'calcium', 'iron', 'sodium'];
  var AGE_FACTOR = { '4-6': 0.55, '7-10': 0.7, '11-13': 0.85, none: 0 };
  var AGE_LABEL = { '4-6': '4–6 岁', '7-10': '7–10 岁', '11-13': '11–13 岁', none: '无儿童' };

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }
  function round(value, digits) {
    var p = Math.pow(10, digits == null ? 1 : digits);
    return Math.round((value + Number.EPSILON) * p) / p;
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function sum(list, fn) {
    return list.reduce(function (acc, item) { return acc + fn(item); }, 0);
  }
  function uniq(list) {
    var seen = {};
    return list.filter(function (item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function ingredients() { return DATA.ingredients; }
  function dish(id) { return DATA.dishes[id] || null; }
  function meal(id) { return DATA.meals[id] || null; }

  /* ---------------- 餐次 ---------------- */

  /* 三餐顺序固定为早、午、晚；午餐复用晚餐菜库（type==='dinner' 的餐），
     没有独立午餐菜库。购物、容器、时间线和工具统计都按这个顺序遍历。 */
  var MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'];
  var DEFAULT_MEALS = { breakfast: true, lunch: false, dinner: true };
  var DEFAULT_LUNCH_MODE = 'packed';

  /* 只接受布尔开关；缺失的项用默认值，三个都关时强制保留早餐。 */
  function normalizeMeals(raw) {
    var out = {
      breakfast: DEFAULT_MEALS.breakfast,
      lunch: DEFAULT_MEALS.lunch,
      dinner: DEFAULT_MEALS.dinner
    };
    if (raw && typeof raw === 'object') {
      MEAL_SLOTS.forEach(function (slot) {
        if (Object.prototype.hasOwnProperty.call(raw, slot) && typeof raw[slot] === 'boolean') {
          out[slot] = raw[slot];
        }
      });
    }
    if (!out.breakfast && !out.lunch && !out.dinner) out.breakfast = true;
    return out;
  }

  function normalizeLunchMode(raw) {
    var modes = (DATA.lunchModes || []).map(function (item) { return item.id; });
    if (!modes.length) modes = ['packed', 'cook'];
    return modes.indexOf(raw) >= 0 ? raw : DEFAULT_LUNCH_MODE;
  }

  /* 兼容 settings.meals 缺失（旧存档/旧调用）时按早餐+晚餐处理。 */
  function mealSlotIds(settings) {
    var source = settings && settings.meals && typeof settings.meals === 'object'
      ? settings.meals
      : settings;
    var normalized = normalizeMeals(source);
    return MEAL_SLOTS.filter(function (slot) { return normalized[slot]; });
  }

  /* 某天/整份计划里真正存在的餐（跳过 disabled 和 pending 占位）。 */
  function builtMealSlots(day) {
    var slots = [];
    MEAL_SLOTS.forEach(function (slot) {
      var m = day && day[slot];
      if (m && !m.pending && m.dishes && m.dishes.length) slots.push(slot);
    });
    return slots;
  }

  /* ---------------- 设置 ---------------- */

  function settingsFrom(raw) {
    raw = raw || {};
    var onigiriRaw = raw.onigiri || {};
    var size = num(onigiriRaw.size, 80);
    var pieces = num(onigiriRaw.pieces, 2);
    var exclude = Array.isArray(raw.exclude) ? raw.exclude.filter(function (id) {
      return DATA.allergens.some(function (a) { return a.id === id; });
    }) : [];
    var overrides = {};
    if (raw.dinnerOverrides && typeof raw.dinnerOverrides === 'object') {
      Object.keys(raw.dinnerOverrides).forEach(function (key) {
        var idx = Number(key);
        var id = raw.dinnerOverrides[key];
        var m = DATA.meals[id];
        if (isFinite(idx) && idx >= 0 && idx <= 4 && m && m.type === 'dinner') overrides[idx] = id;
      });
    }
    var breakfastOverrides = {};
    if (raw.breakfastOverrides && typeof raw.breakfastOverrides === 'object') {
      Object.keys(raw.breakfastOverrides).forEach(function (key) {
        var bIdx = Number(key);
        var bId = raw.breakfastOverrides[key];
        var bm = DATA.meals[bId];
        if (isFinite(bIdx) && bIdx >= 0 && bIdx <= 4 && bm && bm.type === 'breakfast') breakfastOverrides[bIdx] = bId;
      });
    }
    /* 午餐没有独立菜库：lunchOverrides 只接受晚餐菜（type==='dinner'）的 id。 */
    var lunchOverrides = {};
    if (raw.lunchOverrides && typeof raw.lunchOverrides === 'object') {
      Object.keys(raw.lunchOverrides).forEach(function (key) {
        var lIdx = Number(key);
        var lId = raw.lunchOverrides[key];
        var lm = DATA.meals[lId];
        if (isFinite(lIdx) && lIdx >= 0 && lIdx <= 4 && lm && lm.type === 'dinner') lunchOverrides[lIdx] = lId;
      });
    }
    var tools = {};
    (DATA.equipment || []).forEach(function (tool) {
      tools[tool.id] = raw.tools && raw.tools[tool.id] === false ? false : true;
    });
    return {
      days: clamp(Math.round(num(raw.days, 5)), 3, 5),
      adults: clamp(Math.round(num(raw.adults, 2)), 1, 4),
      kidAge: AGE_FACTOR.hasOwnProperty(raw.kidAge) ? raw.kidAge : '7-10',
      style: DATA.plans.hasOwnProperty(raw.style) ? raw.style : 'classic',
      rotation: DATA.rotations.hasOwnProperty(raw.rotation) ? raw.rotation : 'balanced',
      shortcut: !!raw.shortcut,
      salt: raw.salt === 'low' ? 'low' : 'standard',
      texture: raw.texture === 'soft' ? 'soft' : 'standard',
      riceType: (DATA.riceTypes || []).some(function (item) { return item.id === raw.riceType; }) ? raw.riceType : 'white',
      riceAddIn: (DATA.riceAddIns || []).some(function (item) { return item.id === raw.riceAddIn; }) ? raw.riceAddIn : 'none',
      tools: tools,
      containerPref: (DATA.containerPrefs || []).some(function (item) { return item.id === raw.containerPref; }) ? raw.containerPref : 'mixed',
      onigiri: {
        size: [60, 80, 100].indexOf(size) >= 0 ? size : 80,
        pieces: clamp(Math.round(pieces), 1, 3)
      },
      exclude: uniq(exclude),
      dinnerOverrides: overrides,
      breakfastOverrides: breakfastOverrides,
      lunchOverrides: lunchOverrides,
      meals: normalizeMeals(raw.meals),
      lunchMode: normalizeLunchMode(raw.lunchMode)
    };
  }

  function kidFactor(settings) { return AGE_FACTOR[settings.kidAge] || 0; }
  function familyFactor(settings) { return settings.adults + kidFactor(settings); }
  function people(settings) {
    return {
      adults: settings.adults,
      kids: settings.kidAge === 'none' ? 0 : 1,
      kidFactor: kidFactor(settings),
      familyFactor: familyFactor(settings)
    };
  }

  /* ---------------- 菜与份量 ---------------- */

  function baseParts(dishId, settings) {
    var d = dish(dishId);
    if (!d) return [];
    if (dishId === 'rice_bowl') {
      var riceType = settings.riceType || 'white';
      var riceId = riceType === 'mixed' ? 'mixed_rice' : riceType === 'instant' ? 'instant_rice' : 'rice_cooked';
      var riceParts = [{ ingredient: riceId, grams: 150, role: 'rice', note: riceType === 'instant' ? '按包装微波' : '熟重' }];
      if (riceType !== 'instant' && settings.riceAddIn && settings.riceAddIn !== 'none') {
        var addIn = (DATA.riceAddIns || []).filter(function (item) { return item.id === settings.riceAddIn; })[0];
        if (addIn && addIn.ingredient && addIn.grams > 0) {
          riceParts.push({ ingredient: addIn.ingredient, grams: addIn.grams, role: 'veg', note: '同煮加料' });
        }
      }
      return riceParts;
    }
    return d.parts.map(function (part) {
      var grams = num(part.grams, 0);
      if (d.kind === 'onigiri' && part.role === 'rice') {
        grams = settings.onigiri.size * settings.onigiri.pieces;
      }
      return {
        ingredient: part.ingredient,
        grams: grams,
        role: part.role || '',
        note: part.note || '',
        omitWhenLowSalt: !!part.omitWhenLowSalt,
        optional: !!part.optional
      };
    });
  }

  function resolveParts(dishId, settings, edits) {
    var d = dish(dishId);
    if (!d) return [];
    var edit = edits && edits[dishId] ? edits[dishId] : null;
    return baseParts(dishId, settings).map(function (part) {
      var grams = part.grams;
      var edited = false;
      if (edit && edit[part.ingredient] != null) {
        grams = clamp(num(edit[part.ingredient], part.grams), 0, 2000);
        edited = Math.abs(grams - part.grams) > 0.001;
      }
      var ingredientId = part.ingredient;
      if (settings.salt === 'low' && DATA.saltSwaps[part.ingredient]) {
        ingredientId = DATA.saltSwaps[part.ingredient];
      }
      var omitted = settings.salt === 'low' && part.omitWhenLowSalt;
      return {
        ingredient: ingredientId,
        originalIngredient: part.ingredient,
        grams: grams,
        baseGrams: part.grams,
        edited: edited,
        omitted: omitted,
        role: part.role,
        note: part.note
      };
    }).filter(function (part) { return !part.omitted && part.grams > 0; });
  }

  function hasEdits(dishId, edits) {
    if (!edits || !edits[dishId]) return false;
    return Object.keys(edits[dishId]).some(function (key) {
      return edits[dishId][key] != null;
    });
  }

  /* 过敏原工具：区分“含”（ing.allergens / dish.mayContain）与“可能含”
     （ing.mayContain / dish.mayContain），但对外统一排序成一份列表。 */
  function sortAllergens(list) {
    return uniq(list).sort(function (a, b) { return allergenIndex(a) - allergenIndex(b); });
  }

  function allergenSources(parts, dishMayContain) {
    var contains = [];
    var mayContain = [];
    parts.forEach(function (part) {
      var ing = DATA.ingredients[part.ingredient];
      if (!ing) return;
      if (ing.allergens) contains = contains.concat(ing.allergens);
      if (ing.mayContain) mayContain = mayContain.concat(ing.mayContain);
    });
    if (dishMayContain) mayContain = mayContain.concat(dishMayContain);
    return { contains: sortAllergens(contains), mayContain: sortAllergens(mayContain) };
  }

  function sourcesToAllergens(sources) {
    return sortAllergens(sources.contains.concat(sources.mayContain));
  }

  /* 旧接口：按菜谱原始 parts 标注（不扣编辑克数），供显示使用。 */
  function dishAllergens(dishId) {
    var d = dish(dishId);
    if (!d) return [];
    return sourcesToAllergens(allergenSources(d.parts, d.mayContain));
  }

  function allergenIndex(id) {
    for (var i = 0; i < DATA.allergens.length; i++) if (DATA.allergens[i].id === id) return i;
    return 99;
  }
  function allergenLabel(id) {
    var found = DATA.allergens.filter(function (a) { return a.id === id; })[0];
    return found ? found.label : id;
  }

  function mealAllergens(mealId) {
    var m = meal(mealId);
    if (!m) return [];
    var list = [];
    m.items.forEach(function (item) { list = list.concat(dishAllergens(item.dish)); });
    return sortAllergens(list);
  }

  function mealItems(mealId) {
    var m = meal(mealId);
    return m ? m.items : [];
  }

  function mealDisplayName(mealId) {
    var m = meal(mealId);
    return m ? m.name : mealId;
  }

  /* ---------------- 生成菜单 ---------------- */

  function fitsFilters(mealId, exclude) {
    if (!exclude || !exclude.length) return true;
    var allergens = mealAllergens(mealId);
    return !allergens.some(function (a) { return exclude.indexOf(a) >= 0; });
  }

  function candidatesFor(type, exclude) {
    return Object.keys(DATA.meals).filter(function (id) {
      return DATA.meals[id].type === type && fitsFilters(id, exclude);
    });
  }

  /* 可用作午餐的候选：晚餐菜库全体（type==='dinner'），供界面下拉。
     午餐没有独立菜库，选到的菜按最终配方做过敏原检查。 */
  function lunchMealIds() {
    return Object.keys(DATA.meals).filter(function (id) {
      return DATA.meals[id].type === 'dinner';
    });
  }

  function pickReplacement(originalId, type, exclude, preferenceOrder, avoidId) {
    var order = (preferenceOrder || []).concat(Object.keys(DATA.meals));
    var passes = avoidId ? [function (id) { return id !== avoidId; }, function () { return true; }] : [function () { return true; }];
    for (var p = 0; p < passes.length; p++) {
      for (var i = 0; i < order.length; i++) {
        var id = order[i];
        var m = DATA.meals[id];
        if (!m || m.type !== type) continue;
        if (id === originalId) continue;
        if (!passes[p](id)) continue;
        if (fitsFilters(id, exclude)) return id;
      }
    }
    return null;
  }

  function effectiveMeal(mealId, settings, dayIndex) {
    var m = DATA.meals[mealId];
    if (!m) return null;
    var applyShortcut = settings.shortcut && m.type === 'dinner';
    var items = m.items.map(function (item) {
      if (applyShortcut && item.dish === 'teriyaki_chicken') {
        return { dish: 'rotisserie_chicken', swappedFrom: 'teriyaki_chicken' };
      }
      return { dish: item.dish };
    });
    return { id: mealId, type: m.type, name: m.name, items: items, shortcut: applyShortcut && m.items.some(function (i) { return i.dish === 'teriyaki_chicken'; }) };
  }

  /* ---------------- 最终配方过敏原（安全判断的唯一依据） ---------------- */

  /* 以 resolveParts 后的实际食材为准：手动改克数、减盐替换、0 g 移除都计入；
     同时合并 ing.allergens（含）与 ing.mayContain（可能含）。 */
  function finalDishAllergens(dishId, settings, edits) {
    var d = dish(dishId);
    if (!d) return [];
    var parts = resolveParts(dishId, settings, edits);
    if (!parts.length) return [];
    return sourcesToAllergens(allergenSources(parts, d.mayContain));
  }

  /* 先套用 effectiveMeal（例如省事模式照烧鸡→现成烤鸡），再取最终过敏原。 */
  function finalMealAllergens(mealId, settings, edits) {
    var effective = effectiveMeal(mealId, settings);
    if (!effective) return [];
    var list = [];
    effective.items.forEach(function (item) {
      list = list.concat(finalDishAllergens(item.dish, settings, edits));
    });
    return sortAllergens(list);
  }

  /* 最终食材 id 集合：用于推荐替代时计算“能复用哪些食材”。 */
  function finalMealIngredientIds(mealId, settings, edits) {
    var effective = effectiveMeal(mealId, settings);
    if (!effective) return [];
    var list = [];
    effective.items.forEach(function (item) {
      resolveParts(item.dish, settings, edits).forEach(function (part) {
        if (list.indexOf(part.ingredient) < 0) list.push(part.ingredient);
      });
    });
    return list;
  }

  function mealFits(mealId, settings, edits) {
    if (!meal(mealId)) return false;
    var exclude = (settings && settings.exclude) || [];
    if (!exclude.length) return true;
    if (finalMealIngredientIds(mealId, settings, edits).some(function(id) { return DATA.ingredients[id].labelUnknown; })) return false;
    return !finalMealAllergens(mealId, settings, edits).some(function (allergen) {
      return exclude.indexOf(allergen) >= 0;
    });
  }

  function conflictAllergens(mealId, settings, edits) {
    var exclude = (settings && settings.exclude) || [];
    return finalMealAllergens(mealId, settings, edits).filter(function (allergen) {
      return exclude.indexOf(allergen) >= 0;
    });
  }

  /* 推荐替代：同 type 且 mealFits 为真的其他餐。
     排序：能复用“前面已确认餐 + 当天另一餐”最终食材的数量（多者优先），
     其次按偏好顺序（早餐风格/晚餐轮换列表），并尽量避开上一天已确认的同 type 餐。
     推荐只用于提示，不会自动写进菜单。
     candidateType 用于午餐：午餐对象 type 是 'lunch'，但候选来自晚餐菜库（'dinner'）。 */
  function recommendMeal(type, conflictMealId, settings, edits, preferenceOrder, avoidId, referenceIngredients, candidateType) {
    var poolType = candidateType || type;
    var reference = {};
    (referenceIngredients || []).forEach(function (id) { reference[id] = true; });
    var order = preferenceOrder || [];
    var ranked = Object.keys(DATA.meals).filter(function (id) {
      return DATA.meals[id].type === poolType && id !== conflictMealId && mealFits(id, settings, edits);
    }).map(function (id) {
      var shared = finalMealIngredientIds(id, settings, edits).filter(function (ingredientId) {
        return reference[ingredientId];
      });
      var pref = order.indexOf(id);
      return { id: id, shared: shared, pref: pref < 0 ? 999 : pref };
    });
    if (!ranked.length) return null;
    ranked.sort(function (a, b) {
      if (a.shared.length !== b.shared.length) return b.shared.length - a.shared.length;
      if (a.pref !== b.pref) return a.pref - b.pref;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var pool = avoidId ? ranked.filter(function (candidate) { return candidate.id !== avoidId; }) : ranked;
    if (!pool.length) pool = ranked; // 没有其他合规候选时，才允许与上一天重复
    var pick = pool[0];
    var sharedIngredients = pick.shared.map(function (ingredientId) {
      var ing = DATA.ingredients[ingredientId];
      return ing ? ing.name : ingredientId;
    });
    var poolLabel = type === 'lunch' ? '晚餐菜库轮换' : (poolType === 'breakfast' ? '早餐风格' : '晚餐轮换');
    return {
      id: pick.id,
      name: DATA.meals[pick.id].name,
      reason: sharedIngredients.length
        ? '复用已确认餐食材：' + sharedIngredients.join('、')
        : '不含已排除过敏原，按' + poolLabel + '顺序推荐',
      sharedIngredients: sharedIngredients
    };
  }

  /* 冲突餐不做任何自动替换，只生成一个“待选”占位，由用户确认。 */
  function pendingMeal(type, conflictIds, recommendation) {
    var labels = conflictIds.map(allergenLabel);
    return {
      pending: true,
      type: type,
      name: '待选',
      id: null,
      reason: '含' + labels.join('、'),
      conflictAllergens: labels,
      recommendation: recommendation,
      items: [],
      dishes: [],
      allergens: []
    };
  }

  /* 带饭午餐：直接复制当天已确认的晚餐（同一配方、多做一份），
     不再做第二次过敏检查；采购/容器/时间线会按“多做一份”再算一遍。 */
  function copyPackedLunch(dinner) {
    return {
      id: dinner.id,
      type: 'lunch',
      name: '午餐（带饭）：' + dinner.name,
      pending: false,
      packed: true,
      sourceMealId: dinner.id,
      items: dinner.items,
      dishes: dinner.dishes,
      allergens: dinner.allergens,
      shortcut: dinner.shortcut
    };
  }

  function buildPlan(settings, edits) {
    var stylePlan = DATA.plans[settings.style] || DATA.plans.classic;
    var rotation = DATA.rotations[settings.rotation] || DATA.rotations.balanced;
    var breakfastSeq = stylePlan.breakfast;
    var dinnerSeq = rotation.meals;
    var lunchSeq = rotation.meals; // 午餐复用晚餐菜库的轮换顺序
    var breakfastOverrides = settings.breakfastOverrides || {};
    var dinnerOverrides = settings.dinnerOverrides || {};
    var lunchOverrides = settings.lunchOverrides || {};
    var slots = mealSlotIds(settings);
    var hasBreakfast = slots.indexOf('breakfast') >= 0;
    var hasLunch = slots.indexOf('lunch') >= 0;
    var hasDinner = slots.indexOf('dinner') >= 0;
    var requestedLunchMode = settings.lunchMode === 'cook' ? 'cook' : 'packed';
    // 晚餐关闭时带饭没有来源，自动按现做处理（下面加 warning/备注）。
    var lunchFallbackToCook = hasLunch && requestedLunchMode === 'packed' && !hasDinner;
    var lunchMode = lunchFallbackToCook ? 'cook' : requestedLunchMode;
    var warnings = [];
    var days = [];
    var confirmedIngredients = []; // 前面已确认餐的最终食材 id
    var lastBreakfast = null; // 上一天已确认的早餐（避开推荐重复）
    var lastDinner = null;
    var lastLunch = null;
    var pendingCount = 0;
    var confirmedMeals = 0;

    for (var i = 0; i < settings.days; i++) {
      var breakfastId = breakfastSeq[i % breakfastSeq.length];
      var dinnerId = dinnerSeq[i % dinnerSeq.length];
      var lunchId = null;

      if (breakfastOverrides[i] && DATA.meals[breakfastOverrides[i]]) {
        breakfastId = breakfastOverrides[i];
      }
      if (dinnerOverrides[i] && DATA.meals[dinnerOverrides[i]]) {
        dinnerId = dinnerOverrides[i];
      }
      // 现做午餐：当天的 lunchOverrides 优先，否则按晚餐菜库轮换；dinnerOverrides 不影响午餐。
      if (hasLunch && lunchMode === 'cook') {
        lunchId = lunchSeq[i % lunchSeq.length];
        if (lunchOverrides[i] && DATA.meals[lunchOverrides[i]] && DATA.meals[lunchOverrides[i]].type === 'dinner') {
          lunchId = lunchOverrides[i];
        }
      }

      // 当天其它餐的最终食材也参与推荐评分；不拿它当已确认餐。
      var breakfastIngredients = hasBreakfast ? finalMealIngredientIds(breakfastId, settings, edits) : [];
      var dinnerIngredients = hasDinner ? finalMealIngredientIds(dinnerId, settings, edits) : [];
      var lunchIngredients = hasLunch && lunchMode === 'cook' ? finalMealIngredientIds(lunchId, settings, edits) : [];

      var breakfast = null;
      if (hasBreakfast) {
        if (mealFits(breakfastId, settings, edits)) {
          breakfast = decorateMeal(effectiveMeal(breakfastId, settings, i), i, settings, edits);
          confirmedMeals += 1;
          lastBreakfast = breakfastId;
          confirmedIngredients = confirmedIngredients.concat(breakfastIngredients);
        } else {
          pendingCount += 1;
          breakfast = pendingMeal('breakfast', conflictAllergens(breakfastId, settings, edits), recommendMeal(
            'breakfast', breakfastId, settings, edits, breakfastSeq, lastBreakfast,
            uniq(confirmedIngredients.concat(dinnerIngredients, lunchIngredients))
          ));
          warnings.push({ day: i, meal: 'breakfast', from: breakfastId, to: null, pending: true });
        }
      }

      var dinner = null;
      if (hasDinner) {
        if (mealFits(dinnerId, settings, edits)) {
          dinner = decorateMeal(effectiveMeal(dinnerId, settings, i), i, settings, edits);
          confirmedMeals += 1;
          lastDinner = dinnerId;
          confirmedIngredients = confirmedIngredients.concat(dinnerIngredients);
        } else {
          pendingCount += 1;
          dinner = pendingMeal('dinner', conflictAllergens(dinnerId, settings, edits), recommendMeal(
            'dinner', dinnerId, settings, edits, dinnerSeq, lastDinner,
            uniq(confirmedIngredients.concat(breakfastIngredients, lunchIngredients))
          ));
          warnings.push({ day: i, meal: 'dinner', from: dinnerId, to: null, pending: true });
        }
      }

      var lunch = null;
      if (hasLunch && lunchMode === 'packed') {
        if (dinner && !dinner.pending) {
          lunch = copyPackedLunch(dinner);
          confirmedMeals += 1;
          lastLunch = dinner.id;
        } else {
          // 晚餐待选时，带饭午餐没有可复制的配方，只能一起待选。
          pendingCount += 1;
          lunch = pendingMeal('lunch', [], null);
          lunch.reason = '晚餐待选，带饭午餐无法确定';
          lunch.packed = true;
          lunch.sourceMealId = null;
          warnings.push({ day: i, meal: 'lunch', from: null, to: null, pending: true, reason: lunch.reason });
        }
      } else if (hasLunch) {
        // 现做午餐：从晚餐菜库独立选一道，套用 effectiveMeal（如省事模式烤鸡替换）再做最终过敏检查。
        if (mealFits(lunchId, settings, edits)) {
          lunch = decorateMeal(effectiveMeal(lunchId, settings, i), i, settings, edits);
          lunch.type = 'lunch';
          lunch.name = '午餐：' + lunch.name;
          lunch.packed = false;
          lunch.sourceMealId = lunchId;
          if (lunchFallbackToCook) lunch.reason = '晚餐未选，午餐按现做处理';
          confirmedMeals += 1;
          lastLunch = lunchId;
          confirmedIngredients = confirmedIngredients.concat(finalMealIngredientIds(lunchId, settings, edits));
          if (lunchFallbackToCook) {
            warnings.push({ day: i, meal: 'lunch', from: null, to: null, pending: false, reason: lunch.reason });
          }
        } else {
          pendingCount += 1;
          lunch = pendingMeal('lunch', conflictAllergens(lunchId, settings, edits), recommendMeal(
            'lunch', lunchId, settings, edits, lunchSeq, lastLunch,
            uniq(confirmedIngredients.concat(breakfastIngredients, dinnerIngredients)), 'dinner'
          ));
          lunch.packed = false;
          lunch.sourceMealId = lunchId;
          if (lunchFallbackToCook) lunch.reason = '晚餐未选，午餐按现做处理';
          warnings.push({ day: i, meal: 'lunch', from: lunchId, to: null, pending: true, reason: lunch.reason });
          if (lunchFallbackToCook) {
            warnings.push({ day: i, meal: 'lunch', from: null, to: null, pending: false, reason: '晚餐未选，午餐按现做处理' });
          }
        }
      }

      days.push({ index: i, breakfast: breakfast, lunch: lunch, dinner: dinner });
    }

    return {
      days: days,
      warnings: warnings,
      settings: settings,
      mealsEnabled: slots,
      // 实际生效的午餐模式：晚餐关闭时 packed 会自动降级为 cook，界面以此为准。
      lunchMode: lunchMode,
      pendingCount: pendingCount,
      confirmedMeals: confirmedMeals,
      totalMeals: settings.days * slots.length
    };
  }

  function decorateMeal(effective, dayIndex, settings, edits) {
    if (!effective) return null;
    var dishes = effective.items.map(function (item) {
      var d = DATA.dishes[item.dish];
      var storage = storageFor(d, dayIndex, settings, item.dish);
      return {
        id: item.dish,
        name: d ? d.name : item.dish,
        swappedFrom: item.swappedFrom || null,
        storage: storage,
        reheat: d ? d.reheat : 'none',
        allergens: finalDishAllergens(item.dish, settings, edits),
        tags: d ? (d.tags || []) : []
      };
    });
    return {
      id: effective.id,
      name: effective.name,
      pending: false,
      items: effective.items,
      dishes: dishes,
      allergens: sortAllergens(dishes.reduce(function (acc, d) { return acc.concat(d.allergens); }, [])),
      shortcut: effective.shortcut
    };
  }

  function storageFor(d, dayIndex, settings, dishId) {
    if (!d) return DATA.storage.fridge;
    if (d.kind === 'commercialFrozen') return {key:'freeze',label:'原袋冷冻',tag:'tag-freeze',icon:'i-snow',short:'原袋冷冻',note:'保持原包装冷冻，按标签取当餐份量蒸制。'};
    if (dishId === 'rice_bowl' && settings.riceType === 'instant') {
      return {
        key: 'fresh', label: '叮叮饭', tag: 'tag-fresh', icon: 'i-clock',
        note: '按包装微波或热水加热；不参与周末煮饭和冷冻。'
      };
    }
    if (d.storage === 'fresh') return DATA.storage.fresh;
    if (d.storage === 'prep') return DATA.storage.prep;
    if (d.kind === 'onigiri') return DATA.storage.freeze;
    if (d.storage === 'freeze') return DATA.storage.freeze;
    // 一般熟食：前 1–2 天冷藏，后面几天在制作当天冷冻
    return dayIndex < 2 ? DATA.storage.fridge : DATA.storage.freeze;
  }

  /* ---------------- 营养 ---------------- */

  function emptyNutrients() {
    var out = {};
    NUTRIENTS.forEach(function (key) { out[key] = 0; });
    return out;
  }

  function nutrientsForParts(parts, factor) {
    var out = emptyNutrients();
    parts.forEach(function (part) {
      var ing = DATA.ingredients[part.ingredient];
      if (!ing || !ing.per100) return;
      var grams = part.grams * factor;
      NUTRIENTS.forEach(function (key) {
        var value = num(ing.per100[key], 0);
        out[key] += value * grams / 100;
      });
    });
    return out;
  }

  function tidyNutrients(raw) {
    var out = {};
    NUTRIENTS.forEach(function (key) {
      out[key] = round(raw[key], key === 'kcal' || key === 'sodium' ? 0 : 1);
    });
    return out;
  }

  function addNutrients(a, b) {
    var out = {};
    NUTRIENTS.forEach(function (key) { out[key] = (a[key] || 0) + (b[key] || 0); });
    return out;
  }

  function dishNutrition(dishId, settings, edits) {
    var parts = resolveParts(dishId, settings, edits);
    var adult = nutrientsForParts(parts, 1);
    var kid = settings.kidAge === 'none' ? null : nutrientsForParts(parts, kidFactor(settings));
    var family = nutrientsForParts(parts, familyFactor(settings));
    return {
      dishId: dishId,
      parts: parts,
      adult: tidyNutrients(adult),
      kid: kid ? tidyNutrients(kid) : null,
      family: tidyNutrients(family),
      allergens: finalDishAllergens(dishId, settings, edits),
      edited: hasEdits(dishId, edits) || parts.some(function (p) { return p.edited; })
    };
  }

  /* 待选餐没有确认配方：营养与过敏原都返回空值，不按 0 g 菜谱补算。 */
  function pendingMealNutrition(settings) {
    return {
      id: null,
      pending: true,
      items: [],
      dishes: [],
      adult: tidyNutrients(emptyNutrients()),
      kid: settings.kidAge === 'none' ? null : tidyNutrients(emptyNutrients()),
      family: tidyNutrients(emptyNutrients()),
      allergens: []
    };
  }

  function mealNutrition(mealId, settings, edits, effective) {
    if (effective && effective.pending === true) return pendingMealNutrition(settings);
    var items = effective && effective.items ? effective.items : (meal(mealId) ? meal(mealId).items : []);
    var total = { adult: emptyNutrients(), kid: settings.kidAge === 'none' ? null : emptyNutrients(), family: emptyNutrients() };
    var dishes = [];
    items.forEach(function (item) {
      var dn = dishNutrition(item.dish, settings, edits);
      dn.swappedFrom = item.swappedFrom || null;
      dishes.push(dn);
      total.adult = addNutrients(total.adult, dn.adult);
      total.family = addNutrients(total.family, dn.family);
      if (total.kid && dn.kid) total.kid = addNutrients(total.kid, dn.kid);
    });
    return {
      id: mealId,
      pending: false,
      items: items,
      dishes: dishes,
      adult: tidyNutrients(total.adult),
      kid: total.kid ? tidyNutrients(total.kid) : null,
      family: tidyNutrients(total.family),
      allergens: sortAllergens(dishes.reduce(function (acc, d) { return acc.concat(d.allergens); }, []))
    };
  }

  /* 计划里实际开启的餐次：优先用 buildPlan 产出的 mealsEnabled（数组），
     旧计划/旧设置退回 settings.meals，至少保留一餐。 */
  function planMealSlots(plan, settings) {
    if (plan && Array.isArray(plan.mealsEnabled) && plan.mealsEnabled.length) {
      var fromPlan = plan.mealsEnabled.filter(function (slot) { return MEAL_SLOTS.indexOf(slot) >= 0; });
      if (fromPlan.length) return fromPlan;
    }
    var derived = mealSlotIds(settings || (plan && plan.settings));
    return derived.length ? derived : ['breakfast'];
  }

  function planNutrition(plan, settings, edits) {
    settings = settings || (plan && plan.settings) || {};
    var slots = planMealSlots(plan, settings);
    var hasKid = settings.kidAge !== 'none';
    var days = plan.days.map(function (day) {
      var out = {
        index: day.index,
        enabledMeals: slots.slice(),
        breakfast: null,
        lunch: null,
        dinner: null,
        breakfastPending: false,
        lunchPending: false,
        dinnerPending: false
      };
      var adult = emptyNutrients();
      var kid = hasKid ? emptyNutrients() : null;
      var family = emptyNutrients();
      var confirmedMeals = 0;
      // 动态遍历实际开启的餐次：disabled 的为 null 跳过，pending 计 0。
      slots.forEach(function (slot) {
        var m = day[slot];
        if (!m) return;
        var nutrition = mealNutrition(m.id, settings, edits, m);
        out[slot] = nutrition;
        out[slot + 'Pending'] = !!m.pending;
        if (m.pending) return;
        confirmedMeals += 1;
        adult = addNutrients(adult, nutrition.adult);
        family = addNutrients(family, nutrition.family);
        if (kid && nutrition.kid) kid = addNutrients(kid, nutrition.kid);
      });
      out.confirmedMeals = confirmedMeals;
      out.complete = confirmedMeals === slots.length;
      out.adult = tidyNutrients(adult);
      out.kid = kid ? tidyNutrients(kid) : null;
      out.family = tidyNutrients(family);
      return out;
    });
    var totalAdult = emptyNutrients();
    var totalKid = hasKid ? emptyNutrients() : null;
    var totalFamily = emptyNutrients();
    var totalConfirmed = 0;
    days.forEach(function (day) {
      totalAdult = addNutrients(totalAdult, day.adult);
      totalFamily = addNutrients(totalFamily, day.family);
      totalConfirmed += day.confirmedMeals;
      if (totalKid && day.kid) totalKid = addNutrients(totalKid, day.kid);
    });
    return {
      days: days,
      total: {
        adult: tidyNutrients(totalAdult),
        kid: totalKid ? tidyNutrients(totalKid) : null,
        family: tidyNutrients(totalFamily),
        enabledMeals: slots.slice(),
        confirmedMeals: totalConfirmed,
        totalMeals: typeof plan.totalMeals === 'number' ? plan.totalMeals : days.length * slots.length
      }
    };
  }

  function referenceFor(settings) {
    var adult = DATA.reference.adult;
    var kid = settings.kidAge === 'none' ? null : DATA.reference[settings.kidAge];
    return { adult: adult, kid: kid };
  }

  /* ---------------- 采购 ---------------- */

  function purchaseInfo(ingredient, edibleGrams, settings) {
    var p = ingredient.purchase || { mode: 'weight', packKg: 1, packLabel: '1 kg 装' };
    var ratio = num(ingredient.edibleRatio, 1) || 1;
    var rawFactor = num(ingredient.rawPerCooked, 1);
    var boughtGrams = edibleGrams * rawFactor / ratio;
    var result = {
      neededGrams: round(boughtGrams, 0),
      edibleGrams: round(edibleGrams, 0),
      mode: p.mode,
      packLabel: p.packLabel || '',
      packs: 1,
      leftoverLabel: '',
      buyLabel: '',
      note: ingredient.purchaseNote || ''
    };
    if (p.mode === 'packageWeight') {
      result.kg = boughtGrams / 1000;
      result.buyLabel = Math.ceil(boughtGrams) + ' g';
      result.suggestion = '按实物每袋净重买足';
      result.packs = null;
      return result;
    }
    if (p.cupGrams) result.cups = round(boughtGrams / p.cupGrams, 1);
    if (p.mode === 'count') {
      var unitGrams = num(p.unitGrams, 100);
      var packCount = Math.max(1, num(p.packCount, 1));
      var count = boughtGrams / unitGrams;
      var packs = Math.ceil(count / packCount - 0.0001);
      result.count = round(count, 1);
      result.packs = Math.max(1, packs);
      result.buyLabel = round(count, 1) + ' ' + (p.unit || '个');
      var leftover = result.packs * packCount - count;
      if (packCount === 1) {
        result.packs = Math.max(1, Math.ceil(count - 0.0001));
        result.suggestion = result.packs + ' ' + (p.unit || '个');
        result.leftoverLabel = '';
      } else {
        result.suggestion = result.packs + ' × ' + (p.packLabel || (packCount + ' 个装'));
        result.leftoverLabel = leftover > 0.05 ? '余约 ' + round(leftover, 1) + ' ' + (p.unit || '个') : '';
      }
    } else {
      var packKg = Math.max(0.01, num(p.packKg, 1));
      var kg = boughtGrams / (p.gramPerUnit || 1000);
      var packCountW = Math.ceil(kg / packKg - 0.0001);
      result.packs = Math.max(1, packCountW);
      result.kg = round(kg, 2);
      var liquid = p.unitLabel === 'L';
      var quantityLabel = function (value) {
        if (liquid) return value < 0.1 ? round(value * 1000, 0) + ' mL' : round(value, 2) + ' L';
        return value < 1 ? round(value * 1000, 0) + ' g' : round(value, 2) + ' kg';
      };
      result.buyLabel = quantityLabel(kg);
      result.suggestion = result.packs + ' × ' + (p.packLabel || (packKg + ' kg 装'));
      var leftoverKg = result.packs * packKg - kg;
      result.leftoverLabel = leftoverKg > 0.01 ? '余约 ' + quantityLabel(leftoverKg) : '';
    }
    return result;
  }

  function buildShopping(plan, settings, edits) {
    var need = {};
    var factor = familyFactor(settings);
    plan.days.forEach(function (day) {
      // 实际存在的餐次都计入：带饭午餐是晚餐多做的第二份，采购量自然翻倍。
      builtMealSlots(day).forEach(function (slot) {
        var m = day[slot];
        m.dishes.forEach(function (item) {
          var parts = resolveParts(item.id, settings, edits);
          parts.forEach(function (part) {
            if (!need[part.ingredient]) need[part.ingredient] = 0;
            need[part.ingredient] += part.grams * factor;
          });
        });
      });
    });

    var rows = Object.keys(need).map(function (ingredientId) {
      var ing = DATA.ingredients[ingredientId];
      if (!ing) return null;
      var info = purchaseInfo(ing, need[ingredientId], settings);
      return {
        id: ingredientId,
        name: ing.name,
        group: ing.group,
        groupOrder: DATA.groups.indexOf(ing.group) >= 0 ? DATA.groups.indexOf(ing.group) : 99,
        grams: round(need[ingredientId], 0),
        info: info,
        allergens: ing.allergens || [],
        state: ing.purchaseState || ing.state || '',
        purchaseState: ing.purchaseState || '',
        pantry: !!ing.pantry,
        note: ing.purchaseNote || ''
      };
    }).filter(Boolean);

    rows.sort(function (a, b) {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });

    var groups = [];
    rows.forEach(function (row) {
      var g = groups.filter(function (x) { return x.name === row.group; })[0];
      if (!g) { g = { name: row.group, items: [] }; groups.push(g); }
      g.items.push(row);
    });

    return { rows: rows, groups: groups, totalItems: rows.length };
  }

  function shoppingKey(row) {
    return row.id + ':' + (row.info.mode === 'count' ? row.info.buyLabel : row.info.kg);
  }

  /* ---------------- 容器与工具 ---------------- */

  function buildContainerPlan(plan, settings) {
    var factor = familyFactor(settings);
    var counts = {
      box1L: { fridge: 0, freeze: 0 },
      box500: { fridge: 0, freeze: 0 },
      wrap: { freeze: 0 },
      bag: { freeze: 0 },
      jar: { fridge: 0 },
      cube: { freeze: 0 }
    };

    plan.days.forEach(function (day) {
      builtMealSlots(day).forEach(function (slot) {
        var m = day[slot];
        m.dishes.forEach(function (item) {
          var dish = DATA.dishes[item.id];
          if (!dish || !dish.container || !item.storage) return;
          if (item.storage.key === 'fresh') return;
          var category = item.storage.key === 'freeze' ? 'freeze' : 'fridge';
          if (dish.container === 'wrap') {
            counts.wrap.freeze += settings.onigiri.pieces * factor;
          } else if (!(item.id === 'rice_bowl' && settings.riceType === 'instant') &&
            counts[dish.container] && counts[dish.container][category] != null) {
            var container = DATA.containers[dish.container];
            var capacity = container && container.capacityServings ? container.capacityServings : 1;
            counts[dish.container][category] += Math.max(1, Math.ceil(factor / capacity - 0.0001));
          }
          if (dish.brothMl) {
            counts.cube.freeze += Math.ceil(dish.brothMl * factor / 30);
          }
        });
      });
    });

    if (settings.containerPref === 'bag') {
      counts.bag.freeze += counts.box1L.freeze + counts.box500.freeze;
      counts.box1L.freeze = 0;
      counts.box500.freeze = 0;
    }
    counts.wrap.freeze = Math.ceil(counts.wrap.freeze - 0.0001);

    var rows = ['box1L', 'box500', 'bag', 'wrap', 'jar', 'cube'].map(function (id) {
      var total = (counts[id].fridge || 0) + (counts[id].freeze || 0);
      if (!total) return null;
      var container = DATA.containers[id];
      var note = container ? container.note : '';
      if (id === 'cube') {
        note += ' 约 ' + Math.ceil(total / 12) + ' 个 12 格冰格。';
      }
      return {
        id: id,
        name: container ? container.name : id,
        count: total,
        fridge: counts[id].fridge || 0,
        freeze: counts[id].freeze || 0,
        note: note
      };
    }).filter(Boolean);

    return {
      rows: rows,
      total: rows.reduce(function (sum, row) { return sum + row.count; }, 0),
      pref: settings.containerPref,
      note: '按每道菜单独装估算；同一餐的米饭和主菜可以合并到一个 1 L 盒，实际数量会少一些。'
    };
  }

  function equipmentForDish(dishId, settings) {
    if (dishId === 'rice_bowl' && settings.riceType === 'instant') return [];
    var dish = DATA.dishes[dishId];
    return dish ? (dish.equipment || []) : [];
  }

  function buildEquipmentUsage(plan, settings) {
    var counts = {};
    (DATA.equipment || []).forEach(function (tool) { counts[tool.id] = 0; });
    var reheats = { microwave: 0, steam: 0, none: 0 };

    plan.days.forEach(function (day) {
      builtMealSlots(day).forEach(function (slot) {
        var m = day[slot];
        m.dishes.forEach(function (item) {
          var dish = DATA.dishes[item.id];
          if (!dish) return;
          var packedLunch = slot === 'lunch' && day.lunch && day.lunch.packed;
          if (!packedLunch) equipmentForDish(item.id, settings).forEach(function (toolId) {
            if (counts[toolId] != null) counts[toolId] += 1;
          });
          if (reheats[dish.reheat] != null) reheats[dish.reheat] += 1;
        });
      });
    });

    var tools = (DATA.equipment || []).map(function (tool) {
      return {
        id: tool.id,
        name: tool.name,
        role: tool.role,
        note: tool.note,
        available: settings.tools[tool.id] !== false,
        used: counts[tool.id] || 0
      };
    });
    tools.forEach(function (tool) {
      if (reheats[tool.id]) tool.used += reheats[tool.id];
    });
    var missing = tools.filter(function (tool) { return !tool.available && tool.used > 0; });
    return { tools: tools, reheats: reheats, missing: missing };
  }

  /* ---------------- 时间线 ---------------- */

  function buildTimeline(plan, settings, edits) {
    var factor = familyFactor(settings);
    var riceOnigiri = 0;
    var riceBowl = 0;
    var chicken = 0;
    var onigiriChicken = 0;
    var chickenStirfry = 0;
    var chickenOther = 0;
    var rotisserie = 0;
    var beef = 0;
    var salmonDinner = 0;
    var salmonOnigiri = 0;
    var shrimp = 0;
    var tofuDinner = 0;
    var tofuOnigiri = 0;
    var blanchVeg = 0;
    var stirVeg = 0;
    var onigiriCount = 0;
    var instantRice = 0;
    var riceAddInGrams = 0;
    var stewGrams = 0;
    var stewNames = {};
    var marinadeNames = {};
    var packedLunchDays = 0;
    var cookLunchDays = 0;

    plan.days.forEach(function (day) {
      if (day.lunch && !day.lunch.pending) {
        if (day.lunch.packed) packedLunchDays += 1;
        else cookLunchDays += 1;
      }
      // 实际存在的餐次都计入用量；带饭午餐复用晚餐，数量按多做一份累计，
      // 但烹饪块仍然只按汇总数量生成一次，不会出现第二套锅次。
      builtMealSlots(day).forEach(function (slot) {
        var m = day[slot];
        m.dishes.forEach(function (item) {
          var d = DATA.dishes[item.id];
          if (!d) return;
          if (d.kind === 'onigiri') onigiriCount += settings.onigiri.pieces * factor;
          if (d.marinade && DATA.marinades[d.marinade]) marinadeNames[d.marinade] = true;
          resolveParts(item.id, settings, edits).forEach(function (part) {
            var grams = part.grams * factor;
            if (item.id === 'rice_bowl' && part.role === 'veg') {
              riceAddInGrams += grams;
              return;
            }
            if (d.kind === 'stew' && part.role === 'protein') {
              stewGrams += grams;
              stewNames[d.name] = true;
            }
            switch (part.ingredient) {
              case 'rice_cooked':
                if (d.kind === 'onigiri') riceOnigiri += grams; else riceBowl += grams;
                break;
              case 'mixed_rice': riceBowl += grams; break;
              case 'instant_rice': instantRice += grams; break;
              case 'chicken_thigh':
                if (item.id === 'teriyaki_chicken') chicken += grams;
                else if (item.id === 'onigiri_chicken') onigiriChicken += grams;
                else if (item.id === 'pepper_chicken') chickenStirfry += grams;
                else if (d.kind === 'stew') { /* 由炖菜块统一处理 */ }
                else chickenOther += grams;
                break;
              case 'rotisserie_chicken': rotisserie += grams; break;
              case 'beef_lean': beef += grams; break;
              case 'salmon':
                if (item.id === 'miso_salmon') salmonDinner += grams; else salmonOnigiri += grams;
                break;
              case 'shrimp': shrimp += grams; break;
              case 'tofu_firm':
                if (d.kind === 'onigiri') tofuOnigiri += grams; else tofuDinner += grams;
                break;
              case 'broccoli':
              case 'carrot': blanchVeg += grams; break;
              case 'tomato':
              case 'onion':
              case 'mushroom':
              case 'pepper_red':
              case 'garlic':
              case 'spinach':
              case 'pak_choi':
              case 'nai_bai':
              case 'you_dong_cai': stirVeg += grams; break;
              default: break;
            }
          });
        });
      });
    });
    onigiriCount = Math.ceil(onigiriCount - 0.0001);

    var riceCooked = riceOnigiri + riceBowl;
    var riceRawKg = round(riceCooked * 0.43 / 1000, 2);
    var addInText = riceAddInGrams > 0 ? '；同煮加料约 ' + round(riceAddInGrams / 1000, 2) + ' kg（大块）' : '';
    var toCups = function (rawGrams) { return round(rawGrams / (DATA.riceCupGrams || 150), 1); };
    var twoBatches = riceOnigiri > 0 && riceBowl > 0;
    var blocks = [];
    function add(lane, time, title, detail, critical) {
      blocks.push({ lane: lane, time: time, title: title, detail: detail, critical: !!critical });
    }
    var riceLane = settings.tools.riceCooker ? '电饭煲' : '炉灶';
    var riceHint = settings.tools.riceCooker ? '' : '（无电饭煲：厚底锅小火煮开后焖 10 分钟）';

    add('备菜', '0:00', '洗切与称量',
      '蔬菜合计 ' + round((blanchVeg + stirVeg) / 1000, 2) + ' kg；肉类和豆制品分装并擦干，准备腌料、汤块冰格和保鲜盒。');
    if (instantRice > 0) {
      add('备菜', '0:03', '叮叮饭',
        '微波米饭 ' + round(instantRice / 1000, 2) + ' kg，按包装微波/热水加热；不参与周末煮饭和冷冻。');
    }
    var marinadeKeys = Object.keys(marinadeNames);
    if (marinadeKeys.length) {
      add('备菜', '0:05', '腌制',
        marinadeKeys.map(function (key) {
          var m = DATA.marinades[key];
          return m.name + '（' + m.time + '）';
        }).join('、') + '。全部冷藏腌制；腌汁不要重复使用，至少 10–30 分钟，可前一晚准备。');
    }

    if (riceOnigiri > 0) {
      add(riceLane, '0:00', '第一锅米饭（饭团用）',
        '生米 ' + round(riceOnigiri * 0.43 / 1000, 2) + ' kg（约 ' + toCups(riceOnigiri * 0.43) + ' 杯，熟饭 ' + round(riceOnigiri / 1000, 2) + ' kg）' + riceHint + '。煮好立即开盖摊开散热。');
    }
    if (riceBowl > 0) {
      add(riceLane, twoBatches ? '0:45' : '0:00', twoBatches ? '第二锅米饭（晚餐用）' : '米饭（晚餐分装用）',
        '生米 ' + round(riceBowl * 0.43 / 1000, 2) + ' kg（约 ' + toCups(riceBowl * 0.43) + ' 杯，熟饭 ' + round(riceBowl / 1000, 2) + ' kg）' + addInText + riceHint + '。按当餐份量分盒，避免整锅放凉。');
    }
    if (stewGrams > 0) {
      var stewLabel = Object.keys(stewNames).join('、');
      if (settings.tools.pressureCooker) {
        add('炉灶', '0:05', '高压锅炖菜',
          stewLabel + '（约 ' + round(stewGrams / 1000, 2) + ' kg 肉）焯水后加根茎和热水，高压锅 30–40 分钟；肉和汤分开，汤过滤后冻成汤块。');
      } else {
        add('炉灶', '0:05', '炉灶炖菜',
          stewLabel + '（约 ' + round(stewGrams / 1000, 2) + ' kg 肉）普通锅炖 60–90 分钟，注意补热水；汤过滤后冻成汤块。');
      }
    }

    if (salmonDinner > 0) {
      if (settings.tools.oven) {
        add('烤箱', '0:10', '预热 200°C', '烤箱与电饭煲并行；同时把蔬菜洗净切好。');
        add('烤箱', '0:25', '烤三文鱼', '三文鱼 ' + round(salmonDinner / 1000, 2) + ' kg，平铺另盘，中心 63°C；复热时再要求 74°C。');
      } else {
        add('炉灶', '0:20', '煎三文鱼（无烤箱）', '三文鱼 ' + round(salmonDinner / 1000, 2) + ' kg，平底锅煎到中心 63°C，复热时再要求 74°C。');
      }
    }
    if (salmonOnigiri > 0) {
      add('炉灶', '0:15', '煎三文鱼拆碎', '三文鱼 ' + round(salmonOnigiri / 1000, 2) + ' kg，煎熟去皮去刺，叉碎后拌入饭团。');
    }
    if (blanchVeg > 0) {
      add('炉灶', '0:10', '焯蔬菜', '西兰花与胡萝卜合计 ' + round(blanchVeg / 1000, 2) + ' kg，沸水短焯后沥干，不盖盖闷放。');
    }
    if (onigiriChicken > 0) {
      add('炉灶', '0:15', '煮鸡腿撕丝', '鸡腿 ' + round(onigiriChicken / 1000, 2) + ' kg 冷水下锅煮熟（中心 74°C），撕丝后拌入饭团。');
    }
    if (chicken > 0) {
      add('炉灶', '0:25', '煎照烧鸡腿', '去骨鸡腿 ' + round(chicken / 1000, 2) + ' kg，平底锅煎到中心 74°C，再裹照烧汁。');
    }
    if (chickenStirfry > 0) {
      add('炉灶', '0:20', '彩椒鸡片：切片、腌制、快炒',
        '鸡腿 ' + round(chickenStirfry / 1000, 2) + ' kg 切薄片，用鸡片腌料抓匀冷藏 15 分钟；与彩椒快炒到鸡肉中心 74°C。');
    }
    if (chickenOther > 0) {
      add('炉灶', '0:20', '鸡肉其他做法', '鸡肉 ' + round(chickenOther / 1000, 2) + ' kg，按对应菜谱处理。');
    }
    if (tofuOnigiri > 0) {
      add('炉灶', '0:20', '炒干豆腐', '豆腐 ' + round(tofuOnigiri / 1000, 2) + ' kg 压碎炒到水分减少，拌入饭团。');
    }
    if (beef > 0) {
      add('炉灶', '0:40', '番茄牛肉', '牛肉末 ' + round(beef / 1000, 2) + ' kg；番茄与洋葱另计，煮到软烂。');
    }
    if (tofuDinner > 0) {
      add('炉灶', '0:50', '豆腐毛豆', '豆腐 ' + round(tofuDinner / 1000, 2) + ' kg；与毛豆、鸡蛋分锅或先炒蛋再下豆腐。');
    }
    if (stirVeg > 0) {
      add('炉灶', '0:55', '炒蔬菜', '叶菜、番茄、蘑菇、彩椒等合计 ' + round(stirVeg / 1000, 2) + ' kg，分锅快炒，不长时间焖。');
    }
    if (shrimp > 0) {
      add('炉灶', '1:05', '虾仁快炒', '虾仁 ' + round(shrimp / 1000, 2) + ' kg，最后 3–4 分钟大火快炒，避免过熟。');
    }

    if (riceOnigiri > 0) {
      add('冷却与分装', '0:50', '第一锅米饭冷却（饭团用）',
        '摊在浅盘或烤盘上，理想 1 小时内降到不烫手；随后做饭团并直接冷冻。', true);
      if (onigiriCount > 0) {
        add('冷却与分装', '1:20', '做饭团',
          '共约 ' + onigiriCount + ' 个。戴手套或用保鲜膜成型，手不直接接触熟饭；海苔食用前再包。', true);
      }
    }
    if (riceBowl > 0) {
      add('冷却与分装', twoBatches ? '1:35' : '0:50', twoBatches ? '第二锅米饭冷却（晚餐用）' : '米饭冷却',
        '第二锅出锅后立即摊开；1 小时内降温，按餐分盒后直接冷冻，冷藏不超过 24 小时。', true);
    }
    if (rotisserie > 0) {
      add('冷却与分装', '1:25', '拆烤鸡', '现成烤鸡 ' + round(rotisserie / 1000, 2) + ' kg（可食肉），去皮去骨后按份分装；复热到 74°C。');
    }
    var portionTime = twoBatches ? '2:05' : (riceOnigiri > 0 ? '1:35' : '1:20');
    add('冷却与分装', portionTime, '分装贴标', '浅盒分装、按餐贴日期与内容；汤水与固体分开，避免冷凝水。');
    var freezeTime = twoBatches ? '2:15' : '1:45';
    var freezeItems = [];
    if (riceCooked > 0) freezeItems.push('米饭');
    if (onigiriCount > 0) freezeItems.push('饭团');
    freezeItems.push('需要冷冻的晚餐');
    add('冷冻', freezeTime, '入冷冻', freezeItems.join('、') + '在制作当天直接冷冻（−18°C 以下），不要先放冷藏再冻。');
    var hasFridge = plan.days.some(function (day) {
      return builtMealSlots(day).some(function (slot) {
        var m = day[slot];
        return m.dishes.some(function (dish) { return dish.storage.key === 'fridge'; });
      });
    });
    if (hasFridge) {
      add('冷冻', twoBatches ? '2:25' : '1:55', '冷藏收尾', '非米饭类的前 1–2 天晚餐冷藏（4°C 以下），与生食分层放置；米饭与饭团仍然冷冻。');
    }
    // 午餐只加一块操作提示：带饭是“多做一份、装盒”，现做是“当天单独开火”，
    // 都不重复生成周末备餐的烹饪块。
    if (packedLunchDays > 0) {
      add('午餐', twoBatches ? '1:55' : '1:30', '装午餐便当',
        '带饭午餐 ' + packedLunchDays + ' 天：按当天晚餐同款多做一份，冷却后装便当盒（冷藏 ≤24 小时），食用前复热到 74°C。带饭不额外开火，采购与容器已按加量计入。', true);
    }
    if (cookLunchDays > 0) {
      add('午餐', '当天', '午餐现做',
        '午餐现做 ' + cookLunchDays + ' 天：午餐从晚餐菜库单独选菜、当天单独开火，不并进周末备餐锅次；采购、容器与工具已按独立一餐计入。');
    }

    plan.days.forEach(function(day) {
      if (!day.breakfast || day.breakfast.pending) return;
      day.breakfast.dishes.forEach(function(item) {
        if (DATA.dishes[item.id].kind !== 'commercialFrozen') return;
        add('工作日早餐', '第 ' + (day.index + 1) + ' 天', item.name + ' · 按包装蒸制',
          (settings.tools.steamer === false ? '缺蒸锅，换餐或按包装认可的其他方式烹调。' : '') +
          '从冷冻柜取当餐用量，核对生熟属性，按包装说明蒸制；汤包掰开散热。');
      });
    });
    var lanes = [];
    blocks.forEach(function (block) {
      var lane = lanes.filter(function (item) { return item.name === block.lane; })[0];
      if (!lane) { lane = { name: block.lane, blocks: [] }; lanes.push(lane); }
      lane.blocks.push(block);
    });

    return {
      lanes: lanes,
      marinades: marinadeKeys.map(function (key) { return DATA.marinades[key]; }),
      stats: {
        riceRawKg: riceRawKg,
        riceCups: round(riceRawKg * 1000 / (DATA.riceCupGrams || 150), 1),
        riceCookedKg: round(riceCooked / 1000, 2),
        onigiriCount: onigiriCount,
        chickenKg: round(chicken / 1000, 2),
        onigiriChickenKg: round(onigiriChicken / 1000, 2),
        chickenStirfryKg: round(chickenStirfry / 1000, 2),
        rotisserieKg: round(rotisserie / 1000, 2),
        beefKg: round(beef / 1000, 2),
        salmonKg: round((salmonDinner + salmonOnigiri) / 1000, 2),
        shrimpKg: round(shrimp / 1000, 2),
        tofuKg: round((tofuDinner + tofuOnigiri) / 1000, 2),
        vegKg: round((blanchVeg + stirVeg) / 1000, 2),
        instantRiceKg: round(instantRice / 1000, 2),
        stewKg: round(stewGrams / 1000, 2),
        packedLunchDays: packedLunchDays,
        cookLunchDays: cookLunchDays
      }
    };
  }

  /* ---------------- 备份 / 统计 ---------------- */

  function describePlan(plan, settings) {
    var peopleLabel = settings.adults + ' 位成人' +
      (settings.kidAge === 'none' ? '' : ' + 1 位 ' + AGE_LABEL[settings.kidAge] + '儿童');
    return settings.days + ' 天 · ' + peopleLabel;
  }

  function allergenList(settings) {
    return settings.exclude.map(function (id) { return allergenLabel(id); });
  }

  var api = {
    NUTRIENTS: NUTRIENTS,
    settingsFrom: settingsFrom,
    kidFactor: kidFactor,
    familyFactor: familyFactor,
    people: people,
    baseParts: baseParts,
    resolveParts: resolveParts,
    hasEdits: hasEdits,
    dishAllergens: dishAllergens,
    mealAllergens: mealAllergens,
    finalDishAllergens: finalDishAllergens,
    finalMealAllergens: finalMealAllergens,
    mealFits: mealFits,
    mealItems: mealItems,
    mealDisplayName: mealDisplayName,
    allergenLabel: allergenLabel,
    fitsFilters: fitsFilters,
    candidatesFor: candidatesFor,
    lunchMealIds: lunchMealIds,
    buildPlan: buildPlan,
    mealNutrition: mealNutrition,
    dishNutrition: dishNutrition,
    planNutrition: planNutrition,
    referenceFor: referenceFor,
    buildShopping: buildShopping,
    shoppingKey: shoppingKey,
    buildTimeline: buildTimeline,
    buildContainerPlan: buildContainerPlan,
    buildEquipmentUsage: buildEquipmentUsage,
    describePlan: describePlan,
    allergenList: allergenList,
    storage: function () { return DATA.storage; },
    reheat: function () { return DATA.reheat; },
    round: round
  };

  global.MealPrepModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
