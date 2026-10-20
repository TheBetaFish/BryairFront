import type { CountryDefinition, Province, WorldMap } from "../types";

export type ResourceKey = "money" | "manpower" | "industry" | "steel" | "oil";
export type BuildingType = "factory" | "farm" | "mine" | "barracks" | "fort";

export interface ResourceStockpile {
  money: number;
  manpower: number;
  industry: number;
  steel: number;
  oil: number;
}

export interface Building {
  type: BuildingType;
  level: number;
}

export interface ConstructionOrder {
  id: number;
  provinceId: number;
  building: BuildingType;
  daysRemaining: number;
  cost: Partial<ResourceStockpile>;
}

export interface CountryState extends CountryDefinition {
  resources: ResourceStockpile;
  dailyNet: ResourceStockpile;
  ownedProvinceIds: number[];
  constructionQueue: ConstructionOrder[];
}

export interface ProvinceState extends Province {
  buildings: Building[];
  garrison: number;
}

export interface GameState {
  version: 1;
  day: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  selectedCountryId: number;
  countries: CountryState[];
  provinces: ProvinceState[];
  nextOrderId: number;
  log: string[];
}

export function createInitialState(world: WorldMap, selectedCountryId = 0): GameState {
  const provinces: ProvinceState[] = world.provinces.map((province) => ({
    ...province,
    neighbors: [...province.neighbors],
    buildings: province.capital ? [{ type: "factory", level: 1 }, { type: "barracks", level: 1 }] : [],
    garrison: province.capital ? 2 : 0
  }));
  const countries: CountryState[] = world.countries.map((country) => ({
    ...country,
    resources: { money: 120, manpower: 80, industry: 5, steel: 25, oil: 12 },
    dailyNet: { money: 0, manpower: 0, industry: 0, steel: 0, oil: 0 },
    ownedProvinceIds: provinces.filter((province) => province.ownerId === country.id).map((province) => province.id),
    constructionQueue: []
  }));
  return {
    version: 1,
    day: 1,
    paused: true,
    speed: 1,
    selectedCountryId,
    countries,
    provinces,
    nextOrderId: 1,
    log: ["Day 1: Campaign initialized."]
  };
}

export function validateGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  return state.version === 1 && Number.isInteger(state.day) &&
    Array.isArray(state.countries) && Array.isArray(state.provinces) &&
    state.countries.every((country) => Number.isInteger(country.id) && country.resources &&
      ["money", "manpower", "industry", "steel", "oil"].every((key) =>
        Number.isFinite(country.resources[key as ResourceKey]))) &&
    state.provinces.every((province) => Number.isInteger(province.id) &&
      Array.isArray(province.neighbors) && Array.isArray(province.buildings));
}
