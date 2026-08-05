// Biomy nie są "poziomami" ani scenografią. To zestawy lokalnych warunków
// fizycznych. Nazwa biomu jest tylko etykietą dla gracza — silnik używa liczb.

export const BIOME = {
  OCEAN: 0,
  COAST: 1,
  LAKE: 2,
  RIVER: 3,
  SWAMP: 4,
  FOREST: 5,
  PLAINS: 6,
  DESERT: 7,
  MOUNTAIN: 8,
  TUNDRA: 9,
  CAVE: 10,
  VOLCANO: 11,
};

// lightMul  — ile światła dociera do podłoża
// oxyMul    — lokalna modyfikacja tlenu
// nutrient  — bazowa produktywność podłoża (mineralne składniki odżywcze)
// drag      — opór ośrodka (woda gęstsza od powietrza)
// traction  — jak dobrze da się odepchnąć od podłoża
// tempMod   — lokalne odchylenie temperatury
export const BIOME_DEF = [
  { id: 0, key: 'OCEAN', name: 'Ocean', color: [205, 0.62, 0.26], water: true, lightMul: 0.45, oxyMul: 0.8, nutrient: 0.55, drag: 0.86, traction: 0.18, tempMod: -1 },
  { id: 1, key: 'COAST', name: 'Wybrzeże', color: [190, 0.55, 0.44], water: true, lightMul: 0.85, oxyMul: 1.0, nutrient: 1.15, drag: 0.9, traction: 0.35, tempMod: 0 },
  { id: 2, key: 'LAKE', name: 'Jezioro', color: [200, 0.6, 0.36], water: true, lightMul: 0.7, oxyMul: 0.95, nutrient: 0.95, drag: 0.88, traction: 0.25, tempMod: -0.5 },
  { id: 3, key: 'RIVER', name: 'Rzeka', color: [196, 0.58, 0.42], water: true, lightMul: 0.8, oxyMul: 1.1, nutrient: 1.05, drag: 0.9, traction: 0.3, tempMod: -0.5 },
  { id: 4, key: 'SWAMP', name: 'Bagno', color: [95, 0.3, 0.26], water: true, lightMul: 0.62, oxyMul: 0.7, nutrient: 1.35, drag: 0.8, traction: 0.5, tempMod: 1 },
  { id: 5, key: 'FOREST', name: 'Las', color: [120, 0.42, 0.24], water: false, lightMul: 0.72, oxyMul: 1.15, nutrient: 1.1, drag: 0.97, traction: 0.85, tempMod: -0.5 },
  { id: 6, key: 'PLAINS', name: 'Równina', color: [82, 0.38, 0.4], water: false, lightMul: 1.0, oxyMul: 1.0, nutrient: 0.85, drag: 0.98, traction: 0.9, tempMod: 0 },
  { id: 7, key: 'DESERT', name: 'Pustynia', color: [45, 0.5, 0.6], water: false, lightMul: 1.25, oxyMul: 0.95, nutrient: 0.25, drag: 0.99, traction: 0.65, tempMod: 7 },
  { id: 8, key: 'MOUNTAIN', name: 'Góry', color: [30, 0.1, 0.42], water: false, lightMul: 1.1, oxyMul: 0.6, nutrient: 0.35, drag: 0.99, traction: 0.75, tempMod: -8 },
  { id: 9, key: 'TUNDRA', name: 'Tundra', color: [190, 0.12, 0.66], water: false, lightMul: 0.9, oxyMul: 1.05, nutrient: 0.4, drag: 0.98, traction: 0.7, tempMod: -12 },
  { id: 10, key: 'CAVE', name: 'Jaskinia', color: [265, 0.14, 0.16], water: false, lightMul: 0.02, oxyMul: 0.55, nutrient: 0.7, drag: 0.97, traction: 0.8, tempMod: -2 },
  { id: 11, key: 'VOLCANO', name: 'Wulkan', color: [12, 0.72, 0.34], water: false, lightMul: 0.95, oxyMul: 0.5, nutrient: 1.6, drag: 0.98, traction: 0.6, tempMod: 22 },
];

export const biomeName = (id) => (BIOME_DEF[id] ? BIOME_DEF[id].name : '—');
export const isWater = (id) => BIOME_DEF[id].water;
