import type { ArmyUnit, GameState, UnitType } from "./state";

export const UNIT_RULES: Record<UnitType, { label: string; attack: number; defense: number; cost: { money: number; manpower: number; industry: number; steel: number } }> = {
  infantry: { label: "Infantry", attack: 3, defense: 3, cost: { money: 20, manpower: 10, industry: 1, steel: 1 } },
  armor: { label: "Armor", attack: 7, defense: 5, cost: { money: 45, manpower: 8, industry: 3, steel: 5 } },
  artillery: { label: "Artillery", attack: 6, defense: 2, cost: { money: 32, manpower: 6, industry: 2, steel: 4 } }
};

export type MilitaryResult = { ok: true; message: string } | { ok: false; message: string };

export function recruitUnit(state: GameState, provinceId: number, type: UnitType): MilitaryResult {
  const province = state.provinces[provinceId];
  const country = state.countries.find((item) => item.id === state.selectedCountryId);
  if (!province || !country || province.ownerId !== country.id) return { ok: false, message: "Recruit only in your own provinces." };
  const rule = UNIT_RULES[type];
  for (const [key, amount] of Object.entries(rule.cost) as Array<[keyof typeof rule.cost, number]>) {
    if (country.resources[key] < amount) return { ok: false, message: `Not enough ${key} to recruit ${rule.label.toLowerCase()}.` };
  }
  for (const [key, amount] of Object.entries(rule.cost) as Array<[keyof typeof rule.cost, number]>) country.resources[key] -= amount;
  state.units.push({ id: state.nextUnitId++, countryId: country.id, provinceId, type, strength: 1 });
  state.log.unshift(`Day ${state.day}: ${country.name} recruited ${rule.label} in ${province.name}.`);
  state.log = state.log.slice(0, 12);
  return { ok: true, message: `${rule.label} recruited in ${province.name}.` };
}

function unitPower(units: ArmyUnit[], attack: boolean): number {
  return units.reduce((sum, unit) => sum + UNIT_RULES[unit.type][attack ? "attack" : "defense"] * unit.strength, 0);
}

export function attackProvince(state: GameState, fromProvinceId: number, targetProvinceId: number, attackerId: number): MilitaryResult {
  const from = state.provinces[fromProvinceId];
  const target = state.provinces[targetProvinceId];
  if (!from || !target || !from.neighbors.includes(targetProvinceId)) return { ok: false, message: "Target must be an adjacent province." };
  if (from.ownerId !== attackerId || target.ownerId === attackerId) return { ok: false, message: "That province cannot be attacked." };
  const attackers = state.units.filter((unit) => unit.countryId === attackerId && unit.provinceId === fromProvinceId && unit.strength > 0);
  if (!attackers.length) return { ok: false, message: "No army is stationed in this province." };
  const defenders = state.units.filter((unit) => unit.countryId === target.ownerId && unit.provinceId === targetProvinceId && unit.strength > 0);
  const terrainBonus = target.terrain === "mountains" ? 1.8 : target.terrain === "hills" || target.terrain === "forest" ? 1.3 : 1;
  const defense = (unitPower(defenders, false) + target.garrison * 1.8 + target.fortLevel * 1.5 + 1) * terrainBonus;
  const attack = unitPower(attackers, true);
  // Stable day/province-based variance keeps outcomes repeatable for a given campaign state.
  const variance = 0.9 + (((state.day * 31 + fromProvinceId * 17 + targetProvinceId * 13) % 21) / 100);
  if (attack * variance <= defense) {
    const attacker = attackers[0];
    attacker.strength = Math.max(0, Math.round((attacker.strength - 0.5) * 10) / 10);
    state.log.unshift(`Day ${state.day}: ${state.countries[attackerId].name} failed to capture ${target.name}.`);
    state.log = state.log.slice(0, 12);
    return { ok: true, message: `Attack failed. Defensive strength: ${defense.toFixed(1)}.` };
  }
  const defenderId = target.ownerId;
  for (const defender of defenders) defender.strength = 0;
  target.ownerId = attackerId;
  target.garrison = 0;
  const oldOwner = state.countries.find((country) => country.id === defenderId);
  const newOwner = state.countries.find((country) => country.id === attackerId);
  if (oldOwner) oldOwner.ownedProvinceIds = oldOwner.ownedProvinceIds.filter((id) => id !== targetProvinceId);
  if (newOwner && !newOwner.ownedProvinceIds.includes(targetProvinceId)) newOwner.ownedProvinceIds.push(targetProvinceId);
  const advancingUnit = attackers[0];
  advancingUnit.provinceId = targetProvinceId;
  state.log.unshift(`Day ${state.day}: ${newOwner?.name ?? "Army"} captured ${target.name} from ${oldOwner?.name ?? "enemy"}.`);
  state.log = state.log.slice(0, 12);
  return { ok: true, message: `Captured ${target.name}.` };
}

export function runBasicAI(state: GameState): void {
  if (state.day % 3 !== 0) return;
  for (const country of state.countries) {
    if (country.id === state.selectedCountryId) continue;
    const ownProvinces = state.provinces.filter((province) => province.ownerId === country.id);
    const candidates = ownProvinces.flatMap((province) => province.neighbors
      .map((neighborId) => ({ province, target: state.provinces[neighborId] }))
      .filter(({ target }) => target.ownerId !== country.id &&
        state.units.some((unit) => unit.countryId === country.id && unit.provinceId === province.id && unit.strength > 0)));
    if (!candidates.length) continue;
    const choiceIndex = country.personality === "aggressive" ? 0 : (state.day + country.id) % candidates.length;
    const choice = candidates[choiceIndex];
    if (country.personality === "defensive" && state.day % 6 !== 0) continue;
    attackProvince(state, choice.province.id, choice.target.id, country.id);
  }
}
