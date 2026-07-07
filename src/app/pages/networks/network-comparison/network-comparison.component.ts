import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-network-comparison',
  templateUrl: './network-comparison.component.html',
  styleUrls: ['./network-comparison.component.scss'],
})
export class NetworkComparisonComponent implements OnInit {
  allNetworks: any[] = [];
  selectedIds: number[] = [];
  comparisonData: any[] = [];
  chartRefs: Record<string, any> = {};

  isLoadingList = false;
  isLoadingCompare = false;
  searchText = '';
  searchTimeout: any;
  costPerMeterRefreshTimer: any;
  costPerMeter = 150;

  costStackOption: any = {};
  costLengthOption: any = {};
  pipeMixOption: any = {};

  metricRows = [
    { label: 'Total Lifecycle Cost', key: 'total_lifecycle_cost', format: 'currency' },
    { label: 'Construction Cost', key: 'construction_cost', format: 'currency' },
    { label: 'Pumping Lifecycle', key: 'pumping_lifecycle_cost', format: 'currency' },
    { label: 'Total Length', key: 'total_length_m', format: 'meters' },
    { label: 'Route Overlap Removed', key: 'overlap_deduped_length_m', format: 'meters' },
    { label: 'Average Cost / m', key: 'average_cost_per_meter', format: 'currencyPerMeter' },
    { label: 'Average Lifecycle / m', key: 'average_lifecycle_cost_per_meter', format: 'currencyPerMeter' },
    { label: 'Average Diameter', key: 'average_diameter_m', format: 'diameter' },
    { label: 'Max Diameter', key: 'max_diameter_m', format: 'diameter' },
    { label: 'Max Velocity', key: 'max_velocity_m_s', format: 'velocity' },
    { label: 'Pressure Drop', key: 'total_pressure_drop_pa', format: 'pressure' },
    { label: 'Nodes', key: 'node_count', format: 'integer' },
    { label: 'Edges', key: 'edge_count', format: 'integer' },
    { label: 'Routes', key: 'route_count', format: 'integer' },
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
    let params = '?limit=15';
    if (this.searchText) {
      params += `&search=${encodeURIComponent(this.searchText)}`;
    }

    this.api.get<any>(`networks/${params}`).subscribe({
      next: (data) => {
        this.allNetworks = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false,
    });
  }

  onSearchInput(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchNetworkList(), 400);
  }

  toggleSelection(id: number): void {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      if (this.selectedIds.length >= 5) return;
      this.selectedIds.push(id);
    }

    this.selectedIds.length ? this.fetchComparison() : this.resetData();
  }

  resetData(): void {
    this.comparisonData = [];
    this.costStackOption = {};
    this.costLengthOption = {};
    this.pipeMixOption = {};
  }

  fetchComparison(): void {
    this.isLoadingCompare = true;
    this.api.post<any[]>(
      { ids: this.selectedIds, cost_per_meter: this.costPerMeter },
      'networks/compare-metrics/',
    ).subscribe({
      next: (data) => {
        this.comparisonData = data || [];
        this.buildVisualizations();
        this.isLoadingCompare = false;
      },
      error: () => this.isLoadingCompare = false,
    });
  }

  recalculate(): void {
    if (this.selectedIds.length) {
      this.fetchComparison();
    }
  }

  onCostPerMeterChange(): void {
    if (this.costPerMeterRefreshTimer) clearTimeout(this.costPerMeterRefreshTimer);
    this.costPerMeterRefreshTimer = setTimeout(() => {
      if (this.selectedIds.length) {
        this.fetchComparison();
      }
    }, 450);
  }

  valueFor(summary: any, key: string): number {
    return Number(summary?.metrics?.[key] || 0);
  }

  formatValue(value: number, format: string): string {
    const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    const precise = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

    if (format === 'currency') return money.format(value);
    if (format === 'currencyPerMeter') return `${money.format(value)}/m`;
    if (format === 'meters') return `${formatter.format(value)} m`;
    if (format === 'diameter') return `${precise.format(value)} m`;
    if (format === 'velocity') return `${precise.format(value)} m/s`;
    if (format === 'pressure') return `${formatter.format(value)} Pa`;
    if (format === 'thermalLoss') return `${precise.format(value)} kW`;
    if (format === 'temperature') return `${precise.format(value)} deg C`;
    return formatter.format(value);
  }

  bestFor(key: string): number | null {
    if (!this.comparisonData.length) return null;
    const values = this.comparisonData.map(item => this.valueFor(item, key));
    if (['total_lifecycle_cost', 'construction_cost', 'pumping_lifecycle_cost', 'total_length_m', 'average_cost_per_meter', 'average_lifecycle_cost_per_meter', 'total_pressure_drop_pa'].includes(key)) {
      return Math.min(...values);
    }
    return Math.max(...values);
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
    const names = this.comparisonData.map(item => item.network.name);
    const construction = this.comparisonData.map(item => this.valueFor(item, 'construction_cost'));
    const pumping = this.comparisonData.map(item => this.valueFor(item, 'pumping_lifecycle_cost'));
    const totalCosts = this.comparisonData.map(item => this.valueFor(item, 'total_lifecycle_cost'));
    const lengths = this.comparisonData.map(item => this.valueFor(item, 'total_length_m'));
    const costPerMeter = this.comparisonData.map(item => this.valueFor(item, 'average_cost_per_meter'));

    this.costStackOption = {
      backgroundColor: '#ffffff',
      color: ['#3366ff', '#00d68f'],
      title: { text: 'Lifecycle Cost Composition', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => this.formatValue(value, 'currency') },
      legend: { top: 38, left: 12, data: ['Construction', 'Pumping lifecycle'] },
      grid: { top: 78, left: 140, right: 28, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.compactMoney(value) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      yAxis: { type: 'category', data: names, axisLabel: { width: 120, overflow: 'truncate' } },
      series: [
        { name: 'Construction', type: 'bar', stack: 'cost', data: construction, barMaxWidth: 24 },
        { name: 'Pumping lifecycle', type: 'bar', stack: 'cost', data: pumping, barMaxWidth: 24 },
      ],
    };

    this.costLengthOption = {
      backgroundColor: '#ffffff',
      color: ['#ff3d71', '#ffaa00'],
      title: { text: 'Cost vs Length', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 38, left: 12, data: ['Total lifecycle cost', 'Average cost / m'] },
      grid: { top: 82, left: 72, right: 74, bottom: 52 },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 18, width: 110, overflow: 'truncate' } },
      yAxis: [
        { type: 'value', name: 'Total cost', axisLabel: { formatter: (value: number) => this.compactMoney(value) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
        { type: 'value', name: 'Cost / m', axisLabel: { formatter: (value: number) => this.compactMoney(value) } },
      ],
      series: [
        { name: 'Total lifecycle cost', type: 'bar', data: totalCosts.map((value, index) => ({ value, itemStyle: { opacity: lengths[index] ? 0.92 : 0.45 } })), barMaxWidth: 34 },
        { name: 'Average cost / m', type: 'line', yAxisIndex: 1, data: costPerMeter, smooth: true, symbolSize: 8, lineStyle: { width: 3 } },
      ],
    };

    const pipeLabels = this.pipeLabels();
    this.pipeMixOption = {
      backgroundColor: '#ffffff',
      color: ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#8f9bb3', '#884dff', '#00b8d9'],
      title: { text: 'Pipe Diameter Length Mix', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => `${Math.round(value).toLocaleString()} m` },
      legend: { top: 38, left: 12, type: 'scroll', data: pipeLabels },
      grid: { top: 88, left: 70, right: 26, bottom: 50 },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 18, width: 110, overflow: 'truncate' } },
      yAxis: { type: 'value', name: 'Length', axisLabel: { formatter: (value: number) => `${Math.round(value / 1000)} km` }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      series: pipeLabels.map(label => ({
        name: label,
        type: 'bar',
        stack: 'diameter',
        barMaxWidth: 38,
        data: this.comparisonData.map(item => this.lengthForPipeLabel(item, label)),
      })),
    };
  }

  private pipeLabels(): string[] {
    const labels = new Set<string>();
    this.comparisonData.forEach(item => {
      (item.breakdown_by_diameter || []).forEach((pipe: any) => labels.add(pipe.dn ? `DN ${pipe.dn}` : 'Unsized'));
    });
    return Array.from(labels);
  }

  private lengthForPipeLabel(item: any, label: string): number {
    const match = (item.breakdown_by_diameter || []).find((pipe: any) => (pipe.dn ? `DN ${pipe.dn}` : 'Unsized') === label);
    return Number(match?.length_m || 0);
  }

  private compactMoney(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${Math.round(value)}`;
  }

  private downloadChart(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
