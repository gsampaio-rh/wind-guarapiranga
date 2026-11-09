/** Toggles experimentais do modelo de vento — todos nascem desligados (comportamento atual do app). */
export type WindModelFlags = {
  /** F1: troca o catálogo ERA5 pelo catálogo de maior resolução (best_match), mesmas datas. */
  hiresSource: boolean;
  /** F2: mostra o vento observado nas estações do INMET ao lado do simulado. */
  inmetValidation: boolean;
  /** F3: aplica aceleração/abrigo orográfico por célula, derivado do relevo real. */
  orographic: boolean;
  /** F4: acelera o vento conforme a distância percorrida sobre a água (fetch). */
  waterFetch: boolean;
  /** F7: acelera o vento perto de pontas/penínsulas da margem, abriga perto de baías/enseadas. */
  shoreCurvature: boolean;
  /** F12: abriga o vento perto de margem com mata, expõe mais perto de margem aberta/construída (dado real do OSM). */
  shoreRoughness: boolean;
  /** F11: brisa de lago (água→terra, mais forte perto da margem) — estimativa calibrada pela literatura, não medida aqui. */
  lakeBreeze: boolean;
  /** F6: ajusta o número de partículas pela área de água visível, em vez de uma contagem fixa — driven pelo 2º clique do ícone Partículas, não por um botão próprio. */
  adaptiveDensity: boolean;
};

export const DEFAULT_FLAGS: WindModelFlags = {
  hiresSource: false,
  inmetValidation: false,
  orographic: false,
  waterFetch: false,
  shoreCurvature: false,
  shoreRoughness: false,
  lakeBreeze: false,
  adaptiveDensity: false,
};

export type ModelFlagId = keyof WindModelFlags;

export const MODEL_FLAG_BUTTONS: { id: ModelFlagId; elementId: string }[] = [
  { id: "hiresSource", elementId: "model-hires" },
  { id: "inmetValidation", elementId: "model-inmet" },
  { id: "orographic", elementId: "model-orographic" },
  { id: "waterFetch", elementId: "model-fetch" },
  { id: "shoreCurvature", elementId: "model-curvature" },
  { id: "shoreRoughness", elementId: "model-roughness" },
  { id: "lakeBreeze", elementId: "model-lakebreeze" },
];
