export type WindHour = {
  velocidade: number;
  direcao: number;
  rajada: number;
  temperatura?: number;
  umidade?: number;
  nuvens?: number;
  chuva?: number;
  codigo?: number;
};

const AFTERNOON = [13, 14, 15, 16, 17] as const;
const MORNING = [6, 7, 8, 9, 10, 11] as const;

export const WIND_KINDS = [
  { id: "brisa-sudeste", nome: "Brisa de sudeste", test: isSoutheastBreeze },
  { id: "norte", nome: "Norte", test: isNorthWind },
  { id: "vento-forte", nome: "Vento forte", test: isStrongWind },
  { id: "calmaria", nome: "Calmaria", test: isCalmDay },
] as const;

export type WindKindId = (typeof WIND_KINDS)[number]["id"];

export function isSaturday(isoDate: string): boolean {
  return new Date(`${isoDate}T12:00:00-03:00`).getUTCDay() === 6;
}

export function matchesKind(id: string, hours: WindHour[]): boolean {
  const kind = WIND_KINDS.find((item) => item.id === id);
  return kind ? kind.test(hours) : false;
}

export function isSoutheastBreeze(hours: WindHour[]): boolean {
  return afternoonHolds(hours, (direction) => direction >= 100 && direction <= 190) && meanSpeed(hours, MORNING) < meanSpeed(hours, AFTERNOON);
}

export function isNorthWind(hours: WindHour[]): boolean {
  return afternoonHolds(hours, (direction) => direction >= 300 || direction <= 40);
}

export function isStrongWind(hours: WindHour[]): boolean {
  return hours.some((hour) => hour.velocidade >= 20);
}

export function isCalmDay(hours: WindHour[]): boolean {
  return hours.every((hour) => hour.velocidade < 6);
}

function afternoonHolds(hours: WindHour[], directionOk: (direction: number) => boolean): boolean {
  return AFTERNOON.every((index) => {
    const hour = hours[index];
    return hour != null && directionOk(hour.direcao) && hour.velocidade >= 8 && hour.velocidade <= 18;
  });
}

function meanSpeed(hours: WindHour[], indexes: readonly number[]): number {
  let sum = 0;
  for (const index of indexes) sum += hours[index]?.velocidade ?? Number.POSITIVE_INFINITY;
  return sum / indexes.length;
}
