import { HeatingStudy } from './heating-profile.service';

export const MODEL_VISUALS = {
  burlington_envelope: { name: 'Envelope', color: '#059669' },
  burlington_peak: { name: 'Peak-scaled', color: '#d97706' },
  burlington_hdd18: { name: 'Daily HDD18', color: '#2563eb' },
  thermo_rc_ca_v1: { name: 'THERMO-derived RC', color: '#7c3aed' },
  hdd_daily_ca_v1: { name: 'HDD', color: '#2563eb' },
  heat_balance_ca_v1: { name: 'Heat balance', color: '#059669' },
  necb_slp_ca_v1: { name: 'NECB SLP', color: '#d97706' },
};
export function modelVisual(id: string): { name: string; color: string } {
  return MODEL_VISUALS[id] || { name: id, color: '#64748b' };
}
export function peakWeekBounds(values: number[]): [number, number] {
  const peakIndex = values.indexOf(Math.max(...values));
  const start = Math.max(0, Math.min(peakIndex - 84, values.length - 168));
  return [start, Math.min(start + 168, values.length)];
}
export function buildMetricChart(study: HeatingStudy, key: string, unit: string): any {
  return {
    aria: { enabled: true }, backgroundColor: '#ffffff',
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    toolbox: { feature: { saveAsImage: { title: 'Save chart', name: `heating-${key}` } } },
    grid: { top: 35, bottom: 48, left: 105, right: 65 },
    xAxis: { type: 'value', name: unit, nameLocation: 'middle', nameGap: 28, min: key.includes('bias') ? undefined : 0 },
    yAxis: { type: 'category', inverse: true, data: study.results.map(r => modelVisual(r.model).name) },
    series: [{ type: 'bar', barMaxWidth: 38,
      label: { show: true, position: 'right', formatter: p => p.value == null ? 'N/A' : Number(p.value).toLocaleString(undefined, {maximumFractionDigits: 2}) },
      data: study.results.map(r => ({ value: r.metrics[key], itemStyle: { color: modelVisual(r.model).color, borderRadius: [0, 4, 4, 0] } })) }],
  };
}
