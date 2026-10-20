import "./style.css";
import { createWorld, MAP_HEIGHT, MAP_WIDTH } from "./data/world";
import type { Province, WorldMap } from "./types";
import { createInitialState, validateGameState } from "./sim/state";
import type { BuildingType, GameState, ResourceKey } from "./sim/state";
import { BUILDING_RULES, calculateDailyNet } from "./sim/economy";
import { advanceDay } from "./sim/tick";
import { queueConstruction } from "./sim/construction";

const world = createWorld(20261020);
const state: GameState = createInitialState(world, 0);
const canvas = document.querySelector<HTMLCanvasElement>("#world-map");
const status = document.querySelector<HTMLSpanElement>("#map-status");
const details = document.querySelector<HTMLDivElement>("#province-details");
const count = document.querySelector<HTMLElement>("#province-count");
const legend = document.querySelector<HTMLDivElement>("#map-legend");
const resourceHud = document.querySelector<HTMLDivElement>("#resource-hud");
const campaignDate = document.querySelector<HTMLElement>("#campaign-date");
const pauseToggle = document.querySelector<HTMLButtonElement>("#pause-toggle");
const advanceButton = document.querySelector<HTMLButtonElement>("#advance-day");
const speedSelect = document.querySelector<HTMLSelectElement>("#speed-select");
const simulationState = document.querySelector<HTMLElement>("#simulation-state");
const simMessage = document.querySelector<HTMLElement>("#sim-message");
const saveButton = document.querySelector<HTMLButtonElement>("#save-game");
const loadButton = document.querySelector<HTMLButtonElement>("#load-game");

if (!canvas || !status || !details || !count || !legend || !resourceHud || !campaignDate ||
    !pauseToggle || !advanceButton || !speedSelect || !simulationState || !simMessage || !saveButton || !loadButton) {
  throw new Error("Required game UI elements were not found.");
}
const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("This browser does not support the required 2D canvas.");

canvas.width = MAP_WIDTH;
canvas.height = MAP_HEIGHT;
context.imageSmoothingEnabled = false;

let selectedProvinceId: number | null = null;
let hoveredProvinceId: number | null = null;
let timer: number | undefined;

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
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const index = y * MAP_WIDTH + x;
    const provinceId = world.provinceAtPixel[index];
    if (provinceId < 0) { setPixel(image.data, index, waterColor); continue; }
    const province = state.provinces[provinceId];
    let color = rgbByCountry.get(province.ownerId) ?? waterColor;
    const edge = getProvinceAt(x - 1, y) !== provinceId || getProvinceAt(x + 1, y) !== provinceId ||
      getProvinceAt(x, y - 1) !== provinceId || getProvinceAt(x, y + 1) !== provinceId;
    if (provinceId === selectedProvinceId && edge) color = selectedColor;
    else if (provinceId === hoveredProvinceId && edge) color = hoverColor;
    else if (edge) color = borderColor;
    setPixel(image.data, index, color);
  }
  context!.putImageData(image, 0, 0);
}
function renderLegend(): void {
  legend!.replaceChildren();
  for (const country of state.countries) {
    const item = document.createElement("span"); item.className = "legend-item";
    const swatch = document.createElement("span"); swatch.className = "legend-swatch"; swatch.style.backgroundColor = country.color;
    const label = document.createElement("span"); label.textContent = country.name;
    item.append(swatch, label); legend!.append(item);
  }
}
function renderEconomy(): void {
  const country = state.countries.find((entry) => entry.id === state.selectedCountryId)!;
  campaignDate!.textContent = `Day ${state.day} · ${country.name}`;
  resourceHud!.replaceChildren();
  const labels: Record<ResourceKey, string> = { money: "Money", manpower: "Manpower", industry: "Industry", steel: "Steel", oil: "Oil" };
  for (const key of Object.keys(labels) as ResourceKey[]) {
    const tile = document.createElement("div"); tile.className = "resource-tile";
    const label = document.createElement("span"); label.textContent = labels[key];
    const value = document.createElement("strong"); value.textContent = country.resources[key].toLocaleString(undefined, { maximumFractionDigits: 1 });
    const net = document.createElement("small"); const amount = country.dailyNet[key];
    net.textContent = `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}/day`; net.className = amount < 0 ? "negative" : "positive";
    tile.append(label, value, net); resourceHud!.append(tile);
  }
  pauseToggle!.textContent = state.paused ? "Start" : "Pause";
  simulationState!.textContent = state.paused ? "Paused" : `Running · ${state.speed}×`;
  const queued = country.constructionQueue.length;
  simMessage!.textContent = queued ? `${queued} construction order(s) in progress.` : "Select one of your provinces to queue a building.";
}
function renderProvince(province: Province | undefined): void {
  details!.replaceChildren();
  if (!province) {
    const heading = document.createElement("h2"); heading.textContent = "No province selected";
    const paragraph = document.createElement("p"); paragraph.className = "muted";
    paragraph.textContent = "Click a land region on the map to inspect it and manage buildings.";
    details!.append(heading, paragraph); return;
  }
  const liveProvince = state.provinces[province.id];
  const country = state.countries.find((entry) => entry.id === liveProvince.ownerId);
  const heading = document.createElement("h2"); heading.textContent = liveProvince.name;
  const ownerLine = document.createElement("div"); ownerLine.className = "owner-line";
  const swatch = document.createElement("span"); swatch.className = "owner-swatch"; swatch.style.backgroundColor = country?.color ?? "#777";
  const ownerName = document.createElement("strong"); ownerName.textContent = country?.name ?? "Unclaimed";
  ownerLine.append(swatch, ownerName);
  const stats = document.createElement("div"); stats.className = "status-list";
  const entries: Array<[string, string]> = [
    ["Terrain", liveProvince.terrain], ["Population", liveProvince.population.toLocaleString()],
    ["Resource output", `${liveProvince.resourceOutput} / day`], ["Fort level", `${liveProvince.fortLevel} / 5`],
    ["Adjacent provinces", String(liveProvince.neighbors.length)], ["Capital", liveProvince.capital ? "Yes" : "No"],
    ["Garrison", String(liveProvince.garrison)]
  ];
  for (const [label, value] of entries) {
    const row = document.createElement("div"); const key = document.createElement("span"); const content = document.createElement("strong");
    key.textContent = label; content.textContent = value; row.append(key, content); stats.append(row);
  }
  details!.append(heading, ownerLine, stats);
  const buildingHeading = document.createElement("h3"); buildingHeading.className = "building-heading"; buildingHeading.textContent = "Buildings";
  const buildingList = document.createElement("p"); buildingList.className = "muted";
  buildingList.textContent = liveProvince.buildings.length ? liveProvince.buildings.map((building) => `${building.type} Lv.${building.level}`).join(" · ") : "None";
  details!.append(buildingHeading, buildingList);
  if (liveProvince.ownerId === state.selectedCountryId) {
    const buildHeading = document.createElement("h3"); buildHeading.className = "building-heading"; buildHeading.textContent = "Construct";
    const buildGrid = document.createElement("div"); buildGrid.className = "build-grid";
    (Object.keys(BUILDING_RULES) as BuildingType[]).forEach((type) => {
      const rule = BUILDING_RULES[type];
      const button = document.createElement("button"); button.type = "button"; button.className = "build-button";
      button.textContent = `${rule.label} · ${rule.days}d`;
      button.title = `Cost: ${Object.entries(rule.cost).map(([key, amount]) => `${key} ${amount}`).join(", ")}`;
      button.addEventListener("click", () => {
        const result = queueConstruction(state, liveProvince.id, type);
        simMessage!.textContent = result.message;
        if (result.ok) { renderProvince(liveProvince); renderEconomy(); }
      });
      buildGrid.append(button);
    });
    details!.append(buildHeading, buildGrid);
    const country = state.countries.find((entry) => entry.id === state.selectedCountryId)!;
    const orders = country.constructionQueue.filter((order) => order.provinceId === liveProvince.id);
    if (orders.length) {
      const queue = document.createElement("p"); queue.className = "muted queue-note";
      queue.textContent = `Under construction: ${orders.map((order) => `${order.building} (${order.daysRemaining}d)`).join(", ")}`;
      details!.append(queue);
    }
  }
}
function provinceFromPointer(event: PointerEvent): number {
  const bounds = canvas!.getBoundingClientRect();
  return getProvinceAt(Math.floor(((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH),
    Math.floor(((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT));
}
function redraw(): void {
  drawMap(); renderEconomy();
  if (selectedProvinceId !== null) renderProvince(state.provinces[selectedProvinceId]);
}
function tick(): void {
  advanceDay(state); redraw();
}
canvas.addEventListener("pointermove", (event) => {
  const next = provinceFromPointer(event);
  if (next !== hoveredProvinceId) { hoveredProvinceId = next; drawMap(); }
});
canvas.addEventListener("pointerleave", () => { hoveredProvinceId = null; drawMap(); });
canvas.addEventListener("click", (event) => {
  const id = provinceFromPointer(event);
  if (id < 0) { selectedProvinceId = null; renderProvince(undefined); status!.textContent = "Selected water"; }
  else { selectedProvinceId = id; renderProvince(state.provinces[id]); status!.textContent = `Selected ${state.provinces[id].name}`; }
  drawMap();
});
saveButton.addEventListener("click", () => {
  try {
    localStorage.setItem("bryairfront-layer1-save-v1", JSON.stringify(state));
    simMessage!.textContent = "Campaign saved in this browser.";
  } catch {
    simMessage!.textContent = "Save failed: browser storage is unavailable.";
  }
});
loadButton.addEventListener("click", () => {
  try {
    const raw = localStorage.getItem("bryairfront-layer1-save-v1");
    if (!raw) { simMessage!.textContent = "No local save found."; return; }
    const parsed: unknown = JSON.parse(raw);
    if (!validateGameState(parsed) || parsed.provinces.length !== world.provinces.length ||
        parsed.countries.length !== world.countries.length) {
      simMessage!.textContent = "Save file is invalid or incompatible.";
      return;
    }
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    Object.assign(state, parsed);
    // Saved campaigns load paused to prevent unexpected time advancement.
    state.paused = true;
    selectedProvinceId = selectedProvinceId !== null && state.provinces[selectedProvinceId] ? selectedProvinceId : null;
    speedSelect!.value = String(state.speed);
    renderLegend(); redraw();
    simMessage!.textContent = "Campaign loaded. Simulation is paused.";
  } catch {
    simMessage!.textContent = "Load failed: the save data could not be read.";
  }
});
pauseToggle.addEventListener("click", () => {
  state.paused = !state.paused;
  if (timer !== undefined) window.clearInterval(timer);
  timer = state.paused ? undefined : window.setInterval(tick, 1000 / state.speed);
  renderEconomy();
});
advanceButton.addEventListener("click", tick);
speedSelect.addEventListener("change", () => {
  const value = Number(speedSelect.value);
  if (value === 1 || value === 2 || value === 4) state.speed = value;
  if (!state.paused) { if (timer !== undefined) window.clearInterval(timer); timer = window.setInterval(tick, 1000 / state.speed); }
  renderEconomy();
});

function assertWorldIsValid(map: WorldMap): void {
  if (map.provinces.length !== 56) throw new Error(`Expected 56 provinces; got ${map.provinces.length}.`);
  if (map.provinceAtPixel.length !== map.width * map.height) throw new Error("Province raster dimensions mismatch.");
  const ownedCountries = new Set(map.provinces.map((province) => province.ownerId));
  if (ownedCountries.size !== map.countries.length) throw new Error("Every country must start with at least one province.");
  for (const province of map.provinces) for (const neighborId of province.neighbors) {
    const neighbor = map.provinces[neighborId];
    if (!neighbor || !neighbor.neighbors.includes(province.id)) throw new Error(`Adjacency is not symmetric for provinces ${province.id} and ${neighborId}.`);
  }
  if (state.provinces.length !== map.provinces.length) throw new Error("Simulation province count does not match world map.");
}
assertWorldIsValid(world);
for (const country of state.countries) country.dailyNet = calculateDailyNet(state, country);
renderLegend(); renderProvince(undefined); drawMap(); renderEconomy();
count.textContent = String(world.provinces.length);
status.textContent = `${world.countries.length} countries · ${world.provinces.length} provinces`;
console.info("Layer 1 simulation initialized", { width: world.width, height: world.height, provinces: world.provinces.length, countries: world.countries.length });
