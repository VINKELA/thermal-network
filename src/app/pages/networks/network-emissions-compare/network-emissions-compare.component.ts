import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-network-emissions-compare',
  templateUrl: './network-emissions-compare.component.html',
  styleUrls: ['./network-emissions-compare.component.scss'],
})
export class NetworkEmissionsCompareComponent implements OnInit {
  allNetworks: any[] = [];
  selectedIds: number[] = [];
  comparisonData: any[] = [];
  chartRefs: Record<string, any> = {};

  isLoadingList = false;
  isLoadingCompare = false;
  searchText = '';
  searchTimeout: any;
  assumptionRefreshTimer: any;

  selectedMaterial = 'steel';
  componentAllowancePct = 15;

  totalRankOption: any = {};
  reductionOption: any = {};
  alternativesOption: any = {};
  lifecycleStackOption: any = {};
  componentStackOption: any = {};
  baselineInsight: any = null;

  materials = [
    { value: 'steel', label: 'Steel pipe' },
    { value: 'pe_hd', label: 'PE-HD pipe' },
    { value: 'pvc', label: 'PVC pipe' },
  ];

  metricRows = [
    { label: 'Total GWP', key: 'total_emissions_tco2e', format: 'tonnes', lowerIsBetter: true },
    { label: 'Annual Boiler GWP', key: 'annual_boiler_emissions_tco2e', format: 'tonnesPerYear', lowerIsBetter: true },
    { label: 'Pipe Material GWP', key: 'pipe_material_emissions_kgco2e', format: 'kgToTonnes', lowerIsBetter: true },
    { label: 'Component Allowance GWP', key: 'component_allowance_emissions_kgco2e', format: 'kgToTonnes', lowerIsBetter: true },
    { label: 'Network Length', key: 'total_length_m', format: 'meters', lowerIsBetter: true },
    { label: 'Annual Heat Demand', key: 'annual_heat_demand_mwh', format: 'mwh', lowerIsBetter: false },
    { label: 'Boiler Capacity', key: 'installed_boiler_capacity_kw', format: 'kw', lowerIsBetter: false },
    { label: 'Pipe Intensity', key: 'average_kgco2e_per_m', format: 'kgPerMeter', lowerIsBetter: true },
    { label: 'Boiler Heat Intensity', key: 'average_kgco2e_per_mwh_heat', format: 'kgPerMwh', lowerIsBetter: true },
    { label: 'Consumers', key: 'consumer_count', format: 'integer', lowerIsBetter: false },
    { label: 'Edges', key: 'edge_count', format: 'integer', lowerIsBetter: false },
    { label: 'Segments / Boilers', key: 'segment_count', format: 'integer', lowerIsBetter: false },
  ];

  constructor(
    private api: RestApiService,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    this.fetchNetworkList();
  }

  fetchNetworkList(): void {
    this.isLoadingList = true;
    let params = '?limit=50&ordering=-created_at,-id';
    if (this.searchText) {
      params += `&search=${encodeURIComponent(this.searchText)}`;
    }

    this.api.get<any>(`networks/${params}`).subscribe({
      next: (data) => {
        this.allNetworks = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: () => {
        this.isLoadingList = false;
        this.toastr.danger('Networks could not be loaded.', 'Emissions Compare');
      },
    });
  }

  onSearchInput(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchNetworkList(), 350);
  }

  toggleSelection(id: number): void {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(item => item !== id);
    } else {
      if (this.selectedIds.length >= 6) {
        this.toastr.warning('Compare up to six networks at once for readable visuals.', 'Emissions Compare');
        return;
      }
      this.selectedIds.push(id);
    }

    this.selectedIds.length ? this.fetchComparison() : this.resetData();
  }

  recalculate(): void {
    if (this.selectedIds.length) {
      this.fetchComparison();
    }
  }

  onAssumptionChange(): void {
    if (this.assumptionRefreshTimer) clearTimeout(this.assumptionRefreshTimer);
    this.assumptionRefreshTimer = setTimeout(() => this.recalculate(), 450);
  }

  refreshEpd(): void {
    this.fetchComparison(true);
  }

  resetData(): void {
    this.comparisonData = [];
    this.totalRankOption = {};
    this.reductionOption = {};
    this.alternativesOption = {};
    this.lifecycleStackOption = {};
    this.componentStackOption = {};
    this.baselineInsight = null;
  }

  fetchComparison(refreshEpd = false): void {
    if (!this.selectedIds.length) return;
    this.isLoadingCompare = true;
    this.api.post<any[]>(
      {
        ids: this.selectedIds,
        material: this.selectedMaterial,
        component_allowance_pct: this.componentAllowancePct,
        refresh_epd: refreshEpd,
      },
      'networks/compare-emissions/',
    ).subscribe({
      next: (data) => {
        if (!Array.isArray(data)) {
          const errorPayload: any = data;
          this.resetData();
          this.isLoadingCompare = false;
          this.toastr.danger(
            errorPayload?.detail || errorPayload?.error || 'Choose networks from the same project and try again.',
            'Emissions Compare',
          );
          return;
        }
        this.comparisonData = data;
        this.buildVisualizations();
        this.isLoadingCompare = false;
      },
      error: () => {
        this.isLoadingCompare = false;
        this.toastr.danger('Emissions comparison could not be loaded.', 'Emissions Compare');
      },
    });
  }

  metricValue(summary: any, key: string): number {
    return Number(summary?.metrics?.[key] || 0);
  }

  modeLabel(summary: any): string {
    return summary?.emissions_basis?.mode === 'local_boiler_base_case'
      ? 'Local boiler base case'
      : 'Network infrastructure';
  }

  modeClass(summary: any): string {
    return summary?.emissions_basis?.mode === 'local_boiler_base_case' ? 'mode-boiler' : 'mode-network';
  }

  bestFor(metric: any): number | null {
    if (!metric.lowerIsBetter || !this.comparisonData.length) return null;
    const values = this.comparisonData
      .map(item => this.metricValue(item, metric.key))
      .filter(value => Number.isFinite(value));
    if (!values.length) return null;
    return Math.min(...values);
  }

  formatValue(value: number, format: string): string {
    const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    const precise = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    if (format === 'tonnes') return `${precise.format(value || 0)} t CO2e`;
    if (format === 'tonnesPerYear') return value ? `${precise.format(value)} t/yr` : '-';
    if (format === 'kgToTonnes') return `${precise.format((value || 0) / 1000)} t CO2e`;
    if (format === 'meters') return `${number.format(value || 0)} m`;
    if (format === 'mwh') return value ? `${number.format(value)} MWh/yr` : '-';
    if (format === 'kw') return value ? `${number.format(value)} kW` : '-';
    if (format === 'kgPerMeter') return value ? `${precise.format(value)} kg/m` : '-';
    if (format === 'kgPerMwh') return value ? `${number.format(value)} kg/MWh` : '-';
    return number.format(value || 0);
  }

  onChartInit(key: string, chart: any): void {
    this.chartRefs[key] = chart;
  }

  async copyChart(key: string, filename: string): Promise<void> {
    const chart = this.chartRefs[key];
    if (!chart) return;

    const dataUrl = chart.getDataURL({
      type: 'png',
      pixelRatio: 3,
      backgroundColor: '#ffffff',
    });

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if (!navigator.clipboard || !ClipboardItemCtor) {
        throw new Error('Clipboard image write is not available.');
      }
      await (navigator.clipboard as any).write([
        new ClipboardItemCtor({ 'image/png': blob }),
      ]);
      this.toastr.success('Visualization copied as an image.', 'Copied');
    } catch {
      this.downloadChart(dataUrl, filename);
      this.toastr.info('Clipboard image copy was blocked, so the PNG was downloaded.', 'Visualization Ready');
    }
  }

  private buildVisualizations(): void {
    const names = this.comparisonData.map(item => item.network?.name || `Network ${item.network?.id}`);
    const totalsKg = this.comparisonData.map(item => this.totalEmissionsKg(item));
    const annualBoilerT = this.comparisonData.map(item => this.metricValue(item, 'annual_boiler_emissions_tco2e'));

    const ranked = this.comparisonData
      .map((summary, index) => ({
        summary,
        name: names[index],
        totalKg: totalsKg[index],
        totalT: totalsKg[index] / 1000,
        annualBoiler: annualBoilerT[index],
      }))
      .sort((a, b) => a.totalKg - b.totalKg);

    const baseline = this.resolveBaseline(ranked);
    const hasExplicitBaseCase = !!ranked.find(item => this.isBaseCase(item.summary));
    const alternatives = ranked.filter(item => item !== baseline);
    const alternativeDetailRows = hasExplicitBaseCase ? alternatives : ranked;

    this.baselineInsight = null;
    if (baseline && alternatives.length) {
      const bestAlternative = alternatives.reduce((best, item) => item.totalKg < best.totalKg ? item : best, alternatives[0]);
      const avoidedT = Math.max((baseline.totalKg - bestAlternative.totalKg) / 1000, 0);
      const reductionPct = baseline.totalKg > 0 ? Math.max((1 - bestAlternative.totalKg / baseline.totalKg) * 100, 0) : 0;
      this.baselineInsight = {
        baselineName: baseline.name,
        bestName: bestAlternative.name,
        referenceLabel: hasExplicitBaseCase ? 'Base reference' : 'Highest-emission reference',
        reductionLabel: `${reductionPct.toFixed(reductionPct >= 99 ? 2 : 1)}%`,
        avoidedLabel: this.formatTonnes(avoidedT),
        remainingLabel: this.formatTonnes(bestAlternative.totalT),
      };
    }

    const rankedPositiveT = ranked.map(item => Math.max(item.totalT, 0.001));
    const minLogT = rankedPositiveT.length ? Math.max(Math.min(...rankedPositiveT) * 0.5, 0.001) : 0.001;

    this.totalRankOption = {
      backgroundColor: '#ffffff',
      color: ['#be123c'],
      title: {
        text: 'Total Emissions Ranking',
        subtext: 'Log scale keeps small network scenarios visible beside the base case',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
        subtextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const item = ranked[params?.[0]?.dataIndex || 0];
          return [
            `<strong>${item?.name || ''}</strong>`,
            `Mode: ${this.modeLabel(item?.summary)}`,
            `Total GWP: ${this.formatTonnes(item?.totalT || 0)}`,
            item?.annualBoiler ? `Annual boiler GWP: ${this.formatTonnes(item.annualBoiler)}/yr` : '',
          ].filter(Boolean).join('<br/>');
        },
      },
      grid: { top: 82, left: 150, right: 42, bottom: 42 },
      xAxis: {
        type: 'log',
        logBase: 10,
        min: minLogT,
        name: 't CO2e, log scale',
        axisLabel: { formatter: (value: number) => this.compactTonnes(value) },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      yAxis: {
        type: 'category',
        data: ranked.map(item => item.name),
        inverse: true,
        axisLabel: { width: 130, overflow: 'truncate', fontWeight: 800 },
      },
      series: [{
        name: 'Total GWP',
        type: 'bar',
        barMaxWidth: 28,
        data: ranked.map(item => ({
          value: Math.max(item.totalT, 0.001),
          itemStyle: { color: this.isBaseCase(item.summary) ? '#c2410c' : '#12715b' },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => this.compactTonnes(ranked[params.dataIndex]?.totalT || 0),
          fontWeight: 900,
        },
      }],
    };

    this.reductionOption = this.buildReductionOption(baseline, alternatives, hasExplicitBaseCase);
    this.alternativesOption = this.buildAlternativesOption(alternativeDetailRows, hasExplicitBaseCase);

    const stages = ['Production A1-A3', 'Construction A4-A5', 'Use B1-B7', 'End of life C1-C4'];
    const stageKeys = ['production', 'construction', 'use', 'end_of_life'];
    this.lifecycleStackOption = {
      backgroundColor: '#ffffff',
      color: ['#12715b', '#2563eb', '#f97316', '#64748b'],
      title: {
        text: 'Life-Cycle Composition',
        subtext: 'Each bar is normalized to 100% of that scenario',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
        subtextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const lines = [`<strong>${params?.[0]?.axisValue || ''}</strong>`];
          params.forEach(param => {
            lines.push(`${param.marker}${param.seriesName}: ${this.formatPercent(param.value)} (${this.formatTonnes((param.data?.absoluteKg || 0) / 1000)})`);
          });
          return lines.join('<br/>');
        },
      },
      legend: { top: 38, left: 12, data: stages, type: 'scroll' },
      grid: { top: 86, left: 78, right: 28, bottom: 70 },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 22, width: 110, overflow: 'truncate', fontWeight: 800 } },
      yAxis: { type: 'value', min: 0, max: 100, name: '% of total', axisLabel: { formatter: (value: number) => `${value}%` }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      series: stageKeys.map((key, index) => ({
        name: stages[index],
        type: 'bar',
        stack: 'stage',
        barMaxWidth: 42,
        data: this.comparisonData.map(summary => this.lifecycleShare(summary, key)),
      })),
    };

    const componentLabels = this.componentLabels();
    this.componentStackOption = {
      backgroundColor: '#ffffff',
      color: ['#12715b', '#f59e0b', '#c2410c', '#2563eb', '#7c3aed', '#64748b'],
      title: {
        text: 'Component Composition',
        subtext: 'Percent contribution within each scenario',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
        subtextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const lines = [`<strong>${params?.[0]?.axisValue || ''}</strong>`];
          params.forEach(param => {
            lines.push(`${param.marker}${param.seriesName}: ${this.formatPercent(param.value)} (${this.formatTonnes((param.data?.absoluteKg || 0) / 1000)})`);
          });
          return lines.join('<br/>');
        },
      },
      legend: { top: 38, left: 12, type: 'scroll', data: componentLabels },
      grid: { top: 88, left: 74, right: 28, bottom: 70 },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 22, width: 110, overflow: 'truncate', fontWeight: 800 } },
      yAxis: { type: 'value', min: 0, max: 100, name: '% of total', axisLabel: { formatter: (value: number) => `${value}%` }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      series: componentLabels.map(label => ({
        name: label,
        type: 'bar',
        stack: 'component',
        barMaxWidth: 42,
        data: this.comparisonData.map(summary => this.componentShare(summary, label)),
      })),
    };
  }

  private buildReductionOption(baseline: any, alternatives: any[], hasExplicitBaseCase: boolean): any {
    if (!baseline || !alternatives.length || baseline.totalKg <= 0) {
      return this.emptyChartOption(
        hasExplicitBaseCase ? 'Reduction From Base Case' : 'Reduction From Highest-Emission Case',
        'Select a reference case and at least one alternative to calculate avoided emissions.',
      );
    }

    const rows = alternatives
      .map(item => {
        const reductionPct = (1 - item.totalKg / baseline.totalKg) * 100;
        return {
          ...item,
          avoidedT: (baseline.totalKg - item.totalKg) / 1000,
          reductionPct,
        };
      })
      .sort((a, b) => b.reductionPct - a.reductionPct);

    const minPct = Math.min(0, ...rows.map(item => item.reductionPct));

    return {
      backgroundColor: '#ffffff',
      color: ['#0f766e'],
      title: {
        text: hasExplicitBaseCase ? 'Avoided Emissions vs Base Case' : 'Avoided Emissions vs Highest Case',
        subtext: `Reference: ${baseline.name}`,
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
        subtextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const item = rows[params?.[0]?.dataIndex || 0];
          return [
            `<strong>${item?.name || ''}</strong>`,
            `Reduction: ${this.formatPercent(item?.reductionPct || 0)}`,
            `Avoided: ${this.formatTonnes(item?.avoidedT || 0)}`,
            `Remaining total: ${this.formatTonnes(item?.totalT || 0)}`,
          ].join('<br/>');
        },
      },
      grid: { top: 82, left: 150, right: 48, bottom: 42 },
      xAxis: {
        type: 'value',
        min: Math.floor(minPct / 10) * 10,
        max: 100,
        name: '% reduction',
        axisLabel: { formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map(item => item.name),
        axisLabel: { width: 130, overflow: 'truncate', fontWeight: 800 },
      },
      series: [{
        name: 'Reduction',
        type: 'bar',
        barMaxWidth: 30,
        data: rows.map(item => ({
          value: item.reductionPct,
          itemStyle: { color: item.reductionPct >= 0 ? '#0f766e' : '#b91c1c' },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => this.formatPercent(params.value),
          fontWeight: 900,
        },
      }],
    };
  }

  private buildAlternativesOption(rows: any[], hasExplicitBaseCase: boolean): any {
    if (!rows.length) {
      return this.emptyChartOption(
        hasExplicitBaseCase ? 'Network Alternatives Detail' : 'Scenario Detail',
        'Select at least one network scenario to inspect on a normal linear scale.',
      );
    }

    const sorted = [...rows].sort((a, b) => a.totalKg - b.totalKg);

    return {
      backgroundColor: '#ffffff',
      color: ['#2563eb'],
      title: {
        text: hasExplicitBaseCase ? 'Network Alternatives Detail' : 'Scenario Detail',
        subtext: hasExplicitBaseCase ? 'Base case hidden here so smaller scenarios can be compared linearly' : 'Normal linear scale',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
        subtextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const item = sorted[params?.[0]?.dataIndex || 0];
          return [
            `<strong>${item?.name || ''}</strong>`,
            `Total GWP: ${this.formatTonnes(item?.totalT || 0)}`,
            `Pipe material: ${this.formatTonnes(this.metricValue(item?.summary, 'pipe_material_emissions_kgco2e') / 1000)}`,
            `Component allowance: ${this.formatTonnes(this.metricValue(item?.summary, 'component_allowance_emissions_kgco2e') / 1000)}`,
          ].join('<br/>');
        },
      },
      grid: { top: 82, left: 150, right: 48, bottom: 42 },
      xAxis: {
        type: 'value',
        name: 't CO2e',
        axisLabel: { formatter: (value: number) => this.compactTonnes(value) },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: sorted.map(item => item.name),
        axisLabel: { width: 130, overflow: 'truncate', fontWeight: 800 },
      },
      series: [{
        name: 'Total GWP',
        type: 'bar',
        barMaxWidth: 30,
        data: sorted.map(item => ({
          value: item.totalT,
          itemStyle: { color: '#2563eb' },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => this.compactTonnes(params.value),
          fontWeight: 900,
        },
      }],
    };
  }

  private lifecycleValue(summary: any, key: string): number {
    const row = (summary?.lifecycle_modules || []).find((item: any) => item.key === key);
    return Number(row?.emissions_kgco2e || 0);
  }

  private lifecycleShare(summary: any, key: string): any {
    const absoluteKg = this.lifecycleValue(summary, key);
    const totalKg = (summary?.lifecycle_modules || [])
      .reduce((sum: number, item: any) => sum + Number(item?.emissions_kgco2e || 0), 0);
    return {
      value: totalKg > 0 ? (absoluteKg / totalKg) * 100 : 0,
      absoluteKg,
    };
  }

  private componentLabels(): string[] {
    const labels = new Set<string>();
    this.comparisonData.forEach(summary => {
      (summary?.component_breakdown || []).forEach((item: any) => labels.add(item.component || 'Other'));
    });
    return Array.from(labels);
  }

  private componentValue(summary: any, label: string): number {
    const row = (summary?.component_breakdown || []).find((item: any) => (item.component || 'Other') === label);
    return Number(row?.emissions_kgco2e || 0);
  }

  private componentShare(summary: any, label: string): any {
    const absoluteKg = this.componentValue(summary, label);
    const totalKg = (summary?.component_breakdown || [])
      .reduce((sum: number, item: any) => sum + Number(item?.emissions_kgco2e || 0), 0);
    return {
      value: totalKg > 0 ? (absoluteKg / totalKg) * 100 : 0,
      absoluteKg,
    };
  }

  private totalEmissionsKg(summary: any): number {
    const kg = this.metricValue(summary, 'total_emissions_kgco2e');
    return kg || this.metricValue(summary, 'total_emissions_tco2e') * 1000;
  }

  private resolveBaseline(rows: any[]): any {
    return rows.find(item => this.isBaseCase(item.summary))
      || rows.reduce((largest, item) => item.totalKg > largest.totalKg ? item : largest, rows[0]);
  }

  private isBaseCase(summary: any): boolean {
    return summary?.emissions_basis?.mode === 'local_boiler_base_case';
  }

  private formatTonnes(value: number): string {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value || 0)} t CO2e`;
  }

  private formatPercent(value: number): string {
    return `${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: Math.abs(value || 0) >= 99 ? 2 : 1,
      maximumFractionDigits: Math.abs(value || 0) >= 99 ? 2 : 1,
    }).format(value || 0)}%`;
  }

  private compactTonnes(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Mt`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}kt`;
    return `${(value || 0).toFixed(value >= 10 ? 0 : 1)}t`;
  }

  private formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value || 0);
  }

  private downloadChart(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  private emptyChartOption(title: string, text: string): any {
    return {
      backgroundColor: '#ffffff',
      title: {
        text: title,
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 16, fontWeight: 900 },
      },
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text,
          fill: '#6b7280',
          fontSize: 14,
          fontWeight: 700,
          width: 360,
          overflow: 'break',
        },
      },
      xAxis: { show: false },
      yAxis: { show: false },
      series: [],
    };
  }
}
