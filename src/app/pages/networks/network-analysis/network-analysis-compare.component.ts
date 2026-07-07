import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbToastrService } from '@nebular/theme';
import {
  NetworkAnalysisCompareItem,
  NetworkAnalysisService,
} from './network-analysis.service';

interface CompareRow {
  id: number;
  name: string;
  projectName: string;
  capex: number;
  opex: number;
  carbon: number;
  lifecycle: number;
  lcoh: number;
}

@Component({
  selector: 'ngx-network-analysis-compare',
  templateUrl: './network-analysis-compare.component.html',
  styleUrls: ['./network-analysis-compare.component.scss'],
})
export class NetworkAnalysisCompareComponent implements OnInit {
  networks: any[] = [];
  selectedIds: number[] = [];
  reports: NetworkAnalysisCompareItem[] = [];
  rows: CompareRow[] = [];
  networkSearch = '';

  isLoadingNetworks = false;
  isLoadingCompare = false;

  lifecycleBarOption: any = {};
  metricHeatmapOption: any = {};
  compositionOption: any = {};

  private chartRefs: Record<string, any> = {};

  constructor(
    private analysis: NetworkAnalysisService,
    private toastr: NbToastrService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadNetworks();
  }

  loadNetworks(): void {
    this.isLoadingNetworks = true;
    this.analysis.listNetworks().subscribe({
      next: (res) => {
        this.networks = Array.isArray(res) ? res : (res?.results || []);
        this.selectedIds = this.defaultComparisonIds();
        this.isLoadingNetworks = false;
        if (this.selectedIds.length) {
          this.recalculate();
        }
      },
      error: () => {
        this.isLoadingNetworks = false;
        this.toastr.danger('Networks could not be loaded.', 'Techno-Economic Compare');
      },
    });
  }

  get filteredNetworks(): any[] {
    const query = this.networkSearch.trim().toLowerCase();
    if (!query) return this.networks;
    return this.networks.filter(network =>
      String(network.name || '').toLowerCase().includes(query) ||
      String(network.project?.name || '').toLowerCase().includes(query) ||
      String(network.derivation_stage || '').toLowerCase().includes(query)
    );
  }

  get bestLifecycle(): CompareRow | null {
    return this.lowestBy('lifecycle');
  }

  get bestLcoh(): CompareRow | null {
    return this.lowestBy('lcoh');
  }

  get bestCarbon(): CompareRow | null {
    return this.lowestBy('carbon');
  }

  isSelected(id: number): boolean {
    return this.selectedIds.includes(Number(id));
  }

  toggleNetwork(id: number, checked: boolean): void {
    const networkId = Number(id);
    if (checked) {
      const network = this.networks.find(item => Number(item.id) === networkId);
      const projectId = network?.project_id || network?.project?.id || null;
      const currentProjectId = this.selectedProjectId();
      if (currentProjectId && projectId && Number(projectId) !== Number(currentProjectId)) {
        this.selectedIds = [networkId];
        this.toastr.info('Started a new comparison for that project.', 'Techno-Economic Compare');
        return;
      }
      if (this.selectedIds.length >= 6) {
        this.toastr.warning('Compare up to six networks for readable presentation visuals.', 'Techno-Economic Compare');
        return;
      }
      this.selectedIds = Array.from(new Set([...this.selectedIds, networkId]));
    } else {
      this.selectedIds = this.selectedIds.filter(item => item !== networkId);
    }
  }

  recalculate(): void {
    if (!this.selectedIds.length) {
      this.reports = [];
      this.rows = [];
      this.buildCharts();
      return;
    }

    this.isLoadingCompare = true;
    this.analysis.compareReports(this.selectedIds).subscribe({
      next: (items) => {
        if (!Array.isArray(items)) {
          this.reports = [];
          this.rows = [];
          this.buildCharts();
          this.isLoadingCompare = false;
          this.toastr.danger((items as any)?.error || 'Comparison response was not usable.', 'Techno-Economic Compare');
          return;
        }
        this.reports = items || [];
        this.rows = this.reports.map(item => {
          const projection = item.report.lifecycle_projection_20yr || [];
          const finalYear = projection[projection.length - 1] || {
            cumulative_capex: item.report.kpis.total_capex_cad,
            cumulative_opex: 0,
            cumulative_carbon: item.report.kpis.total_carbon_debt_cad,
          };
          return {
            id: item.network.id,
            name: item.network.name || `Network ${item.network.id}`,
            projectName: item.network.project_name || 'Unassigned',
            capex: Number(finalYear.cumulative_capex || item.report.kpis.total_capex_cad || 0),
            opex: Number(finalYear.cumulative_opex || 0),
            carbon: Number(finalYear.cumulative_carbon || item.report.kpis.total_carbon_debt_cad || 0),
            lifecycle: Number(item.report.kpis.total_lifecycle_cost_cad || 0),
            lcoh: Number(item.report.kpis.lcoh_cad_per_kwh || 0),
          };
        });
        this.buildCharts();
        this.isLoadingCompare = false;
      },
      error: (err) => {
        this.isLoadingCompare = false;
        this.toastr.danger(err?.error?.error || 'Techno-economic comparison could not be loaded.', 'Techno-Economic Compare');
      },
    });
  }

  buildCharts(): void {
    const names = this.rows.map(row => this.shortenLabel(row.name));
    const lifecycleValues = this.rows.map(row => Math.max(row.lifecycle, 1));

    this.lifecycleBarOption = {
      backgroundColor: '#ffffff',
      color: ['#0f766e'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const item = params?.[0];
          const row = this.rows[item?.dataIndex || 0];
          return `<strong>${row?.name || ''}</strong><br/>TULC: ${this.formatCurrency(row?.lifecycle || 0)}<br/>LCOH: ${this.formatLcoh(row?.lcoh || 0)}`;
        },
      },
      grid: { top: 28, left: 180, right: 42, bottom: 52 },
      xAxis: {
        type: 'log',
        logBase: 10,
        name: '20-year TULC CAD, log scale',
        min: 1,
        axisLabel: { formatter: (value: number) => this.formatMillions(value), color: '#475569', fontWeight: 800 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#0f172a', fontWeight: 900 },
      },
      series: [{
        name: 'TULC',
        type: 'bar',
        data: lifecycleValues,
        barMaxWidth: 32,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => this.formatMillions(this.rows[params.dataIndex]?.lifecycle || 0),
          color: '#0f172a',
          fontWeight: 900,
        },
      }],
    };

    this.metricHeatmapOption = this.buildMetricHeatmap();
    this.compositionOption = this.buildCompositionChart(names);
  }

  buildMetricHeatmap(): any {
    const metrics = [
      { label: 'CAPEX', key: 'capex', formatter: (value: number) => this.formatCurrency(value) },
      { label: 'TULC', key: 'lifecycle', formatter: (value: number) => this.formatCurrency(value) },
      { label: 'LCOH', key: 'lcoh', formatter: (value: number) => this.formatLcoh(value) },
      { label: 'Carbon Debt', key: 'carbon', formatter: (value: number) => this.formatCurrency(value) },
    ];
    const names = this.rows.map(row => this.shortenLabel(row.name));
    const maxima = metrics.map(metric => Math.max(...this.rows.map(row => Number((row as any)[metric.key] || 0)), 0.000001));
    const data: any[] = [];
    this.rows.forEach((row, y) => {
      metrics.forEach((metric, x) => {
        const actual = Number((row as any)[metric.key] || 0);
        data.push([x, y, Math.round((actual / maxima[x]) * 100), actual]);
      });
    });

    return {
      backgroundColor: '#ffffff',
      tooltip: {
        formatter: (params: any) => {
          const metric = metrics[params.value[0]];
          const row = this.rows[params.value[1]];
          return `<strong>${row.name}</strong><br/>${metric.label}: ${metric.formatter(params.value[3])}<br/>${params.value[2]}% of comparison maximum`;
        },
      },
      grid: { top: 42, left: 150, right: 36, bottom: 42 },
      xAxis: {
        type: 'category',
        data: metrics.map(metric => metric.label),
        axisLabel: { color: '#0f172a', fontWeight: 900 },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#0f172a', fontWeight: 900 },
      },
      visualMap: {
        min: 0,
        max: 100,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        calculable: false,
        inRange: { color: ['#ecfdf5', '#fde68a', '#f97316', '#991b1b'] },
        textStyle: { color: '#475569', fontWeight: 800 },
      },
      series: [{
        name: 'Relative metric intensity',
        type: 'heatmap',
        data,
        label: {
          show: true,
          formatter: (params: any) => `${params.value[2]}%`,
          color: '#0f172a',
          fontWeight: 950,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#0f172a',
            borderWidth: 2,
          },
        },
      }],
    };
  }

  buildCompositionChart(names: string[]): any {
    const totals = this.rows.map(row => Math.max(row.capex + row.opex + row.carbon, 1));
    const pct = (key: 'capex' | 'opex' | 'carbon') => this.rows.map((row, index) => Number(((row[key] / totals[index]) * 100).toFixed(2)));

    return {
      backgroundColor: '#ffffff',
      color: ['#0f766e', '#2563eb', '#b45309'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const row = this.rows[params?.[0]?.dataIndex || 0];
          return [
            `<strong>${row?.name || ''}</strong>`,
            `CAPEX: ${this.formatCurrency(row?.capex || 0)}`,
            `OPEX: ${this.formatCurrency(row?.opex || 0)}`,
            `Carbon debt: ${this.formatCurrency(row?.carbon || 0)}`,
          ].join('<br/>');
        },
      },
      legend: {
        top: 4,
        textStyle: { color: '#475569', fontWeight: 850 },
      },
      grid: { top: 58, left: 150, right: 36, bottom: 42 },
      xAxis: {
        type: 'value',
        max: 100,
        axisLabel: { formatter: '{value}%', color: '#475569', fontWeight: 800 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#0f172a', fontWeight: 900 },
      },
      series: [
        this.compositionSeries('CAPEX', pct('capex')),
        this.compositionSeries('OPEX', pct('opex')),
        this.compositionSeries('Carbon Debt', pct('carbon')),
      ],
    };
  }

  compositionSeries(name: string, data: number[]): any {
    return {
      name,
      type: 'bar',
      stack: 'composition',
      data,
      barMaxWidth: 34,
      label: {
        show: true,
        formatter: (params: any) => params.value >= 8 ? `${params.value.toFixed(0)}%` : '',
        color: '#ffffff',
        fontWeight: 950,
      },
    };
  }

  onChartInit(key: string, chart: any): void {
    this.chartRefs[key] = chart;
  }

  async copyChart(key: string): Promise<void> {
    const chart = this.chartRefs[key];
    if (!chart?.getDataURL) {
      this.toastr.warning('Chart is not ready yet.', 'Copy chart');
      return;
    }

    const dataUrl = chart.getDataURL({
      type: 'png',
      pixelRatio: 3,
      backgroundColor: '#ffffff',
    });

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if ((navigator as any).clipboard?.write && ClipboardItemCtor) {
        await (navigator as any).clipboard.write([
          new ClipboardItemCtor({ 'image/png': blob }),
        ]);
        this.toastr.success('Chart copied as a PNG.', 'Copy chart');
        return;
      }
      this.downloadDataUrl(dataUrl, `${key}-techno-economic-compare.png`);
      this.toastr.info('PNG download started because clipboard images are unavailable.', 'Copy chart');
    } catch (error) {
      this.downloadDataUrl(dataUrl, `${key}-techno-economic-compare.png`);
      this.toastr.info('PNG download started because clipboard copy was blocked.', 'Copy chart');
    }
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  private lowestBy(key: keyof Pick<CompareRow, 'lifecycle' | 'lcoh' | 'carbon'>): CompareRow | null {
    if (!this.rows.length) return null;
    return this.rows.reduce((best, row) => Number(row[key] || 0) < Number(best[key] || 0) ? row : best, this.rows[0]);
  }

  private defaultComparisonIds(): number[] {
    const groups = new Map<number | string, any[]>();
    this.networks.forEach(network => {
      const projectKey = network.project_id || network.project?.id || 'unassigned';
      groups.set(projectKey, [...(groups.get(projectKey) || []), network]);
    });
    const preferredGroup = Array.from(groups.values()).find(group => group.length >= 2) || this.networks.slice(0, 1);
    return preferredGroup.slice(0, 3).map(network => Number(network.id));
  }

  private selectedProjectId(): number | string | null {
    const selected = this.networks.find(item => this.selectedIds.includes(Number(item.id)));
    return selected?.project_id || selected?.project?.id || null;
  }

  backToAnalysis(): void {
    this.router.navigate(['/pages/networks/analysis']);
  }

  shortenLabel(value: string): string {
    const text = String(value || '');
    return text.length > 28 ? `${text.slice(0, 25)}...` : text;
  }

  formatMillions(value: number): string {
    const number = Number(value || 0);
    if (Math.abs(number) >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
    if (Math.abs(number) >= 1_000) return `$${(number / 1_000).toFixed(0)}k`;
    return `$${number.toFixed(0)}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  formatLcoh(value: number): string {
    return `${new Intl.NumberFormat('en-CA', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(Number(value || 0))} CAD/kWh`;
  }
}
