import type { CountryDefinition, Province, TerrainType, WorldMap } from "../types";

export const MAP_WIDTH = 280;
export const MAP_HEIGHT = 180;
export const PROVINCE_COUNT = 56;

export const COUNTRIES: CountryDefinition[] = [
  { id: 0, name: "Northreach", color: "#d85c57", personality: "defensive" },
  { id: 1, name: "Westmark", color: "#d99b45", personality: "builder" },
  { id: 2, name: "Greenvale", color: "#76a85b", personality: "defensive" },
  { id: 3, name: "Ironhold", color: "#8d78c4", personality: "aggressive" },
  { id: 4, name: "Centralia", color: "#4b9eaa", personality: "builder" },
  { id: 5, name: "Eastmere", color: "#d06ca0", personality: "aggressive" },
  { id: 6, name: "Southport", color: "#b7a64d", personality: "builder" },
  { id: 7, name: "Redstone", color: "#7587cf", personality: "aggressive" },
  { id: 8, name: "Suncoast", color: "#b98563", personality: "defensive" }
];

const TERRAIN_TYPES: TerrainType[] = ["plains", "forest", "hills", "mountains", "desert"];

interface Seed { x: number; y: number; provinceId: number; ownerId: number }

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function isLand(x: number, y: number): boolean {
  const blobs = [
    { x: 0.25, y: 0.35, rx: 0.22, ry: 0.27 },
    { x: 0.52, y: 0.42, rx: 0.25, ry: 0.32 },
    { x: 0.77, y: 0.57, rx: 0.17, ry: 0.24 },
    { x: 0.43, y: 0.78, rx: 0.12, ry: 0.12 }
  ];
  const nx = x / MAP_WIDTH;
  const ny = y / MAP_HEIGHT;
  return blobs.some((b) => {
    const dx = (nx - b.x) / b.rx;
    const dy = (ny - b.y) / b.ry;
    return dx * dx + dy * dy <= 1;
  });
}

function generateSeeds(random: () => number): Seed[] {
  const seeds: Seed[] = [];
  const columns = 8;
  const rows = 7;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (seeds.length >= PROVINCE_COUNT) break;
      let x = Math.max(2, Math.min(MAP_WIDTH - 3,
        Math.round(((column + 0.5) / columns) * MAP_WIDTH + (random() - 0.5) * 16)));
      let y = Math.max(2, Math.min(MAP_HEIGHT - 3,
        Math.round(((row + 0.5) / rows) * MAP_HEIGHT + (random() - 0.5) * 12)));

      if (!isLand(x, y)) {
        let found = false;
        for (let radius = 3; radius < 40 && !found; radius += 2) {
          for (let dy = -radius; dy <= radius && !found; dy += 2) {
            for (let dx = -radius; dx <= radius; dx += 2) {
              const cx = x + dx;
              const cy = y + dy;
              if (cx >= 1 && cx < MAP_WIDTH - 1 && cy >= 1 && cy < MAP_HEIGHT - 1 && isLand(cx, cy)) {
                x = cx; y = cy; found = true; break;
              }
            }
          }
        }
        if (!found) continue;
      }

      const sectorX = Math.min(2, Math.floor((x / MAP_WIDTH) * 3));
      const sectorY = Math.min(2, Math.floor((y / MAP_HEIGHT) * 3));
      const ownerId = seeds.length < COUNTRIES.length
        ? seeds.length
        : (sectorY * 3 + sectorX) % COUNTRIES.length;
      seeds.push({ x, y, provinceId: seeds.length, ownerId });
    }
  }

  while (seeds.length < PROVINCE_COUNT) {
    const x = Math.floor(random() * MAP_WIDTH);
    const y = Math.floor(random() * MAP_HEIGHT);
    if (!isLand(x, y)) continue;
    const sectorX = Math.min(2, Math.floor((x / MAP_WIDTH) * 3));
    const sectorY = Math.min(2, Math.floor((y / MAP_HEIGHT) * 3));
    const ownerId = seeds.length < COUNTRIES.length
      ? seeds.length
      : (sectorY * 3 + sectorX) % COUNTRIES.length;
    seeds.push({ x, y, provinceId: seeds.length, ownerId });
  }
  return seeds;
}

function buildNeighbors(raster: Int16Array, provinces: Province[]): void {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const id = raster[y * MAP_WIDTH + x];
      if (id < 0) continue;

      if (x > 0) {
        const left = raster[y * MAP_WIDTH + x - 1];
        if (left >= 0 && left !== id) {
          provinces[id].neighbors.push(left);
          provinces[left].neighbors.push(id);
        }
      }
      if (y > 0) {
        const above = raster[(y - 1) * MAP_WIDTH + x];
        if (above >= 0 && above !== id) {
          provinces[id].neighbors.push(above);
          provinces[above].neighbors.push(id);
        }
      }
    }
  }
  for (const province of provinces) {
    province.neighbors = [...new Set(province.neighbors)].sort((a, b) => a - b);
  }
}

export function createWorld(seed = 20261020): WorldMap {
  const random = seededRandom(seed);
  const seeds = generateSeeds(random);
  const provinceAtPixel = new Int16Array(MAP_WIDTH * MAP_HEIGHT);
  const ownerAtPixel = new Int16Array(MAP_WIDTH * MAP_HEIGHT);
  provinceAtPixel.fill(-1);
  ownerAtPixel.fill(-1);

  const provinces: Province[] = seeds.map((point, id) => ({
    id,
    name: `Province ${String(id + 1).padStart(2, "0")}`,
    ownerId: point.ownerId,
    terrain: TERRAIN_TYPES[Math.floor(random() * TERRAIN_TYPES.length)],
    population: 40 + Math.floor(random() * 160),
    resourceOutput: 1 + Math.floor(random() * 5),
    fortLevel: 0,
    neighbors: [],
    capital: false,
    centerX: point.x,
    centerY: point.y
  }));

  const capitalCountries = new Set<number>();
  for (const province of provinces) {
    if (!capitalCountries.has(province.ownerId)) {
      province.capital = true;
      capitalCountries.add(province.ownerId);
    }
  }

  // Assign every land pixel to the nearest seed; water remains -1.
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!isLand(x, y)) continue;
      let nearest = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const point of seeds) {
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; nearest = point.provinceId; }
      }
      const index = y * MAP_WIDTH + x;
      provinceAtPixel[index] = nearest;
      ownerAtPixel[index] = provinces[nearest].ownerId;
    }
  }

  buildNeighbors(provinceAtPixel, provinces);
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    provinceAtPixel,
    ownerAtPixel,
    provinces,
    countries: COUNTRIES.map((country) => ({ ...country }))
  };
}
