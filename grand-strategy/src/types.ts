export type TerrainType = "plains" | "forest" | "hills" | "mountains" | "desert";

export interface CountryDefinition {
  id: number;
  name: string;
  color: string;
  personality: "aggressive" | "defensive" | "builder";
}

export interface Province {
  id: number;
  name: string;
  ownerId: number;
  terrain: TerrainType;
  population: number;
  resourceOutput: number;
  fortLevel: number;
  neighbors: number[];
  capital: boolean;
  centerX: number;
  centerY: number;
}

export interface WorldMap {
  width: number;
  height: number;
  provinceAtPixel: Int16Array;
  ownerAtPixel: Int16Array;
  provinces: Province[];
  countries: CountryDefinition[];
}
