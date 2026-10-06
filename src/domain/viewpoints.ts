export type Viewpoint = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  distance: number;
  bearing: number;
  pitch: number;
};

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: "amores",
    label: "Ilha dos Amores",
    lng: -46.7245181,
    lat: -23.695741,
    distance: 2200,
    bearing: 24,
    pitch: 52,
  },
  {
    id: "barragem",
    label: "Barragem",
    lng: -46.723,
    lat: -23.6742,
    distance: 1600,
    bearing: 8,
    pitch: 58,
  },
  {
    id: "sul",
    label: "Braço sul",
    lng: -46.746,
    lat: -23.758,
    distance: 2200,
    bearing: 18,
    pitch: 60,
  },
  {
    id: "rasante",
    label: "Rasante",
    lng: -46.734,
    lat: -23.73,
    distance: 650,
    bearing: 42,
    pitch: 74,
  },
];
