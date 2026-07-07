import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-network-emissions',
  templateUrl: './network-emissions.component.html',
  styleUrls: ['./network-emissions.component.scss'],
})
export class NetworkEmissionsComponent implements OnInit {
  networks: any[] = [];
  selectedNetworkId?: number;
  selectedMaterial = 'steel';
  componentAllowancePct = 15;
  summary: any;
  chartRefs: Record<string, any> = {};

  isLoadingNetworks = false;
  isLoadingSummary = false;

  lifecycleOption: any = {};
  componentOption: any = {};
  diameterOption: any = {};
  segmentOption: any = {};

  materials = [
    { value: 'steel', label: 'Steel pipe' },
    { value: 'pe_hd', label: 'PE-HD pipe' },
    { value: 'pvc', label: 'PVC pipe' },
  ];

  constructor(
    private api: RestApiService,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    this.loadNetworks();
  }

  loadNetworks(): void {
    this.isLoadingNetworks = true;
    this.api.get<any>('networks/?limit=500&ordering=-created_at,-id').subscribe({
      next: (res) => {
        this.networks = Array.isArray(res) ? res : (res?.results || []);
        this.isLoadingNetworks = false;
        if (!this.selectedNetworkId && this.networks.length) {
          this.selectedNetworkId = this.networks[0].id;
          this.loadSummary();
        }
      },
      error: () => {
        this.isLoadingNetworks = false;
        this.toastr.danger('Networks could not be loaded.', 'Emissions');
      },
    });
  }

  onNetworkChange(): void {
    this.summary = null;
    this.loadSummary();
  }

  loadSummary(refreshEpd = false): void {
    if (!this.selectedNetworkId) return;
    this.isLoadingSummary = true;
    const query = [
      `material=${encodeURIComponent(this.selectedMaterial)}`,
      `component_allowance_pct=${encodeURIComponent(String(this.componentAllowancePct || 0))}`,
      refreshEpd ? 'refresh_epd=true' : '',
    ].filter(Boolean).join('&');

    this.api.get<any>(`networks/${this.selectedNetworkId}/emissions-summary/?${query}`).subscribe({
      next: (summary) => {
        this.summary = summary;
        this.buildVisualizations();
        this.isLoadingSummary = false;
      },
      error: () => {
        this.isLoadingSummary = false;
        this.toastr.danger('Emissions estimate could not be loaded.', 'Network Emissions');
      },
    });
  }

  refreshEpd(): void {
    this.loadSummary(true);
  }

  recalculate(): void {
    this.loadSummary(false);
  }

  metricValue(path: string, fallback = 0): number {
    const value = path.split('.').reduce((acc, key) => acc?.[key], this.summary);
    return Number(value ?? fallback);
  }

  get diameterBreakdown(): any[] {
    return this.summary?.breakdown_by_diameter || [];
  }

  get segmentBreakdown(): any[] {
    return this.summary?.segments || [];
  }

  get componentBreakdown(): any[] {
    return this.summary?.component_breakdown || [];
  }

  get boilerBreakdown(): any[] {
    return this.summary?.building_boilers || [];
  }

  get factor(): any {
    return this.summary?.emissions_basis?.factor || {};
  }

  get boilerAssumptions(): any {
    return this.summary?.emissions_basis?.boiler_assumptions || {};
  }

  get isBoilerBaseCase(): boolean {
    return this.summary?.emissions_basis?.mode === 'local_boiler_base_case';
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
    if (!this.summary) return;

    const lifecycleRows = this.summary.lifecycle_modules || [];
    this.lifecycleOption = {
      backgroundColor: '#ffffff',
      color: ['#12715b'],
      title: {
        text: this.isBoilerBaseCase ? 'Base Case Boiler GWP by Life-Cycle Stage' : 'Cradle-to-Grave GWP by Life-Cycle Stage',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 15, fontWeight: 800 },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => this.formatTonnes(value / 1000) },
      grid: { top: 70, left: 70, right: 28, bottom: 48 },
      xAxis: { type: 'category', data: lifecycleRows.map(item => item.stage), axisLabel: { rotate: 15 } },
      yAxis: { type: 'value', name: 't CO2e', axisLabel: { formatter: (value: number) => this.compactTonnes(value / 1000) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      series: [{
        name: 'GWP',
        type: 'bar',
        data: lifecycleRows.map(item => Number(item.emissions_kgco2e || 0)),
        barMaxWidth: 48,
        label: { show: true, position: 'top', formatter: (params: any) => this.compactTonnes(params.value / 1000) },
      }],
    };

    const componentRows = this.componentBreakdown;
    this.componentOption = {
      backgroundColor: '#ffffff',
      color: ['#12715b', '#f59e0b', '#2563eb'],
      title: {
        text: this.isBoilerBaseCase ? 'Base Case Emissions Contribution' : 'Component Emissions',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 15, fontWeight: 800 },
      },
      tooltip: { trigger: 'item', valueFormatter: (value: number) => this.formatTonnes(value / 1000) },
      legend: { orient: 'vertical', right: 12, top: 54 },
      series: [{
        name: 'GWP',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['36%', '56%'],
        label: { formatter: '{b}\n{d}%' },
        data: componentRows.map(item => ({
          name: item.component,
          value: Number(item.emissions_kgco2e || 0),
        })),
      }],
      graphic: [{
        type: 'text',
        left: '28%',
        top: '51%',
        style: {
          text: `${this.compactTonnes(this.metricValue('metrics.total_emissions_tco2e'))}\nTotal`,
          textAlign: 'center',
          fill: '#192038',
          fontSize: 18,
          fontWeight: 800,
        },
      }],
    };

    if (this.isBoilerBaseCase) {
      const boilerRows = [...this.boilerBreakdown]
        .sort((a, b) => Number(b.total_emissions_kgco2e || 0) - Number(a.total_emissions_kgco2e || 0))
        .slice(0, 10)
        .reverse();
      this.diameterOption = {
        backgroundColor: '#ffffff',
        color: ['#be123c', '#2563eb'],
        title: { text: 'Local Boiler Demand Drivers', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 800 } },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params: any[]) => {
            const row = boilerRows[params?.[0]?.dataIndex || 0];
            return [
              `<strong>${row?.building_name || ''}</strong>`,
              `Study-period GWP: ${this.formatTonnes(Number(row?.total_emissions_kgco2e || 0) / 1000)}`,
              `Annual heat: ${Number(row?.annual_heat_mwh || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`,
              `Boiler capacity: ${Number(row?.installed_boiler_capacity_kw || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kW`,
            ].join('<br/>');
          },
        },
        legend: { top: 38, left: 12, data: ['Study-period GWP', 'Annual heat'] },
        grid: { top: 84, left: 86, right: 86, bottom: 74 },
        xAxis: {
          type: 'category',
          data: boilerRows.map(item => item.building_name || `Building ${item.building_id}`),
          axisLabel: { rotate: 24, width: 92, overflow: 'truncate' },
        },
        yAxis: [
          { type: 'value', name: 't CO2e', axisLabel: { formatter: (value: number) => this.compactTonnes(value / 1000) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
          { type: 'value', name: 'MWh/yr', axisLabel: { formatter: (value: number) => `${Math.round(value)} MWh` } },
        ],
        series: [
          { name: 'Study-period GWP', type: 'bar', data: boilerRows.map(item => Number(item.total_emissions_kgco2e || 0)), barMaxWidth: 36 },
          { name: 'Annual heat', type: 'line', yAxisIndex: 1, data: boilerRows.map(item => Number(item.annual_heat_mwh || 0)), smooth: true, symbolSize: 8, lineStyle: { width: 3 } },
        ],
      };
    } else {
      const diameterLabels = this.diameterBreakdown.map(item => item.dn ? `DN ${item.dn}` : 'Unsized');
      this.diameterOption = {
        backgroundColor: '#ffffff',
        color: ['#12715b', '#884dff'],
        title: { text: 'Diameter Emissions Drivers', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 800 } },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { top: 38, left: 12, data: ['Emissions', 'Length'] },
        grid: { top: 84, left: 72, right: 78, bottom: 52 },
        xAxis: { type: 'category', data: diameterLabels, axisLabel: { rotate: 18 } },
        yAxis: [
          { type: 'value', name: 't CO2e', axisLabel: { formatter: (value: number) => this.compactTonnes(value / 1000) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
          { type: 'value', name: 'Length', axisLabel: { formatter: (value: number) => `${Math.round(value)} m` } },
        ],
        series: [
          { name: 'Emissions', type: 'bar', data: this.diameterBreakdown.map(item => Number(item.total_emissions_kgco2e || 0)), barMaxWidth: 36 },
          { name: 'Length', type: 'line', yAxisIndex: 1, data: this.diameterBreakdown.map(item => Number(item.length_m || 0)), smooth: true, symbolSize: 8, lineStyle: { width: 3 } },
        ],
      };
    }

    const sortedSegments = [...this.segmentBreakdown]
      .sort((a, b) => Number(b.total_emissions_kgco2e || 0) - Number(a.total_emissions_kgco2e || 0))
      .slice(0, 10)
      .reverse();

    this.segmentOption = {
      backgroundColor: '#ffffff',
      color: ['#be123c'],
      title: {
        text: this.isBoilerBaseCase ? 'Top Local Boiler Emitters' : 'Top Segment Emissions',
        left: 12,
        top: 8,
        textStyle: { color: '#192038', fontSize: 15, fontWeight: 800 },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => this.formatTonnes(value / 1000) },
      grid: { top: 62, left: 150, right: 28, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.compactTonnes(value / 1000) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      yAxis: {
        type: 'category',
        data: sortedSegments.map(segment => segment.building_name || segment.edge_name || `Edge ${segment.edge_id}`),
        axisLabel: { width: 128, overflow: 'truncate' },
      },
      series: [{
        name: 'GWP',
        type: 'bar',
        data: sortedSegments.map(segment => Number(segment.total_emissions_kgco2e || 0)),
        barMaxWidth: 24,
      }],
    };
  }

  private formatTonnes(value: number): string {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value || 0)} t CO2e`;
  }

  private compactTonnes(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Mt`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}kt`;
    return `${(value || 0).toFixed(value >= 10 ? 0 : 1)}t`;
  }

  private downloadChart(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
