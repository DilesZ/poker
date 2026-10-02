// Curva de exploitabilidad: SVG sin dependencias, eje X en escala log,
// línea + puntos y etiqueta del valor final. Componente de presentación.

export interface CurvePoint {
  iteration: number;
  exploitability: number;
}

const W = 560;
const H = 260;
const ML = 56;
const MR = 14;
const MT = 16;
const MB = 36;

function log10(x: number): number {
  return Math.log(Math.max(x, 1)) / Math.LN10;
}

export default function CurvesPanel({
  curve,
  finalExploitability,
}: {
  curve: CurvePoint[];
  finalExploitability?: number | null;
}) {
  if (!curve || curve.length === 0) {
    return (
      <div aria-label="Curva de exploitabilidad">
        <h3>Curva de exploitabilidad</h3>
        <p className="poker-muted">
          Sin curva todavía. Entrena un modelo para ver la evolución de la
          exploitabilidad por iteración.
        </p>
      </div>
    );
  }

  const pts = curve
    .filter(
      (p) =>
        Number.isFinite(p.iteration) && Number.isFinite(p.exploitability),
    )
    .slice()
    .sort((a, b) => a.iteration - b.iteration);
  if (pts.length === 0) {
    return (
      <div aria-label="Curva de exploitabilidad">
        <h3>Curva de exploitabilidad</h3>
        <p className="poker-muted">La curva recibida no contiene puntos válidos.</p>
      </div>
    );
  }

  const xs = pts.map((p) => log10(p.iteration));
  const ys = pts.map((p) => p.exploitability);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  if (yMin === yMax) {
    const pad = Math.abs(yMax) * 0.1 || 1;
    yMin -= pad;
    yMax += pad;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
  }

  const iw = W - ML - MR;
  const ih = H - MT - MB;
  const sx = (lx: number) => ML + ((lx - xMin) / (xMax - xMin)) * iw;
  const sy = (v: number) => MT + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(log10(p.iteration)).toFixed(1)},${sy(p.exploitability).toFixed(1)}`)
    .join(" ");

  // Submuestreo de puntos para no saturar el SVG.
  const step = Math.max(1, Math.floor(pts.length / 80));
  const dots = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

  // Ticks X: potencias de 10 dentro del rango.
  const xTicks: number[] = [];
  for (let e = Math.ceil(xMin); e <= Math.floor(xMax); e += 1) xTicks.push(e);
  if (xTicks.length === 0) xTicks.push((xMin + xMax) / 2);

  // Ticks Y: 4 divisiones lineales.
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);

  const last = pts[pts.length - 1];
  const finalLabel =
    finalExploitability != null && Number.isFinite(finalExploitability)
      ? finalExploitability
      : last.exploitability;

  return (
    <div aria-label="Curva de exploitabilidad">
      <h3>Curva de exploitabilidad</h3>
      <svg
        className="lab-curve"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Curva con ${pts.length} puntos, valor final ${Number(finalLabel).toFixed(4)}`}
      >
        {/* Ejes */}
        <line x1={ML} y1={MT} x2={ML} y2={H - MB} stroke="#2a3a32" strokeWidth={1.5} />
        <line x1={ML} y1={H - MB} x2={W - MR} y2={H - MB} stroke="#2a3a32" strokeWidth={1.5} />
        {/* Ticks X (log) */}
        {xTicks.map((e) => {
          const x = sx(e);
          const label = Math.pow(10, e) >= 1000 ? `1e${e}` : String(Math.round(Math.pow(10, e)));
          return (
            <g key={`x${e}`}>
              <line x1={x} y1={H - MB} x2={x} y2={H - MB + 5} stroke="#7e938a" strokeWidth={1} />
              <text x={x} y={H - MB + 18} textAnchor="middle" fontSize={10} fill="#a7bcb1">
                {label}
              </text>
            </g>
          );
        })}
        {/* Ticks Y */}
        {yTicks.map((v, i) => {
          const y = sy(v);
          return (
            <g key={`y${i}`}>
              <line x1={ML - 5} y1={y} x2={W - MR} y2={y} stroke={i === 0 ? "#2a3a32" : "#1a242a"} strokeWidth={1} />
              <text x={ML - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="#a7bcb1">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* Línea + puntos */}
        <path d={d} fill="none" stroke="#e8b923" strokeWidth={2} strokeLinejoin="round" />
        {dots.map((p, i) => (
          <circle
            key={i}
            cx={sx(log10(p.iteration))}
            cy={sy(p.exploitability)}
            r={2.4}
            fill="#1d9e68"
            stroke="#ffe9a8"
            strokeWidth={0.6}
          >
            <title>{`it ${p.iteration}: ${p.exploitability}`}</title>
          </circle>
        ))}
        {/* Etiqueta final */}
        <text
          x={sx(log10(last.iteration))}
          y={Math.max(sy(last.exploitability) - 10, MT + 4)}
          textAnchor="end"
          fontSize={12}
          fontWeight={800}
          fill="#ffe9a8"
        >
          {`final ${Number(finalLabel).toFixed(4)}`}
        </text>
      </svg>
      <p className="poker-muted">
        Eje X logarítmico (iteración) · {pts.length} puntos · exploitabilidad
        final {Number(finalLabel).toFixed(4)}.
      </p>
    </div>
  );
}
