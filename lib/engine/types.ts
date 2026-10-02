import type { Card } from "@/lib/poker/types";
export type EngineStreet = "preflop"|"flop"|"turn"|"river"|"showdown"|"done";
export interface EnginePlayer { seat:number; name:string; stack:number; betStreet:number; betHand:number; folded:boolean; allIn:boolean; hole:Card[]; }
export interface PokerState { handId:string; seed:number; street:EngineStreet; button:number; sb:number; bb:number; ante:number; players:EnginePlayer[]; board:Card[]; deck:Card[]; pot:number; committed:number; currentBet:number; minRaise:number; lastAggressor:number|null; actingSeat:number|null; winners?:number[]; }
export type EngineAction = {type:"fold"}|{type:"check"}|{type:"call"}|{type:"bet";amount:number}|{type:"raise";to:number}|{type:"allin"};
export interface LegalActions { canFold:boolean; canCheck:boolean; canCall:boolean; callAmount:number; canBet:boolean; betMin:number; betMax:number; canRaise:boolean; raiseToMin:number; raiseToMax:number; canAllIn:boolean; allInAmount:number; }
