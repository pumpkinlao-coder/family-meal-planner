/* =========================================================
   家庭早晚餐规划 V3 — 内容与数据
   营养值：USDA FoodData Central（SR Legacy, 2019）
   逐项来源见每个食材的 source 字段；饭团海苔采用日本食品标准成分表。
   ========================================================= */
window.MEALPREP = {
  meta: {
    version: '3.2.0',
    updated: '2026-11-20',
    title: '家庭三餐规划 V3.2',
    subtitle: '可编辑份量、逐食材营养与自动采购的离线备用餐工具'
  },

  allergens: [
    { id: 'egg', label: '蛋', detail: '鸡蛋' },
    { id: 'milk', label: '奶', detail: '牛奶、酸奶' },
    { id: 'wheat', label: '小麦/麸质', detail: '酱油、麦味噌、普通燕麦的交叉污染' },
    { id: 'soy', label: '大豆', detail: '豆腐、毛豆、酱油、味噌' },
    { id: 'sesame', label: '芝麻', detail: '饭团用芝麻' },
    { id: 'fish', label: '鱼', detail: '三文鱼' },
    { id: 'shellfish', label: '甲壳类', detail: '虾' },
    { id: 'peanut', label: '花生', detail: '本菜单未使用，保留筛选项' },
    { id: 'treenut', label: '坚果', detail: '本菜单未使用，保留筛选项' }
  ],

  groups: ['肉、鱼、蛋', '豆制品', '奶类', '主食与谷物', '蔬菜', '水果', '调味与干货'],

  storage: {
    freeze: {
      key: 'freeze', label: '冷冻', tag: 'tag-freeze', icon: 'i-snow', short: '当天速冻',
      note: '−18°C 以下。制作当天尽快冷却后直接冷冻，标注日期；饭团与米饭尤其不要留在电饭煲里自然冷却。'
    },
    fridge: {
      key: 'fridge', label: '冷藏', tag: 'tag-fridge', icon: 'i-fridge', short: '4°C 冷藏',
      note: '4°C 以下。一般熟食 3–4 天内食用；米饭与饭团不适用这条，需在 24 小时内吃完或冷冻。'
    },
    fresh: {
      key: 'fresh', label: '现加', tag: 'tag-fresh', icon: 'i-leaf', short: '食用当天',
      note: '不参与集中烹饪：牛奶、酸奶、水果、海苔在食用当天取出或包上。'
    },
    prep: {
      key: 'prep', label: '现做', tag: 'tag-fresh', icon: 'i-clock', short: '当天现做',
      note: '建议当天现做；冷藏通常口感更好。冷藏/冷冻都必须尽快降温并控制温度；一次做 2–3 天量可以，但不建议为第 4–5 天提前做好再冷冻。'
    }
  },

  reheat: {
    microwave: { key: 'microwave', label: '微波炉', icon: 'i-microwave', short: '微波复热' },
    steam: { key: 'steam', label: '蒸锅', icon: 'i-steam', short: '蒸锅复热' },
    none: { key: 'none', label: '无需加热', icon: 'i-leaf', short: '直接食用' }
  },

  saltSwaps: {
    soy_sauce: 'soy_sauce_low',
    miso: 'miso_low'
  },


  ingredients: {
    /* ---------- 肉、鱼、蛋 ---------- */
    egg: {
      name: '鸡蛋', group: '肉、鱼、蛋', state: '生重', allergens: ['egg'],
      per100: { kcal: 143, protein: 12.56, fat: 9.51, carb: 0.72, fiber: 0, calcium: 56, iron: 1.75, sodium: 142 },
      purchase: { mode: 'count', unit: '个', unitGrams: 50, packCount: 10, packLabel: '10 枚装' },
      edibleRatio: 0.89,
      purchaseNote: '按每个约 50 g 带壳计，可食部约 44.5 g。',
      source: { fdcId: 171287, desc: 'Egg, whole, raw, fresh', type: 'SR Legacy' }
    },
    chicken_thigh: {
      name: '去骨鸡腿肉', group: '肉、鱼、蛋', state: '生重', allergens: [],
      per100: { kcal: 121, protein: 19.66, fat: 4.12, carb: 0, fiber: 0, calcium: 7, iron: 0.81, sodium: 95 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
      purchaseNote: '去皮去骨；生重计量，烹调后重量会下降。',
      source: { fdcId: 173627, desc: 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw', type: 'SR Legacy' }
    },
    rotisserie_chicken: {
      name: '现成烤鸡（去骨肉）', group: '肉、鱼、蛋', state: '熟重', allergens: [], mayContain: ['soy', 'wheat'],
      per100: { kcal: 144, protein: 28.04, fat: 3.57, carb: 0, fiber: 0, calcium: 13, iron: 0.46, sodium: 328 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '半只装' },
      purchaseNote: '按可食肉计（以烤鸡胸肉数据代表）。调味差异大，钠看包装；去皮可减少一部分脂肪与钠。',
      source: { fdcId: 171445, desc: 'Chicken, broiler, rotisserie, BBQ, breast, meat only', type: 'SR Legacy' }
    },
    beef_lean: {
      name: '瘦牛肉末（90% 瘦）', group: '肉、鱼、蛋', state: '生重', allergens: [],
      per100: { kcal: 176, protein: 20, fat: 10, carb: 0, fiber: 0, calcium: 12, iron: 2.24, sodium: 66 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
      purchaseNote: '按生重；炒制时沥去多余油脂可减少脂肪。',
      source: { fdcId: 174030, desc: 'Beef, ground, 90% lean meat / 10% fat, raw', type: 'SR Legacy' }
    },
    salmon: {
      name: '三文鱼', group: '肉、鱼、蛋', state: '生重', allergens: ['fish'],
      per100: { kcal: 208, protein: 20.42, fat: 13.42, carb: 0, fiber: 0, calcium: 9, iron: 0.34, sodium: 59 },
      purchase: { mode: 'weight', packKg: 0.25, packLabel: '250 g 装' },
      purchaseNote: '养殖大西洋鲑，生重；去皮可减少部分脂肪。',
      source: { fdcId: 175167, desc: 'Fish, salmon, Atlantic, farmed, raw', type: 'SR Legacy' }
    },
    shrimp: {
      name: '虾仁', group: '肉、鱼、蛋', state: '生重', allergens: ['shellfish'],
      per100: { kcal: 71, protein: 13.61, fat: 1.01, carb: 0.91, fiber: 0, calcium: 54, iron: 0.21, sodium: 566 },
      purchase: { mode: 'weight', packKg: 0.3, packLabel: '300 g 袋' },
      purchaseNote: 'USDA 样本为可能含保水剂的生虾，钠偏高；选无添加虾仁通常更低。',
      source: { fdcId: 174210, desc: 'Crustaceans, shrimp, mixed species, raw (may contain additives)', type: 'SR Legacy' }
    },

    /* ---------- 豆制品 ---------- */
    tofu_firm: {
      name: '北豆腐（钙凝固）', group: '豆制品', state: '生重', allergens: ['soy'],
      per100: { kcal: 144, protein: 17.27, fat: 8.72, carb: 2.78, fiber: 2.3, calcium: 683, iron: 2.66, sodium: 14 },
      purchase: { mode: 'weight', packKg: 0.3, packLabel: '300 g 盒' },
      purchaseNote: 'USDA 条目为硫酸钙凝固的硬豆腐；国内北豆腐品牌差异较大，钙含量需看包装。',
      source: { fdcId: 172475, desc: 'Tofu, raw, firm, prepared with calcium sulfate', type: 'SR Legacy' }
    },
    edamame: {
      name: '毛豆仁', group: '豆制品', state: '熟重', allergens: ['soy'],
      per100: { kcal: 121, protein: 11.91, fat: 5.2, carb: 8.91, fiber: 5.2, calcium: 63, iron: 2.27, sodium: 6 },
      purchase: { mode: 'weight', packKg: 0.2, packLabel: '200 g 袋' },
      purchaseNote: '冷冻毛豆仁，按解冻后重量计。',
      source: { fdcId: 168411, desc: 'Edamame, frozen, prepared', type: 'SR Legacy' }
    },

    /* ---------- 奶类 ---------- */
    milk: {
      name: '全脂牛奶', group: '奶类', state: '液体', allergens: ['milk'],
      per100: { kcal: 61, protein: 3.15, fat: 3.25, carb: 4.8, fiber: 0, calcium: 113, iron: 0.03, sodium: 43 },
      purchase: { mode: 'weight', packKg: 1, packLabel: '1 L 盒', unitLabel: 'L' },
      purchaseNote: '1 L 约按 1000 g 计。',
      source: { fdcId: 171265, desc: 'Milk, whole, 3.25% milkfat, with added vitamin D', type: 'SR Legacy' }
    },
    yogurt: {
      name: '原味全脂酸奶', group: '奶类', state: '成品', allergens: ['milk'],
      per100: { kcal: 61, protein: 3.47, fat: 3.25, carb: 4.66, fiber: 0, calcium: 121, iron: 0.05, sodium: 46 },
      purchase: { mode: 'weight', packKg: 0.4, packLabel: '400 g 桶' },
      purchaseNote: '选无添加糖原味酸奶，糖与钠以包装为准。',
      source: { fdcId: 171284, desc: 'Yogurt, plain, whole milk', type: 'SR Legacy' }
    },

    /* ---------- 主食与谷物 ---------- */
    rice_cooked: {
      name: '熟米饭', group: '主食与谷物', state: '熟重', purchaseState: '生米采购', allergens: [],
      per100: { kcal: 130, protein: 2.36, fat: 0.19, carb: 28.73, fiber: 0, calcium: 1, iron: 0.2, sodium: 0 },
      purchase: { mode: 'weight', packKg: 2.5, packLabel: '2.5 kg 袋', cupGrams: 150 },
      rawPerCooked: 0.43,
      purchaseNote: '按熟重配餐；采购量已折算为生米（约 0.43 g 生米 / g 熟饭）。',
      source: { fdcId: 168932, desc: 'Rice, white, short-grain, cooked, unenriched', type: 'SR Legacy' }
    },
    oats_dry: {
      name: '燕麦片', group: '主食与谷物', state: '干重', allergens: [], mayContain: ['wheat'],
      per100: { kcal: 379, protein: 13.15, fat: 6.52, carb: 67.7, fiber: 10.1, calcium: 52, iron: 4.25, sodium: 6 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 袋' },
      purchaseNote: '普通燕麦可能有小麦交叉污染；乳糜泻或小麦过敏请选认证无麸质燕麦。',
      source: { fdcId: 173904, desc: 'Cereals, oats, regular and quick, not fortified, dry', type: 'SR Legacy' }
    },
    corn: {
      name: '甜玉米粒', group: '主食与谷物', state: '熟重', allergens: [],
      per100: { kcal: 96, protein: 3.41, fat: 1.5, carb: 20.98, fiber: 2.4, calcium: 3, iron: 0.45, sodium: 1 },
      purchase: { mode: 'count', unit: '根', unitGrams: 200, packCount: 1, packLabel: '根' },
      edibleRatio: 0.46,
      purchaseNote: '按玉米粒计；一根带芯玉米约 200 g，可食部约 46%。',
      source: { fdcId: 169999, desc: 'Corn, sweet, yellow, cooked, boiled, drained, without salt', type: 'SR Legacy' }
    },
    sweet_potato: {
      name: '红薯', group: '主食与谷物', state: '生重', allergens: [],
      per100: { kcal: 86, protein: 1.57, fat: 0.05, carb: 20.12, fiber: 3, calcium: 30, iron: 0.61, sodium: 55 },
      purchase: { mode: 'count', unit: '个', unitGrams: 200, packCount: 1, packLabel: '个' },
      purchaseNote: '按带皮生重计；蒸熟后食用，皮可食。',
      source: { fdcId: 168482, desc: 'Sweet potato, raw, unprepared', type: 'SR Legacy' }
    },

    /* ---------- 蔬菜 ---------- */
    broccoli: {
      name: '西兰花', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 34, protein: 2.82, fat: 0.37, carb: 6.64, fiber: 2.6, calcium: 47, iron: 0.73, sodium: 33 },
      purchase: { mode: 'count', unit: '颗', unitGrams: 300, packCount: 1, packLabel: '颗' },
      edibleRatio: 0.7,
      purchaseNote: '一颗约 300 g，修整后可食部约 70%。',
      source: { fdcId: 170379, desc: 'Broccoli, raw', type: 'SR Legacy' }
    },
    carrot: {
      name: '胡萝卜', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 41, protein: 0.93, fat: 0.24, carb: 9.58, fiber: 2.8, calcium: 33, iron: 0.3, sodium: 69 },
      purchase: { mode: 'count', unit: '根', unitGrams: 100, packCount: 1, packLabel: '根' },
      edibleRatio: 0.9,
      purchaseNote: '按去皮后可食部计。',
      source: { fdcId: 170393, desc: 'Carrots, raw', type: 'SR Legacy' }
    },
    mushroom: {
      name: '白蘑菇', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 22, protein: 3.09, fat: 0.34, carb: 3.26, fiber: 1, calcium: 3, iron: 0.5, sodium: 5 },
      purchase: { mode: 'weight', packKg: 0.1, packLabel: '100 g 盒' },
      purchaseNote: '也可用口蘑、香菇替代，风味不同。',
      source: { fdcId: 169251, desc: 'Mushrooms, white, raw', type: 'SR Legacy' }
    },
    pepper_red: {
      name: '红彩椒', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 26, protein: 0.99, fat: 0.3, carb: 6.03, fiber: 2.1, calcium: 7, iron: 0.43, sodium: 4 },
      purchase: { mode: 'count', unit: '个', unitGrams: 150, packCount: 1, packLabel: '个' },
      edibleRatio: 0.85,
      purchaseNote: '去籽去蒂后约 85% 可食。',
      source: { fdcId: 170108, desc: 'Peppers, sweet, red, raw', type: 'SR Legacy' }
    },
    tomato: {
      name: '番茄', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 18, protein: 0.88, fat: 0.2, carb: 3.89, fiber: 1.2, calcium: 10, iron: 0.27, sodium: 5 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 盒' },
      purchaseNote: '全年平均数据；熟番茄制品钠可能更高。',
      source: { fdcId: 170457, desc: 'Tomatoes, red, ripe, raw, year round average', type: 'SR Legacy' }
    },
    onion: {
      name: '洋葱', group: '蔬菜', state: '生重', allergens: [],
      per100: { kcal: 40, protein: 1.1, fat: 0.1, carb: 9.34, fiber: 1.7, calcium: 23, iron: 0.21, sodium: 4 },
      purchase: { mode: 'count', unit: '个', unitGrams: 150, packCount: 1, packLabel: '个' },
      edibleRatio: 0.9,
      purchaseNote: '按去皮后可食部计。',
      source: { fdcId: 170000, desc: 'Onions, raw', type: 'SR Legacy' }
    },
    garlic: {
      name: '大蒜', group: '调味与干货', state: '生重', allergens: [],
      per100: { kcal: 149, protein: 6.36, fat: 0.5, carb: 33.06, fiber: 2.1, calcium: 181, iron: 1.7, sodium: 17 },
      purchase: { mode: 'count', unit: '头', unitGrams: 40, packCount: 1, packLabel: '头' },
      edibleRatio: 0.85,
      purchaseNote: '一小瓣约 3–5 g；按头采购，用不完可冷冻蒜末。',
      source: { fdcId: 169230, desc: 'Garlic, raw', type: 'SR Legacy' }
    },

    /* ---------- 水果 ---------- */
    banana: {
      name: '香蕉', group: '水果', state: '可食部', allergens: [],
      per100: { kcal: 89, protein: 1.09, fat: 0.33, carb: 22.84, fiber: 2.6, calcium: 5, iron: 0.26, sodium: 1 },
      purchase: { mode: 'count', unit: '根', unitGrams: 120, packCount: 1, packLabel: '根' },
      edibleRatio: 0.83,
      purchaseNote: '一根带皮约 120 g，可食部约 100 g。',
      source: { fdcId: 173944, desc: 'Bananas, raw', type: 'SR Legacy' }
    },
    apple: {
      name: '苹果', group: '水果', state: '可食部', allergens: [],
      per100: { kcal: 52, protein: 0.26, fat: 0.17, carb: 13.81, fiber: 2.4, calcium: 6, iron: 0.12, sodium: 1 },
      purchase: { mode: 'count', unit: '个', unitGrams: 180, packCount: 1, packLabel: '个' },
      edibleRatio: 0.83,
      purchaseNote: '一个约 180 g，去核后可食部约 150 g。',
      source: { fdcId: 171688, desc: 'Apples, raw, with skin', type: 'SR Legacy' }
    },
    orange: {
      name: '橙子', group: '水果', state: '可食部', allergens: [],
      per100: { kcal: 47, protein: 0.94, fat: 0.12, carb: 11.75, fiber: 2.4, calcium: 40, iron: 0.1, sodium: 0 },
      purchase: { mode: 'count', unit: '个', unitGrams: 180, packCount: 1, packLabel: '个' },
      edibleRatio: 0.72,
      purchaseNote: '一个约 180 g，去皮去籽后可食部约 72%。',
      source: { fdcId: 169097, desc: 'Oranges, raw, all commercial varieties', type: 'SR Legacy' }
    },

    /* ---------- 调味与干货 ---------- */
    nori: {
      name: '烤海苔', group: '调味与干货', state: '干重', allergens: [],
      per100: { kcal: 297, protein: 41.4, fat: 3.7, carb: 44.3, fiber: 40, calcium: 280, iron: 11, sodium: 510 },
      purchase: { mode: 'count', unit: '片', unitGrams: 3, packCount: 10, packLabel: '10 片装' },
      purchaseNote: '一片约 3 g。食用前再包，避免受潮变韧。',
      source: { mext: '1126', desc: 'あまのり 焼きのり', type: '日本食品標準成分表 2020 年版（八訂）' }
    },
    sesame: {
      name: '白芝麻', group: '调味与干货', state: '干重', allergens: ['sesame'],
      per100: { kcal: 573, protein: 17.73, fat: 49.67, carb: 23.45, fiber: 11.8, calcium: 975, iron: 14.55, sodium: 11 },
      purchase: { mode: 'weight', packKg: 0.1, packLabel: '100 g 袋' },
      purchaseNote: '炒香后更易吸收风味；芝麻是常见过敏原。',
      source: { fdcId: 170150, desc: 'Seeds, sesame seeds, whole, dried', type: 'SR Legacy' }
    },
    pumpkin_seed: {
      name: '南瓜籽仁', group: '调味与干货', state: '干重', allergens: [],
      per100: { kcal: 559, protein: 30.23, fat: 49.05, carb: 10.71, fiber: 6, calcium: 46, iron: 8.82, sodium: 7 },
      purchase: { mode: 'weight', packKg: 0.1, packLabel: '100 g 袋' },
      purchaseNote: '给儿童整粒南瓜籽需注意呛咳风险；幼儿可磨碎或选南瓜籽酱。',
      source: { fdcId: 170556, desc: 'Seeds, pumpkin and squash seed kernels, dried', type: 'SR Legacy' }
    },
    soy_sauce: {
      name: '酱油', group: '调味与干货', state: '液体', allergens: ['soy', 'wheat'],
      per100: { kcal: 53, protein: 8.14, fat: 0.57, carb: 4.93, fiber: 0.8, calcium: 33, iron: 1.45, sodium: 5493 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 mL 瓶', unitLabel: 'L' },
      purchaseNote: '含小麦与大豆；减盐模式会替换为低钠酱油。',
      source: { fdcId: 174277, desc: 'Soy sauce made from soy and wheat (shoyu)', type: 'SR Legacy' }
    },
    soy_sauce_low: {
      name: '低钠酱油', group: '调味与干货', state: '液体', allergens: ['soy', 'wheat'],
      per100: { kcal: 57, protein: 9.05, fat: 0.3, carb: 5.59, fiber: 0.7, calcium: 30, iron: 1.35, sodium: 3598 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 mL 瓶', unitLabel: 'L' },
      purchaseNote: 'USDA 低钠酱油条目的钠约为普通酱油的 65%，仍不可无限量使用。',
      source: { fdcId: 172473, desc: 'Soy sauce made from soy and wheat (shoyu), low sodium', type: 'SR Legacy' }
    },
    miso: {
      name: '味噌', group: '调味与干货', state: '生重', allergens: ['soy', 'wheat'],
      per100: { kcal: 198, protein: 12.79, fat: 6.01, carb: 25.37, fiber: 5.4, calcium: 57, iron: 2.49, sodium: 3728 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 盒' },
      purchaseNote: '含大豆；麦味噌通常含小麦，过敏者请确认配料。减盐模式会替换为低盐味噌。',
      source: { fdcId: 172442, desc: 'Miso', type: 'SR Legacy' }
    },
    miso_low: {
      name: '低盐味噌', group: '调味与干货', state: '生重', allergens: ['soy', 'wheat'],
      per100: { kcal: 198, protein: 12.79, fat: 6.01, carb: 25.37, fiber: 5.4, calcium: 57, iron: 2.49, sodium: 2237 },
      purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 盒' },
      purchaseNote: '按普通味噌钠含量的 60% 估算，非 USDA 条目；实际以包装标签为准。',
      source: { name: '估算值（普通味噌 × 0.6 钠）', type: '估算' }
    },
    oil: {
      name: '食用油', group: '调味与干货', state: '液体', allergens: [],
      per100: { kcal: 884, protein: 0, fat: 100, carb: 0, fiber: 0, calcium: 1, iron: 0.56, sodium: 2 },
      purchase: { mode: 'weight', packKg: 0.9, packLabel: '900 mL 瓶', unitLabel: 'L' },
      pantry: true,
      purchaseNote: '以橄榄油数据代表常见植物油；不同油的脂肪酸组成不同。',
      source: { fdcId: 171413, desc: 'Oil, olive, salad or cooking', type: 'SR Legacy' }
    },
    salt: {
      name: '食盐', group: '调味与干货', state: '干重', allergens: [],
      per100: { kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, calcium: 24, iron: 0.33, sodium: 38758 },
      purchase: { mode: 'weight', packKg: 0.4, packLabel: '400 g 袋' },
      pantry: true,
      purchaseNote: '1 g 盐约含 388 mg 钠。减盐模式会省略饭团用盐。',
      source: { fdcId: 173468, desc: 'Salt, table', type: 'SR Legacy' }
    },
    sugar: {
      name: '白砂糖', group: '调味与干货', state: '干重', allergens: [],
      per100: { kcal: 387, protein: 0, fat: 0, carb: 99.98, fiber: 0, calcium: 1, iron: 0.05, sodium: 1 },
      purchase: { mode: 'weight', packKg: 0.4, packLabel: '400 g 袋' },
      pantry: true,
      purchaseNote: '照烧汁与味噌腌料用糖；可减量或省略。',
      source: { fdcId: 169655, desc: 'Sugars, granulated', type: 'SR Legacy' }
    }
  },

  /* =========================================================
     菜品（每份 = 每位成人的基准量）
     ========================================================= */
  dishes: {
    /* ---------- 早餐 ---------- */
    onigiri_egg: {
      name: '鸡蛋芝麻饭团', kind: 'onigiri', storage: 'freeze', reheat: 'microwave',
      tags: ['日式', '手不接触熟饭'],
      parts: [
        { ingredient: 'rice_cooked', grams: 160, role: 'rice', note: '熟重，按饭团规格' },
        { ingredient: 'egg', grams: 50, role: 'protein', note: '煮熟后切碎拌入' },
        { ingredient: 'sesame', grams: 4, role: 'flavor' },
        { ingredient: 'nori', grams: 1, role: 'wrap', note: '食用前再包' },
        { ingredient: 'salt', grams: 0.3, role: 'seasoning', omitWhenLowSalt: true }
      ],
      kidNote: '可做小一号并剪碎海苔；3 岁以下不整片给海苔。',
      softNote: '米饭煮软一点，馅料切碎；海苔剪成小片或省略。',
      steps: [
        '鸡蛋冷水下锅，水沸后 8–9 分钟，冰水冷却后剥壳切碎。',
        '米饭煮好后立即开盖摊开散热；趁温热把蛋碎、芝麻和盐轻轻拌入，不要用力压。',
        '戴一次性手套或铺保鲜膜，取一份米饭放掌心，中间放馅，收口捏成三角或椭圆。',
        '单个包保鲜膜，标注日期；不烫手后尽快冷冻。海苔在食用当天再包。',
        '复热到中心 74°C；微波时中火 1 分钟起步，翻面再 30–60 秒。'
      ]
    },
    onigiri_chicken: {
      name: '鸡肉玉米饭团', kind: 'onigiri', storage: 'freeze', reheat: 'microwave',
      tags: ['日式', '手不接触熟饭'],
      parts: [
        { ingredient: 'rice_cooked', grams: 160, role: 'rice', note: '熟重，按饭团规格' },
        { ingredient: 'chicken_thigh', grams: 45, role: 'protein', note: '煮熟撕丝' },
        { ingredient: 'corn', grams: 25, role: 'veg' },
        { ingredient: 'sesame', grams: 3, role: 'flavor' },
        { ingredient: 'nori', grams: 1, role: 'wrap' },
        { ingredient: 'salt', grams: 0.3, role: 'seasoning', omitWhenLowSalt: true }
      ],
      kidNote: '玉米粒对幼儿有呛咳风险，可压碎；鸡肉撕细丝。',
      softNote: '玉米压碎、鸡肉撕成细丝，饭团做小。',
      steps: [
        '鸡腿肉冷水下锅煮熟（中心 74°C），稍凉后撕成细丝；玉米粒焯熟沥干。',
        '米饭摊开散热，拌入鸡肉丝、玉米、芝麻和盐。',
        '用手套或保鲜膜捏成饭团，单个包好并标注日期，尽快冷冻。',
        '复热时中火 1 分钟起步，翻面补 30–60 秒，中心达到 74°C。'
      ]
    },
    onigiri_salmon: {
      name: '三文鱼饭团', kind: 'onigiri', storage: 'freeze', reheat: 'microwave',
      tags: ['日式', '含鱼'],
      parts: [
        { ingredient: 'rice_cooked', grams: 160, role: 'rice' },
        { ingredient: 'salmon', grams: 45, role: 'protein', note: '煎熟后拆碎' },
        { ingredient: 'sesame', grams: 3, role: 'flavor' },
        { ingredient: 'nori', grams: 1, role: 'wrap' },
        { ingredient: 'salt', grams: 0.3, role: 'seasoning', omitWhenLowSalt: true }
      ],
      kidNote: '仔细检查鱼刺；鱼肉拆碎后再拌入。',
      softNote: '鱼肉拆得更碎，海苔剪小片。',
      steps: [
        '三文鱼煎熟（中心 63°C 以上），去皮去刺后叉碎。',
        '米饭降温后拌入鱼肉、芝麻与少量盐。',
        '捏成饭团，单个包膜并标注；尽快冷冻或当天食用。',
        '复热到 74°C；鱼肉饭团不要反复加热。'
      ]
    },
    onigiri_tofu: {
      name: '豆腐毛豆饭团', kind: 'onigiri', storage: 'freeze', reheat: 'microwave',
      tags: ['日式', '豆制品'],
      parts: [
        { ingredient: 'rice_cooked', grams: 160, role: 'rice' },
        { ingredient: 'tofu_firm', grams: 60, role: 'protein', note: '压碎炒干' },
        { ingredient: 'edamame', grams: 25, role: 'protein' },
        { ingredient: 'sesame', grams: 3, role: 'flavor' },
        { ingredient: 'nori', grams: 1, role: 'wrap' },
        { ingredient: 'salt', grams: 0.3, role: 'seasoning', omitWhenLowSalt: true }
      ],
      kidNote: '豆腐压碎后口感更软；毛豆切碎，避免整粒。',
      softNote: '毛豆切碎、豆腐炒得略干，饭团做小。',
      steps: [
        '豆腐压碎，用不粘锅炒到水分减少；毛豆煮熟切碎。',
        '米饭降温后拌入豆腐、毛豆、芝麻和盐。',
        '捏成饭团，包膜标注日期；尽快冷冻。',
        '复热到中心 74°C，避免只加热表面。'
      ]
    },
    milk_glass: {
      name: '牛奶', storage: 'fresh', reheat: 'none', tags: ['现加'],
      parts: [{ ingredient: 'milk', grams: 250, role: 'dairy' }],
      steps: ['食用当天从冷藏取出，倒一杯即可；不参与预先分装。']
    },
    yogurt_bowl: {
      name: '原味酸奶', storage: 'fresh', reheat: 'none', tags: ['现加'],
      parts: [{ ingredient: 'yogurt', grams: 200, role: 'dairy' }],
      steps: ['食用当天取用；可加水果或燕麦，但不要提前拌好久放。']
    },
    banana: {
      name: '香蕉', storage: 'fresh', reheat: 'none', tags: ['现加'],
      parts: [{ ingredient: 'banana', grams: 100, role: 'fruit' }],
      steps: ['食用当天切好或整根带走；切开的香蕉容易氧化。']
    },
    apple: {
      name: '苹果', storage: 'fresh', reheat: 'none', tags: ['现加'],
      parts: [{ ingredient: 'apple', grams: 100, role: 'fruit' }],
      steps: ['食用当天洗净切块；儿童切成易嚼的小块。']
    },
    orange: {
      name: '橙子', storage: 'fresh', reheat: 'none', tags: ['现加'],
      parts: [{ ingredient: 'orange', grams: 150, role: 'fruit' }],
      steps: ['食用当天剥皮分瓣；去籽后再给儿童。']
    },
    sweet_potato: {
      name: '蒸红薯', storage: 'prep', reheat: 'microwave', tags: ['蒸'],
      parts: [{ ingredient: 'sweet_potato', grams: 180, role: 'staple' }],
      kidNote: '去皮压成泥更容易入口。',
      softNote: '蒸得更软，去皮压泥。',
      steps: [
        '红薯刷洗干净，整颗蒸 20–25 分钟，筷子能轻松插入。',
        '放凉后冷藏，3 天内吃完；食用时微波或再蒸热。',
        '儿童版去皮压泥，避免大块噎住。'
      ]
    },
    corn_cob: {
      name: '水煮玉米', storage: 'prep', reheat: 'microwave', tags: ['煮'],
      parts: [{ ingredient: 'corn', grams: 150, role: 'staple' }],
      kidNote: '整粒玉米对幼儿有呛咳风险，可切下玉米粒压碎。',
      softNote: '切下玉米粒并压碎，或打成玉米糊。',
      steps: [
        '玉米去外皮，沸水煮 8–10 分钟。',
        '放凉后冷藏；食用前加热到热透。',
        '儿童版把玉米粒切下压碎，避免整粒。'
      ]
    },
    boiled_egg: {
      name: '水煮蛋', storage: 'prep', reheat: 'none', tags: ['煮', '可冷藏'],
      parts: [{ ingredient: 'egg', grams: 50, role: 'protein' }],
      kidNote: '切小块；确保蛋黄完全凝固。',
      steps: [
        '冷水下锅，水沸后煮 8–9 分钟，冰水冷却后剥壳。',
        '带壳冷藏 3 天内食用；剥壳后当天吃完。'
      ]
    },
    oat_milk: {
      name: '燕麦牛奶', storage: 'prep', reheat: 'microwave', tags: ['现煮'],
      parts: [
        { ingredient: 'oats_dry', grams: 40, role: 'staple' },
        { ingredient: 'milk', grams: 250, role: 'dairy' }
      ],
      kidNote: '燕麦煮软，牛奶不要滚沸。',
      softNote: '燕麦多煮 2–3 分钟至软烂，可略增牛奶。',
      steps: [
        '燕麦加少量水煮 3–5 分钟，再加入牛奶小火加热，不要滚沸。',
        '关火静置 2 分钟；不加糖，用香蕉或苹果提供甜味。',
        '需要时微波复热到温热，儿童食用前试温。'
      ]
    },
    oat_yogurt: {
      name: '燕麦酸奶杯', storage: 'fresh', reheat: 'none', tags: ['现拌'],
      parts: [
        { ingredient: 'oats_dry', grams: 40, role: 'staple' },
        { ingredient: 'yogurt', grams: 200, role: 'dairy' }
      ],
      kidNote: '燕麦提前泡软，避免干硬。',
      softNote: '燕麦用酸奶浸泡 20 分钟以上再吃。',
      steps: [
        '燕麦与酸奶拌匀，冷藏浸泡 20 分钟或一夜。',
        '食用当天加入水果；不要提前拌水果久放。'
      ]
    },
    oat_banana_water: {
      name: '燕麦香蕉粥', storage: 'prep', reheat: 'microwave', tags: ['无奶无蛋'],
      parts: [
        { ingredient: 'oats_dry', grams: 40, role: 'staple' },
        { ingredient: 'banana', grams: 100, role: 'fruit' },
        { ingredient: 'pumpkin_seed', grams: 8, role: 'protein' }
      ],
      kidNote: '南瓜籽磨碎或省略；粥煮软。',
      steps: [
        '燕麦加水煮 5–8 分钟至软，加入香蕉压碎。',
        '南瓜籽磨碎后撒上；不加糖。',
        '适合无蛋、无奶的早餐组合；小麦过敏者用认证无麸质燕麦。'
      ]
    },

    /* ---------- 晚餐 ---------- */
    teriyaki_chicken: {
      name: '照烧鸡腿', storage: 'fridge', reheat: 'microwave', tags: ['含酱油'],
      parts: [
        { ingredient: 'chicken_thigh', grams: 130, role: 'protein' },
        { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
        { ingredient: 'sugar', grams: 5, role: 'seasoning' },
        { ingredient: 'oil', grams: 5, role: 'fat' }
      ],
      kidNote: '酱汁减少一半，鸡肉切小条；避免过咸。',
      softNote: '鸡肉切小条炖软，酱汁减量。',
      steps: [
        '鸡腿肉擦干，皮面朝下先煎至金黄，翻面煎到中心 74°C。',
        '酱油与糖混合，倒入锅中收汁裹匀；不要收得过干。',
        '稍凉后切条分装，冷藏或冷冻；复热到中心 74°C。'
      ]
    },
    tomato_beef: {
      name: '番茄牛肉', storage: 'fridge', reheat: 'microwave', tags: ['家常'],
      parts: [
        { ingredient: 'beef_lean', grams: 100, role: 'protein' },
        { ingredient: 'tomato', grams: 200, role: 'veg' },
        { ingredient: 'onion', grams: 40, role: 'veg' },
        { ingredient: 'oil', grams: 6, role: 'fat' }
      ],
      kidNote: '汤汁拌饭；牛肉末炒散，避免结块。',
      softNote: '番茄煮到软烂，牛肉末炒散。',
      steps: [
        '洋葱切丁炒软，加入牛肉末炒散至变色。',
        '加入番茄块，中小火煮 10–15 分钟到软烂；不加盐或少量盐。',
        '分装浅盒冷却；复热到 74°C，汤汁要滚开。'
      ]
    },
    miso_salmon: {
      name: '味噌三文鱼', storage: 'fridge', reheat: 'microwave', tags: ['含鱼', '含味噌'],
      parts: [
        { ingredient: 'salmon', grams: 120, role: 'protein' },
        { ingredient: 'miso', grams: 10, role: 'seasoning' },
        { ingredient: 'sugar', grams: 3, role: 'seasoning' },
        { ingredient: 'oil', grams: 2, role: 'fat' }
      ],
      kidNote: '味噌减量，仔细检查鱼刺。',
      softNote: '鱼肉拆碎，味噌减量。',
      steps: [
        '味噌与糖调匀，抹在鱼排上腌 15–20 分钟。',
        '擦去多余酱料，200°C 烤 12–15 分钟，中心 63°C；或平底锅煎熟。',
        '复热到 74°C；鱼刺在分装前检查。'
      ]
    },
    garlic_shrimp: {
      name: '蒜香虾仁', storage: 'fridge', reheat: 'microwave', tags: ['含虾'],
      parts: [
        { ingredient: 'shrimp', grams: 120, role: 'protein' },
        { ingredient: 'garlic', grams: 5, role: 'flavor' },
        { ingredient: 'oil', grams: 6, role: 'fat' }
      ],
      kidNote: '虾仁切小段；确认完全变色。',
      softNote: '虾仁切小段，炒到全熟。',
      steps: [
        '虾仁解冻后擦干；蒜切末。',
        '热锅下油与蒜末，虾仁大火快炒到完全不透明（中心 74°C）。',
        '不要久炒；分装冷却后冷藏，复热到 74°C。'
      ]
    },
    tofu_edamame: {
      name: '豆腐毛豆炒蛋', storage: 'fridge', reheat: 'microwave', tags: ['豆制品'],
      parts: [
        { ingredient: 'tofu_firm', grams: 150, role: 'protein' },
        { ingredient: 'edamame', grams: 60, role: 'protein' },
        { ingredient: 'egg', grams: 50, role: 'protein' },
        { ingredient: 'soy_sauce', grams: 5, role: 'seasoning' },
        { ingredient: 'oil', grams: 5, role: 'fat' }
      ],
      kidNote: '毛豆切碎，豆腐压碎；鸡蛋完全炒熟。',
      softNote: '豆腐压碎、毛豆切碎，炒得更软。',
      steps: [
        '豆腐压碎，毛豆煮熟；鸡蛋打散。',
        '锅中下油，先炒蛋至凝固，加入豆腐与毛豆翻炒。',
        '少量酱油调味；分装冷却后冷藏或冷冻，复热到 74°C。'
      ]
    },
    rotisserie_chicken: {
      name: '现成烤鸡', storage: 'fridge', reheat: 'microwave', tags: ['省事', '钠看标签'],
      parts: [{ ingredient: 'rotisserie_chicken', grams: 100, role: 'protein' }],
      kidNote: '去皮、去骨，切小块；现成烤鸡是否偏咸取决于调味，去皮可减少一部分。',
      steps: [
        '购买当天去骨去皮，按份分装；不要在室温久放。',
        '复热到中心 74°C；表皮不耐微波，可改用烤箱 160°C 加热。',
        '调味料可能含大豆、小麦，过敏者先确认配料表。'
      ]
    },
    tomato_tofu: {
      name: '番茄肉末豆腐', storage: 'fridge', reheat: 'microwave', tags: ['家常', '低盐友好'],
      parts: [
        { ingredient: 'tofu_firm', grams: 150, role: 'protein' },
        { ingredient: 'tomato', grams: 150, role: 'veg' },
        { ingredient: 'oil', grams: 4, role: 'fat' }
      ],
      kidNote: '番茄煮软，豆腐切小块。',
      softNote: '煮到豆腐入味、番茄软烂。',
      steps: [
        '豆腐切块，番茄切块。',
        '少油炒番茄到出汁，加入豆腐小火煮 5–8 分钟。',
        '不加酱油也很鲜；分装冷却后冷藏，复热到 74°C。'
      ]
    },
    rice_bowl: {
      name: '米饭', storage: 'freeze', reheat: 'microwave', tags: ['主食'],
      parts: [{ ingredient: 'rice_cooked', grams: 150, role: 'rice' }],
      kidNote: '儿童份量按系数减少；可做成小饭团方便入口。',
      steps: [
        '晚餐用米饭按份分装，趁热分盒并尽快冷却。',
        '冷藏不超过 24 小时；跨天份量在制作当天直接冷冻。',
        '复热到中心 74°C，微波后翻拌再补热。'
      ]
    },
    broccoli_carrot: {
      name: '西兰花胡萝卜', storage: 'fridge', reheat: 'microwave', tags: ['蔬菜'],
      parts: [
        { ingredient: 'broccoli', grams: 80, role: 'veg' },
        { ingredient: 'carrot', grams: 50, role: 'veg' },
        { ingredient: 'oil', grams: 3, role: 'fat' }
      ],
      kidNote: '切小朵煮软，胡萝卜切薄片。',
      softNote: '多蒸 2–3 分钟至软烂，切小块。',
      steps: [
        '西兰花切小朵、胡萝卜切片，沸水焯 1–2 分钟或蒸 4–5 分钟。',
        '沥干后拌少量油；不要长时间闷在锅里。',
        '分装冷藏，复热到热透；蔬菜复热后口感会变软。'
      ]
    },
    mushroom_pepper: {
      name: '蘑菇彩椒', storage: 'fridge', reheat: 'microwave', tags: ['蔬菜'],
      parts: [
        { ingredient: 'mushroom', grams: 50, role: 'veg' },
        { ingredient: 'pepper_red', grams: 50, role: 'veg' },
        { ingredient: 'oil', grams: 3, role: 'fat' }
      ],
      kidNote: '彩椒切小丁，蘑菇切薄片炒软。',
      softNote: '蘑菇和彩椒都炒软，切小丁。',
      steps: [
        '蘑菇切片、彩椒切条。',
        '热锅少油，先炒蘑菇到出水，再加彩椒快炒。',
        '分装冷藏，复热到热透。'
      ]
    },
    broccoli_plain: {
      name: '西兰花', storage: 'fridge', reheat: 'microwave', tags: ['蔬菜'],
      parts: [
        { ingredient: 'broccoli', grams: 100, role: 'veg' },
        { ingredient: 'oil', grams: 2, role: 'fat' }
      ],
      kidNote: '切小朵蒸软。',
      softNote: '蒸到软烂。',
      steps: [
        '西兰花切小朵，蒸 4–5 分钟或焯 1–2 分钟。',
        '拌少量油；分装冷藏，复热到热透。'
      ]
    }
  },

  /* =========================================================
     一餐的组成
     ========================================================= */
  meals: {
    bf1: { type: 'breakfast', name: '鸡蛋芝麻饭团＋牛奶＋香蕉', items: [{ dish: 'onigiri_egg' }, { dish: 'milk_glass' }, { dish: 'banana' }] },
    bf2: { type: 'breakfast', name: '蒸红薯＋水煮蛋＋酸奶＋苹果', items: [{ dish: 'sweet_potato' }, { dish: 'boiled_egg' }, { dish: 'yogurt_bowl' }, { dish: 'apple' }] },
    bf3: { type: 'breakfast', name: '鸡肉玉米饭团＋酸奶＋苹果', items: [{ dish: 'onigiri_chicken' }, { dish: 'yogurt_bowl' }, { dish: 'apple' }] },
    bf4: { type: 'breakfast', name: '水煮玉米＋水煮蛋＋酸奶＋橙子', items: [{ dish: 'corn_cob' }, { dish: 'boiled_egg' }, { dish: 'yogurt_bowl' }, { dish: 'orange' }] },
    bf5: { type: 'breakfast', name: '蒸红薯＋水煮蛋＋牛奶＋苹果', items: [{ dish: 'sweet_potato' }, { dish: 'boiled_egg' }, { dish: 'milk_glass' }, { dish: 'apple' }] },
    bf6: { type: 'breakfast', name: '燕麦牛奶＋水煮蛋＋香蕉', items: [{ dish: 'oat_milk' }, { dish: 'boiled_egg' }, { dish: 'banana' }] },
    bf7: { type: 'breakfast', name: '燕麦酸奶杯＋水煮蛋＋苹果', items: [{ dish: 'oat_yogurt' }, { dish: 'boiled_egg' }, { dish: 'apple' }] },
    bf8: { type: 'breakfast', name: '三文鱼饭团＋牛奶＋苹果', items: [{ dish: 'onigiri_salmon' }, { dish: 'milk_glass' }, { dish: 'apple' }] },
    bf9: { type: 'breakfast', name: '豆腐毛豆饭团＋酸奶＋橙子', items: [{ dish: 'onigiri_tofu' }, { dish: 'yogurt_bowl' }, { dish: 'orange' }] },
    bf10: { type: 'breakfast', name: '燕麦香蕉粥＋南瓜籽', items: [{ dish: 'oat_banana_water' }] },

    dn1: { type: 'dinner', name: '照烧鸡腿＋米饭＋西兰花胡萝卜', items: [{ dish: 'teriyaki_chicken' }, { dish: 'rice_bowl' }, { dish: 'broccoli_carrot' }] },
    dn2: { type: 'dinner', name: '番茄牛肉＋米饭＋蘑菇彩椒', items: [{ dish: 'tomato_beef' }, { dish: 'rice_bowl' }, { dish: 'mushroom_pepper' }] },
    dn3: { type: 'dinner', name: '味噌三文鱼＋米饭＋西兰花', items: [{ dish: 'miso_salmon' }, { dish: 'rice_bowl' }, { dish: 'broccoli_plain' }] },
    dn4: { type: 'dinner', name: '蒜香虾仁＋米饭＋蘑菇彩椒', items: [{ dish: 'garlic_shrimp' }, { dish: 'rice_bowl' }, { dish: 'mushroom_pepper' }] },
    dn5: { type: 'dinner', name: '豆腐毛豆炒蛋＋米饭＋西兰花胡萝卜', items: [{ dish: 'tofu_edamame' }, { dish: 'rice_bowl' }, { dish: 'broccoli_carrot' }] },
    dn6: { type: 'dinner', name: '现成烤鸡＋米饭＋西兰花胡萝卜', items: [{ dish: 'rotisserie_chicken' }, { dish: 'rice_bowl' }, { dish: 'broccoli_carrot' }] },
    dn7: { type: 'dinner', name: '番茄肉末豆腐＋米饭＋蘑菇彩椒', items: [{ dish: 'tomato_tofu' }, { dish: 'rice_bowl' }, { dish: 'mushroom_pepper' }] }
  },

  plans: {
    frozen: {
      label: '超市冷冻早餐（蒸锅）',
      breakfast: ['bf_frozen_millet','bf_frozen_buns','bf_frozen_dumplings','bf_frozen_millet','bf_frozen_buns'],
      note: '选包装支持蒸制的小米糕、小笼包与饺子，搭配奶和水果。'
    },
    classic: {
      label: '经典＋日式饭团',
      breakfast: ['bf1', 'bf2', 'bf3', 'bf4', 'bf5'],
      note: '两天饭团、两天蒸煮主食，保留变化。'
    },
    onigiri: {
      label: '饭团优先',
      breakfast: ['bf1', 'bf3', 'bf8', 'bf9', 'bf1'],
      note: '饭团轮换鸡蛋、鸡肉、三文鱼和豆腐馅。'
    },
    oat: {
      label: '燕麦优先',
      breakfast: ['bf6', 'bf7', 'bf6', 'bf7', 'bf6'],
      note: '燕麦与牛奶或酸奶组合，减少饭团制作。'
    }
  },

  rotations: {
    balanced: { label: '均衡轮换', meals: ['dn1', 'dn2', 'dn3', 'dn4', 'dn5'], note: '鸡、牛、鱼、虾、豆腐轮换，按天数循环。' },
    fish: { label: '多鱼', meals: ['dn1', 'dn3', 'dn2', 'dn3', 'dn5'], note: '三文鱼为主，注意鱼刺与过敏。' },
    soy: { label: '多豆制品', meals: ['dn5', 'dn2', 'dn7', 'dn3', 'dn5'], note: '豆腐与毛豆为主，蛋白质来源更植物化。' },
    meat: { label: '鸡牛为主', meals: ['dn1', 'dn2', 'dn1', 'dn5', 'dn2'], note: '减少鱼虾，搭配一次豆腐；蔬菜仍需保留。' }
  },

  /* ---------- 整周预设：只提供数据，切换时由界面合并家庭设置与工具开关 ---------- */
  /* 餐次开关与午餐模式：早餐/午餐/晚餐可独立选择 */
  mealSlots: [
    { id: 'breakfast', label: '早餐', note: '饭团、蒸煮主食或燕麦；可在周末预制。' },
    { id: 'lunch', label: '午餐', note: '可选带饭（复用晚餐多做一份）或现做。' },
    { id: 'dinner', label: '晚餐', note: '主菜、米饭和蔬菜；带饭模式下会多做一份午餐。' }
  ],
  lunchModes: [
    {
      id: 'packed', label: '带饭，不额外开火',
      note: '午餐复用当天晚餐同款，多做一份、装便当；采购增加一份，时间线只加装盒，不增加锅次。'
    },
    {
      id: 'cook', label: '午餐现做，单独开火',
      note: '午餐从晚餐菜库里独立选一道，采购和时间线都按单独一餐计算；适合有时间或不想连吃两顿同款。'
    }
  ],

  weekPresets: [
    {
      id: 'onigiri',
      label: '日式饭团',
      note: '适合想换口味、愿意周末集中煮饭捏饭团的一周：早餐全部是饭团，晚餐走均衡轮换（鸡、牛、鱼、虾、豆腐）。需要电饭煲和炉灶；切换预设不会自动打开工具开关（需要烤箱/高压锅/微波炉等工具时，仍以工具设置里的开关为准）。',
      requiresTools: ['riceCooker', 'stove'],
      settings: { style: 'onigiri', rotation: 'balanced', shortcut: false, riceType: 'white', riceAddIn: 'none' }
    },
    {
      id: 'stew',
      label: '家常炖菜',
      note: '适合周末有时间慢炖、想多做汤块的一周：五个晚餐都是炖菜，肉和汤分开保存，工作日复热即可。需要炉灶，有高压锅可把炖煮时间缩到 30–40 分钟，没有就用普通锅炖 60–90 分钟；切换预设不会自动打开工具开关（需要烤箱/高压锅/微波炉等工具时，仍以工具设置里的开关为准）。',
      requiresTools: ['stove'],
      settings: { style: 'classic', rotation: 'stew', shortcut: false, riceType: 'white', riceAddIn: 'none' }
    },
    {
      id: 'quick-roast',
      label: '快手烤鸡',
      note: '适合工作日时间紧、想少开火的一周：用现成烤鸡替换照烧鸡腿，晚餐米饭换成叮叮饭；买烤鸡时按包装确认调味料。需要微波炉热叮叮饭；切换预设不会自动打开工具开关（需要烤箱/高压锅/微波炉等工具时，仍以工具设置里的开关为准）。',
      requiresTools: ['riceCooker', 'stove', 'microwave'],
      settings: { style: 'classic', rotation: 'meat', shortcut: true, riceType: 'instant', riceAddIn: 'none' }
    }
  ],

  /* 超市冷冻便利菜：只作为可选采购项，不计入菜单营养和已买进度 */
  optionalShopping: [
    {
      id: 'frozen_peas', label: '速冻甜豌豆', amount: '约 300 g / 袋',
      channels: '盒马、朴朴、山姆等冷冻柜常见',
      note: '不用解冻，微波 2–3 分钟或沸水焯 2 分钟；可当工作日的现成蔬菜。不计入菜单营养。'
    },
    {
      id: 'frozen_corn_shoots', label: '冷冻甜玉米笋', amount: '约 300 g / 袋',
      channels: '盒马、朴朴、山姆等冷冻柜常见',
      note: '直接焯水或微波，适合配炖菜汤块和面；不计入菜单营养。'
    },
    {
      id: 'frozen_spinach', label: '冷冻菠菜（分份）', amount: '约 200–300 g / 袋',
      channels: '盒马、朴朴、山姆等冷冻柜常见',
      note: '工作日省事替补：复热后口感偏软，适合配汤面；不计入菜单营养。'
    }
  ],

  reference: {
    adult: {
      label: '成人（19–50 岁）',
      energyNote: '成人全天参考能量大致在 1,600–3,000 kcal，取决于性别、体型和活动量；本页只算已选餐次（早餐、午餐和/或晚餐），加餐和饮料未计入，因此不设能量达成率。',
      protein: [46, 56],
      calcium: [1000, 1000],
      iron: [8, 18],
      fiber: [25, 38],
      sodiumMax: 2300
    },
    '4-6': {
      label: '4–6 岁儿童',
      energyNote: '儿童全天能量需求随年龄和活动量变化很大，本页不设能量目标，只展示两餐合计。',
      protein: [19, 19],
      calcium: [1000, 1000],
      iron: [10, 10],
      sodiumMax: null
    },
    '7-10': {
      label: '7–10 岁儿童（跨 4–8 与 9–13 岁参考）',
      energyNote: '儿童全天能量需求随年龄和活动量变化很大，本页不设能量目标，只展示两餐合计。',
      protein: [19, 34],
      calcium: [1000, 1300],
      iron: [8, 10],
      sodiumMax: null
    },
    '11-13': {
      label: '11–13 岁儿童',
      energyNote: '青春期前后能量与铁需求上升；本页只展示两餐合计，不能判断全天是否充足。',
      protein: [34, 34],
      calcium: [1300, 1300],
      iron: [8, 8],
      sodiumMax: null
    }
  },

  safety: {
    cooling: [
      '熟食分浅盒，尽快冷却后冷藏（≤4°C）或冷冻（≤−18°C）；不要让熟食在室温长时间停留。室温超过 2 小时（高温环境超过 1 小时）的易腐食物应丢弃。',
      '米饭和饭团按更严格规则：理想情况下 1 小时内快速冷却；冷藏不超过 24 小时；跨天备餐在制作当天直接冷冻。',
      '米饭不要留在电饭煲或锅里自然冷却，也不要反复加热同一份。',
      '前 1–2 天的一般熟食可冷藏，后几天在制作当天冷冻；冷藏熟食通常 3–4 天内食用，但不适用于米饭或饭团。',
      '冷冻前标注日期与内容，优先按“先做先吃”取用。'
    ],
    reheating: [
      '微波炉中途翻动或搅拌，蒸锅把厚块拆小，复热后确认中心达到 74°C。',
      '设备功率、份量与初温不同，不要依赖固定分钟数；分钟数只是起点。',
      '复热后静置 1–2 分钟再测温，避免局部过热烫伤儿童。',
      '只复热要吃的份量，不要整盒反复加热。'
    ],
    fresh: [
      '海苔、水果和适合生食的蔬菜在食用当天加入，避免受潮与口感变差。',
      '儿童餐检查局部过热，去除骨头、鱼刺与整粒呛咳风险食材。',
      '生肉与即食食物分开处理；饭团用保鲜膜、模具或洁净手套成型，避免徒手接触熟饭。',
      '现成烤鸡、酱油、味噌、海苔的钠含量差异大，包装标签优先于本页估算。'
    ],
    allergies: [
      '本页按菜品配料标注可能含有的主要过敏原，但无法覆盖所有品牌与交叉污染。',
      '酱油通常含小麦与大豆；麦味噌也可能含小麦；普通燕麦可能含小麦交叉污染；现成烤鸡调味料常含大豆或小麦。',
      '排除过敏原后，页面会自动换菜并在菜单上说明；若提示“无可用替换”，请手动调整，不要直接照做。',
      '严重过敏或乳糜泻需要专门评估，本页不能替代专业建议。'
    ]
  },

  tips: {
    salt: [
      '用低钠酱油替代普通酱油，钠约降到 65%；味噌改用低盐味噌，钠约降到 60%。',
      '照烧汁、味噌腌料减半，用番茄、洋葱、香菇、蒜和醋补风味。',
      '现成烤鸡是否更咸取决于调味与是否去皮；本页数据按烤鸡胸肉估计，低于含 10 g 酱油的照烧鸡。若包装标签更高，减盐时改用自制鸡腿并减少酱油。',
      '海苔、酱油、味噌的钠以包装标签为准；本页按数据库平均值估算。'
    ],
    texture: [
      '饭团做小一号，海苔剪成小片或省略；3 岁以下不做整颗饭团。',
      '蔬菜多蒸 2–3 分钟至软烂，切小丁；玉米、毛豆切碎压碎。',
      '鸡肉撕丝、牛肉末炒散、鱼肉拆碎并检查鱼刺。',
      '复热后试温再给孩子，避免局部过热。'
    ],
    storage: [
      '饭团单个包保鲜膜，尽量排出空气，标注日期后冷冻。',
      '冷冻饭团食用前一晚移到冷藏解冻，或直接用微波的解冻档；不要室温解冻。',
      '海苔食用前再包，避免冷冻后受潮变韧。',
      '蔬菜冷冻后口感会变软，优先安排在前 1–2 天冷藏，或接受口感变化。'
    ],
    planning: [
      '把需要长时间加热的鸡腿、牛肉和米饭安排在周末同一时段，利用电饭煲、烤箱和炉灶并行。',
      '先煮饭团用米饭，因为它需要冷却和成型；晚餐用米饭可以后煮或同锅分两批。',
      '菜单允许重复：重复的菜更省时间，也更容易让孩子接受。',
      '每周只改 1–2 个变量（如换一种鱼或加一道豆制品），比整周重做更容易坚持。'
    ]
  },

  reheatTiers: {
    microwave: [
      { label: '小份', amount: '≤150 g', start: '1 分钟起步', detail: '翻动或搅拌，再补 30–60 秒；汤类中途取出搅匀。' },
      { label: '中份', amount: '150–300 g', start: '2 分钟起步', detail: '中途翻动一次，再补 1 分钟；厚块拆小或摊平。' },
      { label: '大份', amount: '>300 g', start: '分两次加热', detail: '分成两盒或摊成薄层，避免外层过热、中心仍凉。' }
    ],
    steam: [
      { label: '小份', amount: '≤150 g', start: '水沸后 5–6 分钟', detail: '盖盖蒸，厚块先切开；确认中心 74°C。' },
      { label: '中份', amount: '150–300 g', start: '水沸后 8–10 分钟', detail: '平铺不叠放，中途翻面一次。' },
      { label: '大份', amount: '>300 g', start: '拆小后 10–12 分钟', detail: '大块先拆成小块，避免外熟内生。' }
    ],
    onigiri: [
      { label: '冷藏饭团', amount: '1–2 个', start: '中火 1 分钟', detail: '表面洒少量水或盖湿厨房纸，翻面再 30–60 秒。' },
      { label: '冷冻饭团', amount: '1–2 个', start: '解冻后再加热', detail: '先用解冻档或冷藏解冻，再加热到中心 74°C；不要直接高火硬烤。' },
      { label: '儿童份', amount: '半个–1 个', start: '中火 40–60 秒', detail: '切开检查中心温度，放凉到适口再给。' }
    ]
  },

  sources: [
    { title: 'USDA FoodData Central（SR Legacy 数据集）', url: 'https://fdc.nal.usda.gov/', note: '逐食材每 100 g 营养值；每个食材条目附 fdcId。' },
    { title: '日本食品标准成分表 2020 年版（八订）1126 あまのり 焼きのり', url: 'https://fooddb.mext.go.jp/', note: '烤海苔每 100 g 数据；日本文部科学省食品成分数据库。' },
    { title: '英国食品标准局：米饭安全（中文 PDF）', url: 'https://www.food.gov.uk/sites/default/files/media/document/sfbb-chinese-05-cooking-04-rice_0.pdf', note: '熟饭尽快冷却，理想 1 小时内；冷藏饭 24 小时内食用。' },
    { title: '日本农林水产省：饭团与食物中毒预防', url: 'https://www.maff.go.jp/j/syouan/saigai/syokutyuudoku.html', note: '避免徒手接触饭团，注意清洁与及时食用。' },
    { title: '日本农林水产省：便当制作的食品安全', url: 'https://www.maff.go.jp/j/syouan/seisaku/foodpoisoning/lunchbox.html', note: '充分加热、降温、洁净容器和低温保存。' },
    { title: 'USDA FSIS：熟食保存', url: 'https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely', note: '冷藏熟食 3–4 天；室温超过 2 小时丢弃。' },
    { title: 'USDA FSIS：安全复热', url: 'https://ask.fsis.usda.gov/article/What-methods-of-reheating-food-are-safe', note: '剩食复热到 165°F / 74°C。' },
    { title: 'FoodSafety.gov：最低安全中心温度', url: 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures', note: '禽肉 74°C；鱼类 63°C。' },
    { title: '美国膳食指南 2020–2025', url: 'https://www.dietaryguidelines.gov/', note: '钠每日低于 2,300 mg 的通用建议。' },
    { title: 'NIH ODS：钙', url: 'https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/', note: '儿童与成人钙推荐摄入量。' },
    { title: 'NIH ODS：铁', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/', note: '儿童与成人铁推荐摄入量。' },
    { title: 'NASEM DRI：蛋白质', url: 'https://www.ncbi.nlm.nih.gov/books/NBK56068/', note: '蛋白质推荐摄入量按年龄与性别。' },
    { title: 'USDA MyPlate：4–8 岁儿童示例计划', url: 'https://www.myplate.gov/', note: '水果、蔬菜、谷物、蛋白质、奶类或强化豆乳的多样性。' }
  ]
};

/* =========================================================
   工具、容器、腌制与新增蔬菜菜品
   这部分放在初始化之后，便于在不打散原有菜单的情况下扩展。
   ========================================================= */
(function (D) {
  D.equipment = [
    { id: 'stove', name: '炉灶 / 炒锅', role: '煎、炒、焯、煮', note: '大多数热菜都依赖它。', alternative: '如果没有炉灶，热菜很难按计划完成；至少保留炉灶或烤箱。' },
    { id: 'riceCooker', name: '电饭煲', role: '煮饭', note: '没有时用厚底锅在炉灶煮饭。', alternative: '用厚底锅在炉灶煮饭，煮开后小火焖 10 分钟，时间更长。' },
    { id: 'oven', name: '烤箱', role: '烤三文鱼、烤蔬菜', note: '没有时三文鱼改用平底锅煎。', alternative: '三文鱼改平底锅煎，蔬菜改炉灶炒或焯。' },
    { id: 'microwave', name: '微波炉', role: '复热', note: '复热主力。', alternative: '用蒸锅或锅隔水加热，时间更长；必须测温到 74°C。' },
    { id: 'steamer', name: '蒸锅', role: '蒸红薯、复热', note: '蒸红薯和部分复热。', alternative: '用微波或锅加蒸架替代。' }
  ];

  D.containers = {
    box1L: {
      id: 'box1L', name: '玻璃保鲜盒 1 L', short: '1 L 盒', capacity: '1 L',
      suitable: ['fridge', 'freeze'], capacityServings: 2, note: '装米饭加主菜或整份晚餐；按约 2 成人份估算，冷冻留 1–2 cm。'
    },
    box500: {
      id: 'box500', name: '玻璃保鲜盒 500 ml', short: '500 ml 盒', capacity: '500 ml',
      suitable: ['fridge', 'freeze'], capacityServings: 1, note: '蔬菜、小份主菜或儿童份；按约 1 成人份估算。'
    },
    wrap: {
      id: 'wrap', name: '保鲜膜', short: '保鲜膜', capacity: '单个饭团',
      suitable: ['freeze'], note: '单个饭团包紧并排出空气；也可以再用冷冻袋集中装。'
    },
    bag: {
      id: 'bag', name: '冷冻密封袋 1 L', short: '冷冻袋', capacity: '1 L',
      suitable: ['freeze'], capacityServings: 2, note: '扁平冷冻省空间；按约 2 成人份估算；袋装不能直接微波。'
    },
    jar: {
      id: 'jar', name: '玻璃罐 500 ml', short: '玻璃罐', capacity: '500 ml',
      suitable: ['fridge'], note: '装酱汁、腌料或汤；不适合冷冻到满。'
    }
  };

  D.containerPrefs = [
    { id: 'mixed', label: '混合', note: '冷藏用玻璃盒，冷冻用袋或盒；最通用。' },
    { id: 'glass', label: '全玻璃盒', note: '可直接微波，但重、占空间。' },
    { id: 'bag', label: '冷冻袋优先', note: '省空间；袋不能直接微波。' }
  ];

  D.marinades = {
    teriyaki: {
      name: '照烧腌汁', time: '20–30 分钟',
      ingredients: '酱油 10 g、糖 5 g',
      note: '可冷藏腌一晚；腌汁不要重复使用，留一部分最后收汁更安全。'
    },
    miso: {
      name: '味噌腌料', time: '20–30 分钟',
      ingredients: '味噌 10 g、糖 3 g',
      note: '烤前擦去多余酱料，避免焦；味噌可能含小麦。'
    },
    garlic_shrimp: {
      name: '蒜香虾仁腌料', time: '10 分钟',
      ingredients: '蒜末 5 g、油 3 g',
      note: '不超过 30 分钟，避免蒜味过重；虾仁要擦干再腌。'
    },
    pepper_chicken: {
      name: '鸡片腌料', time: '15 分钟',
      ingredients: '酱油 8 g、糖 3 g、油 2 g',
      note: '抓匀冷藏；炒前回温几分钟，避免下锅出水。'
    }
  };

  D.ingredients.butter = {
    name: '有盐黄油', group: '奶类', state: '冷藏', allergens: ['milk'],
    per100: { kcal: 717, protein: 0.85, fat: 81.11, carb: 0.06, fiber: 0, calcium: 24, iron: 0.02, sodium: 643 },
    purchase: { mode: 'weight', packKg: 0.2, packLabel: '200 g 块' },
    purchaseNote: '有盐黄油；每 100 g 含钠约 643 mg，实际每次用量很小。',
    source: { fdcId: 173410, desc: 'Butter, salted', type: 'SR Legacy' }
  };

  D.ingredients.pepper_red.highlight = '维生素 C 来源';
  D.ingredients.mushroom.highlight = '膳食纤维来源';
  D.ingredients.broccoli.highlight = '维生素 C 与纤维';
  D.ingredients.butter.highlight = '少量增香，注意钠与脂肪';

  D.dishes.pepper_chicken = {
    name: '彩椒鸡片', storage: 'fridge', reheat: 'microwave', tags: ['快炒', '彩椒'],
    marinade: 'pepper_chicken',
    parts: [
      { ingredient: 'chicken_thigh', grams: 120, role: 'protein', note: '切薄片后腌 15 分钟' },
      { ingredient: 'pepper_red', grams: 100, role: 'veg' },
      { ingredient: 'soy_sauce', grams: 8, role: 'seasoning' },
      { ingredient: 'sugar', grams: 3, role: 'seasoning' },
      { ingredient: 'oil', grams: 4, role: 'fat' }
    ],
    kidNote: '彩椒切小丁、鸡片切小；不辣，适合儿童。',
    softNote: '彩椒多炒 1–2 分钟至软，鸡片切小。',
    steps: [
      '鸡腿肉切薄片，用酱油、糖和一半的油抓匀，冷藏腌 15 分钟。',
      '彩椒去籽切块；热锅下余油，鸡片滑炒到变色后盛出。',
      '原锅炒彩椒到断生，回锅鸡片，收汁到鸡肉中心 74°C。',
      '分装冷藏或冷冻；复热到中心 74°C，彩椒不要久煮。'
    ]
  };

  D.dishes.bell_pepper_side = {
    name: '清炒彩椒', storage: 'fridge', reheat: 'microwave', tags: ['维生素 C', '快炒'],
    parts: [
      { ingredient: 'pepper_red', grams: 100, role: 'veg' },
      { ingredient: 'oil', grams: 3, role: 'fat' }
    ],
    kidNote: '彩椒切小丁炒软；不辣。',
    softNote: '多炒 1–2 分钟至软，切小丁。',
    steps: [
      '彩椒去籽切块或小丁。',
      '热锅少油，中大火快炒 1–2 分钟到断生；不要久焖，减少维生素 C 损失。',
      '分装冷藏，复热到热透；复热后口感会变软。'
    ]
  };

  D.dishes.miso_butter_mushroom = {
    name: '味噌黄油炒菇', storage: 'fridge', reheat: 'microwave', tags: ['高纤维', '味噌黄油'],
    parts: [
      { ingredient: 'mushroom', grams: 120, role: 'veg' },
      { ingredient: 'butter', grams: 8, role: 'fat' },
      { ingredient: 'miso', grams: 8, role: 'seasoning' }
    ],
    kidNote: '味噌减量；黄油香气足，但钠和脂肪较高，少量即可。',
    softNote: '菇切薄片炒软，味噌减量。',
    steps: [
      '蘑菇切片，不要水洗太久；用湿布擦净或快速冲洗后擦干。',
      '锅中放黄油，中火把蘑菇炒到出水再收干、边缘微黄。',
      '关火或离火后再拌入味噌，避免味噌久煮和糊底。',
      '分装冷藏，2–3 天内吃完；复热到热透，黄油酱拌匀。'
    ]
  };

  D.meals.dn8 = {
    type: 'dinner', name: '彩椒鸡片＋米饭＋味噌黄油菇',
    items: [{ dish: 'pepper_chicken' }, { dish: 'rice_bowl' }, { dish: 'miso_butter_mushroom' }]
  };
  D.meals.dn9 = {
    type: 'dinner', name: '番茄牛肉＋米饭＋清炒彩椒',
    items: [{ dish: 'tomato_beef' }, { dish: 'rice_bowl' }, { dish: 'bell_pepper_side' }]
  };
  D.meals.dn10 = {
    type: 'dinner', name: '照烧鸡腿＋米饭＋味噌黄油菇',
    items: [{ dish: 'teriyaki_chicken' }, { dish: 'rice_bowl' }, { dish: 'miso_butter_mushroom' }]
  };

  D.rotations.veg = {
    label: '多蔬菜', meals: ['dn9', 'dn8', 'dn3', 'dn5', 'dn2'],
    note: '彩椒和菇类轮换，维生素 C 与膳食纤维更充足。'
  };
  D.rotations.mushroom = {
    label: '多菇类', meals: ['dn8', 'dn10', 'dn2', 'dn5', 'dn9'],
    note: '味噌黄油菇与蘑菇彩椒轮换；黄油有盐，注意总钠。'
  };

  D.tips.vegetables = [
    '彩椒是维生素 C 的好来源，快炒到断生即可，不要久焖；红彩椒比青椒更甜，也更容易被儿童接受。',
    '菇类提供膳食纤维和鲜味，味噌黄油只需少量就能增香；味噌离火后再拌，避免糊底。',
    '蔬菜不要全部水煮：一部分快炒、一部分蒸，口感和营养素保存都更好。',
    '本页只按数据库估算膳食纤维，没有逐项计算维生素 C；彩椒和西兰花作为来源提示，不宣称具体毫克数。'
  ];

  /* ---------- 为所有菜品补齐工具、容器、腌制信息 ---------- */
  var equipmentMap = {
    onigiri_egg: ['riceCooker', 'stove'], onigiri_chicken: ['riceCooker', 'stove'],
    onigiri_salmon: ['riceCooker', 'stove'], onigiri_tofu: ['riceCooker', 'stove'],
    milk_glass: [], yogurt_bowl: [], banana: [], apple: [], orange: [], oat_yogurt: [],
    sweet_potato: ['stove', 'steamer'], corn_cob: ['stove', 'steamer'], boiled_egg: ['stove'],
    oat_milk: ['stove'], oat_banana_water: ['stove'],
    teriyaki_chicken: ['stove'], tomato_beef: ['stove'], miso_salmon: ['oven', 'stove'],
    garlic_shrimp: ['stove'], tofu_edamame: ['stove'], rotisserie_chicken: [],
    tomato_tofu: ['stove'], rice_bowl: ['riceCooker'],
    broccoli_carrot: ['stove', 'steamer'], mushroom_pepper: ['stove'], broccoli_plain: ['stove', 'steamer'],
    pepper_chicken: ['stove'], bell_pepper_side: ['stove'], miso_butter_mushroom: ['stove']
  };
  var containerMap = {
    onigiri_egg: 'wrap', onigiri_chicken: 'wrap', onigiri_salmon: 'wrap', onigiri_tofu: 'wrap',
    milk_glass: null, yogurt_bowl: null, banana: null, apple: null, orange: null, oat_yogurt: null,
    sweet_potato: 'box500', corn_cob: 'box500', boiled_egg: 'box500',
    oat_milk: 'box500', oat_banana_water: 'box500',
    teriyaki_chicken: 'box1L', tomato_beef: 'box1L', miso_salmon: 'box1L',
    garlic_shrimp: 'box1L', tofu_edamame: 'box1L', rotisserie_chicken: 'box1L',
    tomato_tofu: 'box1L', rice_bowl: 'box1L',
    broccoli_carrot: 'box500', mushroom_pepper: 'box500', broccoli_plain: 'box500',
    pepper_chicken: 'box1L', bell_pepper_side: 'box500', miso_butter_mushroom: 'box500'
  };

  Object.keys(D.dishes).forEach(function (id) {
    var dish = D.dishes[id];
    if (!dish.equipment) dish.equipment = equipmentMap[id] || [];
    if (!dish.container) dish.container = containerMap[id] || null;
  });

  D.dishes.teriyaki_chicken.marinade = 'teriyaki';
  D.dishes.miso_salmon.marinade = 'miso';
  D.dishes.garlic_shrimp.marinade = 'garlic_shrimp';
  D.dishes.pepper_chicken.marinade = 'pepper_chicken';

  D.sources.push({
    title: 'USDA FoodData Central：黄油（有盐）',
    url: 'https://fdc.nal.usda.gov/food-details/173410/nutrients',
    note: '味噌黄油炒菇的黄油数据；每 100 g 含钠约 643 mg。'
  });
})(window.MEALPREP);

/* =========================================================
   米饭方案、炖菜、汤块、面条与味噌牛肉
   新增食材尽量使用 USDA 条目；无法对应的（叮叮饭、杂粮饭、奶白菜等）用近似值并在来源中标“估算”。
   ========================================================= */
(function (D) {
  D.riceCupGrams = 150; // 1 杯生米约 150 g（180 ml 电饭煲杯）
  D.riceTypes = [
    { id: 'white', label: '白米饭（自煮）', note: '周末煮好分装冷冻。' },
    { id: 'mixed', label: '杂粮饭（自煮）', note: '按杂粮饭熟重近似；采购按生杂粮折算。' },
    { id: 'instant', label: '叮叮饭（微波米饭）', note: '买现成微波米饭，省去煮饭与冷冻。' }
  ];

  D.riceAddIns = [
    { id: 'none', label: '不加', ingredient: null, grams: 0, note: '' },
    { id: 'carrot', label: '胡萝卜块', ingredient: 'carrot', grams: 50, note: '切大块和米饭同煮，取出配饭。' },
    { id: 'sweetPotato', label: '红薯块', ingredient: 'sweet_potato', grams: 80, note: '切大块同煮，增加甜味和纤维。' },
    { id: 'corn', label: '玉米段', ingredient: 'corn', grams: 50, note: '切段同煮，儿童容易接受。' },
    { id: 'coarseGrain', label: '粗粮（燕麦米/糙米）', ingredient: 'coarse_grain', grams: 30, note: '干重，提前浸泡 30 分钟，与白米同煮。' }
  ];

  D.ingredients.pork_ribs = {
    name: '猪排骨（可食部）', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 189, protein: 19.34, fat: 11.82, carb: 0, fiber: 0, calcium: 22, iron: 0.85, sodium: 63 },
    purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
    edibleRatio: 0.65,
    purchaseNote: '带骨排骨按可食部约 65% 折算；炖煮后去骨再分装。',
    source: { fdcId: 167895, desc: 'Pork, fresh, loin, country-style ribs, separable lean and fat, raw', type: 'SR Legacy' }
  };
  D.ingredients.beef_shank = {
    name: '牛腱子', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 128, protein: 21.75, fat: 3.85, carb: 0, fiber: 0, calcium: 20, iron: 2.32, sodium: 63 },
    purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
    purchaseNote: '牛腱适合长时间炖煮。',
    source: { fdcId: 169441, desc: 'Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, raw', type: 'SR Legacy' }
  };
  D.ingredients.beef_brisket = {
    name: '牛腩', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 253, protein: 18.42, fat: 19.06, carb: 0.56, fiber: 0, calcium: 6, iron: 1.7, sodium: 69 },
    purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
    purchaseNote: '脂肪较高，炖好后撇去浮油。',
    source: { fdcId: 168664, desc: 'Beef, brisket, whole, separable lean and fat, trimmed to 1/8" fat, all grades, raw', type: 'SR Legacy' }
  };
  D.ingredients.pork_shoulder = {
    name: '梅花肉', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 236, protein: 17.18, fat: 17.99, carb: 0, fiber: 0, calcium: 15, iron: 1.05, sodium: 65 },
    purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 装' },
    purchaseNote: '猪肩肉，炖后软嫩。',
    source: { fdcId: 167843, desc: 'Pork, fresh, shoulder, whole, separable lean and fat, raw', type: 'SR Legacy' }
  };
  D.ingredients.pork_mince = {
    name: '猪肉末', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 263, protein: 16.88, fat: 21.19, carb: 0, fiber: 0, calcium: 14, iron: 0.88, sodium: 56 },
    purchase: { mode: 'weight', packKg: 0.3, packLabel: '300 g 盒' },
    purchaseNote: '番茄肉末豆腐用少量肉末增香。',
    source: { fdcId: 167902, desc: 'Pork, fresh, ground, raw', type: 'SR Legacy' }
  };
  D.ingredients.beef_slice = {
    name: '牛肉片', group: '肉、鱼、蛋', state: '生重', allergens: [],
    per100: { kcal: 138, protein: 21.38, fat: 5.36, carb: 0, fiber: 0, calcium: 5, iron: 2, sodium: 55 },
    purchase: { mode: 'weight', packKg: 0.3, packLabel: '300 g 盒' },
    purchaseNote: '适合快炒的瘦牛肉片。',
    source: { fdcId: 172173, desc: 'Beef, loin, top sirloin cap steak, boneless, separable lean only, raw', type: 'SR Legacy' }
  };
  D.ingredients.noodles = {
    name: '鲜面条', group: '主食与谷物', state: '生重', allergens: ['wheat'],
    per100: { kcal: 138, protein: 4.54, fat: 2.07, carb: 25.16, fiber: 1.2, calcium: 12, iron: 1.47, sodium: 165 },
    purchase: { mode: 'weight', packKg: 0.3, packLabel: '300 g 袋' },
    purchaseNote: '现煮现吃，不建议冷冻；USDA 样本含添加盐，钠以包装为准。',
    source: { fdcId: 168919, desc: 'Noodles, egg, cooked, enriched, with added salt', type: 'SR Legacy' }
  };
  D.ingredients.mixed_rice = {
    name: '杂粮饭', group: '主食与谷物', state: '熟重', purchaseState: '杂粮生重', allergens: [],
    per100: { kcal: 123, protein: 2.74, fat: 0.97, carb: 25.58, fiber: 1.6, calcium: 3, iron: 0.56, sodium: 4 },
    purchase: { mode: 'weight', packKg: 1, packLabel: '1 kg 杂粮袋', cupGrams: 150 },
    rawPerCooked: 0.4,
    purchaseNote: '以糙米饭近似杂粮饭；采购按生杂粮折算。',
    source: { fdcId: 169704, desc: 'Rice, brown, long-grain, cooked', type: 'SR Legacy' }
  };
  D.ingredients.instant_rice = {
    name: '叮叮饭（微波米饭）', group: '主食与谷物', state: '熟重', allergens: [],
    per100: { kcal: 130, protein: 2.4, fat: 0.2, carb: 28.7, fiber: 0.4, calcium: 1, iron: 0.2, sodium: 2 },
    purchase: { mode: 'count', unit: '盒', unitGrams: 200, packCount: 4, packLabel: '4 盒装' },
    purchaseNote: '按 200 g/盒估算；按包装微波加热，营养按熟白米饭近似。',
    source: { name: '按熟白米饭近似（估算）', type: '估算' }
  };
  D.ingredients.coarse_grain = {
    name: '粗粮（燕麦米/糙米）', group: '主食与谷物', state: '干重', allergens: [],
    per100: { kcal: 367, protein: 7.54, fat: 3.2, carb: 76.25, fiber: 3.6, calcium: 9, iron: 1.29, sodium: 5 },
    purchase: { mode: 'weight', packKg: 0.5, packLabel: '500 g 袋' },
    purchaseNote: '干重，以糙米近似；与白米同煮前浸泡 30 分钟。',
    source: { fdcId: 169703, desc: 'Rice, brown, long-grain, raw', type: 'SR Legacy' }
  };

  /* 番茄豆腐加肉末 */
  D.dishes.tomato_tofu.parts = [
    { ingredient: 'tofu_firm', grams: 150, role: 'protein' },
    { ingredient: 'tomato', grams: 150, role: 'veg' },
    { ingredient: 'pork_mince', grams: 50, role: 'protein' },
    { ingredient: 'oil', grams: 4, role: 'fat' },
    { ingredient: 'soy_sauce', grams: 5, role: 'seasoning' }
  ];
  D.dishes.tomato_tofu.name = '番茄肉末豆腐';
  D.dishes.tomato_tofu.steps = [
    '猪肉末用少量酱油抓匀；豆腐切块，番茄切块。',
    '少油炒散肉末到变色，加入番茄炒出汁。',
    '加入豆腐小火煮 5–8 分钟，少量酱油调味。',
    '分装冷藏，复热到 74°C；汤汁要滚开。'
  ];
  D.dishes.tomato_tofu.kidNote = '肉末炒散、豆腐切小块，番茄煮软。';

  /* 味噌牛肉 */
  D.dishes.miso_beef = {
    name: '味噌牛肉彩椒', storage: 'fridge', reheat: 'microwave', tags: ['味噌', '快炒'],
    equipment: ['stove'], container: 'box1L',
    marinade: 'miso',
    parts: [
      { ingredient: 'beef_slice', grams: 130, role: 'protein', note: '逆纹切薄片' },
      { ingredient: 'pepper_red', grams: 80, role: 'veg' },
      { ingredient: 'onion', grams: 40, role: 'veg' },
      { ingredient: 'miso', grams: 10, role: 'seasoning' },
      { ingredient: 'sugar', grams: 3, role: 'seasoning' },
      { ingredient: 'oil', grams: 4, role: 'fat' }
    ],
    kidNote: '味噌减量，牛肉切小片；彩椒不辣。',
    softNote: '牛肉切小片、彩椒炒软，味噌减量。',
    steps: [
      '牛肉片逆纹切薄，味噌、糖和一半油抓匀，冷藏腌 15–20 分钟。',
      '彩椒和洋葱切块；热锅下余油，牛肉快速滑炒到变色后盛出。',
      '炒香洋葱和彩椒，回锅牛肉，收汁；牛肉中心 74°C。',
      '分装冷藏或冷冻；复热到 74°C，避免久煮变硬。'
    ]
  };

  /* 炖菜：肉 + 根茎 + 汤，汤可冻成块 */
  function stew(id, name, parts) {
    D.dishes[id] = {
      name: name, kind: 'stew', storage: 'freeze', reheat: 'microwave', tags: ['炖菜', '汤块'],
      equipment: ['stove', 'pressureCooker'], container: 'box500',
      brothMl: 250,
      parts: parts,
      kidNote: '炖到软烂，肉切小；汤本身有盐，儿童少量。',
      softNote: '多炖 10–15 分钟至软烂，肉切小。',
      steps: [
        '肉冷水下锅焯水，撇去浮沫后捞出；根茎切大块。',
        '锅中少油炒香洋葱/调味，加入肉和热水，小火炖到软烂（高压锅约 30–40 分钟，普通锅 60–90 分钟）。',
        '出锅前调味；肉和汤分开，汤过滤后冷却，装冰格冻成汤块。',
        '肉按份冷藏或冷冻；汤块冷冻保存，煮面或焯菜时取用。'
      ]
    };
  }
  stew('stew_chicken', '炖鸡', [
    { ingredient: 'chicken_thigh', grams: 150, role: 'protein' },
    { ingredient: 'carrot', grams: 50, role: 'veg' },
    { ingredient: 'onion', grams: 50, role: 'veg' },
    { ingredient: 'mushroom', grams: 50, role: 'veg' },
    { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
    { ingredient: 'sugar', grams: 3, role: 'seasoning' },
    { ingredient: 'oil', grams: 4, role: 'fat' }
  ]);
  stew('stew_ribs', '炖排骨', [
    { ingredient: 'pork_ribs', grams: 150, role: 'protein' },
    { ingredient: 'carrot', grams: 50, role: 'veg' },
    { ingredient: 'onion', grams: 50, role: 'veg' },
    { ingredient: 'mushroom', grams: 50, role: 'veg' },
    { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
    { ingredient: 'sugar', grams: 3, role: 'seasoning' },
    { ingredient: 'oil', grams: 4, role: 'fat' }
  ]);
  stew('stew_shank', '炖牛腱', [
    { ingredient: 'beef_shank', grams: 150, role: 'protein' },
    { ingredient: 'tomato', grams: 150, role: 'veg' },
    { ingredient: 'onion', grams: 50, role: 'veg' },
    { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
    { ingredient: 'sugar', grams: 3, role: 'seasoning' },
    { ingredient: 'oil', grams: 4, role: 'fat' }
  ]);
  stew('stew_brisket', '番茄牛腩', [
    { ingredient: 'beef_brisket', grams: 150, role: 'protein' },
    { ingredient: 'tomato', grams: 150, role: 'veg' },
    { ingredient: 'onion', grams: 50, role: 'veg' },
    { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
    { ingredient: 'sugar', grams: 3, role: 'seasoning' },
    { ingredient: 'oil', grams: 4, role: 'fat' }
  ]);
  stew('stew_pork', '炖梅花肉', [
    { ingredient: 'pork_shoulder', grams: 150, role: 'protein' },
    { ingredient: 'mushroom', grams: 80, role: 'veg' },
    { ingredient: 'carrot', grams: 50, role: 'veg' },
    { ingredient: 'soy_sauce', grams: 10, role: 'seasoning' },
    { ingredient: 'sugar', grams: 3, role: 'seasoning' },
    { ingredient: 'oil', grams: 4, role: 'fat' }
  ]);

  D.meals.dn11 = { type: 'dinner', name: '炖鸡＋米饭＋西兰花', items: [{ dish: 'stew_chicken' }, { dish: 'rice_bowl' }, { dish: 'broccoli_plain' }] };
  D.meals.dn12 = { type: 'dinner', name: '炖排骨＋米饭＋西兰花胡萝卜', items: [{ dish: 'stew_ribs' }, { dish: 'rice_bowl' }, { dish: 'broccoli_carrot' }] };
  D.meals.dn13 = { type: 'dinner', name: '炖牛腱＋米饭＋清炒彩椒', items: [{ dish: 'stew_shank' }, { dish: 'rice_bowl' }, { dish: 'bell_pepper_side' }] };
  D.meals.dn14 = { type: 'dinner', name: '番茄牛腩＋米饭＋西兰花', items: [{ dish: 'stew_brisket' }, { dish: 'rice_bowl' }, { dish: 'broccoli_plain' }] };
  D.meals.dn15 = { type: 'dinner', name: '炖梅花肉＋米饭＋味噌黄油菇', items: [{ dish: 'stew_pork' }, { dish: 'rice_bowl' }, { dish: 'miso_butter_mushroom' }] };
  D.meals.dn16 = { type: 'dinner', name: '味噌牛肉彩椒＋米饭＋西兰花', items: [{ dish: 'miso_beef' }, { dish: 'rice_bowl' }, { dish: 'broccoli_plain' }] };

  D.rotations.stew = {
    label: '炖菜周', meals: ['dn11', 'dn12', 'dn13', 'dn14', 'dn15'],
    note: '五种炖菜轮换，按天数取用；汤过滤后冻成汤块，配面或焯菜。'
  };

  D.quickMeals = [
    {
      id: 'stew_noodle', name: '汤块蔬菜面', time: '10 分钟', serves: '1 人',
      formula: '炖菜汤块 2–3 块（约 60–90 ml）+ 鲜面 150 g + 水煮蔬菜 100 g',
      steps: [
        '汤块加 250–300 ml 水煮开，尝味后再决定是否加盐。',
        '另锅煮面，按包装时间少煮 30 秒，捞入汤碗。',
        '蔬菜焯水或微波，最后放入；需要时加一个水煮蛋。',
        '面现煮现吃，不冷冻；汤块本身有盐，儿童份减半。'
      ],
      note: '汤块是炖菜过滤后的汤冷冻而成；肉可以另配。鲜面不在本周采购清单里，做面时另买或常备。'
    }
  ];

  D.equipment.push({
    id: 'pressureCooker', name: '高压锅 / 炖锅', role: '炖菜',
    note: '炖菜用；没有高压锅时用普通锅延长炖煮时间。',
    alternative: '用普通锅在炉灶炖 60–90 分钟，注意补热水。'
  });
  D.containers.cube = {
    id: 'cube', name: '汤块冰格（30 ml）', short: '汤块冰格', capacity: '30 ml × 12',
    suitable: ['freeze'], note: '炖菜汤过滤后冻成块；每块约 30 ml，按一次用量分装。'
  };

  D.tips.stews = [
    '炖菜一次做 2–3 种，肉和汤分开：肉按份冷藏/冷冻，汤过滤后冻成 30 ml 汤块。',
    '汤块适合煮面、焯菜或做粥底；汤本身有盐，先尝再调味。',
    '带骨排骨按可食部折算，炖好后去骨再分装，避免儿童误吞碎骨。',
    '牛腩脂肪较高，冷却后撇去凝固油脂再分装。'
  ];
  D.tips.rices = [
    '白米饭可换成杂粮饭或叮叮饭；杂粮饭采购按生杂粮折算，叮叮饭按盒购买。',
    '煮饭时丢入大块胡萝卜、红薯、玉米段或粗粮，增加纤维和甜味；饭团仍建议用白米饭，便于成型。',
    '杂粮与粗粮提前浸泡 30 分钟，水量比白米略多。',
    '叮叮饭按包装微波，不参与周末煮饭和冷冻；适合临时替换白米饭。'
  ];
})(window.MEALPREP);

/* =========================================================
   绿叶菜与膳食纤维/便便公式
   ========================================================= */
(function (D) {
  D.ingredients.spinach = {
    name: '菠菜', group: '蔬菜', state: '生重', allergens: [],
    per100: { kcal: 23, protein: 2.86, fat: 0.39, carb: 3.63, fiber: 2.2, calcium: 99, iron: 2.71, sodium: 79 },
    purchase: { mode: 'count', unit: '把', unitGrams: 300, packCount: 1, packLabel: '把' },
    edibleRatio: 0.8,
    purchaseNote: '一把约 300 g，修根后可食部约 80%；USDA 菠菜数据。',
    source: { fdcId: 168462, desc: 'Spinach, raw', type: 'SR Legacy' }
  };
  D.ingredients.pak_choi = {
    name: '小青菜（小白菜）', group: '蔬菜', state: '生重', allergens: [],
    per100: { kcal: 13, protein: 1.5, fat: 0.2, carb: 2.18, fiber: 1, calcium: 105, iron: 0.8, sodium: 65 },
    purchase: { mode: 'count', unit: '把', unitGrams: 300, packCount: 1, packLabel: '把' },
    edibleRatio: 0.85,
    purchaseNote: '一把约 300 g；USDA 小白菜数据。',
    source: { fdcId: 170390, desc: 'Cabbage, chinese (pak-choi), raw', type: 'SR Legacy' }
  };
  D.ingredients.nai_bai = {
    name: '奶白菜', group: '蔬菜', state: '生重', allergens: [],
    per100: { kcal: 16, protein: 1.2, fat: 0.2, carb: 3.23, fiber: 1.2, calcium: 77, iron: 0.31, sodium: 9 },
    purchase: { mode: 'count', unit: '把', unitGrams: 300, packCount: 1, packLabel: '把' },
    edibleRatio: 0.85,
    purchaseNote: '以白菜类（pe-tsai）近似；一把约 300 g。',
    source: { fdcId: 169979, desc: 'Cabbage, chinese (pe-tsai), raw', type: 'SR Legacy' }
  };
  D.ingredients.you_dong_cai = {
    name: '油冬菜', group: '蔬菜', state: '生重', allergens: [],
    per100: { kcal: 16, protein: 1.2, fat: 0.2, carb: 3.23, fiber: 1.2, calcium: 77, iron: 0.31, sodium: 9 },
    purchase: { mode: 'count', unit: '把', unitGrams: 300, packCount: 1, packLabel: '把' },
    edibleRatio: 0.85,
    purchaseNote: '以白菜类（pe-tsai）近似；一把约 300 g。',
    source: { fdcId: 169979, desc: 'Cabbage, chinese (pe-tsai), raw', type: 'SR Legacy' }
  };

  function leafy(id, name, ingredient, grams, note) {
    D.dishes[id] = {
      name: name, storage: 'prep', reheat: 'microwave', tags: ['绿叶菜', '快炒'],
      equipment: ['stove'], container: 'box500',
      parts: [
        { ingredient: ingredient, grams: grams, role: 'veg' },
        { ingredient: 'garlic', grams: 3, role: 'flavor' },
        { ingredient: 'oil', grams: 3, role: 'fat' }
      ],
      kidNote: '切小段炒软；纤维多，儿童少量多次吃，配足水。',
      softNote: '多炒 1–2 分钟至软，切小段。',
      steps: [
        '叶子菜洗净，沥干；菠菜可先焯水 20–30 秒去除部分草酸。',
        '热锅少油，下蒜末，转大火快炒到叶子刚塌软，不要久煮。',
        '出锅前少量盐或不加盐；当天吃，冷藏不超过 1–2 天，不建议冷冻。'
      ],
      note: note
    };
  }
  leafy('garlic_spinach', '蒜蓉菠菜', 'spinach', 120, '菠菜先焯 20–30 秒，挤干再炒，口感更好。');
  leafy('garlic_bok_choy', '蒜蓉小青菜', 'pak_choi', 150, '小青菜易熟，梗先下锅再下叶。');
  leafy('garlic_nai_bai', '蒜蓉奶白菜', 'nai_bai', 150, '奶白菜水分多，大火快炒，不要盖盖焖。');
  leafy('garlic_you_dong', '蒜蓉油冬菜', 'you_dong_cai', 150, '油冬菜切小段，梗叶分开下锅。');

  var greensCycle = ['garlic_spinach', 'garlic_bok_choy', 'garlic_nai_bai', 'garlic_you_dong'];
  var leafyDishes = { garlic_spinach: true, garlic_bok_choy: true, garlic_nai_bai: true, garlic_you_dong: true };
  var dinnerIds = Object.keys(D.meals).filter(function (id) { return D.meals[id].type === 'dinner'; });
  dinnerIds.forEach(function (id, index) {
    var dishId = greensCycle[index % greensCycle.length];
    var exists = D.meals[id].items.some(function (item) { return leafyDishes[item.dish]; });
    if (!exists) D.meals[id].items.push({ dish: dishId });
  });

  D.tips.greens = [
    '叶菜每天都要有：菠菜、小青菜、奶白菜、油冬菜轮换，快炒或焯水，不要久煮。',
    '绿叶菜体积大、纤维多，配足水和一点油脂更容易排便；只吃纤维不喝水反而更干。',
    '菠菜先焯 20–30 秒可减少草酸；肾结石病史的人不要大量吃生菠菜，具体听医生。',
    '叶菜不适合冷冻，建议当天或冷藏 1–2 天吃完；本页把它们标为“现做”。'
  ];

  D.digestive = [
    { symbol: '✅', label: '理想便便', formula: '碳水 + 纤维 + 油脂', note: '成型、柔软、顺畅。' },
    { symbol: '😬', label: '成型但不通畅', formula: '碳水 + 纤维', note: '有体积但偏干，可能缺油和水。' },
    { symbol: '💧', label: '软便 / 不成形', formula: '碳水 + 油脂', note: '油脂多、纤维少，容易散。' },
    { symbol: '≈', label: '量少、滑软', formula: '油脂 + 纤维', note: '体积不足，蛋白质和碳水可能偏少。' },
    { symbol: '▫', label: '羊💩蛋', formula: '只吃纤维', note: '纤维多但缺水和油脂，反而干硬。' },
    { symbol: '🏆', label: '完/美便便', formula: '碳水 + 纤维 + 油脂 + 适量蛋白质', note: '结构完整、气味不过重。' },
    { symbol: '💦', label: '丝滑通畅', formula: '膳食纤维 + 充足水分', note: '水让纤维膨胀；缺水时纤维会变硬。' },
    { symbol: '😖', label: '黏腻恶臭', formula: '高油高糖 + 低纤维', note: '纤维不足、油脂和糖偏多。' }
  ];
  D.tips.hydration = '每天大约 1.5–2 L 水（按体重、天气和活动量调整）；吃纤维多时更要配足水，否则可能更干。';
})(window.MEALPREP);

// 超市冷冻早餐以净重采购，SKU 的营养和配料以实物包装为准。
(function addFreezerBreakfasts(data) {
  data.groups.push('超市冷冻柜');
  data.reheat.packageSteam = { key: 'packageSteam', label: '按包装蒸制', short: '按包装蒸制', icon: 'i-steam' };
  [
    ['millet', '冷冻小米糕', 110, 'milk_glass', 'banana', '牛奶＋香蕉'],
    ['buns', '冷冻小笼包', 150, 'yogurt_bowl', 'apple', '酸奶＋苹果'],
    ['dumplings', '冷冻饺子（可蒸款）', 160, 'milk_glass', 'orange', '牛奶＋橙子']
  ].forEach(function (entry) {
    var key = 'frozen_' + entry[0], name = entry[1];
    var instruction = '选包装明确支持蒸锅的款式。按该商品说明决定是否解冻、冷水或上汽入锅、份量和蒸制时间。生制肉馅要完全做熟；熟制品按说明热透。';
    data.ingredients[key] = {
      name: name, group: '超市冷冻柜', state: '预包装净重', allergens: [], per100: {},
      purchase: {mode:'packageWeight'}, edibleRatio: 1, labelUnknown: true,
      purchaseNote: '盒马等超市冷冻柜购买。按净含量买足，核对包装的生熟属性、蒸法、配料和过敏原。',
      source: {type:'待核对实物营养标签', desc:'未计入成品营养，当前合计仅含已知食材。'}
    };
    data.dishes[key] = {
      name: name, kind: 'commercialFrozen', storage: 'freeze', reheat: 'packageSteam',
      tags: ['超市成品','包装蒸法'], equipment: ['steamer'], container: null,
      parts: [{ingredient:key,grams:entry[2],role:'staple',note:'每人示例净重，按产品规格调整'}],
      steps: ['到家按包装要求保持冷冻，保留原袋说明。', instruction, '只取本餐份量，蒸好后配奶与水果。'],
      kidNote:'掰开散热后再给儿童，汤包注意内部热汤。', softNote:'切小块，检查中心温度。',
      note:'当前没有具体商品标签，成品营养未计入；启用过敏排除时暂不推荐。'
    };
    data.meals['bf_' + key] = {type:'breakfast',name:name+'＋'+entry[5],items:[{dish:key},{dish:entry[3]},{dish:entry[4]}]};
  });
})(window.MEALPREP);
