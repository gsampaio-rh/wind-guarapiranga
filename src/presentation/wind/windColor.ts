export type Rgb = [number, number, number];

/**
 * Escala fraco→forte por velocidade instantânea do traço, em nós. Os limites
 * cobrem a faixa observada no catálogo (calmaria ~0 nós até rajada forte ~26
 * nós). Pensada para funcionar também com a Rajada ligada: a velocidade usada
 * aqui já inclui o envelope de rajada (ver `blendSpeed` em particle.ts), então
 * o traço esquenta sozinho durante uma rajada, sem precisar de uma cor
 * separada por cima.
 *
 * Sem azul no início de propósito: a água do mapa é um azul escuro
 * (`#123e56` em mapStyle.ts) e um traço fraco azulado se perdia nela. O fraco
 * começa num quase-branco (alto contraste com a água) e esquenta por
 * verde → amarelo → laranja → vermelho.
 */
export const SPEED_COLOR_STOPS: readonly { knots: number; color: Rgb }[] = [
  { knots: 0, color: [232, 240, 230] },
  { knots: 5, color: [163, 217, 158] },
  { knots: 10, color: [99, 191, 92] },
  { knots: 15, color: [230, 199, 60] },
  { knots: 20, color: [230, 126, 40] },
  { knots: 26, color: [214, 48, 39] },
];

export function speedToColor(knots: number): Rgb {
  const value = Math.max(0, knots);
  const first = SPEED_COLOR_STOPS[0];
  if (!first || value <= first.knots) return first?.color ?? [255, 255, 255];
  for (let index = 1; index < SPEED_COLOR_STOPS.length; index += 1) {
    const previous = SPEED_COLOR_STOPS[index - 1];
    const current = SPEED_COLOR_STOPS[index];
    if (!previous || !current) continue;
    if (value <= current.knots) {
      const t = (value - previous.knots) / (current.knots - previous.knots);
      return [
        Math.round(previous.color[0] + (current.color[0] - previous.color[0]) * t),
        Math.round(previous.color[1] + (current.color[1] - previous.color[1]) * t),
        Math.round(previous.color[2] + (current.color[2] - previous.color[2]) * t),
      ];
    }
  }
  const last = SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1];
  return last?.color ?? [255, 255, 255];
}
