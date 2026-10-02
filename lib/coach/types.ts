// Contrato exacto que importan el store y la UI. No cambiar sin ellos.
import type { Card } from "../poker/types";
export type PosLabel = "SB"|"BB"|"UTG"|"MP"|"CO"|"BTN";
export type CoachStreet = "preflop"|"flop"|"turn"|"river";
export type CoachActionType = "fold"|"check"|"call"|"bet"|"raise"|"allin";
export interface HandAction { street: CoachStreet; seat: number; action: CoachActionType; amount: number; potAfter: number; }
export interface HandRecord { id: string; ts: number; heroSeat: number; button: number; positions: Record<number, PosLabel>; actions: HandAction[]; result: { bbWon: number; showdown: boolean }; heroHole?: Card[]; board?: Card[]; }
export type FlagKind = "VPIP_ALTO_EP" | "PASIVO_POSTFLOP" | "OVERFOLD_BB" | "OVERFOLD" | "MISSED_VALUE" | "BAD_SIZING" | "BAD_PREFLOP" | "OVERAGGRESSION";
export interface CoachFlag { id: string; kind: FlagKind; title: string; detail: string; evidenceHandIds: string[]; source: string; }
export interface PosStats { hands: number; vpip: number; pfr: number; }
export interface CoachReport { sampleN: number; overall: { vpip: number; pfr: number; threeBet: number; wtsd: number; showdownRate: number; aggro: number }; byPosition: Record<PosLabel, PosStats>; flags: CoachFlag[]; }
