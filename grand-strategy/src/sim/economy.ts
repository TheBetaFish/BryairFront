import type { BuildingType, CountryState, GameState, ResourceStockpile } from "./state";

const ZERO = (): ResourceStockpile => ({ money: 0, manpower: 0, industry: 0, steel: 0, oil: 0 });

export const BUILDING_RULES: Record<BuildingType, {
  label: string; days: number; cost: Partial<ResourceStockpile>; slots: number;
}> = {
  factory: { label: "Factory", days: 4, cost: { money: 35, steel: 8 }, slots: 3 },
  farm: { label: "Farm", days: 3, cost: { money: 18, steel: 2 }, slots: 3 },
  mine: { label: "Mine", days: 5, cost: { money: 28, steel: 5 }, slots: 3 },
  barracks: { label: "Barracks", days: 4, cost: { money: 30, steel: 6 }, slots: 2 },
  fort: { label: "Fort", days: 3, cost: { money: 20, steel: 4 }, slots: 5 }
};

export function calculateDailyNet(state: GameState, country: CountryState): ResourceStockpile {
  const net = ZERO();
  const provinces = state.provinces.filter((province) => province.ownerId === country.id);
  net.money = 4 + provinces.length * 1.2;
  net.manpower = provinces.reduce((sum, province) => sum + province.population * 0.012, 0);
  net.industry = provinces.reduce((sum, province) => sum +
    province.buildings.filter((building) => building.type === "factory").reduce((n, building) => n + building.level * 2, 0), 0);
  net.steel = provinces.reduce((sum, province) => sum +
    province.buildings.filter((building) => building.type === "mine").reduce((n, building) => n + building.level * 2, 0), 0);
  net.money += provinces.reduce((sum, province) => sum +
    province.buildings.filter((building) => building.type === "farm").reduce((n, building) => n + building.level * 1.5, 0), 0);
  net.oil = provinces.reduce((sum, province) => sum + (province.terrain === "desert" ? 0.3 : 0), 0);
  const garrison = provinces.reduce((sum, province) => sum + province.garrison, 0);
  net.money -= garrison * 0.5;
  net.manpower -= garrison * 0.15;
  // Shortages reduce effective industrial output rather than allowing negative stockpiles.
  if (country.resources.steel <= 0) net.industry *= 0.7;
  if (country.resources.oil <= 0) net.industry *= 0.85;
  return net;
}

export function applyDailyEconomy(state: GameState): void {
  for (const country of state.countries) {
    const net = calculateDailyNet(state, country);
    country.dailyNet = net;
    for (const key of Object.keys(net) as Array<keyof ResourceStockpile>) {
      country.resources[key] = Math.max(0, Math.round((country.resources[key] + net[key]) * 100) / 100);
    }
  }
}
