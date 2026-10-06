export type PlaceKind = "club" | "island";

export type Place = {
  name: string;
  lng: number;
  lat: number;
  kind: PlaceKind;
};

/** Shore clubs and named islands from OpenStreetMap. */
export const PLACES: Place[] = [
  { name: "Ilha dos Amores", lng: -46.7245181, lat: -23.695741, kind: "island" },
  { name: "Ilha do Eucalipto", lng: -46.7337197, lat: -23.7335585, kind: "island" },
  { name: "São Paulo Yacht Club", lng: -46.7185181, lat: -23.678174, kind: "club" },
  { name: "Yacht Club Santo Amaro", lng: -46.7180393, lat: -23.6812536, kind: "club" },
  { name: "Yacht Club Paulista", lng: -46.7424952, lat: -23.6954414, kind: "club" },
  { name: "Yacht Club Itaupu", lng: -46.7329987, lat: -23.7007281, kind: "club" },
  { name: "Marina Sylvestre", lng: -46.7150488, lat: -23.6941634, kind: "club" },
  { name: "Clube de Campo do Castelo", lng: -46.7163938, lat: -23.7144231, kind: "club" },
  { name: "Clube de Campo de São Paulo", lng: -46.720475, lat: -23.7360439, kind: "club" },
  { name: "Clube Atlético Indiano", lng: -46.7306594, lat: -23.6725511, kind: "club" },
  { name: "Bola Sport Clube", lng: -46.6973866, lat: -23.7269067, kind: "club" },
  { name: "AFPS Clube Náutico", lng: -46.7744423, lat: -23.7457637, kind: "club" },
  { name: "Clube Rincão", lng: -46.7421158, lat: -23.7756403, kind: "club" },
  { name: "Clube de Campo Pão de Açúcar", lng: -46.712114, lat: -23.8008437, kind: "club" },
];

export const placesGeoJson = {
  type: "FeatureCollection" as const,
  features: PLACES.map((place) => ({
    type: "Feature" as const,
    properties: { name: place.name, kind: place.kind },
    geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] as [number, number] },
  })),
};
