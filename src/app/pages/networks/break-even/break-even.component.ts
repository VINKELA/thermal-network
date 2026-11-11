import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, timer } from 'rxjs';
import { exhaustMap, takeUntil } from 'rxjs/operators';
import * as Papa from 'papaparse';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { HeatingProfileService } from '../load-profile-comparison/heating-profile.service';

interface InputField { key: string; label: string; min: number; max: number; step: number; }
interface InputGroup { title: string; fields: InputField[]; }

@Component({
  selector: 'ngx-break-even',
  templateUrl: './break-even.component.html',
  styleUrls: ['./break-even.component.scss'],
})
export class BreakEvenComponent implements OnInit, OnDestroy {
  groups: InputGroup[] = [];
  options: { [key: string]: number } = {};
  projects: Array<{ id: number; name: string }> = [];
  networks: Array<{ id: number; name: string }> = [];
  projectId: number = null;
  networkId: number = null;
  mode = 'demo';
  year = new Date().getFullYear() - 1;
  networkProfile = 'active';
  sourceModel = '';
  profileLabel = '';
  hourlyKw: number[] = [];
  residualCredit = false;
  busy = false;
  error = '';
  progress = '';
  result: any = null;
  costChart: any = {};
  componentChart: any = {};
  storageChart: any = {};
  loadChart: any = {};
  sensitivityChart: any = {};
  criticalChart: any = {};
  criticalDifferenceChart: any = {};
  criticalKey = 'hp';
  criticalRootIndex = 0;
  criticalZoom = true;
  strategyZoneChart: any = {};
  zoneStrategies = ['small', 'large', 'hp', 'tes'];
  showOtherCrossings = true;
  zoneFocusM: number = null;
  zoneBasis = 'economic';
  plotScale = 'relative';
  imageExportMessage = '';
  exportingImage = false;
  stale = false;
  readonly labels = { small: 'A · Small pipe + pumping', large: 'B · Larger pipe', hp: 'C · Small pipe + HP', tes: 'D · Small pipe + TES' };
  readonly colors = { small: '#dc2626', large: '#2563eb', hp: '#7c3aed', tes: '#059669' };
  costDiameter(diameter: number): number {
    const width = this.options.diameter_band_width_mm || 0;
    return width > 0 ? Math.ceil(Number((diameter / width).toPrecision(14))) * width : diameter;
  }
  installedRate(diameter: number): number {
    return this.options.reference_cost * ((1 - this.options.alpha) + this.options.alpha *
      Math.pow(this.costDiameter(diameter) / this.options.reference_diameter_mm, this.options.exponent_n));
  }
  private destroyed$ = new Subject<void>();
  private stopPolling$ = new Subject<void>();
  private scopeChange$ = new Subject<void>();

  constructor(private api: RestApiService, private context: ProjectContextService,
              private heating: HeatingProfileService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const selectedStrategies = (this.route.snapshot.queryParamMap.get('strategies') || '').split(',').filter(Boolean);
    if (selectedStrategies.length && selectedStrategies.every(key => Object.keys(this.labels).includes(key))) {
      this.zoneStrategies = Array.from(new Set(selectedStrategies));
    }
    const basis = this.route.snapshot.queryParamMap.get('zone_basis');
    if (basis === 'economic' || basis === 'feasible') this.zoneBasis = basis;
    const scale = this.route.snapshot.queryParamMap.get('plot_scale');
    if (scale === 'total' || scale === 'relative') this.plotScale = scale;
    this.api.get<any>('break-even/').pipe(takeUntil(this.destroyed$)).subscribe({
      next: schema => { this.groups = schema.groups; if (!Object.keys(this.options).length) this.options = { ...schema.defaults }; },
      error: e => this.showError(e),
    });
    this.heating.getOptions('projects/').pipe(takeUntil(this.destroyed$)).subscribe({ next: p => this.projects = p, error: e => this.showError(e) });
    this.context.selectedProject$.pipe(takeUntil(this.destroyed$)).subscribe(id => {
      this.scopeChange$.next(); this.stopPolling$.next(); this.busy = false;
      this.projectId = id; this.networkId = null; this.networks = []; this.result = null; this.error = '';
      if (id) this.heating.getOptions(`networks/?project_id=${id}`).pipe(takeUntil(this.scopeChange$), takeUntil(this.destroyed$))
        .subscribe({ next: n => this.networks = n, error: e => this.showError(e) });
    });
    const linked = this.route.snapshot.queryParamMap.get('run');
    if (linked && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(linked)) this.resume(linked);
  }

  ngOnDestroy(): void {
    [this.destroyed$, this.stopPolling$, this.scopeChange$].forEach(s => { s.next(); s.complete(); });
  }
  selectProject(id: number): void { this.context.setProject(id); }
  changed(): void { if (this.result) this.stale = true; }
  name(key: string): string { return this.labels[key] || key; }
  get criticalViews(): any[] { return this.result && this.result.critical_lengths || []; }
  get activeCritical(): any { return this.criticalViews.find(v => v.key === this.criticalKey) || this.criticalViews[0]; }
  get activeCrossing(): any { const v = this.activeCritical; return v && v.crossings[this.criticalRootIndex]; }
  selectCritical(key: string): void { this.criticalKey = key; this.criticalRootIndex = 0; this.criticalZoom = true; this.renderCritical(); }
  formatLength(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m'; }
  get zoneStrategyOrder(): string[] { return this.result && this.result.strategy_analysis ? this.result.strategy_analysis.strategy_order : []; }
  get activeStrategyMap(): any {
    const analysis = this.result && this.result.strategy_analysis;
    const maps = analysis && (this.zoneBasis === 'economic' ? analysis.economic_maps : analysis.maps);
    return maps && maps[this.zoneStrategyOrder.filter(k => this.zoneStrategies.includes(k)).join(',')];
  }
  get otherZoneCrossings(): any[] { return this.activeStrategyMap ? this.activeStrategyMap.pairwise_crossings.filter(p => p.classification !== 'winner_change') : []; }
  toggleZoneStrategy(key: string, selected: boolean): void {
    if (!selected && this.zoneStrategies.length === 1) return;
    this.zoneStrategies = selected ? Array.from(new Set([...this.zoneStrategies, key])) : this.zoneStrategies.filter(k => k !== key);
    this.zoneFocusM = null; this.renderStrategyZones();
  }
  focusZoneBoundary(length: number | null): void { this.zoneFocusM = length; this.renderStrategyZones(); }
  private interpolateCost(points: any[], length: number): number {
    if (length <= points[0].length_m) return points[0].npc;
    if (length >= points[points.length - 1].length_m) return points[points.length - 1].npc;
    let low = 0, high = points.length - 1;
    while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (points[mid].length_m <= length) low = mid; else high = mid; }
    const a = points[low], b = points[high];
    return a.npc + (b.npc - a.npc) * (length - a.length_m) / (b.length_m - a.length_m);
  }
  private plottedCost(cost: number, length: number, reference: any[]): number {
    return this.plotScale === 'relative' ? cost - this.interpolateCost(reference, length) : cost;
  }
  changePlotScale(): void { if (this.result) this.render(); }

  private presentationImage(kind: string, renderer = 'canvas'): string {
    const library = (window as any).echarts;
    if (!library || !library.init) throw new Error('The chart library is still loading. Try again shortly.');
    const source = kind === 'zones' ? this.strategyZoneChart : this.criticalChart;
    if (!source || !source.series) throw new Error('Load a study before exporting a chart.');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;pointer-events:none';
    document.body.appendChild(host);
    const chart = library.init(host, null, { width: 1920, height: 1080, renderer });
    const title = kind === 'zones' ? 'Where the preferred strategy changes' : this.activeCritical.title;
    const relative = this.plotScale === 'relative' && (kind === 'zones' || !this.activeCritical.diagnostic);
    const subtitle = relative ? 'Lifecycle cost difference · a clearer view of the break-even points' : 'Total lifecycle cost · exact model intersections';
    const context = `${this.result.profile.year || ''} heating profile  |  ${this.result.inputs.options.years}-year lifecycle  |  ${kind === 'zones' ? this.zoneBasis === 'economic' ? 'Economic comparison; hydraulic limits not enforced' : 'Operating limits enforced' : this.activeCritical.symbol}`;
    const series = source.series.map(s => ({ ...s,
      animation: false,
      lineStyle: s.lineStyle ? { ...s.lineStyle, width: s.lineStyle.width >= 4 ? 5 : 3 } : undefined,
      label: s.label ? { ...s.label, fontSize: 18, fontFamily: 'Arial', color: s.label.color || '#334155', opacity: 1 } : undefined,
      markPoint: s.markPoint ? { ...s.markPoint, symbolSize: 20 } : undefined,
      markLine: s.markLine ? { ...s.markLine, label: { ...s.markLine.label, fontSize: 18 },
        data: (s.markLine.data || []).map(d => ({ ...d, label: { ...(d.label || {}), fontSize: 18 } })) } : undefined,
      markArea: s.markArea ? { ...s.markArea, data: s.markArea.data.map(pair => pair.map(d => ({ ...d,
        label: { ...(d.label || {}), fontSize: 18, color: '#334155', opacity: 1 } }))) } : undefined,
    }));
    const options = { ...source, animation: false, backgroundColor: '#ffffff',
      textStyle: { fontFamily: 'Arial', color: '#17243b', fontSize: 18 },
      title: [{ text: title, left: 95, top: 45, textStyle: { fontSize: 36, fontWeight: 600, color: '#14233b' } },
        { text: subtitle, left: 95, top: 102, textStyle: { fontSize: 21, fontWeight: 400, color: '#64748b' } }],
      legend: { ...source.legend, left: 95, top: 165, itemWidth: 38, itemHeight: 16, itemGap: 28, textStyle: { fontSize: 20, color: '#334155' } },
      toolbox: { show: false }, tooltip: { show: false }, dataZoom: [],
      grid: { left: 155, right: 365, top: 265, bottom: 190 },
      xAxis: { ...source.xAxis, nameGap: 50, nameTextStyle: { fontSize: 20 },
        axisLabel: { ...source.xAxis.axisLabel, fontSize: 18, color: '#64748b', margin: 15 },
        axisLine: { lineStyle: { color: '#cbd5e1' } }, axisTick: { show: false }, splitLine: { show: false } },
      yAxis: { ...source.yAxis, nameLocation: 'middle', nameRotate: 90, nameGap: 105, nameTextStyle: { fontSize: 19 },
        axisLabel: { ...source.yAxis.axisLabel, fontSize: 18, color: '#64748b', margin: 15 },
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#e7edf5' } } },
      graphic: [{ type: 'text', left: 95, top: 975, style: { text: context, font: '18px Arial', fill: '#475569' } },
        { type: 'text', left: 95, top: 1013, style: { text: 'Imported modeled demand and illustrative cost assumptions. Rescaling preserves all crossing lengths.', font: '16px Arial', fill: '#64748b' } }],
      series };
    try {
      chart.setOption(options, true);
      return chart.getDataURL({ type: renderer === 'svg' ? 'svg' : 'png', pixelRatio: 2, backgroundColor: '#fff', excludeComponents: ['toolbox', 'dataZoom'] });
    } finally { chart.dispose(); host.remove(); }
  }
  async exportPresentation(kind = 'zones', action = 'download'): Promise<void> {
    this.imageExportMessage = ''; this.exportingImage = true;
    try {
      const url = this.presentationImage(kind, action === 'svg' ? 'svg' : 'canvas');
      const filename = `break-even-${kind}-${this.plotScale}-presentation.${action === 'svg' ? 'svg' : 'png'}`;
      if (action === 'copy') {
        try {
          const blob = await (await fetch(url)).blob();
          const Item = (window as any).ClipboardItem;
          if (!(navigator as any).clipboard?.write || !Item) throw new Error('Image clipboard unavailable');
          await (navigator as any).clipboard.write([new Item({ 'image/png': blob })]);
          this.imageExportMessage = 'Presentation image copied. Paste it directly into PowerPoint or your document.';
        } catch {
          const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
          this.imageExportMessage = 'Image copying was unavailable, so the high-resolution PNG was downloaded.';
        }
      } else {
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        this.imageExportMessage = action === 'svg' ? 'Vector SVG downloaded; it stays sharp when resized.' : 'Presentation PNG downloaded at 3840 × 2160 pixels.';
      }
    } catch (error) { this.imageExportMessage = error.message || 'The image could not be exported. Try again.'; }
    finally { this.exportingImage = false; }
  }
  crossingDescription(crossing: any): string {
    if (crossing.classification === 'service_infeasible_crossing') return 'At least one strategy cannot supply the full heating demand.';
    if (crossing.classification === 'infeasible_crossing') return 'At least one of these strategies fails the modeled limits.';
    if (crossing.classification === 'optimal_tie') return 'Equal lowest cost at this point; no change in the winning zone.';
    if (crossing.classification === 'winner_change') return 'Changes the overall least-cost strategy.';
    return `${crossing.cheaper_keys.map(k => this.name(k)).join(', ')} is cheaper here; the pairwise crossing does not change the winner.`;
  }

  renderStrategyZones(): void {
    const analysis = this.result && this.result.strategy_analysis;
    const map = this.activeStrategyMap;
    if (!analysis || !map) return;
    const maximum = this.result.inputs.options.maximum_length_m;
    const span = this.zoneFocusM == null ? maximum : Math.max(.25, this.zoneFocusM * .4);
    const low = this.zoneFocusM == null ? 0 : Math.max(0, this.zoneFocusM - span);
    const high = this.zoneFocusM == null ? maximum : Math.min(maximum, this.zoneFocusM + span);
    const keys = this.zoneStrategyOrder.filter(k => this.zoneStrategies.includes(k));
    const reference = analysis.curves.large;
    const displayCost = (cost, length) => this.plottedCost(cost, length, reference);
    const visible = keys.reduce((all, k) => all.concat(analysis.curves[k].filter(p => p.length_m >= low && p.length_m <= high)), [] as any[]);
    const costs = visible.map(p => displayCost(p.npc, p.length_m));
    const lower = Math.min(0, ...costs), upper = Math.max(0, ...costs);
    const padding = Math.max(1, upper - lower) * .12;
    const minCost = this.plotScale === 'relative' || this.zoneFocusM != null ? lower - padding : 0;
    const maxCost = upper + padding;
    const costUnit = this.plotScale === 'relative' ? 1000 : 1e6;
    const symbols = { small: 'circle', large: 'rect', hp: 'diamond', tes: 'triangle' };
    const shortNames = { small: 'Small pipe + pumping', large: 'Upsized pipe', hp: 'Heat pump', tes: 'TES' };
    const endpoints = keys.map(key => {
      const last = analysis.curves[key].filter(p => p.length_m >= low && p.length_m <= high).slice(-1)[0];
      return { key, value: last ? displayCost(last.npc, last.length_m) : 0 };
    }).sort((a, b) => b.value - a.value);
    const labelOffsets: { [key: string]: number } = {};
    let previousLabelY = -22;
    endpoints.forEach(point => {
      const actualY = (maxCost - point.value) / (maxCost - minCost) * 400;
      const labelY = Math.max(actualY, previousLabelY + 22);
      labelOffsets[point.key] = labelY - actualY;
      previousLabelY = labelY;
    });
    const shaded = map.zones.map((zone, i) => [{ xAxis: zone.start_m, name: `Zone ${i + 1}`,
      itemStyle: { color: zone.winner ? this.colors[zone.winner] : '#64748b', opacity: .07 },
      label: { show: (zone.end_m - zone.start_m) / (high - low) > .06, position: 'insideBottom', color: '#334155', fontWeight: 'bold' } }, { xAxis: zone.end_m }]);
    const lines = map.transitions.map(t => ({ xAxis: t.length_m, name: t.label,
      lineStyle: { color: t.kind === 'cost_crossing' ? '#475569' : '#d97706', type: 'dashed', width: 2 },
      label: { formatter: `${t.label} = ${this.formatLength(t.length_m)}`, position: 'insideEndTop', backgroundColor: '#fff', color: '#334155', padding: 4 } }));
    const series: any[] = [];
    keys.forEach((key, index) => {
      series.push({ type: 'line', name: this.name(key), showSymbol: false, connectNulls: false,
        itemStyle: { color: this.colors[key] }, lineStyle: { color: this.colors[key], width: 2 },
        symbol: symbols[key], symbolSize: 7,
        data: analysis.curves[key].map(p => [p.length_m, p.feasible ? displayCost(p.npc, p.length_m) : null]),
        markArea: index === 0 ? { silent: true, data: shaded } : undefined,
        markLine: index === 0 ? { silent: true, symbol: 'none', data: lines } : undefined });
      series.push({ type: 'line', name: this.name(key), showSymbol: false, connectNulls: false,
        itemStyle: { color: this.colors[key] }, lineStyle: { color: this.colors[key], width: 2, type: 'dashed', opacity: .8 },
        data: analysis.curves[key].map(p => [p.length_m, p.feasible ? null : displayCost(p.npc, p.length_m)]) });
      const last = analysis.curves[key].filter(p => p.length_m >= low && p.length_m <= high).slice(-1)[0];
      if (last) series.push({ type: 'scatter', name: this.name(key), symbol: symbols[key], symbolSize: 9,
        itemStyle: { color: this.colors[key] }, z: 12, data: [[last.length_m, displayCost(last.npc, last.length_m)]],
        label: { show: true, position: 'right', offset: [6, labelOffsets[key]], formatter: shortNames[key], color: this.colors[key], fontWeight: 'bold', fontSize: 13 },
        tooltip: { show: false } });
    });
    // Separate segments preserve jumps when a winner becomes infeasible.
    map.zones.filter(zone => zone.winner).forEach(zone => [true, false].forEach(feasibleSection => series.push({
      type: 'line', name: this.name(zone.winner), showSymbol: false, connectNulls: false,
      itemStyle: { color: this.colors[zone.winner] }, lineStyle: { color: this.colors[zone.winner], width: 5, type: feasibleSection ? 'solid' : 'dashed' },
      data: analysis.curves[zone.winner].filter(p => p.length_m >= zone.start_m - 1e-6 && p.length_m <= zone.end_m + 1e-6)
        .map(p => [p.length_m, p.feasible === feasibleSection ? displayCost(p.npc, p.length_m) : null]), z: 5 })));
    const changes = map.pairwise_crossings.filter(p => p.classification === 'winner_change');
    series.push({ type: 'scatter', name: 'Overall winner changes', symbol: 'diamond', symbolSize: 16, z: 10,
      itemStyle: { color: '#0f172a', borderColor: '#fff', borderWidth: 2 },
      data: changes.map(p => ({ value: [p.length_m, displayCost(p.cost_cad, p.length_m)], crossing: p })),
      tooltip: { trigger: 'item', renderMode: 'richText', formatter: p => `${p.data.crossing.label}\n${this.formatLength(p.value[0])}\n${this.name(p.data.crossing.a)} / ${this.name(p.data.crossing.b)}\nChanges the overall winner` } });
    if (this.showOtherCrossings) series.push({ type: 'scatter', name: 'Other pairwise crossings', symbol: 'emptyCircle', symbolSize: 11, z: 8,
      itemStyle: { color: '#64748b', borderWidth: 2 },
      data: this.otherZoneCrossings.map(p => ({ value: [p.length_m, displayCost(p.cost_cad, p.length_m)], crossing: p })),
      tooltip: { trigger: 'item', renderMode: 'richText', formatter: p => `${this.name(p.data.crossing.a)} / ${this.name(p.data.crossing.b)}\n${this.formatLength(p.value[0])}\n${this.crossingDescription(p.data.crossing)}` } });
    const operationalLimits = (analysis.feasibility_boundaries || []).filter(b => keys.includes(b.key));
    operationalLimits.forEach((boundary, i) => {
      const length = boundary.length_m;
      if (length < low || length > high) return;
      series.push({ type: 'line', name: `${shortNames[boundary.key]} operating limit`, data: [],
        markLine: { silent: false, symbol: 'none',
          lineStyle: { color: this.colors[boundary.key], type: 'dotted', width: 2 },
          label: { show: true, position: 'insideEndTop', rotate: 90, color: this.colors[boundary.key],
            backgroundColor: '#ffffff', padding: 4, fontSize: 12,
            formatter: `${shortNames[boundary.key]} limit: ${this.formatLength(length)}` },
          data: [{ xAxis: length }] },
        tooltip: { formatter: `${shortNames[boundary.key]}: ${this.formatLength(length)}\n${boundary.reasons.join(' ')}` } });
    });
    this.strategyZoneChart = { ...this.baseChart(), legend: { type: 'scroll', top: 25, data: keys.map(k => this.name(k)) },
      grid: { left: 105, right: 150, top: 105, bottom: 90 },
      tooltip: { trigger: 'axis', renderMode: 'richText', formatter: params => {
        const items = params.filter(p => Array.isArray(p.value) && p.value[1] != null && p.seriesType === 'line');
        const unique = items.filter((p, i) => items.findIndex(other => other.seriesName === p.seriesName) === i);
        return unique.length ? `Distance: ${this.formatLength(unique[0].value[0])}\n` + unique.map(p => `${p.seriesName}: ${(p.value[1] / costUnit).toFixed(2)} ${this.plotScale === 'relative' ? 'thousand CAD versus upsized pipe' : 'million CAD'}`).join('\n') : '';
      } },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', filterMode: 'none', bottom: 8 }],
      xAxis: { type: 'value', name: 'Trunk route length L (m)', min: low, max: high, nameLocation: 'middle', nameGap: 35 },
      yAxis: { type: 'value', name: this.plotScale === 'relative' ? 'Extra cost vs upsized pipe (thousand CAD)' : 'Total lifecycle cost (million CAD)', min: minCost, max: maxCost,
        axisLabel: { formatter: v => (v / costUnit).toFixed(1) } }, series };
    if (this.plotScale === 'relative') series[0].markLine.data.unshift({ yAxis: 0, lineStyle: { color: '#2563eb', type: 'solid', width: 1 }, label: { formatter: 'Upsized pipe reference', position: 'insideStartTop' } });
  }

  renderCritical(): void {
    const view = this.activeCritical;
    if (!view) return;
    const root = this.activeCrossing;
    const relative = this.plotScale === 'relative' && !view.diagnostic;
    const leftValue = p => relative ? 0 : p.left;
    const rightValue = p => relative ? p.right - p.left : p.right;
    const maximum = this.result.inputs.options.maximum_length_m;
    const span = root ? Math.max(.25, root.length_m * .4) : maximum;
    const low = this.criticalZoom && root ? Math.max(0, root.length_m - span) : 0;
    const high = this.criticalZoom && root ? Math.min(maximum, root.length_m + span) : maximum;
    const visible = view.points.filter(p => p.length_m >= low && p.length_m <= high);
    const ys = visible.reduce((all, p) => all.concat([leftValue(p), rightValue(p)]), [] as number[]);
    const minimumY = Math.min(...ys), maximumY = Math.max(...ys);
    const costScale = Math.max(Math.abs(minimumY), Math.abs(maximumY)) < 1000 ? 1 : 1000;
    const differenceScale = Math.max(...visible.map(p => Math.abs(p.difference))) < 1000 ? 1 : 1000;
    const minimumDifference = Math.min(0, ...visible.map(p => p.difference));
    const maximumDifference = Math.max(0, ...visible.map(p => p.difference));
    const differencePadding = Math.max(1, maximumDifference - minimumDifference) * .12;
    const padding = Math.max(1, maximumY - minimumY) * .12;
    const label = root ? `${view.symbol} = ${this.formatLength(root.length_m)}` : '';
    const markLine = root ? { silent: true, symbol: 'none',
      lineStyle: { color: '#475569', type: 'dashed' },
      label: { formatter: label, position: 'insideEndTop', color: '#334155', backgroundColor: '#fff', padding: 4 },
      data: [{ xAxis: root.length_m }] } : undefined;
    const axis = { type: 'value', min: low, max: high, name: 'Route distance (m)', nameLocation: 'middle', nameGap: 35,
      axisLabel: { formatter: v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) } };
    const zoom = [{ type: 'inside', filterMode: 'none' }, { type: 'slider', filterMode: 'none', bottom: 5 }];
    this.criticalChart = { ...this.baseChart(), legend: { type: 'scroll', top: 30 },
      grid: { left: 95, right: 45, top: 100, bottom: 85 }, dataZoom: zoom, xAxis: axis,
      yAxis: { type: 'value', name: relative ? `Extra cost vs blue reference (${costScale === 1 ? 'CAD' : 'thousand CAD'})` : costScale === 1 ? 'Present cost (CAD)' : 'Present cost (thousand CAD)', min: minimumY - padding, max: maximumY + padding,
        axisLabel: { formatter: v => (v / costScale).toLocaleString(undefined, { maximumFractionDigits: 2 }) } },
      series: [
        { type: 'line', name: view.left_label, showSymbol: false, lineStyle: { width: 3, type: 'solid' }, itemStyle: { color: '#2563eb' },
          data: view.points.map(p => [p.length_m, leftValue(p)]), markLine,
          markPoint: root ? { symbol: 'diamond', symbolSize: 20, itemStyle: { color: root.feasible ? '#059669' : '#d97706' },
            label: { show: false }, data: [{ name: label, coord: [root.length_m, relative ? 0 : root.cost_cad], value: relative ? 0 : root.cost_cad }] } : undefined },
        { type: 'line', name: view.right_label, showSymbol: false, lineStyle: { width: 3, type: 'dashed' }, itemStyle: { color: '#db2777' },
          data: view.points.map(p => [p.length_m, rightValue(p)]) },
      ] };
    this.criticalDifferenceChart = { ...this.baseChart(), legend: { show: false }, dataZoom: zoom, xAxis: axis,
      grid: { left: 95, right: 45, top: 65, bottom: 85 },
      yAxis: { type: 'value', name: differenceScale === 1 ? 'Left − right (CAD)' : 'Left − right (thousand CAD)', scale: true,
        min: minimumDifference - differencePadding, max: maximumDifference + differencePadding,
        axisLabel: { formatter: v => (v / differenceScale).toLocaleString(undefined, { maximumFractionDigits: 2 }) } },
      series: [{ type: 'line', name: 'Cost difference', showSymbol: false, lineStyle: { width: 3, color: '#7c3aed' },
        data: view.points.map(p => [p.length_m, p.difference]),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: '#64748b' },
          data: [{ yAxis: 0, label: { formatter: 'Equal cost', position: 'insideEndTop' } }, ...(root ? [{ xAxis: root.length_m, label: { formatter: label, position: 'insideEndTop' } }] : [])] },
        markPoint: root ? { symbol: 'diamond', symbolSize: 18, itemStyle: { color: root.feasible ? '#059669' : '#d97706' },
          label: { show: false }, data: [{ name: label, coord: [root.length_m, 0], value: root.length_m }] } : undefined,
      }] };
  }
  private showError(error: any): void {
    const detail = error && error.error;
    this.error = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'The request could not finish. Check the API connection and retry.';
  }

  upload(event: Event): void {
    const file = (event.target as HTMLInputElement).files[0];
    this.hourlyKw = []; this.profileLabel = ''; this.error = ''; this.changed();
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.error = 'Use a CSV smaller than 2 MB.'; return; }
    Papa.parse<{ heating_kw?: string }>(file, { header: true, skipEmptyLines: 'greedy', complete: parsed => {
      if (parsed.errors.length || !parsed.meta.fields || !parsed.meta.fields.includes('heating_kw')) {
        this.error = 'Use a CSV with a heating_kw header and one value per hour.'; return;
      }
      const values = parsed.data.map(row => {
        const raw = String(row.heating_kw == null ? '' : row.heating_kw).trim();
        return raw === '' ? NaN : Number(raw);
      });
      if (![8760, 8784].includes(values.length) || values.some(v => !Number.isFinite(v) || v < 0 || v > 1000000) || !values.some(v => v > 0)) {
        this.error = 'The CSV must contain 8760 or 8784 hourly values between 0 and 1,000,000 kW, with positive demand.'; return;
      }
      this.hourlyKw = values; this.profileLabel = file.name;
    }, error: () => this.error = 'The CSV could not be read.' });
  }

  run(): void {
    if (this.busy) return;
    if (!this.projectId) { this.error = 'Select a project first.'; return; }
    if (this.mode === 'custom' && !this.hourlyKw.length) { this.error = 'Upload a complete hourly profile first.'; return; }
    if (this.mode === 'network' && !this.networkId) { this.error = 'Select a network first.'; return; }
    if (!this.groups.length) { this.error = 'Wait for the study input definitions to load.'; return; }
    const invalid = this.groups.reduce((all, g) => all.concat(g.fields), [] as InputField[])
      .find(f => !Number.isFinite(this.options[f.key]) || this.options[f.key] < f.min || this.options[f.key] > f.max);
    if (invalid) { this.error = `Check ${invalid.label}. Allowed range: ${invalid.min} to ${invalid.max}.`; return; }
    const body: any = { project_id: this.projectId, mode: this.mode, year: this.year,
      network_profile: this.networkProfile, source_model: this.sourceModel,
      options: { ...this.options }, residual_credit: this.residualCredit };
    if (this.mode === 'network') body.network_id = this.networkId;
    if (this.mode === 'custom') { body.hourly_kw = this.hourlyKw; body.profile_label = this.profileLabel; }
    this.busy = true; this.error = ''; this.result = null; this.stale = false; this.progress = 'Starting break-even study…';
    this.api.post<any>(body, 'break-even/').pipe(takeUntil(this.scopeChange$), takeUntil(this.destroyed$)).subscribe({
      next: state => { localStorage.setItem(`breakEvenRun:${this.projectId}`, state.run_id); this.poll(state.run_id); },
      error: e => { this.busy = false; this.showError(e); },
    });
  }

  resume(runId?: string): void {
    const id = runId || localStorage.getItem(`breakEvenRun:${this.projectId}`);
    if (!id) { this.error = 'No previous study is recorded for this project in this browser.'; return; }
    this.busy = true; this.error = ''; this.progress = 'Loading saved study…'; this.poll(id);
  }
  private poll(id: string): void {
    this.stopPolling$.next();
    timer(0, 1500).pipe(exhaustMap(() => this.api.get<any>(`break-even/${id}/`)),
      takeUntil(this.stopPolling$), takeUntil(this.destroyed$)).subscribe({ next: state => {
        this.progress = state.message;
        if (state.status === 'complete') {
          if (this.projectId !== state.result.project_id) this.context.setProject(state.result.project_id);
          this.result = state.result; this.options = { diameter_band_width_mm: 0, ...this.result.inputs.options };
          this.residualCredit = this.result.inputs.residual_credit;
          this.mode = this.result.profile.mode;
          this.networkId = this.result.profile.network_id || null;
          this.year = this.result.profile.year || this.year;
          this.networkProfile = this.result.profile.network_profile || 'active';
          this.sourceModel = this.result.profile.source_model || '';
          if (this.mode === 'custom') { this.hourlyKw = this.result.inputs.hourly_kw; this.profileLabel = this.result.profile.name; }
          this.stale = false; this.busy = false;
          localStorage.setItem(`breakEvenRun:${this.projectId}`, id);
          this.render(); this.stopPolling$.next();
        } else if (state.status !== 'running' && state.status !== 'queued') {
          this.error = state.message; this.busy = false; this.stopPolling$.next();
        }
      }, error: e => { this.busy = false; this.showError(e); this.stopPolling$.next(); } });
  }

  private baseChart(): any {
    return { backgroundColor: '#fff', tooltip: { trigger: 'axis', renderMode: 'richText' },
      toolbox: { feature: { saveAsImage: { title: 'Save chart' }, dataZoom: { title: { zoom: 'Zoom', back: 'Reset zoom' } } } },
      legend: { top: 30 }, grid: { left: 90, right: 35, top: 90, bottom: 65 } };
  }

  render(): void {
    const r = this.result;
    this.renderCritical();
    this.renderStrategyZones();
    const keys = Object.keys(this.labels);
    const overviewReference = r.curves.large;
    const overviewCost = p => this.plottedCost(p.npc, p.length_m, overviewReference);
    const overviewUnit = this.plotScale === 'relative' ? 1000 : 1e6;
    this.costChart = { ...this.baseChart(), xAxis: { type: 'value', name: 'Route distance (m)', nameLocation: 'middle', nameGap: 30 },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 5, filterMode: 'none' }],
      yAxis: { type: 'value', min: 'dataMin', max: 'dataMax', scale: true, name: this.plotScale === 'relative' ? 'Extra cost vs upsized pipe (thousand CAD)' : 'Lifecycle cost (million CAD)', axisLabel: { formatter: v => (v / overviewUnit).toFixed(1) } },
      series: keys.map(k => ({ type: 'line', name: this.name(k), showSymbol: false, itemStyle: { color: this.colors[k] },
        data: r.curves[k].map(p => [p.length_m, overviewCost(p)]),
        markLine: k === 'large' ? { silent: true, symbol: 'none', data: [{ xAxis: r.summary.selected_length_m, name: 'Compared distance' }] } : undefined,
        markArea: { silent: true, itemStyle: { color: this.colors[k], opacity: .025 }, data: [] } })),
    };
    // Crosses mark sampled infeasible designs without removing their cost curves.
    this.costChart.series.push(...keys.map(k => ({ type: 'scatter', name: this.name(k), symbol: 'cross', symbolSize: 7,
      itemStyle: { color: this.colors[k], opacity: .55 }, data: r.curves[k].filter(p => !p.feasible).map(p => [p.length_m, overviewCost(p)]) })));
    const components = ['pipe_capex', 'pump_capex', 'node_capex', 'source_heat_pv', 'pumping_pv', 'hp_electricity_pv', 'tes_auxiliary_pv', 'maintenance_pv', 'replacements_pv', 'residual_credit_pv'];
    const names = ['Pipe construction', 'Pump equipment', 'Node equipment', 'Source heat', 'Pumping electricity', 'HP electricity', 'TES auxiliaries', 'Maintenance', 'Replacements', 'Residual credit'];
    this.componentChart = { ...this.baseChart(), legend: { type: 'scroll', top: 30 },
      xAxis: { type: 'category', data: r.selected.map(s => this.name(s.key)), axisLabel: { interval: 0, rotate: 10 } },
      yAxis: { type: 'value', name: 'Present cost (million CAD)', axisLabel: { formatter: v => (v / 1e6).toFixed(1) } },
      series: components.map((k, i) => ({ type: 'bar', stack: 'cost', name: names[i], data: r.selected.map(s => s.components[k]) })) };
    const hourly = r.inputs.hourly_kw;
    const indices = Array.from({ length: hourly.length }, (_, i) => i);
    const zoom = [{ type: 'inside' }, { type: 'slider', bottom: 10 }];
    this.loadChart = { ...this.baseChart(), dataZoom: zoom,
      xAxis: { type: 'value', name: 'Hour of year' }, yAxis: { type: 'value', name: 'Thermal power (kW)' },
      series: [{ type: 'line', name: 'Common heating demand', showSymbol: false, data: indices.map(i => [i, hourly[i]]) },
        { type: 'line', name: 'TES trunk delivery before pipe losses', showSymbol: false, data: indices.map(i => [i, r.storage.trunk_kw[i]]) }] };
    this.storageChart = { ...this.baseChart(), legend: { show: false }, dataZoom: zoom,
      xAxis: { type: 'value', name: 'Hour of year' }, yAxis: { type: 'value', name: 'Stored energy (kWh)' },
      series: [{ type: 'line', name: 'Storage charge level', showSymbol: false, lineStyle: { color: this.colors.tes },
        data: r.storage.state_kwh.map((v, i) => [i, v]) }] };
    const alphas = Array.from(new Set<number>(r.sensitivity.map(s => s.alpha)));
    const multipliers = [.5, 1, 1.5];
    this.sensitivityChart = { ...this.baseChart(), legend: { show: false },
      tooltip: { renderMode: 'richText', formatter: p => `${this.name(p.data.winner) || 'No feasible strategy'}\nAlpha ${alphas[p.value[0]]}; electricity ×${multipliers[p.value[1]]}` },
      xAxis: { type: 'category', name: 'Alpha', data: alphas.map(String) },
      yAxis: { type: 'category', name: 'Electricity multiplier', data: multipliers.map(v => '×' + v) },
      series: [{ type: 'heatmap', label: { show: true, formatter: p => ({ small: 'A', large: 'B', hp: 'HP', tes: 'TES' }[p.data.winner] || 'No fit') },
        data: r.sensitivity.map(s => ({ value: [alphas.indexOf(s.alpha), multipliers.indexOf(s.electricity_multiplier), 1], winner: s.winner,
          itemStyle: { color: s.winner ? this.colors[s.winner] : '#94a3b8' }, label: { color: '#fff' } })) }] };
  }

  exportJson(): void { this.download('break-even-study.json', JSON.stringify(this.result, null, 2), 'application/json'); }
  exportCurves(): void {
    const rows: any[][] = [['strategy', 'route_length_m', 'net_present_cost_cad', 'feasible']];
    Object.keys(this.result.curves).forEach(k => this.result.curves[k].forEach(p => rows.push([k, p.length_m, p.npc, p.feasible])));
    this.csv('break-even-cost-curves.csv', rows);
  }
  exportHourly(): void {
    const r = this.result;
    this.csv('break-even-hourly-operation.csv', [['hour', 'heating_kw', 'tes_trunk_delivery_kw', 'tes_charge_kw', 'tes_discharge_kw', 'tes_soc_start_kwh', 'tes_soc_end_kwh'],
      ...r.inputs.hourly_kw.map((v, i) => [i, v, r.storage.trunk_kw[i], r.storage.charge_kw[i], r.storage.discharge_kw[i], r.storage.state_kwh[i], r.storage.state_kwh[i + 1]])]);
  }
  private csv(name: string, rows: any[][]): void {
    this.download(name, rows.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv');
  }
  private download(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
