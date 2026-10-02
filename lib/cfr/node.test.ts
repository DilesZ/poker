// Tests del nodo de arrepentimientos (vitest, cero deps salvo vitest).
import { describe, expect, it } from "vitest";
import { averageStrategy, currentStrategy, newNode, regretMatching } from "./node";

describe("nodo CFR", () => {
  it("devuelve estrategia uniforme cuando todos los arrepentimientos son <= 0", () => {
    const nodo = newNode(["a", "b", "c"]);
    nodo.regretSum = [-1, -2, 0];
    expect(regretMatching(nodo)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(currentStrategy(nodo)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("reparte proporcional a los arrepentimientos positivos", () => {
    const nodo = newNode(["a", "b"]);
    nodo.regretSum = [3, 1];
    const estrategia = regretMatching(nodo);
    expect(estrategia[0]).toBeCloseTo(0.75, 10);
    expect(estrategia[1]).toBeCloseTo(0.25, 10);
  });

  it("ignora los arrepentimientos negativos", () => {
    const nodo = newNode(["a", "b"]);
    nodo.regretSum = [2, -5];
    expect(regretMatching(nodo)).toEqual([1, 0]);
  });

  it("la estrategia media pondera el acumulado y cae a uniforme si está vacío", () => {
    const visitado = newNode(["a", "b"]);
    visitado.strategySum = [10, 0];
    expect(averageStrategy(visitado)).toEqual([1, 0]);
    const vacio = newNode(["a", "b"]);
    expect(averageStrategy(vacio)).toEqual([0.5, 0.5]);
  });

  it("regretMatching no muta el nodo y devuelve un array nuevo", () => {
    const nodo = newNode(["a", "b"]);
    nodo.regretSum = [3, 1];
    const estrategia = regretMatching(nodo);
    expect(estrategia).not.toBe(nodo.regretSum);
    expect(nodo.regretSum).toEqual([3, 1]);
    expect(nodo.strategySum).toEqual([0, 0]);
    expect(nodo.actions).toEqual(["a", "b"]);
  });
});
