import type { WindHour } from "../../domain/wind/series";

export function paintDayChart(dayChart: HTMLCanvasElement, hours: WindHour[], hour: number): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(dayChart.clientWidth * ratio));
  const height = Math.max(1, Math.round(dayChart.clientHeight * ratio));
  if (dayChart.width !== width || dayChart.height !== height) {
    dayChart.width = width;
    dayChart.height = height;
  }
  const chart = dayChart.getContext("2d");
  if (!chart || dayChart.clientWidth === 0) return;
  chart.setTransform(ratio, 0, 0, ratio, 0, 0);
  const viewWidth = dayChart.clientWidth;
  const viewHeight = dayChart.clientHeight;
  chart.clearRect(0, 0, viewWidth, viewHeight);
  const maxSpeed = Math.max(4, ...hours.map((item) => item.rajada));
  const temps = hours.flatMap((item) => (item.temperatura == null ? [] : [item.temperatura]));
  const slot = viewWidth / 24;
  const arrowY = 18;
  const barBase = viewHeight - 22;
  const barHeight = Math.max(24, barBase - 40);
  const current = Math.floor(hour) % 24;
  chart.fillStyle = "rgba(244, 255, 248, 0.08)";
  chart.fillRect(current * slot, 0, slot, viewHeight);
  hours.forEach((item, index) => {
    const x = index * slot + 1.5;
    const barWidth = Math.max(1, slot - 3);
    const gustHeight = (item.rajada / maxSpeed) * barHeight;
    const meanHeight = (item.velocidade / maxSpeed) * barHeight;
    chart.fillStyle = "rgba(215, 228, 218, 0.32)";
    chart.fillRect(x, barBase - gustHeight, barWidth, gustHeight);
    chart.fillStyle = index === current ? "#f4fff8" : "#8fd6a8";
    chart.fillRect(x, barBase - meanHeight, barWidth, meanHeight);
    const bearing = ((item.direcao + 180) * Math.PI) / 180;
    chart.strokeStyle = index === current ? "#f2d16b" : "#f7faf7";
    chart.fillStyle = index === current ? "#f2d16b" : "#f7faf7";
    chart.lineWidth = 1.4;
    strokeArrow(chart, x + barWidth / 2, arrowY, bearing, 11);
  });
  if (temps.length === hours.length) {
    const low = Math.min(...temps);
    const high = Math.max(...temps);
    chart.beginPath();
    chart.strokeStyle = "#f2d16b";
    chart.lineWidth = 1.5;
    hours.forEach((item, index) => {
      const y = viewHeight - 6 - ((item.temperatura ?? low) - low) / Math.max(0.5, high - low) * 14;
      const x = index * slot + slot / 2;
      if (index === 0) chart.moveTo(x, y);
      else chart.lineTo(x, y);
    });
    chart.stroke();
  }
  chart.strokeStyle = "#f7faf7";
  chart.lineWidth = 1;
  chart.beginPath();
  chart.moveTo((hour / 24) * viewWidth, 0);
  chart.lineTo((hour / 24) * viewWidth, viewHeight);
  chart.stroke();
}

function strokeArrow(chart: CanvasRenderingContext2D, x: number, y: number, bearing: number, length: number): void {
  const dx = Math.sin(bearing) * length;
  const dy = -Math.cos(bearing) * length;
  chart.beginPath();
  chart.moveTo(x, y);
  chart.lineTo(x + dx, y + dy);
  chart.stroke();
  const angle = Math.atan2(dy, dx);
  const head = 4.5;
  chart.beginPath();
  chart.moveTo(x + dx, y + dy);
  chart.lineTo(x + dx - head * Math.cos(angle - 0.45), y + dy - head * Math.sin(angle - 0.45));
  chart.lineTo(x + dx - head * Math.cos(angle + 0.45), y + dy - head * Math.sin(angle + 0.45));
  chart.closePath();
  chart.fill();
}
