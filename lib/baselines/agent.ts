// Contrato de agentes baseline + registro. Español. Cero dependencias.
// Otro agente importa BASELINES y llama a `decide(info, rng)` con su propio rng.
import type { EngineAction } from "@/lib/engine/types";
import type { InformationSet } from "@/lib/engine/infoset";
import {
  decideCallingStation,
  decideGtoLite,
  decideLag,
  decideManiac,
  decideNit,
  decideRandom,
  decideTag,
} from "./policies";

export type BaselineId =
  | "random"
  | "calling-station"
  | "nit"
  | "tag"
  | "lag"
  | "maniac"
  | "gto-lite";

export interface BaselineAgent {
  id: BaselineId;
  name: string;
  version: string;
  decide(info: InformationSet, rng: () => number): EngineAction;
}

export const BASELINES: Record<BaselineId, BaselineAgent> = {
  random: { id: "random", name: "Aleatorio", version: "v0", decide: decideRandom },
  "calling-station": {
    id: "calling-station",
    name: "Calling Station",
    version: "v0",
    decide: decideCallingStation,
  },
  nit: { id: "nit", name: "Nit (roca)", version: "v0", decide: decideNit },
  tag: { id: "tag", name: "TAG", version: "v0", decide: decideTag },
  lag: { id: "lag", name: "LAG", version: "v0", decide: decideLag },
  maniac: { id: "maniac", name: "Maníaco", version: "v0", decide: decideManiac },
  "gto-lite": {
    id: "gto-lite",
    name: "GTO-lite (heurística, no GTO)",
    version: "v0",
    decide: decideGtoLite,
  },
};
