import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-network-costs',
  templateUrl: './network-costs.component.html',
  styleUrls: ['./network-costs.component.scss'],
})
export class NetworkCostsComponent implements OnInit {
  networks: any[] = [];
  selectedNetworkId?: number;
  costPerMeter = 150;
  costPerMeterEdited = false;
  costPerMeterRefreshTimer: any;
  summary: any;
  constants: any;
  chartRefs: Record<string, any> = {};

  costCompositionOption: any = {};
  diameterCostOption: any = {};
  segmentParetoOption: any = {};

  isLoadingNetworks = false;
  isLoadingSummary = false;
  isSavingConstants = false;

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
      error: () => this.isLoadingNetworks = false,
    });
  }

  onNetworkChange(): void {
    this.summary = null;
    this.constants = null;
    this.loadSummary();
  }

  loadSummary(): void {
    if (!this.selectedNetworkId) return;
    this.isLoadingSummary = true;
    const query = this.costPerMeterEdited
      ? `?cost_per_meter=${encodeURIComponent(String(this.costPerMeter || 0))}`
      : '';
    this.api.get<any>(`networks/${this.selectedNetworkId}/cost-summary/${query}`).subscribe({
      next: (summary) => {
        this.summary = summary;
        this.constants = { ...(summary?.design_constants || {}) };
        if (!this.costPerMeterEdited) {
          this.costPerMeter = Number(this.constants?.fallback_pipe_cost_per_meter || this.costPerMeter || 150);
        }
        this.buildVisualizations();
        this.isLoadingSummary = false;
      },
      error: () => {
        this.toastr.danger('Cost summary could not be loaded.', 'Network Cost');
        this.isLoadingSummary = false;
      },
    });
  }

  recalculate(): void {
    this.costPerMeterEdited = true;
    if (this.constants) {
      this.constants.fallback_pipe_cost_per_meter = Number(this.costPerMeter || 0);
    }
    this.loadSummary();
  }

  onCostPerMeterChange(): void {
    this.costPerMeterEdited = true;
    if (this.constants) {
      this.constants.fallback_pipe_cost_per_meter = Number(this.costPerMeter || 0);
    }
    if (this.costPerMeterRefreshTimer) clearTimeout(this.costPerMeterRefreshTimer);
    this.costPerMeterRefreshTimer = setTimeout(() => this.loadSummary(), 450);
  }

  saveConstants(): void {
    if (!this.selectedNetworkId || !this.constants) return;
    this.isSavingConstants = true;
    const payload = {
      ...this.constants,
      network: this.selectedNetworkId,
      fallback_pipe_cost_per_meter: Number(this.costPerMeter || 0),
      pipe_catalog: this.constants.pipe_catalog || [],
    };

    const request = payload.id
      ? this.api.update(payload.id, payload, 'network_design_constants/')
      : this.api.post(payload, 'network_design_constants/');

    request.subscribe({
      next: (saved) => {
        this.constants = saved;
        this.toastr.success('Network constants saved.', 'Network Cost');
        this.isSavingConstants = false;
        this.loadSummary();
      },
      error: () => {
        this.toastr.danger('Network constants could not be saved.', 'Network Cost');
        this.isSavingConstants = false;
      },
    });
  }

  addPipe(): void {
    if (!this.constants) return;
    if (!Array.isArray(this.constants.pipe_catalog)) {
      this.constants.pipe_catalog = [];
    }
    this.constants.pipe_catalog.push({ dn: 0, di: 0, cost: this.costPerMeter || 0, roughness: 0.000045 });
  }

  removePipe(index: number): void {
    this.constants.pipe_catalog.splice(index, 1);
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

    const construction = this.metricValue('metrics.construction_cost');
    const pumping = this.metricValue('metrics.pumping_lifecycle_cost');
    const total = this.metricValue('metrics.total_lifecycle_cost');

    this.costCompositionOption = {
      backgroundColor: '#ffffff',
      color: ['#3366ff', '#00d68f'],
      title: { text: 'Network Cost Composition', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'item', valueFormatter: (value: number) => this.money(value) },
      legend: { orient: 'vertical', right: 20, top: 50, data: ['Construction', 'Pumping lifecycle'] },
      series: [{
        name: 'Cost',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['38%', '56%'],
        label: { formatter: '{b}\n{d}%' },
        data: [
          { name: 'Construction', value: construction },
          { name: 'Pumping lifecycle', value: pumping },
        ],
      }],
      graphic: [{
        type: 'text',
        left: '30%',
        top: '51%',
        style: {
          text: `${this.compactMoney(total)}\nTotal`,
          textAlign: 'center',
          fill: '#192038',
          fontSize: 18,
          fontWeight: 700,
        },
      }],
    };

    const labels = this.diameterBreakdown.map(item => item.dn ? `DN ${item.dn}` : 'Unsized');
    this.diameterCostOption = {
      backgroundColor: '#ffffff',
      color: ['#3366ff', '#ff3d71'],
      title: { text: 'Pipe Diameter Cost Drivers', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 38, left: 12, data: ['Length', 'Total cost'] },
      grid: { top: 84, left: 72, right: 78, bottom: 52 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 18 } },
      yAxis: [
        { type: 'value', name: 'Length', axisLabel: { formatter: (value: number) => `${Math.round(value)} m` }, splitLine: { lineStyle: { color: '#edf1f7' } } },
        { type: 'value', name: 'Cost', axisLabel: { formatter: (value: number) => this.compactMoney(value) } },
      ],
      series: [
        { name: 'Length', type: 'bar', data: this.diameterBreakdown.map(item => Number(item.length_m || 0)), barMaxWidth: 36 },
        { name: 'Total cost', type: 'line', yAxisIndex: 1, data: this.diameterBreakdown.map(item => Number(item.total_cost || 0)), smooth: true, symbolSize: 8, lineStyle: { width: 3 } },
      ],
    };

    const sortedSegments = [...this.segmentBreakdown]
      .sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0))
      .slice(0, 10)
      .reverse();

    this.segmentParetoOption = {
      backgroundColor: '#ffffff',
      color: ['#884dff'],
      title: { text: 'Top Segment Cost Drivers', left: 12, top: 8, textStyle: { color: '#192038', fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => this.money(value) },
      grid: { top: 62, left: 150, right: 28, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { formatter: (value: number) => this.compactMoney(value) }, splitLine: { lineStyle: { color: '#edf1f7' } } },
      yAxis: {
        type: 'category',
        data: sortedSegments.map(segment => segment.edge_name || `Edge ${segment.edge_id}`),
        axisLabel: { width: 128, overflow: 'truncate' },
      },
      series: [{
        name: 'Segment total',
        type: 'bar',
        data: sortedSegments.map(segment => Number(segment.total_cost || 0)),
        barMaxWidth: 24,
      }],
    };
  }

  private money(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  }

  private compactMoney(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${Math.round(value || 0)}`;
  }

  private downloadChart(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
