// Tests CEREBRO V3 CARD-AWARE: estimador de fuerza + shape + claves con /fuerza.
// 5 de estimador + 7 de comportamiento (12 en total).
import { describe, expect, it, afterEach } from "vitest";
import {
  chooseBrainAction,
  createBrain,
  priorConFallback,
  reflectOnHand,
} from "./brain";
import { bucketFuerza, estimateCardStrength } from "./strength";
import {
  boardParcial,
  buildHandRecord,
  claveDesdeContexto,
  claveSituacion,
  RULETA_SITUACIONES,
} from "./reflection";

const RANDOM_ORIG = Math.random;
function fijarRandom(v: number): void {
  (Math as unknown as { random: () => number }).random = () => v;
}
afterEach(() => {
  (Math as unknown as { random: () => number }).random = RANDOM_ORIG;
});

describe("brain V3: estimador de fuerza (5)", () => {
  it("E1. pares: AA ~0.95 strong, 22 ~0.61 mid", () => {
    const aa = estimateCardStrength("A♠ A♥", "");
    expect(aa).toBeCloseTo(0.95, 2);
    expect(bucketFuerza(aa)).toBe("strong");
    const pp2 = estimateCardStrength("2♣ 2♦", "");
    expect(pp2).toBeGreaterThan(0.55);
    expect(pp2).toBeLessThan(0.65);
    expect(bucketFuerza(pp2)).toBe("mid");
  });

  it("E2. AKs strong con bonus suited+Ax; 72o weak por gap", () => {
    const aks = estimateCardStrength("A♠ K♠", "");
    expect(aks).toBeGreaterThan(0.75);
    expect(bucketFuerza(aks)).toBe("strong");
    // Notación letras "As Ks" da lo mismo que unicode.
    const aksLetras = estimateCardStrength("As Ks", "");
    expect(aksLetras).toBeCloseTo(aks, 6);
    const mala = estimateCardStrength("7♣ 2♦", "");
    expect(mala).toBeLessThan(0.4);
    expect(bucketFuerza(mala)).toBe("weak");
  });

  it("E3. acepta arrays y objetos; inválido → 0.5", () => {
    const desdeArray = estimateCardStrength(["As", "Ks"], []);
    const desdeString = estimateCardStrength("A♠ K♠", "");
    expect(desdeArray).toBeCloseTo(desdeString, 6);
    const desdeObj = estimateCardStrength(
      [
        { rank: 14, suit: "♠" },
        { rank: 13, suit: "♠" },
      ],
      "",
    );
    expect(desdeObj).toBeCloseTo(desdeString, 6);
    expect(estimateCardStrength("zz qq", "nada")).toBe(0.5);
    expect(estimateCardStrength("", "")).toBe(0.5);
    expect(estimateCardStrength("A♠", "")).toBe(0.5); // 1 sola carta
    expect(bucketFuerza(estimateCardStrength("zz", "qq"))).toBe("mid");
  });

  it("E4. postflop evaluate7: SF>flush>pair (0.12+(cat/8)*0.78)", () => {
    // Pareja K (cat1) → 0.2175 weak.
    const pair = estimateCardStrength("A♠ K♠", "K♦ 7♣ 2♠");
    expect(pair).toBeCloseTo(0.12 + (1 / 8) * 0.78, 6);
    expect(bucketFuerza(pair)).toBe("weak");
    // Color (cat5) → 0.6075 mid.
    const flush = estimateCardStrength("A♠ K♠", "Q♠ 7♠ 2♠");
    expect(flush).toBeCloseTo(0.12 + (5 / 8) * 0.78, 6);
    expect(bucketFuerza(flush)).toBe("mid");
    // Escalera de color (cat8) → 0.9 strong.
    const sf = estimateCardStrength("9♠ T♠", "J♠ Q♠ K♠");
    expect(sf).toBeCloseTo(0.9, 6);
    expect(bucketFuerza(sf)).toBe("strong");
    expect(sf).toBeGreaterThan(flush);
    expect(flush).toBeGreaterThan(pair);
  });

  it("E5. bucketFuerza umbrales y no-finitos → mid", () => {
    expect(bucketFuerza(0.39)).toBe("weak");
    expect(bucketFuerza(0.4)).toBe("mid");
    expect(bucketFuerza(0.64)).toBe("mid");
    expect(bucketFuerza(0.65)).toBe("strong");
    expect(bucketFuerza(0.95)).toBe("strong");
    expect(bucketFuerza(Number.NaN)).toBe("mid");
    expect(bucketFuerza(Number.POSITIVE_INFINITY)).toBe("mid");
  });
});

describe("brain V3: card-aware (7)", () => {
  it("1. AA preflop elige raise/allin sobre fold (shape decide con priors iguales)", () => {
    fijarRandom(0.99); // explotación (effEps 0.05) + desempate estable
    const brain = { ...createBrain(), epsilon: 0 };
    const legal = {
      candidates: [{ type: "fold" as const }, { type: "call" as const }, { type: "raise" as const }],
      toCall: 20,
      pot: 100,
      stack: 1000,
    };
    const ctx = {
      street: "preflop" as const,
      boardLen: 0,
      myStack: 1000,
      pot: 100,
      toCall: 20,
      numRivales: 1,
      strength: 0.95, // AA
    };
    const accion = chooseBrainAction(brain, legal, ctx);
    // fold shape -0.1575, call +0.1125, raise +0.2025 → gana agresión.
    expect(["raise", "allin"]).toContain(accion.type);
  });

  it("2. 72o preflop elige fold (shape premia debilidad)", () => {
    fijarRandom(0.99);
    const brain = { ...createBrain(), epsilon: 0 };
    const legal = {
      candidates: [{ type: "fold" as const }, { type: "call" as const }, { type: "raise" as const }],
      toCall: 20,
      pot: 100,
      stack: 1000,
    };
    const ctx = {
      street: "preflop" as const,
      boardLen: 0,
      myStack: 1000,
      pot: 100,
      toCall: 20,
      numRivales: 1,
      strength: 0.366, // 72o
    };
    const accion = chooseBrainAction(brain, legal, ctx);
    // fold +0.047, call -0.034, raise -0.060 → gana fold.
    expect(accion.type).toBe("fold");
  });

  it("3. flush hecha sube el call frente a gutshot (misma situación, distinta fuerza)", () => {
    fijarRandom(0.99);
    const brain = { ...createBrain(), epsilon: 0 };
    const flush = estimateCardStrength("A♠ K♠", "Q♠ 7♠ 2♠"); // 0.6075
    const gut = estimateCardStrength("J♠ T♦", "K♣ Q♥ 2♦"); // 0.12 (solo carta alta)
    expect(flush).toBeGreaterThan(gut);
    const legal = {
      candidates: [{ type: "fold" as const }, { type: "call" as const }],
      toCall: 60,
      pot: 200,
      stack: 900,
    };
    const base = {
      street: "flop" as const,
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
      numRivales: 1,
    };
    // Sin veto pot-odds (prior 0.5 > precio 0.23): decide el shape.
    const conFlush = chooseBrainAction(brain, legal, { ...base, strength: flush });
    const conGut = chooseBrainAction(brain, legal, { ...base, strength: gut });
    expect(conFlush.type).toBe("call"); // +0.027 vs -0.038
    expect(conGut.type).toBe("fold"); // -0.095 vs +0.133
  });

  it("4. HU/strong vs multi/weak: claves distintas; RULETA 312 y priors bajo demanda", () => {
    const huFuerte = claveDesdeContexto({
      street: "flop",
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
      numRivales: 1,
      strength: 0.9,
    });
    const multiDebil = claveDesdeContexto({
      street: "flop",
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
      numRivales: 3,
      strength: 0.2,
    });
    expect(huFuerte).toBe("flop/cheap/deep/HU/strong");
    expect(multiDebil).toBe("flop/cheap/deep/multi/weak");
    expect(huFuerte).not.toBe(multiDebil);
    // RULETA: 96 viejas + 216 V3 = 312, con compat.
    expect(RULETA_SITUACIONES).toContain("preflop/toCall0");
    expect(RULETA_SITUACIONES).toContain("flop/hasPot");
    expect(RULETA_SITUACIONES).toContain("flop/cheap/deep/HU/strong");
    expect(RULETA_SITUACIONES).toContain("flop/cheap/deep/multi/weak");
    expect(RULETA_SITUACIONES).toHaveLength(312);
    // Bajo demanda: solo 96*5=480 priors, todos 0.5; la V3 cae a fallback 0.5.
    const brain = createBrain();
    expect(Object.keys(brain.priors)).toHaveLength(480);
    expect(Object.values(brain.priors).every((p) => p === 0.5)).toBe(true);
    expect(brain.priors["flop/cheap/deep/HU/strong/call"]).toBeUndefined();
    expect(priorConFallback(brain.priors, "flop/cheap/deep/HU/strong", "call")).toBe(0.5);
  });

  it("5. fallback v3→v2→v1 (directa, sin fuerza, cubo/rivales, vieja, 0.5)", () => {
    const brain = createBrain();
    // Directa V3 manda.
    const conDirecta = { ...brain.priors, "flop/cheap/deep/HU/strong/call": 0.9 };
    expect(priorConFallback(conDirecta, "flop/cheap/deep/HU/strong", "call")).toBeCloseTo(0.9, 6);
    // Sin directa → V2 sin fuerza.
    const soloV2 = { ...brain.priors };
    (soloV2 as Record<string, number>)["flop/cheap/deep/HU/call"] = 0.8;
    expect(priorConFallback(soloV2, "flop/cheap/deep/HU/strong", "call")).toBeCloseTo(0.8, 6);
    // Sin V2 → cubo con rivales (cheap→hasPot).
    const soloCuboRival = { ...brain.priors };
    delete soloCuboRival["flop/cheap/deep/HU/call"];
    soloCuboRival["flop/hasPot/HU/call"] = 0.7;
    expect(priorConFallback(soloCuboRival, "flop/cheap/deep/HU/strong", "call")).toBeCloseTo(0.7, 6);
    // Sin cubo/rivales → vieja sin rivales.
    const soloVieja = { ...brain.priors };
    delete soloVieja["flop/cheap/deep/HU/call"];
    delete soloVieja["flop/hasPot/HU/call"];
    soloVieja["flop/hasPot/call"] = 0.6;
    expect(priorConFallback(soloVieja, "flop/cheap/deep/HU/strong", "call")).toBeCloseTo(0.6, 6);
    // Sin nada → 0.5; free→toCall0.
    const vacia: Record<string, number> = {};
    expect(priorConFallback(vacia, "flop/cheap/deep/HU/strong", "call")).toBe(0.5);
    const freeSolo = { "flop/toCall0/HU/check": 0.65 } as Record<string, number>;
    expect(priorConFallback(freeSolo, "flop/free/deep/HU/mid", "check")).toBeCloseTo(0.65, 6);
  });

  it("6. shape rivalLoose: loose premia call y raise fuerte; nit resta fold mid", () => {
    fijarRandom(0.99);
    const base = {
      street: "flop" as const,
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
      numRivales: 1,
    };
    const legalFoldCall = {
      candidates: [{ type: "fold" as const }, { type: "call" as const }],
      toCall: 60,
      pot: 200,
      stack: 900,
    };
    // Fuerza mid (0.5): shape 0, empate → random 0.99 mantiene fold.
    const sinRival = chooseBrainAction(
      { ...createBrain(), epsilon: 0 },
      legalFoldCall,
      { ...base, strength: 0.5 },
    );
    expect(sinRival.type).toBe("fold");
    // Mesa loose (+0.03 al call) → call gana el empate.
    const loose = chooseBrainAction(
      { ...createBrain(), epsilon: 0 },
      legalFoldCall,
      { ...base, strength: 0.5, rivalLoose: 0.6 },
    );
    expect(loose.type).toBe("call");
    // Raise con strong en mesa loose: bonus +0.04 voltea un 0.615 vs 0.55.
    const brainSesgado = createBrain();
    const clave = "flop/cheap/deep/HU/strong";
    brainSesgado.priors[`${clave}/call`] = 0.615;
    brainSesgado.priors[`${clave}/raise`] = 0.55;
    const legalCallRaise = {
      candidates: [{ type: "call" as const }, { type: "raise" as const }],
      toCall: 60,
      pot: 200,
      stack: 900,
    };
    const sinBonus = chooseBrainAction(
      { ...brainSesgado, epsilon: 0 },
      legalCallRaise,
      { ...base, strength: 0.8 },
    );
    expect(sinBonus.type).toBe("call"); // 0.69 vs 0.685
    const conBonus = chooseBrainAction(
      { ...brainSesgado, epsilon: 0 },
      legalCallRaise,
      { ...base, strength: 0.8, rivalLoose: 0.7 },
    );
    expect(conBonus.type).toBe("raise"); // 0.72 vs 0.725
    // Mesa nit (0.1): fold mid -0.02 → check gana el empate fold/check.
    const legalFoldCheck = {
      candidates: [{ type: "fold" as const }, { type: "check" as const }],
      toCall: 0,
      pot: 200,
      stack: 900,
    };
    const nit = chooseBrainAction(
      { ...createBrain(), epsilon: 0 },
      legalFoldCheck,
      { ...base, toCall: 0, strength: 0.5, rivalLoose: 0.1 },
    );
    expect(nit.type).toBe("check");
  });

  it("7. strength inválida → mid (ctx y record) y lesson con bucket", () => {
    // Ctx sin strength o NaN → mid.
    expect(
      claveDesdeContexto({
        street: "flop",
        boardLen: 3,
        myStack: 900,
        pot: 200,
        toCall: 60,
        numRivales: 1,
      }),
    ).toBe("flop/cheap/deep/HU/mid");
    expect(
      claveDesdeContexto({
        street: "flop",
        boardLen: 3,
        myStack: 900,
        pot: 200,
        toCall: 60,
        numRivales: 1,
        strength: Number.NaN,
      }),
    ).toBe("flop/cheap/deep/HU/mid");
    // Record con cartas basura → mid (try/catch).
    const raro = buildHandRecord({
      won: true,
      myCards: "carta rara",
      board: "mesa rara",
      actions: [{ street: "flop", type: "call", amount: 10, toCall: 10 }],
      potWon: 100,
      stackDelta: 50,
      numRivales: 1,
    });
    expect(claveSituacion(raro)).toContain("/mid");
    // Sin rivales ni cartas útiles → clave vieja exacta (compat).
    const viejo = buildHandRecord({
      won: true,
      myCards: "carta rara",
      board: "",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      potWon: 180,
      stackDelta: 90,
    });
    expect(claveSituacion(viejo)).toBe("flop/hasPot");
    // boardParcial progresivo.
    expect(boardParcial("K♦ 7♣ 2♠ 5♥ 9♦", "preflop")).toBe("");
    expect(boardParcial("K♦ 7♣ 2♠ 5♥ 9♦", "flop")).toBe("K♦ 7♣ 2♠");
    expect(boardParcial("K♦ 7♣ 2♠ 5♥ 9♦", "turn")).toBe("K♦ 7♣ 2♠ 5♥");
    expect(boardParcial("K♦ 7♣ 2♠ 5♥ 9♦", "river")).toBe("K♦ 7♣ 2♠ 5♥ 9♦");
    // reflectOnHand guarda strengthBucket en la lesson.
    const { lesson } = reflectOnHand(
      createBrain(),
      buildHandRecord({
        won: true,
        myCards: "A♠ A♥",
        board: "",
        actions: [{ street: "preflop", type: "raise", amount: 60, toCall: 0 }],
        potWon: 100,
        stackDelta: 50,
        numRivales: 1,
      }),
    );
    expect(lesson?.strengthBucket).toBe("strong");
  });
});
