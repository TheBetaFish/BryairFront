import "./style.css";
import { createWorld, MAP_HEIGHT, MAP_WIDTH } from "./data/world";
import type { Province, WorldMap } from "./types";

const world = createWorld(20261020);
const canvas = document.querySelector<HTMLCanvasElement>("#world-map");
const status = document.querySelector<HTMLSpanElement>("#map-status");
const details = document.querySelector<HTMLDivElement>("#province-details");
const count = document.querySelector<HTMLElement>("#province-count");
const legend = document.querySelector<HTMLDivElement>("#map-legend");

if (!canvas || !status || !details || !count || !legend) {
  throw new Error("Required game UI elements were not found.");
}
const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("This browser does not support the required 2D canvas.");

canvas.width = MAP_WIDTH;
canvas.height = MAP_HEIGHT;
context.imageSmoothingEnabled = false;

let selectedProvinceId: number | null = null;
let hoveredProvinceId: number | null = null;

const rgbByCountry = new Map(world.countries.map((country) => {
  const hex = country.color.replace("#", "");
  const n = Number.parseInt(hex, 16);
  return [country.id, [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number]];
}));

const waterColor: [number, number, number] = [21, 36, 49];
const borderColor: [number, number, number] = [15, 23, 31];
const selectedColor: [number, number, number] = [255, 230, 120];
const hoverColor: [number, number, number] = [255, 255, 255];

function getProvinceAt(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return -1;
  return world.provinceAtPixel[y * MAP_WIDTH + x];
}

function setPixel(data: Uint8ClampedArray, index: number, color: [number, number, number]): void {
  const offset = index * 4;
  data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
}

function drawMap(): void {
  const image = context!.createImageData(MAP_WIDTH, MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const index = y * MAP_WIDTH + x;
      const provinceId = world.provinceAtPixel[index];
      if (provinceId < 0) { setPixel(image.data, index, waterColor); continue; }

      const province = world.provinces[provinceId];
      let color = rgbByCountry.get(province.ownerId) ?? waterColor;
      const edge = getProvinceAt(x - 1, y) !== provinceId ||
        getProvinceAt(x + 1, y) !== provinceId ||
        getProvinceAt(x, y - 1) !== provinceId ||
        getProvinceAt(x, y + 1) !== provinceId;

      if (provinceId === selectedProvinceId && edge) color = selectedColor;
      else if (provinceId === hoveredProvinceId && edge) color = hoverColor;
      else if (edge) color = borderColor;
      setPixel(image.data, index, color);
    }
  }
  context!.putImageData(image, 0, 0);
}

function renderLegend(): void {
  legend!.replaceChildren();
  for (const country of world.countries) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = country.color;
    const label = document.createElement("span");
    label.textContent = country.name;
    item.append(swatch, label);
    legend!.append(item);
  }
}

function renderProvince(province: Province | undefined): void {
  details!.replaceChildren();
  if (!province) {
    const heading = document.createElement("h2");
    heading.textContent = "No province selected";
    const paragraph = document.createElement("p");
    paragraph.className = "muted";
    paragraph.textContent = "Click a land region on the map to inspect its owner and terrain.";
    details!.append(heading, paragraph);
    return;
  }

  const country = world.countries.find((entry) => entry.id === province.ownerId);
  const heading = document.createElement("h2");
  heading.textContent = province.name;
  const ownerLine = document.createElement("div");
  ownerLine.className = "owner-line";
  const swatch = document.createElement("span");
  swatch.className = "owner-swatch";
  swatch.style.backgroundColor = country?.color ?? "#777";
  const ownerName = document.createElement("strong");
  ownerName.textContent = country?.name ?? "Unclaimed";
  ownerLine.append(swatch, ownerName);

  const stats = document.createElement("div");
  stats.className = "status-list";
  const entries: Array<[string, string]> = [
    ["Terrain", province.terrain],
    ["Population", province.population.toLocaleString()],
    ["Resource output", `${province.resourceOutput} / day`],
    ["Fort level", `${province.fortLevel} / 5`],
    ["Adjacent provinces", String(province.neighbors.length)],
    ["Capital", province.capital ? "Yes" : "No"]
  ];
  for (const [label, value] of entries) {
    const row = document.createElement("div");
    const key = document.createElement("span");
    const content = document.createElement("strong");
    key.textContent = label;
    content.textContent = value;
    row.append(key, content);
    stats.append(row);
  }
  details!.append(heading, ownerLine, stats);
}

function provinceFromPointer(event: PointerEvent): number {
  const bounds = canvas!.getBoundingClientRect();
  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT);
  return getProvinceAt(x, y);
}

canvas.addEventListener("pointermove", (event) => {
  const next = provinceFromPointer(event);
  if (next !== hoveredProvinceId) { hoveredProvinceId = next; drawMap(); }
});
canvas.addEventListener("pointerleave", () => { hoveredProvinceId = null; drawMap(); });
canvas.addEventListener("click", (event) => {
  const id = provinceFromPointer(event);
  if (id < 0) {
    selectedProvinceId = null;
    renderProvince(undefined);
    status!.textContent = "Selected water";
  } else {
    selectedProvinceId = id;
    renderProvince(world.provinces[id]);
    status!.textContent = `Selected ${world.provinces[id].name}`;
  }
  drawMap();
});

function assertWorldIsValid(map: WorldMap): void {
  if (map.provinces.length !== 56) throw new Error(`Expected 56 provinces; got ${map.provinces.length}.`);
  if (map.provinceAtPixel.length !== map.width * map.height) throw new Error("Province raster dimensions mismatch.");
  const ownedCountries = new Set(map.provinces.map((province) => province.ownerId));
  if (ownedCountries.size !== map.countries.length) throw new Error("Every country must start with at least one province.");
  for (const province of map.provinces) {
    for (const neighborId of province.neighbors) {
      const neighbor = map.provinces[neighborId];
      if (!neighbor || !neighbor.neighbors.includes(province.id)) {
        throw new Error(`Adjacency is not symmetric for provinces ${province.id} and ${neighborId}.`);
      }
    }
  }
}

assertWorldIsValid(world);
renderLegend();
renderProvince(undefined);
drawMap();
count.textContent = String(world.provinces.length);
status.textContent = `${world.countries.length} countries · ${world.provinces.length} provinces`;
console.info("Layer 1 world initialized", { width: world.width, height: world.height, provinces: world.provinces.length, countries: world.countries.length });
