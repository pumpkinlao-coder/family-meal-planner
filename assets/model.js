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

  /* ---------------- 蔬菜（V3.3） ---------------- */

  /* 蔬菜类别固定三类，数据层只提供键与中文名；缺失时用内置文案。
     与蔬菜有关的逻辑都放在这里，供设置、生成菜单、覆盖统计和界面助手共用。 */
  var VEG_CATEGORY_KEYS = ['leafy', 'gourd', 'root'];
  var VEG_CATEGORY_LABELS = { leafy: '绿叶菜', gourd: '瓜果菜', root: '根茎及鳞茎菜' };
  var VEG_STRATEGIES = ['balanced', 'seasonal', 'easy'];
  var DEFAULT_VEG_TARGETS = { 3: [5, 7], 4: [6, 9], 5: [8, 12] };

  function vegCategoryKey(value) {
    return VEG_CATEGORY_KEYS.indexOf(value) >= 0 ? value : null;
  }

  function allVegCategories() {
    return { leafy: true, gourd: true, root: true };
  }

  function vegCategoryLabels() {
    var labels = {};
    VEG_CATEGORY_KEYS.forEach(function (key) {
      var raw = DATA.vegCategories && DATA.vegCategories[key];
      labels[key] = typeof raw === 'string' && raw ? raw : VEG_CATEGORY_LABELS[key];
    });
    return labels;
  }

  /* 旧存档/旧调用没有 vegCategories：默认三类全开。
     settingsFrom 里全 false 会回退成三类全开；buildPlan 内部用 allowEmpty
     保留“全关”状态，才能按“跳过并记 warning”处理。 */
  function normalizeVegCategories(raw, allowEmpty) {
    var out = allVegCategories();
    var seenBoolean = false;
    if (Array.isArray(raw)) {
      // 兼容界面层可能传入的数组形式（['leafy'] 表示只保留这一类）。
      out = { leafy: false, gourd: false, root: false };
      raw.forEach(function (key) {
        if (VEG_CATEGORY_KEYS.indexOf(key) >= 0) out[key] = true;
      });
      seenBoolean = true;
    } else if (raw && typeof raw === 'object') {
      VEG_CATEGORY_KEYS.forEach(function (key) {
        if (typeof raw[key] === 'boolean') {
          out[key] = raw[key];
          seenBoolean = true;
        }
      });
    }
    if (!seenBoolean) return allVegCategories();
    if (!out.leafy && !out.gourd && !out.root) {
      return allowEmpty ? out : allVegCategories();
    }
    return out;
  }

  function normalizeVegStrategy(raw) {
    return VEG_STRATEGIES.indexOf(raw) >= 0 ? raw : 'balanced';
  }

  /* 蔬菜设置的统一视图：不修改原 settings，直接调用 buildPlan 时也能兜底。 */
  function settingsVeg(settings, options) {
    settings = settings || {};
    return {
      strategy: normalizeVegStrategy(settings.vegStrategy),
      categories: normalizeVegCategories(settings.vegCategories, !!(options && options.allowEmptyCategories)),
      quick: settings.vegQuick === true,
      lowSmoke: settings.vegLowSmoke === true,
      exclude: Array.isArray(settings.exclude) ? settings.exclude : []
    };
  }

  /* 显式把三类都关掉：跳过蔬菜配菜并记 warning，但绝不把整餐标 pending。 */
  function categoriesClosed(settings) {
    var raw = settings && settings.vegCategories;
    return !!(raw && typeof raw === 'object' &&
      raw.leafy === false && raw.gourd === false && raw.root === false);
  }

  function vegetableInfo(ingredientId) {
    var catalog = DATA.vegetables;
    return catalog && catalog[ingredientId] ? catalog[ingredientId] : null;
  }

  function vegetableCategoryOf(ingredientId) {
    var info = vegetableInfo(ingredientId);
    return info ? vegCategoryKey(info.category) : null;
  }

  /* 天数目标统一从 DATA.vegTargets 取；数据缺失时用内置区间，3–5 天之外按最近档位。 */
  function vegTargetFor(days) {
    var table = DATA.vegTargets && typeof DATA.vegTargets === 'object' ? DATA.vegTargets : DEFAULT_VEG_TARGETS;
    var rounded = Math.round(num(days, 5));
    var key = String(Math.min(5, Math.max(3, isFinite(rounded) ? rounded : 5)));
    var fallback = DEFAULT_VEG_TARGETS[key];
    var raw = table[key];
    var min = Array.isArray(raw) ? num(raw[0], fallback[0]) : fallback[0];
    var max = Array.isArray(raw) ? num(raw[1], fallback[1]) : fallback[1];
    if (min > max) {
      var swap = min;
      min = max;
      max = swap;
    }
    return [min, max];
  }

  /* 菜品上的蔬菜元数据：优先读 DATA.dishes 字段（契约字段），
     数据不完整时再用第一个蔬菜食材回填，方便过渡期与测试使用。 */
  function dishVegMeta(dishId) {
    var d = dish(dishId);
    if (!d) return null;
    var vegId = d.vegId != null ? d.vegId : null;
    if (!vegId && DATA.vegetables) {
      (d.parts || []).some(function (part) {
        if (DATA.vegetables[part.ingredient]) {
          vegId = part.ingredient;
          return true;
        }
        return false;
      });
    }
    var info = vegId ? vegetableInfo(vegId) : null;
    var category = d.vegCategory != null ? d.vegCategory : (info ? info.category : null);
    return {
      id: dishId,
      vegId: vegId || null,
      category: vegCategoryKey(category),
      rawCategory: category || null,
      cookMethod: d.cookMethod || null,
      quick: d.quick === true,
      lowSmoke: d.lowSmoke === true,
      info: info,
      dish: d
    };
  }

  /* 类别过滤：三大类按开关；三大类之外的蔬菜（例如西兰花）只在三类全开时作为兜底候选。 */
  function dishMatchesVegCategories(meta, categories) {
    if (!meta || !meta.rawCategory) return false;
    if (meta.category) return categories[meta.category] === true;
    return categories.leafy !== false && categories.gourd !== false && categories.root !== false;
  }

  /* 蔬菜候选池：所有 kind==='vegSide' 的菜品，按蔬菜类别过滤；
     vegQuick / vegLowSmoke 只保留对应偏好的菜，单条过滤后为空时回退到过滤前的集合。 */
  function vegetableDishPool(settings) {
    if (!DATA.vegetables) return [];
    var veg = settingsVeg(settings);
    var ids = Object.keys(DATA.dishes).filter(function (id) {
      return DATA.dishes[id] && DATA.dishes[id].kind === 'vegSide';
    }).sort();
    ids = ids.filter(function (id) {
      return dishMatchesVegCategories(dishVegMeta(id), veg.categories);
    });
    if (veg.quick) {
      var quickOnly = ids.filter(function (id) { return DATA.dishes[id].quick === true; });
      if (quickOnly.length) ids = quickOnly;
    }
    if (veg.lowSmoke) {
      var lowSmokeOnly = ids.filter(function (id) { return DATA.dishes[id].lowSmoke === true; });
      if (lowSmokeOnly.length) ids = lowSmokeOnly;
    }
    return ids;
  }

  /* 蔬菜安全过滤：以最终配方（改克数、减盐替换、0 g 移除后）为准，
     再加一次过敏原检查；未知配料视为不安全，不允许进入菜单。 */
  function vegetableDishFits(dishId, settings, edits) {
    var d = dish(dishId);
    if (!d || d.kind !== 'vegSide') return false;
    var veg = settingsVeg(settings);
    var parts = resolveParts(dishId, settings, edits);
    if (!parts.length) return false;
    var unknown = parts.some(function (part) {
      var ing = DATA.ingredients[part.ingredient];
      return !!(ing && ing.labelUnknown);
    });
    if (unknown) return false;
    var allergens = finalDishAllergens(dishId, settings, edits);
    return !allergens.some(function (allergen) {
      return veg.exclude.indexOf(allergen) >= 0;
    });
  }

  /* 确定性评分（不使用随机数）：类别覆盖不足、绿叶优先、当季、快/少油烟、
     与前一天/近两天/当天重复都按固定分值加减，最后按固定顺序打破平局。 */
  function scoreVegetableCandidate(meta, ctx) {
    var score = 0;
    var category = meta.category;
    var seasonal = !!(meta.info && Array.isArray(meta.info.season) &&
      meta.info.season.indexOf(ctx.month) >= 0);
    if (category) {
      if (!ctx.todayCats[category]) score += 26;   // 当天还没覆盖这一类
      if (!ctx.planCats[category]) score += 14;    // 本周还没出现过这一类
      if (category === 'leafy') score += 18;       // 绿叶菜每日优先
      if (ctx.todayCats[category]) score -= 8;     // 当天已有同类，重复减分
    }
    if (seasonal) {
      // 当季加分：当季策略明显偏好应季菜；均衡/省事只轻微参考。
      score += ctx.strategy === 'seasonal' ? 30 : (ctx.strategy === 'easy' ? 6 : 12);
    } else if (ctx.strategy === 'seasonal') {
      score -= 18;                                 // 当季策略避开反季菜
    }
    if (meta.quick) score += ctx.quick ? 16 : 0;      // 只有用户开了“快手菜”才加权
    if (meta.lowSmoke) score += ctx.lowSmoke ? 16 : 0; // 只有用户开了“少油烟”才加权
    if (ctx.strategy === 'easy') {
      // 省事策略：优先快手、少油烟和不用看火的蒸/焯/电饭煲做法。
      if (meta.quick) score += 10;
      if (meta.lowSmoke) score += 6;
      if (meta.cookMethod === 'steam' || meta.cookMethod === 'riceCooker' || meta.cookMethod === 'blanch') {
        score += 6;
      }
    }
    if (ctx.strategy === 'balanced' && typeof ctx.dayIndex === 'number') {
      // 均衡策略按天交替“快手/温和”做法，避免整周都是同一种做法。
      var wantsQuick = ctx.dayIndex % 2 === 0;
      if (meta.quick === wantsQuick) score += 5;
    }
    if (meta.vegId) {
      if (ctx.prevIds[meta.vegId]) score -= 60;    // 与前一天同一种蔬菜：强惩罚
      if (ctx.recentIds[meta.vegId]) score -= 22;  // 近两天重复
      if (ctx.todayIds[meta.vegId]) score -= 30;   // 当天已有同一种蔬菜
      if (!ctx.usedIds[meta.vegId]) score += 12;   // 本周还没用过
    }
    var pairs = meta.info && meta.info.pairs;
    if (pairs && Array.isArray(pairs)) {
      var paired = pairs.some(function (pair) {
        return !!(ctx.mealDishIds[pair] || ctx.mealIngredientIds[pair]);
      });
      if (paired) score += 6;                      // 与当天主菜/食材搭配
    }
    return score;
  }

  function vegCategoryOrder(meta) {
    return meta && meta.category ? VEG_CATEGORY_KEYS.indexOf(meta.category) : VEG_CATEGORY_KEYS.length;
  }

  /* 为某一餐挑 1 个蔬菜配菜。返回 {id, reason}：
     id 为 null 时只表示“这餐跳过蔬菜配菜”，调用方不会把整餐标 pending。 */
  function pickVegetableSide(settings, edits, ctx) {
    var pool = vegetableDishPool(settings);
    if (!pool.length) return { id: null, reason: 'empty-pool', score: 0 };
    var safe = pool.filter(function (id) { return vegetableDishFits(id, settings, edits); });
    if (!safe.length) return { id: null, reason: 'no-safe', score: 0 };
    // 尽量排除前一天、当天已经用过的蔬菜；没有替代时才允许重复（采购复用）。
    var preferred = safe.filter(function (id) {
      var meta = dishVegMeta(id);
      return !(meta.vegId && (ctx.prevIds[meta.vegId] || ctx.todayIds[meta.vegId]));
    });
    var usePool = preferred.length ? preferred : safe;
    var best = null;
    usePool.forEach(function (id) {
      var meta = dishVegMeta(id);
      var candidate = { id: id, meta: meta, score: scoreVegetableCandidate(meta, ctx) };
      if (!best ||
        candidate.score > best.score ||
        (candidate.score === best.score && vegCategoryOrder(candidate.meta) < vegCategoryOrder(best.meta)) ||
        (candidate.score === best.score && vegCategoryOrder(candidate.meta) === vegCategoryOrder(best.meta) &&
          candidate.id < best.id)) {
        best = candidate;
      }
    });
    if (!best) return { id: null, reason: 'no-safe', score: 0 };
    return { id: best.id, reason: null, score: best.score };
  }

  /* 收集一餐里出现的蔬菜：ids 用于避免重复，cats 用于类别覆盖加分。 */
  function vegUsageFromItems(items, settings, edits) {
    var ids = {};
    var cats = {};
    (items || []).forEach(function (item) {
      resolveParts(item.dish, settings, edits).forEach(function (part) {
        var info = vegetableInfo(part.ingredient);
        if (!info) return;
        ids[part.ingredient] = true;
        var category = vegCategoryKey(info.category);
        if (category) cats[category] = true;
      });
    });
    return { ids: ids, cats: cats };
  }

  function mergeVegUsage(target, source) {
    Object.keys(source.ids).forEach(function (key) { target.ids[key] = true; });
    Object.keys(source.cats).forEach(function (key) { target.cats[key] = true; });
    return target;
  }

  function copyBoolMap(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (key) { out[key] = true; });
    return out;
  }

  function unionVegHistoryIds(history, daysBack) {
    var out = {};
    var start = Math.max(0, history.length - daysBack);
    for (var i = start; i < history.length; i++) {
      Object.keys(history[i].ids).forEach(function (key) { out[key] = true; });
    }
    return out;
  }

  function unionVegHistoryCats(history) {
    var out = {};
    for (var i = 0; i < history.length; i++) {
      Object.keys(history[i].cats).forEach(function (key) { out[key] = true; });
    }
    return out;
  }

  /* 给已确认的一餐追加 1 个安全蔬菜配菜：返回新的 effective 与更新后的当天蔬菜聚合。
     只在 dinner 和现做 lunch 上调用；packed lunch 复制 dinner，不重复追加。 */
  function addVegetableSide(effective, settings, edits, dayIndex, mealSlot, vegHistory, todayVeg, warnings) {
    if (!effective || !effective.items) return { effective: effective, usage: todayVeg, added: null };
    if (categoriesClosed(settings)) return { effective: effective, usage: todayVeg, added: null };
    var already = effective.items.some(function (item) {
      var itemDish = dish(item.dish);
      return !!(itemDish && itemDish.kind === 'vegSide');
    });
    if (already) return { effective: effective, usage: todayVeg, added: null };
    var pool = vegetableDishPool(settings);
    if (!pool.length) return { effective: effective, usage: todayVeg, added: null };

    var pairingDishIds = {};
    var pairingIngredientIds = {};
    effective.items.forEach(function (item) {
      pairingDishIds[item.dish] = true;
      resolveParts(item.dish, settings, edits).forEach(function (part) {
        pairingIngredientIds[part.ingredient] = true;
      });
    });

    var veg = settingsVeg(settings);
    var picked = pickVegetableSide(settings, edits, {
      month: (new Date()).getMonth() + 1,
      dayIndex: dayIndex,
      strategy: veg.strategy,
      quick: veg.quick,
      lowSmoke: veg.lowSmoke,
      prevIds: vegHistory.length ? vegHistory[vegHistory.length - 1].ids : {},
      recentIds: unionVegHistoryIds(vegHistory, 2),
      usedIds: unionVegHistoryIds(vegHistory, vegHistory.length),
      planCats: unionVegHistoryCats(vegHistory),
      todayIds: todayVeg.ids,
      todayCats: todayVeg.cats,
      mealDishIds: pairingDishIds,
      mealIngredientIds: pairingIngredientIds
    });

    if (!picked.id) {
      if (picked.reason === 'no-safe' && warnings) {
        warnings.push({
          day: dayIndex,
          meal: mealSlot,
          from: null,
          to: null,
          pending: false,
          kind: 'vegetable',
          reason: '没有通过过敏原与配料检查的蔬菜配菜，已跳过这餐的蔬菜配菜。'
        });
      }
      return { effective: effective, usage: todayVeg, added: null };
    }

    var nextEffective = {
      id: effective.id,
      type: effective.type,
      name: effective.name,
      items: effective.items.concat([{ dish: picked.id, vegSide: true }]),
      shortcut: effective.shortcut
    };
    var usage = { ids: copyBoolMap(todayVeg.ids), cats: copyBoolMap(todayVeg.cats) };
    mergeVegUsage(usage, vegUsageFromItems([{ dish: picked.id }], settings, edits));
    return { effective: nextEffective, usage: usage, added: picked.id };
  }

  /* ---------------- 蔬菜覆盖统计 ---------------- */

  /* 覆盖统计只看午餐/晚餐里实际存在的非待选餐：
     - 早餐不以蔬菜配菜为目标，早餐里的红薯等主食不计入覆盖；
     - packed 午餐是晚餐的复制份，不重复计数；
     计数口径：菜单 parts 里带 DATA.vegetables 且属于三大类的食材出现次数，
     base 菜里的胡萝卜/彩椒/番茄/洋葱等也按类别计入，西兰花等三大类之外的不计入。 */
  function vegetableSummary(plan, settings, edits) {
    plan = plan || {};
    settings = settings || plan.settings || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var target = vegTargetFor(days.length || settings.days || 5);
    var labels = vegCategoryLabels();
    var categories = { leafy: 0, gourd: 0, root: 0 };
    var count = 0;
    var dayEntries = [];
    var usedMap = {};

    days.forEach(function (day) {
      var dayIds = {};
      builtMealSlots(day).forEach(function (slot) {
        var m = day[slot];
        if (!m || m.pending) return;
        if (slot === 'breakfast') return;
        if (slot === 'lunch' && m.packed) return;
        (m.dishes || []).forEach(function (item) {
          resolveParts(item.id, settings, edits).forEach(function (part) {
            var info = vegetableInfo(part.ingredient);
            var category = info ? vegCategoryKey(info.category) : null;
            if (!category) return;
            count += 1;
            categories[category] += 1;
            dayIds[part.ingredient] = true;
            if (!usedMap[part.ingredient]) {
              var ing = DATA.ingredients[part.ingredient] || {};
              usedMap[part.ingredient] = {
                id: part.ingredient,
                name: info.name || ing.name || part.ingredient,
                category: category,
                dayMap: {}
              };
            }
            usedMap[part.ingredient].dayMap[day.index] = true;
          });
        });
      });
      dayEntries.push({ index: day.index, ids: dayIds });
    });

    var leafyDays = dayEntries.filter(function (entry) {
      return Object.keys(entry.ids).some(function (id) {
        return vegetableCategoryOf(id) === 'leafy';
      });
    }).length;

    // repeats：相邻两天都出现同一种蔬菜的“天数对数”。
    var repeats = 0;
    for (var r = 1; r < dayEntries.length; r++) {
      var shared = Object.keys(dayEntries[r].ids).some(function (id) {
        return !!dayEntries[r - 1].ids[id];
      });
      if (shared) repeats += 1;
    }

    var used = Object.keys(usedMap).map(function (id) {
      var entry = usedMap[id];
      return {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        days: Object.keys(entry.dayMap).length
      };
    });
    used.sort(function (a, b) {
      if (b.days !== a.days) return b.days - a.days;
      return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');
    });

    var totalDays = days.length;
    var distinct = used.length;
    // 目标按“不同蔬菜种数”判断；count 是份次，只作辅助说明。
    var ok = distinct >= target[0] && distinct <= target[1];
    var notes = [];
    if (!DATA.vegetables) {
      notes.push('蔬菜数据尚未加载，本次菜单没有追加蔬菜配菜；补齐 data.js 后重新生成即可。');
    }
    var span = totalDays + ' 天';
    if (ok) {
      notes.push('蔬菜 ' + distinct + ' 种不同（' + count + ' 份次），达到 ' + span + '目标 ' + target[0] + '–' + target[1] + '。');
    } else if (distinct < target[0]) {
      notes.push('蔬菜 ' + distinct + ' 种不同（' + count + ' 份次），低于 ' + span + '目标 ' + target[0] + '–' + target[1] +
        '；可多开一类蔬菜、增加现做餐，或保留更多蔬菜配菜。');
    } else {
      notes.push('蔬菜 ' + distinct + ' 种不同（' + count + ' 份次），高于 ' + span + '目标 ' + target[0] + '–' + target[1] +
        '；三餐全开或现做午餐较多时会自然偏多，属正常范围，可按食量减少配菜。');
    }
    VEG_CATEGORY_KEYS.forEach(function (key) {
      if (!categories[key]) {
        notes.push('本周没有' + labels[key] + '；可在蔬菜设置里至少开启这一类，或换一种搭配。');
      }
    });
    if (totalDays && leafyDays < totalDays) {
      notes.push('有 ' + (totalDays - leafyDays) + ' 天没有绿叶菜；绿叶菜建议每天有一份。');
    }
    if (repeats > 0) {
      notes.push('有 ' + repeats + ' 天的蔬菜与前一天重复；尽量轮换，采购允许复用的蔬菜可以保留。');
    }
    return {
      count: count,
      distinct: distinct,
      target: [target[0], target[1]],
      categories: categories,
      leafyDays: leafyDays,
      totalDays: totalDays,
      repeats: repeats,
      used: used,
      ok: ok,
      notes: notes
    };
  }

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
    /* V3.3 蔬菜设置：缺失字段（旧存档/旧调用）用默认值；全 false 回退三类全开。 */
    var vegCategories = normalizeVegCategories(raw.vegCategories);
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
      lunchMode: normalizeLunchMode(raw.lunchMode),
      vegStrategy: normalizeVegStrategy(raw.vegStrategy),
      vegCategories: vegCategories,
      vegQuick: raw.vegQuick === true,
      vegLowSmoke: raw.vegLowSmoke === true
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
    var parts = baseParts(dishId, settings);
    if (settings.rotation === 'daughter') {
      parts = parts.map(function (p) {
        return p.ingredient === 'corn' || p.ingredient === 'salmon' ? Object.assign({}, p, {grams: p.grams / 2}) : p;
      });
      if (dishId === 'rice_bowl' && settings.riceAddIn === 'none' && !settings.exclude.includes('soy')) {
        parts = parts.concat({ingredient: 'edamame', grams: 15, role: 'veg'});
      }
    }
    return parts.map(function (part) {
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
  function copyPackedLunch(dinner, dayIndex, settings, edits) {
    // 需要当天制作的配菜改为提前做熟的西兰花；每餐只准备一份。
    var ids = uniq(dinner.dishes.map(function(dish) {
      return dish.storage.key === 'prep' ? 'broccoli_plain' : dish.id;
    }));
    var items = ids.map(function(id){ return { dish: id }; });
    var packed = decorateMeal(Object.assign({}, dinner, {items: items}), dayIndex, settings, edits);
    packed.dishes.forEach(function(dish){
      dish.lunchSteps = [dish.storage.key === 'fresh' && dish.id !== 'rice_bowl'
        ? '取即食配菜，按份组合。' : '取本餐已熟份量，按包装或复热说明加热，熟食中心达到 74°C 后装盘。'];
    });
    return {
      id: dinner.id,
      type: 'lunch',
      name: '午餐（带饭）：' + packed.dishes.map(function(d){return d.name;}).join('＋'),
      pending: false,
      packed: true,
      sourceMealId: dinner.id,
      items: packed.items,
      dishes: packed.dishes,
      allergens: packed.allergens,
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
    var lunchMode = requestedLunchMode;
    var warnings = [];
    var days = [];
    var confirmedIngredients = []; // 前面已确认餐的最终食材 id
    var lastBreakfast = null; // 上一天已确认的早餐（避开推荐重复）
    var lastDinner = null;
    var lastLunch = null;
    var pendingCount = 0;
    var confirmedMeals = 0;

    /* V3.3 蔬菜：每天维护已出现的蔬菜（含 base 菜），跨天避免连吃同一种。
       三类蔬菜被显式全部关闭时跳过追加并记 warning，但不会把整餐标 pending。 */
    var vegCategoriesOff = categoriesClosed(settings);
    var vegHistory = [];
    if (vegCategoriesOff) {
      warnings.push({
        day: 0, meal: 'dinner', from: null, to: null, pending: false, kind: 'vegetable',
        reason: '三类蔬菜都被关闭，本周不追加蔬菜配菜；菜单按原菜谱生成，未把任何一餐标为待选。'
      });
    }

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

      // 当天蔬菜聚合：先收已确认早餐与晚餐/现做午餐基础菜里的蔬菜，再决定配菜。
      var todayVeg = { ids: {}, cats: {} };
      if (breakfast && !breakfast.pending) {
        mergeVegUsage(todayVeg, vegUsageFromItems(breakfast.items, settings, edits));
      }
      var dinnerEffective = hasDinner ? effectiveMeal(dinnerId, settings, i) : null;
      var lunchEffective = hasLunch && lunchMode === 'cook' && lunchId ? effectiveMeal(lunchId, settings, i) : null;
      var dinnerFits = hasDinner ? mealFits(dinnerId, settings, edits) : false;
      var lunchFits = hasLunch && lunchMode === 'cook' && lunchId ? mealFits(lunchId, settings, edits) : false;
      if (dinnerFits) mergeVegUsage(todayVeg, vegUsageFromItems(dinnerEffective.items, settings, edits));
      if (lunchFits) mergeVegUsage(todayVeg, vegUsageFromItems(lunchEffective.items, settings, edits));

      var dinner = null;
      if (hasDinner) {
        if (dinnerFits) {
          var dinnerApplied = addVegetableSide(dinnerEffective, settings, edits, i, 'dinner', vegHistory, todayVeg, warnings);
          todayVeg = dinnerApplied.usage;
          dinner = decorateMeal(dinnerApplied.effective, i, settings, edits);
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
        var source = dinner;
        if (!hasDinner && mealFits(dinnerId, settings, edits)) {
          var base = effectiveMeal(dinnerId, settings, i);
          var prepared = addVegetableSide(base, settings, edits, i, 'lunch', vegHistory, todayVeg, warnings);
          source = decorateMeal(prepared.effective, i, settings, edits);
        }
        if (source && !source.pending) {
          lunch = copyPackedLunch(source, i, settings, edits);
          confirmedMeals += 1;
          lastLunch = source.id;
        } else {
          // 晚餐待选时，带饭午餐没有可复制的配方，只能一起待选。
          pendingCount += 1;
          lunch = pendingMeal('lunch', [], null);
          lunch.reason = hasDinner ? '晚餐待选，带饭午餐无法确定' : '本日轮换餐与过敏排除冲突';
          lunch.packed = true;
          lunch.sourceMealId = null;
          warnings.push({ day: i, meal: 'lunch', from: null, to: null, pending: true, reason: lunch.reason });
        }
      } else if (hasLunch) {
        // 现做午餐：从晚餐菜库独立选一道，套用 effectiveMeal（如省事模式烤鸡替换）再做最终过敏检查。
        if (lunchFits) {
          var lunchApplied = addVegetableSide(lunchEffective, settings, edits, i, 'lunch', vegHistory, todayVeg, warnings);
          todayVeg = lunchApplied.usage;
          lunch = decorateMeal(lunchApplied.effective, i, settings, edits);
          lunch.type = 'lunch';
          lunch.name = '午餐：' + lunch.name;
          lunch.packed = false;
          lunch.sourceMealId = lunchId;
          confirmedMeals += 1;
          lastLunch = lunchId;
          confirmedIngredients = confirmedIngredients.concat(finalMealIngredientIds(lunchId, settings, edits));
        } else {
          pendingCount += 1;
          lunch = pendingMeal('lunch', conflictAllergens(lunchId, settings, edits), recommendMeal(
            'lunch', lunchId, settings, edits, lunchSeq, lastLunch,
            uniq(confirmedIngredients.concat(breakfastIngredients, dinnerIngredients)), 'dinner'
          ));
          lunch.packed = false;
          lunch.sourceMealId = lunchId;
          warnings.push({ day: i, meal: 'lunch', from: lunchId, to: null, pending: true, reason: lunch.reason });
        }
      }

      vegHistory.push({ ids: copyBoolMap(todayVeg.ids), cats: copyBoolMap(todayVeg.cats) });
      days.push({ index: i, breakfast: breakfast, lunch: lunch, dinner: dinner });
    }

    if (DATA.vegetables && !vegCategoriesOff && vegetableDishPool(settings).length === 0) {
      warnings.push({
        day: 0, meal: 'dinner', from: null, to: null, pending: false, kind: 'vegetable',
        reason: '蔬菜数据里没有可用的配菜菜谱，本次菜单没有追加蔬菜配菜。'
      });
    }

    var plan = {
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
    // 覆盖统计按实际菜单推算：营养、采购、容器、时间线都已自动包含新增蔬菜配菜。
    plan.vegetableSummary = vegetableSummary(plan, settings, edits);
    return plan;
  }

  function decorateMeal(effective, dayIndex, settings, edits) {
    if (!effective) return null;
    var dishes = effective.items.map(function (item) {
      var d = DATA.dishes[item.dish];
      var storage = storageFor(d, dayIndex, settings, item.dish);
      // 蔬菜标签字段：优先读 DATA.dishes 的契约字段，蔬菜侧菜再回填一次，供界面出标签。
      var vegMeta = d && d.kind === 'vegSide' ? dishVegMeta(item.dish) : null;
      return {
        id: item.dish,
        name: d ? d.name : item.dish,
        swappedFrom: item.swappedFrom || null,
        storage: storage,
        reheat: d ? d.reheat : 'none',
        allergens: finalDishAllergens(item.dish, settings, edits),
        tags: d ? (d.tags || []) : [],
        vegId: d && d.vegId != null ? d.vegId : (vegMeta ? vegMeta.vegId : null),
        vegCategory: d && d.vegCategory != null ? d.vegCategory : (vegMeta ? vegMeta.category : null),
        cookMethod: d && d.cookMethod != null ? d.cookMethod : null,
        quick: d ? d.quick === true : false,
        lowSmoke: d ? d.lowSmoke === true : false
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
    // 有明确冷藏上限的菜（蔬菜侧菜等）：超过 maxFridgeDays 改成“当天现做”，
    // 不进入“后几天冷冻”的通用逻辑；storage 已是 prep 的绿叶菜保持现做。
    var maxFridgeDays = num(d.maxFridgeDays, NaN);
    if (isFinite(maxFridgeDays)) {
      if (dayIndex >= maxFridgeDays) return DATA.storage.prep;
      if (d.storage === 'prep') return DATA.storage.prep;
      if (d.storage === 'freeze') return DATA.storage.freeze;
      return DATA.storage.fridge;
    }
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

  function daughterParts(id, settings, edits) {
    var parts = resolveParts(id, settings, edits);
    var factor = kidFactor(settings);
    var active = settings.rotation === 'daughter' && factor > 0;
    var result = parts.map(function (p) {
      var grams = p.grams * factor;
      if (active && !p.edited && p.ingredient === 'broccoli') grams = 45;
      if (active && !p.edited && p.ingredient === 'mushroom') grams = 50;
      return Object.assign({}, p, {grams: grams});
    });
    return result;
  }

  function dishNutrition(dishId, settings, edits) {
    var parts = resolveParts(dishId, settings, edits);
    var adult = nutrientsForParts(parts, 1);
    var kid = settings.kidAge === 'none' ? null : nutrientsForParts(daughterParts(dishId, settings, edits), 1);
    var family = addNutrients(nutrientsForParts(parts, settings.adults),kid);
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
          var parts = resolveParts(item.id, settings, edits).map(function(p){return Object.assign({},p,{grams:p.grams*settings.adults});}).concat(daughterParts(item.id,settings,edits));
          parts.forEach(function (part) {
            if (!need[part.ingredient]) need[part.ingredient] = 0;
            need[part.ingredient] += part.grams;
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
    var vegSideGrams = 0;   // 新增蔬菜配菜：按 cookMethod 汇总，走通用遍历
    var vegSideMethods = {};
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
            // 新增蔬菜配菜按 cookMethod 汇总，不再逐个硬编码蔬菜食材；
            // 旧菜里的西兰花/胡萝卜等仍走下面的固定分类，保证时间线行为不变。
            if (d.kind === 'vegSide' && vegetableInfo(part.ingredient) && part.role === 'veg') {
              var vegSideMethod = d.cookMethod || 'stirFry';
              vegSideGrams += grams;
              vegSideMethods[vegSideMethod] = (vegSideMethods[vegSideMethod] || 0) + grams;
              return;
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
              default:
                // 兜底：base 菜里出现的新蔬菜食材也按菜品 cookMethod 计入，避免遗漏。
                if (vegetableInfo(part.ingredient) && part.role === 'veg') {
                  var fallbackVegMethod = d.cookMethod || 'stirFry';
                  vegSideGrams += grams;
                  vegSideMethods[fallbackVegMethod] = (vegSideMethods[fallbackVegMethod] || 0) + grams;
                }
                break;
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
      '蔬菜合计 ' + round((blanchVeg + stirVeg + vegSideGrams) / 1000, 2) + ' kg；肉类和豆制品分装并擦干，准备腌料、汤块冰格和保鲜盒。');
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
    // 新增蔬菜配菜：按 cookMethod 汇总一块，不逐个硬编码蔬菜做法。
    if (vegSideGrams > 0) {
      var vegMethodLabels = {
        waterOil: '水油焖', stirFry: '快炒', blanch: '焯水',
        steam: '蒸', braise: '焖烧', riceCooker: '电饭煲同煮'
      };
      var vegMethodDetail = Object.keys(vegSideMethods).sort().map(function (key) {
        return (vegMethodLabels[key] || key) + '约 ' + round(vegSideMethods[key] / 1000, 2) + ' kg';
      }).join('、');
      add('炉灶', '1:15', '蔬菜配菜（按做法汇总）',
        '本周蔬菜配菜合计约 ' + round(vegSideGrams / 1000, 2) + ' kg：' + vegMethodDetail +
        '。按做法分锅处理，叶菜快炒、瓜果/根茎可蒸或焖；当天现做或冷藏 1–2 天，不冷冻。');
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
        '带饭午餐 ' + packedLunchDays + ' 天：提前做熟午餐主菜和配菜，迅速分装；跨日份冷冻，食用前在冰箱解冻，食用前复热到 74°C。带饭不额外开火，采购与容器已按加量计入。', true);
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
        vegKg: round((blanchVeg + stirVeg + vegSideGrams) / 1000, 2),
        vegSideKg: round(vegSideGrams / 1000, 2),
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
    daughterParts: daughterParts,
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
    // V3.3 蔬菜：候选池与覆盖统计供界面/测试直接调用；不改动旧导出。
    vegetableDishPool: vegetableDishPool,
    vegetableSummary: vegetableSummary,
    storage: function () { return DATA.storage; },
    reheat: function () { return DATA.reheat; },
    round: round
  };

  global.MealPrepModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
