import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { Router } from '@angular/router';
import {
  AnalysisComponentLifecycleRow,
  CarbonTaxRate,
  NetworkAnalysisReport,
  NetworkAnalysisService,
} from './network-analysis.service';

@Component({
  selector: 'ngx-network-analysis-dashboard',
  templateUrl: './network-analysis-dashboard.component.html',
  styleUrls: ['./network-analysis-dashboard.component.scss'],
})
export class NetworkAnalysisDashboardComponent implements OnInit {
  networks: any[] = [];
  selectedNetworkId?: number;
  selectedNetwork: any;
  report?: NetworkAnalysisReport;
  carbonTaxSchedule: CarbonTaxRate[] = [];

  isLoadingNetworks = false;
  isLoadingReport = false;
  isLoadingCarbonTax = false;

  capexDonutOption: any = {};
  lifecycleAreaOption: any = {};
  carbonTaxOption: any = {};
  capexComponentOption: any = {};
  opexComponentOption: any = {};
  emissionsComponentOption: any = {};
  carbonCostComponentOption: any = {};
  private chartRefs: Record<string, any> = {};

  constructor(
    private analysis: NetworkAnalysisService,
    private toastr: NbToastrService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadCarbonTaxSchedule();
    this.loadNetworks();
  }

  loadNetworks(): void {
    this.isLoadingNetworks = true;
    this.analysis.listNetworks().subscribe({
      next: (res) => {
        this.networks = Array.isArray(res) ? res : (res?.results || []);
        this.isLoadingNetworks = false;
        if (!this.selectedNetworkId && this.networks.length) {
          this.selectedNetworkId = this.networks[0].id;
          this.loadReport();
        }
      },
      error: () => {
        this.isLoadingNetworks = false;
        this.toastr.danger('Networks could not be loaded.', 'Analysis');
      },
    });
  }

  loadReport(): void {
    if (!this.selectedNetworkId) return;
    this.selectedNetwork = this.networks.find(item => item.id === this.selectedNetworkId);
    this.report = undefined;
    this.isLoadingReport = true;

    this.analysis.getReport(this.selectedNetworkId).subscribe({
      next: (report) => {
        this.report = report;
        this.buildCharts();
        this.isLoadingReport = false;
      },
      error: () => {
        this.isLoadingReport = false;
        this.toastr.danger('Techno-economic analysis could not be generated.', 'Analysis');
      },
    });
  }

  get kpis(): any {
    return this.report?.kpis || {};
  }

  get assumptions(): any {
    return this.report?.analysis_assumptions || {};
  }

  get carbonTaxRange(): string {
    if (!this.carbonTaxSchedule.length) return 'No schedule loaded';
    const first = this.carbonTaxSchedule[0];
    const last = this.carbonTaxSchedule[this.carbonTaxSchedule.length - 1];
    return `${first.year}-${last.year} · ${this.formatCarbonPrice(first.price_cad_per_tonne)} to ${this.formatCarbonPrice(last.price_cad_per_tonne)}`;
  }

  loadCarbonTaxSchedule(): void {
    this.isLoadingCarbonTax = true;
    this.analysis.getCarbonTaxSchedule().subscribe({
      next: (res) => {
        const rows = Array.isArray(res) ? res : (res?.results || []);
        this.carbonTaxSchedule = rows
          .map(row => ({
            ...row,
            year: Number(row.year),
            price_cad_per_tonne: Number(row.price_cad_per_tonne || 0),
          }))
          .filter(row => row.year && row.price_cad_per_tonne >= 0)
          .sort((a, b) => a.year - b.year);
        this.buildCarbonTaxChart();
        this.isLoadingCarbonTax = false;
      },
      error: () => {
        this.isLoadingCarbonTax = false;
        this.toastr.warning('Carbon tax schedule could not be loaded.', 'Analysis');
      },
    });
  }

  buildCharts(): void {
    if (!this.report) return;

    const breakdown = this.report.capex_breakdown || [];
    const projection = this.report.lifecycle_projection_20yr || [];
    const years = projection.map(row => row.year);

    this.capexDonutOption = breakdown.length
      ? {
        backgroundColor: '#ffffff',
        color: ['#0f766e', '#2563eb', '#f59e0b'],
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            return `<strong>${params.name}</strong><br/>${this.formatCurrency(params.value)} (${params.percent}%)`;
          },
        },
        legend: {
          bottom: 4,
          left: 'center',
          itemWidth: 12,
          itemHeight: 12,
          textStyle: { color: '#475569', fontWeight: 700 },
        },
        series: [{
          name: 'CAPEX',
          type: 'pie',
          radius: ['58%', '78%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 5,
          },
          label: {
            show: true,
            formatter: (params: any) => `${params.name}\n${this.formatMillions(params.value)}`,
            color: '#0f172a',
            fontWeight: 900,
            lineHeight: 18,
          },
          data: breakdown.map(row => ({ name: row.category, value: Number(row.value || 0) })),
        }],
        graphic: {
          type: 'text',
          left: 'center',
          top: '38%',
          style: {
            text: 'CAPEX',
            fill: '#0f172a',
            fontSize: 18,
            fontWeight: 900,
            textAlign: 'center',
          },
        },
      }
      : this.emptyChartOption('No priced CAPEX components');

    this.lifecycleAreaOption = {
      backgroundColor: '#ffffff',
      color: ['#0f766e', '#2563eb', '#b45309'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#0f172a' } },
        formatter: (params: any[]) => {
          const year = params?.[0]?.axisValue;
          const total = params.reduce((sum, item) => sum + Number(item.value || 0), 0);
          return [
            `<strong>${year}</strong>`,
            ...params.map(item => `${item.marker}${item.seriesName}: ${this.formatCurrency(item.value)}`),
            `<strong>Total: ${this.formatCurrency(total)}</strong>`,
          ].join('<br/>');
        },
      },
      legend: {
        top: 6,
        left: 12,
        data: ['Base CAPEX', 'Cumulative OPEX PV', 'Cumulative Carbon Debt PV'],
        textStyle: { color: '#475569', fontWeight: 800 },
      },
      grid: { top: 64, left: 86, right: 32, bottom: 54 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: years,
        axisLabel: { color: '#475569', fontWeight: 800 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        name: 'Cumulative CAD',
        axisLabel: { formatter: (value: number) => this.formatMillions(value), color: '#475569', fontWeight: 800 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        this.areaSeries('Base CAPEX', projection.map(row => row.cumulative_capex), '#0f766e'),
        this.areaSeries('Cumulative OPEX PV', projection.map(row => row.cumulative_opex), '#2563eb'),
        this.areaSeries('Cumulative Carbon Debt PV', projection.map(row => row.cumulative_carbon), '#b45309'),
      ],
    };

    this.buildComponentLifecycleCharts();
  }

  buildComponentLifecycleCharts(): void {
    const rows = this.report?.component_lifecycle_20yr || [];
    this.capexComponentOption = this.componentChartOption(
      rows,
      'capex',
      'Cumulative CAPEX by Component',
      'CAD',
      'line',
      (value) => this.formatMillions(value),
    );
    this.opexComponentOption = this.componentChartOption(
      rows,
      'discounted_opex',
      'Discounted OPEX by Component',
      'PV CAD/year',
      'bar',
      (value) => this.formatCurrency(value),
    );
    this.emissionsComponentOption = this.componentChartOption(
      rows,
      'annual_emissions_tco2e',
      'Annual Operational Emissions by Source',
      'tCO2e/year',
      'bar',
      (value) => this.formatTonnes(value),
    );
    this.carbonCostComponentOption = this.componentChartOption(
      rows,
      'discounted_carbon_cost',
      'Discounted Carbon Cost by Source',
      'PV CAD/year',
      'bar',
      (value) => this.formatCurrency(value),
    );
  }

  componentChartOption(
    rows: AnalysisComponentLifecycleRow[],
    key: keyof Pick<
      AnalysisComponentLifecycleRow,
      'capex' | 'annual_opex' | 'annual_emissions_tco2e' | 'annual_carbon_cost' | 'cumulative_carbon_cost'
      | 'discounted_opex' | 'discounted_carbon_cost'
    >,
    emptyMessage: string,
    yAxisName: string,
    type: 'bar' | 'line',
    formatter: (value: number) => string,
  ): any {
    const years = rows.map(row => row.year);
    const categories = this.componentCategories(rows, key);
    if (!rows.length || !categories.length) {
      return this.emptyChartOption(emptyMessage);
    }

    const palette = ['#0f766e', '#2563eb', '#b45309', '#7c3aed', '#dc2626', '#0891b2', '#65a30d'];
    const series = categories.map((category, index) => ({
      name: category,
      type,
      stack: 'component-total',
      smooth: type === 'line',
      symbol: type === 'line' ? 'circle' : 'none',
      symbolSize: 6,
      barMaxWidth: 34,
      data: rows.map(row => this.componentValue(row[key], category)),
      lineStyle: type === 'line' ? { width: 3, color: palette[index % palette.length] } : undefined,
      areaStyle: type === 'line' ? { opacity: 0.14, color: palette[index % palette.length] } : undefined,
      itemStyle: { color: palette[index % palette.length], borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0 },
      emphasis: { focus: 'series' },
    }));

    return {
      backgroundColor: '#ffffff',
      color: palette,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: type === 'bar' ? 'shadow' : 'cross', label: { backgroundColor: '#0f172a' } },
        formatter: (params: any[]) => {
          const year = params?.[0]?.axisValue;
          const total = params.reduce((sum, item) => sum + Number(item.value || 0), 0);
          return [
            `<strong>${year}</strong>`,
            ...params.map(item => `${item.marker}${item.seriesName}: ${formatter(Number(item.value || 0))}`),
            `<strong>Total: ${formatter(total)}</strong>`,
          ].join('<br/>');
        },
      },
      legend: {
        type: 'scroll',
        top: 6,
        left: 12,
        right: 12,
        textStyle: { color: '#475569', fontWeight: 800 },
      },
      grid: { top: 72, left: 88, right: 28, bottom: 54 },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#475569', fontWeight: 800 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        axisLabel: { formatter: (value: number) => formatter(value), color: '#475569', fontWeight: 800 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series,
    };
  }

  componentCategories(
    rows: AnalysisComponentLifecycleRow[],
    key: keyof Pick<
      AnalysisComponentLifecycleRow,
      'capex' | 'annual_opex' | 'annual_emissions_tco2e' | 'annual_carbon_cost' | 'cumulative_carbon_cost'
      | 'discounted_opex' | 'discounted_carbon_cost'
    >,
  ): string[] {
    const categories = new Set<string>();
    rows.forEach(row => {
      (row[key] || []).forEach(item => {
        if (Math.abs(Number(item.value || 0)) > 0.005) {
          categories.add(item.category);
        }
      });
    });
    return Array.from(categories);
  }

  componentValue(items: Array<{ category: string; value: number }> = [], category: string): number {
    const item = items.find(entry => entry.category === category);
    return Number(item?.value || 0);
  }

  emptyChartOption(message: string): any {
    return {
      backgroundColor: '#ffffff',
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: `${message}\nNo modeled values available`,
          fill: '#64748b',
          fontSize: 16,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 24,
        },
      },
    };
  }

  buildCarbonTaxChart(): void {
    const rows = this.carbonTaxSchedule || [];
    const years = rows.map(row => row.year);
    const prices = rows.map(row => Number(row.price_cad_per_tonne || 0));

    this.carbonTaxOption = {
      backgroundColor: '#ffffff',
      color: ['#b45309', '#0f766e'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const item = params?.[0];
          return `<strong>${item?.axisValue}</strong><br/>Carbon price: ${this.formatCarbonPrice(item?.value || 0)}`;
        },
      },
      grid: { top: 38, left: 86, right: 32, bottom: 58 },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#475569', fontWeight: 800 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        name: 'CAD / tCO2e',
        axisLabel: { formatter: (value: number) => `$${Number(value || 0).toFixed(0)}`, color: '#475569', fontWeight: 800 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Carbon tax',
          type: 'bar',
          data: prices,
          barMaxWidth: 28,
          itemStyle: { borderRadius: [5, 5, 0, 0], color: '#b45309' },
          emphasis: { focus: 'series' },
        },
        {
          name: 'Trajectory',
          type: 'line',
          data: prices,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 4, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => params.dataIndex === 0 || params.dataIndex === prices.length - 1
              ? this.formatCarbonPrice(params.value)
              : '',
            color: '#0f172a',
            fontWeight: 950,
          },
        },
      ],
    };
  }

  areaSeries(name: string, data: number[], color: string): any {
    return {
      name,
      type: 'line',
      stack: 'total-cost',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data,
      lineStyle: { width: 3, color },
      itemStyle: { color },
      areaStyle: { opacity: 0.2, color },
      emphasis: { focus: 'series' },
    };
  }

  onChartInit(key: string, chart: any): void {
    this.chartRefs[key] = chart;
  }

  goToCompare(): void {
    this.router.navigate(['/pages/networks/analysis/compare']);
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
      this.downloadDataUrl(dataUrl, `${key}-analysis.png`);
      this.toastr.info('PNG download started because clipboard images are unavailable.', 'Copy chart');
    } catch (error) {
      this.downloadDataUrl(dataUrl, `${key}-analysis.png`);
      this.toastr.info('PNG download started because clipboard copy was blocked.', 'Copy chart');
    }
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  formatMillions(value: number): string {
    const number = Number(value || 0);
    if (Math.abs(number) >= 1_000_000) {
      return `$${(number / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(number) >= 1_000) {
      return `$${(number / 1_000).toFixed(0)}k`;
    }
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

  formatCarbonPrice(value: number): string {
    return `${new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    }).format(Number(value || 0))}/tCO2e`;
  }

  formatTonnes(value: number): string {
    return `${new Intl.NumberFormat('en-CA', {
      maximumFractionDigits: 1,
    }).format(Number(value || 0))} tCO2e`;
  }

  formatPercent(value: number): string {
    return `${(Number(value || 0) * 100).toFixed(1)}%`;
  }

  formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('en-CA', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(value || 0));
  }
}
