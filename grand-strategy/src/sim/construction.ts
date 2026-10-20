import { BUILDING_RULES } from "./economy";
import type { BuildingType, GameState, ResourceStockpile } from "./state";

export type ConstructionResult = { ok: true; message: string } | { ok: false; message: string };

export function queueConstruction(state: GameState, provinceId: number, building: BuildingType): ConstructionResult {
  const province = state.provinces[provinceId];
  if (!province) return { ok: false, message: "Unknown province." };
  const country = state.countries.find((entry) => entry.id === state.selectedCountryId);
  if (!country || province.ownerId !== country.id) return { ok: false, message: "You can only build in your own provinces." };
  const rule = BUILDING_RULES[building];
  const usedSlots = province.buildings.reduce((sum, item) => sum + item.level, 0) +
    country.constructionQueue.filter((order) => order.provinceId === provinceId).length;
  if (usedSlots >= rule.slots) return { ok: false, message: "This province has reached this building's slot limit." };
  const alreadyQueued = country.constructionQueue.some((order) => order.provinceId === provinceId && order.building === building);
  if (alreadyQueued) return { ok: false, message: "That building is already queued here." };
  for (const [key, amount] of Object.entries(rule.cost) as Array<[keyof ResourceStockpile, number]>) {
    if (country.resources[key] < amount) return { ok: false, message: `Not enough ${key} for construction.` };
  }
  for (const [key, amount] of Object.entries(rule.cost) as Array<[keyof ResourceStockpile, number]>) {
    country.resources[key] -= amount;
  }
  country.constructionQueue.push({
    id: state.nextOrderId++, provinceId, building, daysRemaining: rule.days, cost: { ...rule.cost }
  });
  state.log.unshift(`Day ${state.day}: ${rule.label} construction started in ${province.name}.`);
  state.log = state.log.slice(0, 12);
  return { ok: true, message: `${rule.label} queued in ${province.name}.` };
}

export function advanceConstruction(state: GameState): void {
  for (const country of state.countries) {
    const completed = [];
    for (const order of country.constructionQueue) {
      order.daysRemaining -= 1;
      if (order.daysRemaining <= 0) {
        const province = state.provinces[order.provinceId];
        if (province && province.ownerId === country.id) {
          const existing = province.buildings.find((building) => building.type === order.building);
          if (existing) existing.level += 1;
          else province.buildings.push({ type: order.building, level: 1 });
          if (order.building === "fort") province.fortLevel = Math.min(5, province.fortLevel + 1);
          state.log.unshift(`Day ${state.day}: ${province.name} completed a ${order.building}.`);
        } else {
          // Ownership changed while building: refund half of the original cost.
          for (const [key, amount] of Object.entries(order.cost) as Array<[keyof ResourceStockpile, number]>) {
            country.resources[key] += Math.floor(amount / 2);
          }
        }
        completed.push(order.id);
      }
    }
    country.constructionQueue = country.constructionQueue.filter((order) => !completed.includes(order.id));
  }
  state.log = state.log.slice(0, 12);
}
