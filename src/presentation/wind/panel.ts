import type { WindDay } from "../../domain/wind/series";
import { extremeHour, sampleSeries, sampleWeather } from "../../domain/wind/series";
import {
  formatCelsius,
  formatFrom,
  formatHour,
  formatKnots,
  formatMillimetres,
  formatWindDate,
  weatherLabel,
} from "./format";

export type DayPanelElements = {
  dayName: HTMLElement;
  dayWhen: HTMLElement;
  dayWind: HTMLElement;
  dayDir: HTMLElement;
  dayGust: HTMLElement;
  dayTemp: HTMLElement;
  dayRh: HTMLElement;
  dayCloud: HTMLElement;
  dayRain: HTMLElement;
  daySky: HTMLElement;
  dayPeak: HTMLElement;
  dayPeakGust: HTMLElement;
  dayTempRange: HTMLElement;
  dayRainSum: HTMLElement;
  dayField: HTMLElement;
  dayChart: HTMLElement;
  windStatus: HTMLElement;
  windStatusReadout: HTMLElement;
  flowNote: HTMLElement;
};

export function mountDayPicker(container: HTMLElement, days: WindDay[], selectedId: string, onSelect: (day: WindDay) => void): void {
  for (const item of days) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.windDay = item.id;
    button.setAttribute("aria-pressed", String(item.id === selectedId));
    const name = document.createElement("span");
    name.className = "wind-name";
    name.textContent = item.nome;
    const date = document.createElement("span");
    date.textContent = item.data.split("-").reverse().join("/");
    button.append(name, date);
    button.addEventListener("click", () => {
      const next = days.find((candidate) => candidate.id === item.id);
      if (!next) return;
      for (const other of container.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      onSelect(next);
    });
    container.append(button);
  }
}

export function renderDayPanel(elements: DayPanelElements, day: WindDay, hour: number, gustsOn: boolean): void {
  if (!day.horas) return;
  const hours = day.horas;
  const sample = sampleSeries(day, hour);
  const weather = sampleWeather(day, hour);
  elements.dayName.textContent = day.nome;
  elements.dayWhen.textContent = `${formatWindDate(day.data)} · ${formatHour(hour)} · ${day.modelo}`;
  elements.dayWind.textContent = formatKnots(sample.velocidade);
  elements.dayDir.textContent = formatFrom(sample.direcao);
  elements.windStatus.style.setProperty("--flow", `${(sample.direcao + 180) % 360}deg`);
  const gustBit = gustsOn ? ` · rajada ${formatKnots(sample.rajada).replace(" nós", "")}` : "";
  elements.windStatusReadout.textContent = `${formatKnots(sample.velocidade)}${gustBit} · ${formatFrom(sample.direcao)}`;
  elements.dayGust.textContent = formatKnots(sample.rajada);
  elements.dayTemp.textContent = weather ? formatCelsius(weather.temperatura) : "—";
  elements.dayRh.textContent = weather ? `${Math.round(weather.umidade)}%` : "—";
  elements.dayCloud.textContent = weather ? `${Math.round(weather.nuvens)}%` : "—";
  elements.dayRain.textContent = weather ? `${formatMillimetres(weather.chuva)}` : "—";
  elements.daySky.textContent = weather ? weatherLabel(weather.codigo) : "";
  const peak = extremeHour(hours, "velocidade");
  const gust = extremeHour(hours, "rajada");
  const temps = hours.flatMap((item) => (item.temperatura == null ? [] : [item.temperatura]));
  const rain = hours.reduce((sum, item) => sum + (item.chuva ?? 0), 0);
  elements.dayPeak.textContent = `${formatKnots(peak.value)} às ${peak.index}h`;
  elements.dayPeakGust.textContent = `${formatKnots(gust.value)} às ${gust.index}h`;
  elements.dayTempRange.textContent = temps.length ? `${formatCelsius(Math.min(...temps))} – ${formatCelsius(Math.max(...temps))}` : "—";
  elements.dayRainSum.textContent = formatMillimetres(rain);
  elements.dayField.textContent = fieldSentence(day, hour, gustsOn);
  elements.flowNote.textContent = gustsOn
    ? "Alguns traços, de vez em quando, ficam vermelhos, sobem até a rajada da hora e voltam. Os outros seguem brancos, no vento constante."
    : "O traço mostra o vento desta hora, igual em todo o lago, e aponta para onde ele vai.";
  elements.dayChart.setAttribute("aria-valuenow", String(Math.floor(hour)));
  elements.dayChart.setAttribute("aria-valuetext", formatHour(hour));
}

function fieldSentence(day: WindDay, hour: number, gustsOn: boolean): string {
  const regional = sampleSeries(day, hour);
  const base = `O vento é o mesmo em todo o lago: ${formatKnots(regional.velocidade)}, ${formatFrom(regional.direcao)}. O traço aponta para onde ele vai.`;
  if (!gustsOn) return base;
  return `${base} Alguns traços ficam vermelhos até a rajada de ${formatKnots(regional.rajada)} e voltam.`;
}
