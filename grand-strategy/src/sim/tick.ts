import { applyDailyEconomy } from "./economy";
import { advanceConstruction } from "./construction";
import type { GameState } from "./state";
import { runBasicAI } from "./military";

export function advanceDay(state: GameState): void {
  state.day += 1;
  advanceConstruction(state);
  applyDailyEconomy(state);
  runBasicAI(state);
  state.log.unshift(`Day ${state.day}: Resources updated.`);
  state.log = state.log.slice(0, 12);
}
