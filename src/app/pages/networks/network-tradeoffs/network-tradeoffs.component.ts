import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';

interface NetworkItem {
  id: number;
  name: string;
  project_id?: number;
  parent_network?: number;
  parent_network_name?: string;
  derivation_stage?: string;
  derivation_method?: string;
  total_length?: number;
  route_count?: number;
  created_at?: string;
}

interface PipeSizingRun {
  id: number;
  name: string;
  network?: number;
  network_name?: string;
  topology_source_name?: string;
}

interface PipeSectionRow {
  id: number;
  edge_name?: string;
  peak_load_kw?: number;
  mass_flow_kg_s?: number;
  diameter_m?: number;
  velocity_m_s?: number;
  delta_t?: number;
  pressure_drop_pa?: number;
  length_m?: number;
  overlap_count?: number;
  is_shared_segment?: boolean;
}

interface PipeCatalogPipe {
  dn: number;
  di: number;
  cost: number;
  roughness?: number;
}

interface DesignConstants {
  rho: number;
  cp: number;
  mu: number;
  max_velocity: number;
  min_velocity: number;
  target_pressure_drop: number;
  electricity_cost: number;
  pump_efficiency: number;
  lifespan_years: number;
  hours_per_year: number;
  supply_temperature_c: number;
  return_temperature_c: number;
  ambient_temperature_c: number;
  thermal_loss_coefficient_w_m_k: number;
  fallback_pipe_cost_per_meter: number;
  pipe_catalog: PipeCatalogPipe[];
}

interface DeltaTScenario {
  deltaT: number;
  massFlowKgS: number;
  pumpKw: number;
  lifecycleCost: number;
  pipeCapex: number;
  pumpLifecycleCost: number;
  heatLossKw: number;
  heatLossLifecycleCost: number;
  averageDn: number;
  averageVelocity: number;
  maxVelocity: number;
  maxPressurePaM: number;
  violatingSections: number;
  isFeasible: boolean;
}

interface NetworkComparisonPoint {
  id: number;
  name: string;
  stage?: string;
  lengthM: number;
  annualHeatMwh: number;
  peakKw: number;
  lifecycleCost: number;
  constructionCost: number;
  pumpingCost: number;
  emissionsKg: number;
  overlapRatio: number;
  routeCount: number;
}

interface PairTradeoffChart {
  key: string;
  eyebrow: string;
  title: string;
  filename: string;
  option: any;
}

interface PairMetricSpec {
  label: string;
  unit: string;
  value: (row: DeltaTScenario) => number;
}

const DEFAULT_PIPE_CATALOG: PipeCatalogPipe[] = [
  { dn: 20, di: 0.020, cost: 15, roughness: 0.000045 },
  { dn: 25, di: 0.025, cost: 20, roughness: 0.000045 },
  { dn: 32, di: 0.032, cost: 30, roughness: 0.000045 },
  { dn: 40, di: 0.040, cost: 40, roughness: 0.000045 },
  { dn: 50, di: 0.050, cost: 55, roughness: 0.000045 },
  { dn: 65, di: 0.065, cost: 70, roughness: 0.000045 },
  { dn: 80, di: 0.080, cost: 90, roughness: 0.000045 },
  { dn: 100, di: 0.100, cost: 120, roughness: 0.000045 },
  { dn: 125, di: 0.125, cost: 160, roughness: 0.000045 },
  { dn: 150, di: 0.150, cost: 200, roughness: 0.000045 },
  { dn: 200, di: 0.200, cost: 300, roughness: 0.000045 },
  { dn: 250, di: 0.250, cost: 450, roughness: 0.000045 },
  { dn: 300, di: 0.300, cost: 600, roughness: 0.000045 },
  { dn: 350, di: 0.350, cost: 800, roughness: 0.000045 },
  { dn: 400, di: 0.400, cost: 1100, roughness: 0.000045 },
];

@Component({
  selector: 'ngx-network-tradeoffs',
  templateUrl: './network-tradeoffs.component.html',
  styleUrls: ['./network-tradeoffs.component.scss'],
})
export class NetworkTradeoffsComponent implements OnInit {
  networks: NetworkItem[] = [];
  pipeSizingRuns: PipeSizingRun[] = [];
  filteredRuns: PipeSizingRun[] = [];
  sections: PipeSectionRow[] = [];

  selectedNetworkId?: number;
  selectedPipeSizingId?: number;
  selectedYear = new Date().getFullYear();
  constants: DesignConstants = this.defaultConstants();

  demandSummary: any;
  costSummary: any;
  emissionsSummary: any;
  heatUtilization: any;
  aggregateRows: any[] = [];

  deltaTScenarios: DeltaTScenario[] = [];
  comparisonPoints: NetworkComparisonPoint[] = [];
  selectedPoint?: NetworkComparisonPoint;

  diversityFactor = 0;
  coincidentPeakKw = 0;
  individualPeakSumKw = 0;
  annualHeatMwh = 0;
  peakCoincidenceSavingKw = 0;
  routeOverlapSavedM = 0;
  routeOverlapRatio = 0;
  utilizationMatchPct = 0;
  backupHeatMwh = 0;

  isLoading = false;
  isComparing = false;
  error = '';

  deltaTOption: any = {};
  utilizationOption: any = {};
  diversityOption: any = {};
  lengthBenefitOption: any = {};
  carbonCostOption: any = {};
  overlapOption: any = {};
  evolutionOption: any = {};
  pairTradeoffCharts: PairTradeoffChart[] = [];
  chartRefs: Record<string, any> = {};

  private readonly gravity = 9.80665;

  constructor(
    private api: RestApiService,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    this.loadSelectors();
  }

  get selectedNetwork(): NetworkItem | undefined {
    return this.networks.find((network) => Number(network.id) === Number(this.selectedNetworkId));
  }

  get selectedRun(): PipeSizingRun | undefined {
    return this.pipeSizingRuns.find((run) => Number(run.id) === Number(this.selectedPipeSizingId));
  }

  get bestDeltaT(): DeltaTScenario | undefined {
    return this.deltaTScenarios.reduce((best, row) => {
      if (!best) return row;
      return row.lifecycleCost < best.lifecycleCost ? row : best;
    }, undefined as DeltaTScenario | undefined);
  }

  loadSelectors(): void {
    this.isLoading = true;
    this.error = '';
    forkJoin({
      networks: this.api.get<any>('networks/?limit=500&ordering=-created_at,-id').pipe(catchError(() => of(null))),
      runs: this.api.get<any>('pipe_sizings/?limit=500&ordering=-created_at,-id').pipe(catchError(() => of(null))),
    })
      .pipe(finalize(() => this.isLoading = false))
      .subscribe(({ networks, runs }) => {
        this.networks = this.listFromResponse<NetworkItem>(networks);
        this.pipeSizingRuns = this.listFromResponse<PipeSizingRun>(runs);
        this.selectedNetworkId = this.pipeSizingRuns[0]?.network || this.networks[0]?.id;
        this.filterRuns();
        this.selectedPipeSizingId = this.filteredRuns[0]?.id;
        this.loadDashboard();
      });
  }

  onNetworkChange(networkId: number | string): void {
    this.selectedNetworkId = Number(networkId);
    this.filterRuns();
    this.selectedPipeSizingId = this.filteredRuns[0]?.id;
    this.loadDashboard();
  }

  onRunChange(runId: number | string): void {
    this.selectedPipeSizingId = Number(runId);
    const run = this.selectedRun;
    if (run?.network) {
      this.selectedNetworkId = run.network;
      this.filterRuns();
    }
    this.loadDashboard();
  }

  onYearChange(): void {
    this.loadDashboard();
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
      if (!navigator.clipboard || !ClipboardItemCtor) throw new Error('Clipboard blocked');
      await (navigator.clipboard as any).write([new ClipboardItemCtor({ 'image/png': blob })]);
      this.toastr.success('Visualization copied as an image.', 'Copied');
    } catch {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
      this.toastr.info('Clipboard image copy was blocked, so the PNG was downloaded.', 'Visualization Ready');
    }
  }

  formatNumber(value: number | null | undefined, digits = 1): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  formatCurrency(value: number | null | undefined): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    if (Math.abs(numeric) >= 1_000_000) return `$${this.formatNumber(numeric / 1_000_000, 2)}M`;
    if (Math.abs(numeric) >= 1_000) return `$${this.formatNumber(numeric / 1_000, 1)}k`;
    return numeric.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  }

  private loadDashboard(): void {
    if (!this.selectedNetworkId) {
      this.error = 'No network is available for tradeoff analysis.';
      return;
    }

    this.isLoading = true;
    this.error = '';
    const year = Number(this.selectedYear || new Date().getFullYear());
    const endYear = year + 1;
    const networkId = this.selectedNetworkId;
    const sectionsRequest = this.selectedPipeSizingId
      ? this.api.get<any>(`edge_pipe_sizings/?pipe_sizing=${this.selectedPipeSizingId}`).pipe(catchError(() => of([])))
      : of([]);

    forkJoin({
      constants: this.api.get<any>(`network_design_constants/?network=${networkId}`).pipe(catchError(() => of(null))),
      sections: sectionsRequest,
      demand: this.api.get<any>(`networks/${networkId}/demand-map/`).pipe(catchError(() => of(null))),
      cost: this.api.get<any>(`networks/${networkId}/cost-summary/`).pipe(catchError(() => of(null))),
      emissions: this.api.get<any>(`networks/${networkId}/emissions-summary/`).pipe(catchError(() => of(null))),
      utilization: this.api.get<any>(`heat-utilization/?network_id=${networkId}&year=${year}`).pipe(catchError(() => of(null))),
      aggregate: this.api.get<any>(`aggregate-profile/?network_id=${networkId}&start_date__gte=${year}-01-01&start_date__lte=${endYear}-01-01`).pipe(catchError(() => of(null))),
    })
      .pipe(finalize(() => this.isLoading = false))
      .subscribe((payload) => {
        this.constants = this.normalizeConstants(payload.constants);
        this.sections = this.listFromResponse<PipeSectionRow>(payload.sections)
          .filter((section) => this.numberOr(section.length_m, 0) > 0);
        this.demandSummary = payload.demand;
        this.costSummary = payload.cost;
        this.emissionsSummary = payload.emissions;
        this.heatUtilization = payload.utilization;
        this.aggregateRows = this.listFromResponse<any>(payload.aggregate);

        this.computeSelectedNetworkMetrics();
        this.deltaTScenarios = this.buildDeltaTScenarios();
        this.buildCharts();
        this.loadComparisonPoints();
      });
  }

  private loadComparisonPoints(): void {
    const related = this.relatedNetworks().slice(0, 8);
    if (!related.length) {
      this.comparisonPoints = [];
      return;
    }

    this.isComparing = true;
    const requests = related.map((network) => forkJoin({
      demand: this.api.get<any>(`networks/${network.id}/demand-map/`).pipe(catchError(() => of(null))),
      cost: this.api.get<any>(`networks/${network.id}/cost-summary/`).pipe(catchError(() => of(null))),
      emissions: this.api.get<any>(`networks/${network.id}/emissions-summary/`).pipe(catchError(() => of(null))),
    }).pipe(catchError(() => of(null))));

    forkJoin(requests)
      .pipe(finalize(() => this.isComparing = false))
      .subscribe((responses) => {
        this.comparisonPoints = related.map((network, index) => {
          const response: any = responses[index] || {};
          return this.comparisonPoint(network, response.demand, response.cost, response.emissions);
        });
        this.selectedPoint = this.comparisonPoints.find((point) => point.id === this.selectedNetworkId);
        this.buildComparisonCharts();
      });
  }

  private computeSelectedNetworkMetrics(): void {
    const totals = this.demandSummary?.totals || {};
    const network = this.demandSummary?.network || {};
    const util = this.heatUtilization?.summary || {};
    const aggregateRows = this.aggregateRows || [];

    this.individualPeakSumKw = this.numberOr(totals.peak_heat_kw, 0);
    this.coincidentPeakKw = Math.max(...aggregateRows.map((row) => this.numberOr(row.total_demand, 0)), 0);
    if (!this.coincidentPeakKw) this.coincidentPeakKw = this.individualPeakSumKw;
    this.diversityFactor = this.individualPeakSumKw ? this.coincidentPeakKw / this.individualPeakSumKw : 0;
    this.peakCoincidenceSavingKw = Math.max(this.individualPeakSumKw - this.coincidentPeakKw, 0);
    this.annualHeatMwh = this.numberOr(totals.annual_heat_mwh, 0);

    this.utilizationMatchPct = this.numberOr(util.heat_match_pct, 0);
    this.backupHeatMwh = this.numberOr(util.annual_unserved_consumer_heat_kwh, 0) / 1000;

    this.routeOverlapSavedM = this.numberOr(network.overlap_deduped_length_m, this.costSummary?.metrics?.overlap_deduped_length_m || 0);
    this.routeOverlapRatio = this.numberOr(network.overlap_ratio, this.costSummary?.metrics?.overlap_ratio || 0);
  }

  private buildDeltaTScenarios(): DeltaTScenario[] {
    if (!this.sections.length) return [];
    const options = [10, 15, 20, 25, 30, 35, 40, 50, 60];
    return options.map((deltaT) => {
      const evaluated = this.sections.map((section) => this.evaluateAtDeltaT(section, deltaT));
      const totalLength = this.sum(evaluated, (row) => row.lengthM);
      const violatingSections = evaluated.filter((row) => !row.isFeasible).length;
      return {
        deltaT,
        massFlowKgS: this.sum(evaluated, (row) => row.massFlowKgS),
        pumpKw: this.sum(evaluated, (row) => row.pumpKw),
        heatLossKw: this.sum(evaluated, (row) => row.heatLossKw),
        lifecycleCost: this.sum(evaluated, (row) => row.pipeCapex + row.pumpLifecycleCost + row.heatLossLifecycleCost),
        pipeCapex: this.sum(evaluated, (row) => row.pipeCapex),
        pumpLifecycleCost: this.sum(evaluated, (row) => row.pumpLifecycleCost),
        heatLossLifecycleCost: this.sum(evaluated, (row) => row.heatLossLifecycleCost),
        averageDn: totalLength ? this.sum(evaluated, (row) => row.pipe.dn * row.lengthM) / totalLength : 0,
        averageVelocity: totalLength ? this.sum(evaluated, (row) => row.velocity * row.lengthM) / totalLength : 0,
        maxVelocity: Math.max(...evaluated.map((row) => row.velocity), 0),
        maxPressurePaM: Math.max(...evaluated.map((row) => row.pressurePaM), 0),
        violatingSections,
        isFeasible: violatingSections === 0,
      };
    });
  }

  private evaluateAtDeltaT(section: PipeSectionRow, deltaT: number): any {
    const peakLoadKw = Math.max(this.numberOr(section.peak_load_kw, 0), 0);
    const massFlowKgS = this.constants.cp && deltaT ? peakLoadKw / (this.constants.cp * deltaT) : 0;
    const pipe = this.pipeForFlow(section, massFlowKgS);
    const lengthM = this.numberOr(section.length_m, 0);
    const hydraulic = this.hydraulics(massFlowKgS, pipe.di, lengthM, pipe.roughness || 0.000045);
    const pipeCapex = lengthM * this.numberOr(pipe.cost, this.constants.fallback_pipe_cost_per_meter);
    const annualEnergyKwh = hydraulic.pumpKw * this.constants.hours_per_year;
    const pumpLifecycleCost = annualEnergyKwh * this.constants.electricity_cost * this.constants.lifespan_years;
    const heatLossKw = this.heatLossKw(lengthM, this.constants.return_temperature_c + deltaT / 2);
    const heatLossLifecycleCost = heatLossKw * this.constants.hours_per_year * this.constants.electricity_cost * this.constants.lifespan_years;
    return {
      section,
      lengthM,
      massFlowKgS,
      pipe,
      velocity: hydraulic.velocity,
      pressurePaM: hydraulic.pressurePaM,
      isFeasible: hydraulic.velocity <= this.constants.max_velocity && hydraulic.pressurePaM <= this.constants.target_pressure_drop,
      pumpKw: hydraulic.pumpKw,
      pipeCapex,
      pumpLifecycleCost,
      heatLossKw,
      heatLossLifecycleCost,
    };
  }

  private pipeForFlow(section: PipeSectionRow, massFlowKgS: number): PipeCatalogPipe {
    const catalog = this.catalog();
    const lengthM = this.numberOr(section.length_m, 0);
    for (const pipe of catalog) {
      const hydraulic = this.hydraulics(massFlowKgS, pipe.di, lengthM, pipe.roughness || 0.000045);
      if (hydraulic.velocity <= this.constants.max_velocity && hydraulic.pressurePaM <= this.constants.target_pressure_drop) {
        return pipe;
      }
    }
    return catalog[catalog.length - 1];
  }

  private hydraulics(massFlowKgS: number, diameterM: number, lengthM: number, roughnessM: number): any {
    const volumeFlow = this.constants.rho ? massFlowKgS / this.constants.rho : 0;
    const area = diameterM ? Math.PI * diameterM * diameterM / 4 : 0;
    const velocity = area ? volumeFlow / area : 0;
    const reynolds = this.constants.mu ? this.constants.rho * velocity * diameterM / this.constants.mu : 0;
    const friction = this.frictionFactor(reynolds, diameterM, roughnessM);
    const pressurePa = diameterM ? friction * (lengthM / diameterM) * (this.constants.rho * velocity * velocity / 2) : 0;
    const pressurePaM = lengthM ? pressurePa / lengthM : 0;
    const pumpKw = this.constants.pump_efficiency ? (volumeFlow * pressurePa) / (this.constants.pump_efficiency * 1000) : 0;
    return { velocity, pressurePa, pressurePaM, pumpKw };
  }

  private buildCharts(): void {
    this.buildSelectedCharts();
    this.buildComparisonCharts();
  }

  private buildSelectedCharts(): void {
    const noDeltaT = this.deltaTScenarios.length ? [] : this.noDataGraphic('No pipe sizing data');

    this.deltaTOption = {
      backgroundColor: '#ffffff',
      color: ['#047857'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 90, right: 42, top: 62, bottom: 72 },
      graphic: noDeltaT,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          const row = this.deltaTScenarios[params?.[0]?.dataIndex || 0];
          if (!row) return '';
          return [
            `<strong>${row.deltaT} C delta T</strong>`,
            `Total mass flow: ${this.formatNumber(row.massFlowKgS, 2)} kg/s`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: this.deltaTScenarios.map((row) => `${row.deltaT} C`),
        name: 'Delta T',
        nameLocation: 'middle',
        nameGap: 42,
        axisLabel: { color: '#475569', fontWeight: 900 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Total mass flow (kg/s)',
        axisLabel: { formatter: (value: number) => this.formatNumber(value, 0), color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Total mass flow',
          type: 'line',
          smooth: true,
          symbolSize: 12,
          data: this.deltaTScenarios.map((row) => row.massFlowKgS),
          lineStyle: { width: 5 },
          itemStyle: { borderColor: '#047857', borderWidth: 2 },
          areaStyle: { color: 'rgba(4, 120, 87, 0.10)' },
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => this.formatNumber(params.value, 0),
            color: '#047857',
            fontWeight: 900,
          },
        },
      ],
    };

    this.pairTradeoffCharts = this.buildDeltaTPairCharts();

    const utilSummary = this.heatUtilization?.summary || {};
    this.utilizationOption = {
      backgroundColor: '#ffffff',
      color: ['#047857', '#f97316', '#dc2626'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 88, right: 36, top: 58, bottom: 54 },
      graphic: utilSummary.hours ? [] : this.noDataGraphic('No hourly utilization data'),
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: ['Annual heat'],
        axisLabel: { color: '#475569', fontWeight: 900 },
      },
      yAxis: {
        type: 'value',
        name: 'MWh/year',
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Waste heat used',
          type: 'bar',
          stack: 'heat',
          barMaxWidth: 76,
          data: [this.numberOr(utilSummary.annual_utilized_heat_kwh, 0) / 1000],
        },
        {
          name: 'Unused source heat',
          type: 'bar',
          stack: 'source',
          barMaxWidth: 76,
          data: [this.numberOr(utilSummary.annual_unused_producer_heat_kwh, 0) / 1000],
        },
        {
          name: 'Backup heat needed',
          type: 'bar',
          stack: 'demand',
          barMaxWidth: 76,
          data: [this.numberOr(utilSummary.annual_unserved_consumer_heat_kwh, 0) / 1000],
        },
      ],
    };

    this.diversityOption = {
      backgroundColor: '#ffffff',
      color: ['#7c3aed', '#0f766e'],
      grid: { left: 82, right: 36, top: 34, bottom: 54 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: ['Sum of building peaks', 'Coincident network peak'],
        axisLabel: { color: '#475569', fontWeight: 900 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'kW',
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 70,
        data: [
          { value: this.individualPeakSumKw, itemStyle: { color: '#7c3aed' } },
          { value: this.coincidentPeakKw, itemStyle: { color: '#0f766e' } },
        ],
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => `${this.formatNumber(params.value, 0)} kW`,
          color: '#0f172a',
          fontWeight: 950,
        },
      }],
    };

    const individual = this.numberOr(this.demandSummary?.network?.individual_route_length_m, this.costSummary?.metrics?.individual_route_length_m || 0) / 1000;
    const physical = this.numberOr(this.demandSummary?.network?.total_length, this.costSummary?.metrics?.total_length_m || 0) / 1000;
    const saved = this.routeOverlapSavedM / 1000;
    this.overlapOption = {
      backgroundColor: '#ffffff',
      color: ['#64748b', '#2563eb', '#047857'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 76, right: 36, top: 58, bottom: 54 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: ['Route length'],
        axisLabel: { color: '#475569', fontWeight: 900 },
      },
      yAxis: {
        type: 'value',
        name: 'km',
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        { name: 'Individual routed length', type: 'bar', data: [individual], barMaxWidth: 62 },
        { name: 'Unique constructed length', type: 'bar', data: [physical], barMaxWidth: 62 },
        { name: 'Overlap removed', type: 'bar', data: [saved], barMaxWidth: 62 },
      ],
    };
  }

  private buildDeltaTPairCharts(): PairTradeoffChart[] {
    if (!this.deltaTScenarios.length) return [];

    const massFlow = this.metric('Total mass flow', 'kg/s', (row) => row.massFlowKgS);
    const averageDn = this.metric('Length-weighted average DN', 'DN', (row) => row.averageDn);
    const pumpPower = this.metric('Pump power', 'kW', (row) => row.pumpKw);
    const pressureGradient = this.metric('Maximum pressure gradient', 'Pa/m', (row) => row.maxPressurePaM);
    const averageVelocity = this.metric('Length-weighted velocity', 'm/s', (row) => row.averageVelocity);
    const pipeCapex = this.metric('Pipe CAPEX', 'CAD', (row) => row.pipeCapex);
    const pumpCost = this.metric('Pump lifecycle cost', 'CAD', (row) => row.pumpLifecycleCost);
    const heatLoss = this.metric('Heat loss', 'kW', (row) => row.heatLossKw);
    const heatLossCost = this.metric('Heat-loss lifecycle cost', 'CAD', (row) => row.heatLossLifecycleCost);
    const meanWaterTemperature = this.metric(
      'Mean water temperature',
      'C',
      (row) => this.numberOr(this.constants.return_temperature_c, 50) + row.deltaT / 2,
    );

    const specs = [
      {
        key: 'pair-flow-dn',
        eyebrow: 'Flow to pipe size',
        title: 'Mass Flow vs Average Pipe Diameter',
        filename: 'mass-flow-vs-average-pipe-diameter.png',
        x: massFlow,
        y: averageDn,
        color: '#2563eb',
      },
      {
        key: 'pair-flow-pump',
        eyebrow: 'Flow to pumping',
        title: 'Mass Flow vs Pump Power',
        filename: 'mass-flow-vs-pump-power.png',
        x: massFlow,
        y: pumpPower,
        color: '#ea580c',
      },
      {
        key: 'pair-velocity-pressure',
        eyebrow: 'Darcy-Weisbach response',
        title: 'Velocity vs Maximum Pressure Gradient',
        filename: 'velocity-vs-pressure-gradient.png',
        x: averageVelocity,
        y: pressureGradient,
        color: '#7c3aed',
      },
      {
        key: 'pair-dn-capex',
        eyebrow: 'Construction tradeoff',
        title: 'Average Pipe Diameter vs Pipe CAPEX',
        filename: 'average-pipe-diameter-vs-pipe-capex.png',
        x: averageDn,
        y: pipeCapex,
        color: '#2563eb',
      },
      {
        key: 'pair-pump-power-cost',
        eyebrow: 'Pump energy cost',
        title: 'Pump Power vs Pumping Cost',
        filename: 'pump-power-vs-pumping-cost.png',
        x: pumpPower,
        y: pumpCost,
        color: '#ea580c',
      },
      {
        key: 'pair-mean-temp-heat-loss',
        eyebrow: 'Thermal loss driver',
        title: 'Mean Water Temperature vs Heat Loss',
        filename: 'mean-water-temperature-vs-heat-loss.png',
        x: meanWaterTemperature,
        y: heatLoss,
        color: '#dc2626',
      },
      {
        key: 'pair-heat-loss-cost',
        eyebrow: 'Thermal lifecycle',
        title: 'Heat Loss vs Heat-Loss Cost',
        filename: 'heat-loss-vs-heat-loss-cost.png',
        x: heatLoss,
        y: heatLossCost,
        color: '#dc2626',
      },
    ];

    return specs.map((spec) => ({
      key: spec.key,
      eyebrow: spec.eyebrow,
      title: spec.title,
      filename: spec.filename,
      option: this.pairChartOption(spec.x, spec.y, spec.color),
    }));
  }

  private metric(label: string, unit: string, value: (row: DeltaTScenario) => number): PairMetricSpec {
    return { label, unit, value };
  }

  private pairChartOption(xMetric: PairMetricSpec, yMetric: PairMetricSpec, color: string): any {
    const showDeltaTLabels = xMetric.label === 'Delta T' || yMetric.label === 'Delta T';
    const rows = this.deltaTScenarios
      .map((row) => ({
        row,
        x: xMetric.value(row),
        y: yMetric.value(row),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((a, b) => a.x - b.x);

    const pointData = rows.map((point) => ({
      value: [point.x, point.y, point.row.deltaT],
      itemStyle: {
        color: point.row.isFeasible ? color : '#dc2626',
        borderColor: '#0f172a',
        borderWidth: 1.2,
      },
    }));

    return {
      backgroundColor: '#ffffff',
      color: [color],
      grid: { left: 86, right: 32, top: 34, bottom: 72 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value || [];
          const row = this.deltaTScenarios.find((scenario) => Number(scenario.deltaT) === Number(value[2]));
          const lines = [
            showDeltaTLabels
              ? `<strong>${this.formatNumber(value[2], 0)} C delta T</strong>`
              : `<strong>${xMetric.label} -> ${yMetric.label}</strong>`,
            `${xMetric.label}: ${this.formatMetricValue(value[0], xMetric.unit)}`,
            `${yMetric.label}: ${this.formatMetricValue(value[1], yMetric.unit)}`,
            row?.isFeasible
              ? 'Hydraulic status: within velocity and pressure targets'
              : `Hydraulic status: ${this.formatNumber(row?.violatingSections || 0, 0)} sections exceed targets`,
          ];
          return lines.join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: this.axisName(xMetric),
        nameLocation: 'middle',
        nameGap: 46,
        axisLabel: {
          formatter: (value: number) => this.formatAxisValue(value, xMetric.unit),
          color: '#475569',
          fontWeight: 900,
        },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        name: this.axisName(yMetric),
        nameLocation: 'middle',
        nameGap: 62,
        axisLabel: {
          formatter: (value: number) => this.formatAxisValue(value, yMetric.unit),
          color: '#475569',
          fontWeight: 900,
        },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Trend',
          type: 'line',
          smooth: true,
          showSymbol: false,
          silent: true,
          data: rows.map((point) => [point.x, point.y]),
          lineStyle: { width: 3, opacity: 0.45 },
        },
        {
          name: 'Delta T scenario',
          type: 'scatter',
          symbolSize: 14,
          data: pointData,
          label: {
            show: showDeltaTLabels,
            formatter: (params: any) => `${this.formatNumber(params.value?.[2], 0)} C`,
            position: 'top',
            color: '#0f172a',
            fontWeight: 950,
          },
          emphasis: { scale: 1.15 },
        },
      ],
    };
  }

  private axisName(metric: PairMetricSpec): string {
    return metric.unit === 'DN' ? metric.label : `${metric.label} (${metric.unit})`;
  }

  private formatAxisValue(value: number, unit: string): string {
    if (unit === 'CAD') return this.formatCurrency(value);
    if (unit === 'DN' || unit === 'C' || unit === 'Pa/m') return this.formatNumber(value, 0);
    if (unit === 'kg/s' || unit === 'kW') return this.formatNumber(value, Math.abs(value) >= 100 ? 0 : 1);
    return this.formatNumber(value, 1);
  }

  private formatMetricValue(value: number, unit: string): string {
    if (unit === 'CAD') return this.formatCurrency(value);
    if (unit === 'DN') return `DN${this.formatNumber(value, 0)}`;
    return `${this.formatNumber(value, unit === 'Pa/m' ? 0 : 2)} ${unit}`;
  }

  private buildComparisonCharts(): void {
    const rows = this.comparisonPoints || [];
    const noComparison = rows.length ? [] : this.noDataGraphic('No related network comparison data');

    this.lengthBenefitOption = {
      backgroundColor: '#ffffff',
      color: ['#2563eb'],
      grid: { left: 82, right: 42, top: 34, bottom: 72 },
      graphic: noComparison,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value || [];
          return [
            `<strong>${value[3]}</strong>`,
            `Length: ${this.formatNumber(value[0], 2)} km`,
            `Annual demand: ${this.formatNumber(value[1], 1)} MWh`,
            `Demand density: ${this.formatNumber(value[2], 1)} MWh/km`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: 'Constructed length (km)',
        nameLocation: 'middle',
        nameGap: 46,
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Annual demand (MWh)',
        nameLocation: 'middle',
        nameGap: 62,
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [{
        type: 'scatter',
        symbolSize: (value: any[]) => 14 + Math.min(Number(value?.[2] || 0) / 40, 28),
        data: rows.map((row) => [
          row.lengthM / 1000,
          row.annualHeatMwh,
          row.lengthM ? row.annualHeatMwh / (row.lengthM / 1000) : 0,
          row.name,
        ]),
        itemStyle: { borderColor: '#0f172a', borderWidth: 1.2, opacity: 0.86 },
      }],
    };

    this.carbonCostOption = {
      backgroundColor: '#ffffff',
      color: ['#be123c'],
      grid: { left: 86, right: 42, top: 34, bottom: 72 },
      graphic: noComparison,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value || [];
          return [
            `<strong>${value[3]}</strong>`,
            `Lifecycle cost: ${this.formatCurrency(value[0])}`,
            `Embodied emissions: ${this.formatNumber(value[1] / 1000, 1)} tCO2e`,
            `Annual demand: ${this.formatNumber(value[2], 1)} MWh`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: 'Lifecycle cost (CAD)',
        nameLocation: 'middle',
        nameGap: 48,
        axisLabel: { formatter: (value: number) => this.formatCurrency(value), color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Embodied emissions (kg CO2e)',
        nameLocation: 'middle',
        nameGap: 66,
        axisLabel: { formatter: (value: number) => `${this.formatNumber(value / 1000, 0)}t`, color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [{
        type: 'scatter',
        symbolSize: (value: any[]) => 16 + Math.min(Number(value?.[2] || 0) / 1000, 24),
        data: rows.map((row) => [row.lifecycleCost, row.emissionsKg, row.annualHeatMwh, row.name]),
        itemStyle: { borderColor: '#0f172a', borderWidth: 1.2, opacity: 0.86 },
      }],
    };

    this.evolutionOption = {
      backgroundColor: '#ffffff',
      color: ['#2563eb', '#f97316', '#047857'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 82, right: 76, top: 58, bottom: 86 },
      graphic: noComparison,
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: rows.map((row) => row.name),
        axisLabel: { color: '#475569', fontWeight: 900, rotate: rows.length > 3 ? 24 : 0 },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'MWh / km',
          axisLabel: { color: '#475569', fontWeight: 900 },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
        },
        {
          type: 'value',
          name: 'Route overlap',
          axisLabel: { formatter: (value: number) => `${this.formatNumber(value * 100, 0)}%`, color: '#475569', fontWeight: 900 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Demand density',
          type: 'bar',
          barMaxWidth: 42,
          data: rows.map((row) => row.lengthM ? row.annualHeatMwh / (row.lengthM / 1000) : 0),
        },
        {
          name: 'Lifecycle cost / annual MWh',
          type: 'line',
          smooth: true,
          data: rows.map((row) => row.annualHeatMwh ? row.lifecycleCost / row.annualHeatMwh : 0),
          lineStyle: { width: 4 },
        },
        {
          name: 'Overlap ratio',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: rows.map((row) => row.overlapRatio),
          lineStyle: { width: 4, type: 'dashed' },
        },
      ],
    };
  }

  private relatedNetworks(): NetworkItem[] {
    const selected = this.selectedNetwork;
    if (!selected) return [];
    const familyRoot = selected.parent_network || selected.id;
    const related = this.networks.filter((network) => {
      return (
        network.id === selected.id ||
        network.parent_network === selected.id ||
        network.id === selected.parent_network ||
        network.parent_network === familyRoot
      );
    });
    if (!related.some((network) => network.id === selected.id)) {
      related.unshift(selected);
    }
    return related.sort((a, b) => {
      if (a.id === selected.id) return -1;
      if (b.id === selected.id) return 1;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }

  private comparisonPoint(network: NetworkItem, demand: any, cost: any, emissions: any): NetworkComparisonPoint {
    const metrics = cost?.metrics || {};
    const totals = demand?.totals || {};
    const demandNetwork = demand?.network || {};
    const emissionsMetrics = emissions?.metrics || emissions?.kpis || {};
    return {
      id: network.id,
      name: network.name,
      stage: network.derivation_stage,
      lengthM: this.numberOr(metrics.total_length_m, demandNetwork.total_length || network.total_length || 0),
      annualHeatMwh: this.numberOr(totals.annual_heat_mwh, 0),
      peakKw: this.numberOr(totals.peak_heat_kw, 0),
      lifecycleCost: this.numberOr(metrics.total_lifecycle_cost, 0),
      constructionCost: this.numberOr(metrics.construction_cost, 0),
      pumpingCost: this.numberOr(metrics.pumping_lifecycle_cost, 0),
      emissionsKg: this.numberOr(
        emissionsMetrics.total_embodied_kg_co2e,
        emissionsMetrics.total_emissions_kg_co2e || emissionsMetrics.total_lifecycle_kg_co2e || 0,
      ),
      overlapRatio: this.numberOr(metrics.overlap_ratio, demandNetwork.overlap_ratio || 0),
      routeCount: this.numberOr(network.route_count, 0),
    };
  }

  private filterRuns(): void {
    this.filteredRuns = this.pipeSizingRuns.filter((run) => Number(run.network) === Number(this.selectedNetworkId));
  }

  private defaultConstants(): DesignConstants {
    return {
      rho: 971.8,
      cp: 4.19,
      mu: 0.000355,
      max_velocity: 2.5,
      min_velocity: 0.5,
      target_pressure_drop: 100,
      electricity_cost: 0.15,
      pump_efficiency: 0.75,
      lifespan_years: 30,
      hours_per_year: 4000,
      supply_temperature_c: 80,
      return_temperature_c: 50,
      ambient_temperature_c: 10,
      thermal_loss_coefficient_w_m_k: 0.25,
      fallback_pipe_cost_per_meter: 150,
      pipe_catalog: DEFAULT_PIPE_CATALOG.slice(),
    };
  }

  private normalizeConstants(response: any): DesignConstants {
    const saved = this.listFromResponse<any>(response)[0] || {};
    const merged = { ...this.defaultConstants(), ...saved };
    merged.pipe_catalog = this.normalizeCatalog(saved.pipe_catalog || merged.pipe_catalog);
    return merged;
  }

  private normalizeCatalog(rawCatalog: any[]): PipeCatalogPipe[] {
    const catalog = (Array.isArray(rawCatalog) ? rawCatalog : [])
      .map((pipe) => ({
        dn: Math.round(this.numberOr(pipe?.dn, this.numberOr(pipe?.di, 0) * 1000)),
        di: this.numberOr(pipe?.di, 0),
        cost: this.numberOr(pipe?.cost, this.constants?.fallback_pipe_cost_per_meter || 150),
        roughness: this.numberOr(pipe?.roughness, 0.000045),
      }))
      .filter((pipe) => pipe.dn > 0 && pipe.di > 0)
      .sort((a, b) => a.di - b.di);
    return catalog.length ? catalog : DEFAULT_PIPE_CATALOG.slice();
  }

  private catalog(): PipeCatalogPipe[] {
    return this.normalizeCatalog(this.constants.pipe_catalog);
  }

  private frictionFactor(reynolds: number, diameterM: number, roughnessM: number): number {
    if (!Number.isFinite(reynolds) || reynolds <= 0 || diameterM <= 0) return 0;
    if (reynolds < 2000) return 64 / reynolds;
    if (reynolds < 4000) return 0.04;
    const term = (roughnessM / (3.7 * diameterM)) + (5.74 / Math.pow(reynolds, 0.9));
    return 0.25 / Math.pow(Math.log10(term), 2);
  }

  private heatLossKw(lengthM: number, meanWaterTemperatureC: number): number {
    const coefficient = Math.max(this.numberOr(this.constants.thermal_loss_coefficient_w_m_k, 0), 0);
    const temperatureLift = Math.max(meanWaterTemperatureC - this.numberOr(this.constants.ambient_temperature_c, 10), 0);
    return coefficient * Math.max(lengthM, 0) * temperatureLift / 1000;
  }

  private listFromResponse<T>(response: any): T[] {
    if (Array.isArray(response)) return response as T[];
    if (Array.isArray(response?.results)) return response.results as T[];
    return [];
  }

  private sum<T>(rows: T[], selector: (row: T) => number): number {
    return rows.reduce((total, row) => total + this.numberOr(selector(row), 0), 0);
  }

  private numberOr(value: any, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private noDataGraphic(text: string): any[] {
    return [{
      type: 'text',
      left: 'center',
      top: 'middle',
      style: { text, fill: '#be123c', fontSize: 18, fontWeight: 900 },
    }];
  }
}
