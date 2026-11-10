import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbToastrService } from '@nebular/theme';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';

interface NetworkListItem {
  id: number;
  name: string;
}

interface PipeSizingRun {
  id: number;
  name: string;
  method?: string;
  network?: number;
  network_name?: string;
  source_network_name?: string;
  topology_source?: string;
  topology_source_name?: string;
  created_at?: string;
}

interface PipeSectionRow {
  id: number;
  edge_name?: string;
  edge?: any;
  route?: any;
  peak_load_kw?: number;
  mass_flow_kg_s?: number;
  diameter_m?: number;
  velocity_m_s?: number;
  delta_t?: number;
  pressure_drop_pa?: number;
  length_m?: number;
  overlap_count?: number;
  is_shared_segment?: boolean;
  segment_path?: Array<{ lat: number; lng: number }>;
  source_route_ids?: number[];
  source_edge_ids?: number[];
}

interface PipeCatalogPipe {
  dn: number;
  di: number;
  cost: number;
  roughness?: number;
}

interface DesignConstants {
  id?: number;
  network?: number;
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

interface SegmentAlternative {
  sectionId: number;
  sectionName: string;
  lengthM: number;
  peakLoadKw: number;
  massFlowKgS: number;
  pipe: PipeCatalogPipe;
  velocityMS: number;
  pressureDropPa: number;
  pressureDropPaM: number;
  headLossM: number;
  pumpingPowerKw: number;
  annualPumpEnergyKwh: number;
  heatLossKw: number;
  annualHeatLossKwh: number;
  capexCad: number;
  lifetimePumpCad: number;
  lifetimeHeatLossCad: number;
  lifecycleCad: number;
  velocityStatus: 'low' | 'target' | 'high';
  pressureStatus: 'target' | 'high';
}

interface NetworkScenario {
  label: string;
  targetPaM: number | null;
  description: string;
  segments: SegmentAlternative[];
  totalLengthM: number;
  capexCad: number;
  annualPumpEnergyKwh: number;
  annualHeatLossKwh: number;
  lifetimePumpCad: number;
  lifetimeHeatLossCad: number;
  lifecycleCad: number;
  pumpingPowerKw: number;
  heatLossKw: number;
  averageDn: number;
  averageVelocityMS: number;
  averagePressurePaM: number;
  maxVelocityMS: number;
  maxPressurePaM: number;
  dnDistributionKm: Record<string, number>;
}

interface ScenarioOption {
  key: string;
  label: string;
  targetPaM: number | null;
}

interface SegmentInsight {
  sectionId: number;
  sectionName: string;
  lengthM: number;
  peakLoadKw: number;
  currentDn: number;
  economicDn: number;
  currentPumpKw: number;
  economicPumpKw: number;
  currentVelocity: number;
  economicVelocity: number;
  currentPressurePaM: number;
  economicPressurePaM: number;
  extraPipeCapexCad: number;
  lifetimePumpSavingCad: number;
  netLifecycleSavingCad: number;
  decision: string;
}

interface ChartExportSize {
  width: number;
  height: number;
  pixelRatio: number;
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
  selector: 'ngx-pipe-section-sensitivity',
  templateUrl: './pipe-section-sensitivity.component.html',
  styleUrls: ['./pipe-section-sensitivity.component.scss'],
})
export class PipeSectionSensitivityComponent implements OnInit {
  networks: NetworkListItem[] = [];
  pipeSizingRuns: PipeSizingRun[] = [];
  filteredRuns: PipeSizingRun[] = [];
  sections: PipeSectionRow[] = [];

  selectedNetworkId: number | null = null;
  selectedPipeSizingId: number | null = null;
  constants: DesignConstants = this.defaultConstants();

  loadMultiplier = 1;
  electricityCost = 0.15;
  hoursPerYear = 4000;
  lifespanYears = 30;

  isLoading = false;
  isAnalyzing = false;
  error = '';

  currentScenario: NetworkScenario | null = null;
  targetScenarios: NetworkScenario[] = [];
  bestScenario: NetworkScenario | null = null;
  capexMinimumScenario: NetworkScenario | null = null;
  segmentInsights: SegmentInsight[] = [];

  lifecycleTradeoffOption: any = {};
  diameterPumpOption: any = {};
  dnDistributionOption: any = {};
  networkDiameterOption: any = {};
  segmentEconomicsOption: any = {};
  chartRefs: Record<string, any> = {};
  selectedNetworkDiameterScenarioKey = '';

  private readonly gravity = 9.80665;

  constructor(
    private api: RestApiService,
    private router: Router,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    this.loadSelectors();
  }

  get selectedRun(): PipeSizingRun | null {
    return this.pipeSizingRuns.find((run) => Number(run.id) === Number(this.selectedPipeSizingId)) || null;
  }

  get scenarioRows(): NetworkScenario[] {
    return this.targetScenarios;
  }

  get networkDiameterScenarioOptions(): ScenarioOption[] {
    const options: ScenarioOption[] = [{
      key: 'current',
      label: 'Current saved sizing',
      targetPaM: null,
    }];

    this.scenariosByPressureTarget().forEach((scenario) => {
      const targetPaM = this.numberOr(scenario.targetPaM, 0);
      if (targetPaM <= 0) return;
      options.push({
        key: this.scenarioKey(targetPaM),
        label: `${this.formatNumber(targetPaM, 0)} Pa/m scenario`,
        targetPaM,
      });
    });

    return options;
  }

  get topSegmentInsights(): SegmentInsight[] {
    return this.segmentInsights.slice(0, 12);
  }

  get lifecycleSavingsVsCurrent(): number {
    if (!this.currentScenario || !this.bestScenario) return 0;
    return this.currentScenario.lifecycleCad - this.bestScenario.lifecycleCad;
  }

  get pumpSavingsVsCompact(): number {
    if (!this.capexMinimumScenario || !this.bestScenario) return 0;
    return this.capexMinimumScenario.lifetimePumpCad - this.bestScenario.lifetimePumpCad;
  }

  get extraPipeCostVsCompact(): number {
    if (!this.capexMinimumScenario || !this.bestScenario) return 0;
    return this.bestScenario.capexCad - this.capexMinimumScenario.capexCad;
  }

  get economicVerdict(): string {
    if (!this.bestScenario || !this.capexMinimumScenario) {
      return 'Select a network and pipe sizing run to calculate the lifecycle tradeoff.';
    }

    const target = this.bestScenario.targetPaM
      ? `${this.formatNumber(this.bestScenario.targetPaM, 0)} Pa/m`
      : this.bestScenario.label;
    const extra = this.extraPipeCostVsCompact;
    const pumpSaving = this.pumpSavingsVsCompact;

    if (pumpSaving > extra && extra > 0) {
      return `Larger pipes pay back here: moving from the lowest-CAPEX policy to ${target} adds ${this.formatCurrency(extra)} in pipe CAPEX but avoids ${this.formatCurrency(pumpSaving)} in lifetime pumping cost.`;
    }

    if (this.bestScenario === this.capexMinimumScenario) {
      return `The lowest-CAPEX pipe policy is also the lifecycle-cost winner under the current electricity cost, operating hours, and project life.`;
    }

    return `${target} gives the best lifecycle cost under the current assumptions. The economic choice is where extra pipe CAPEX and avoided pump energy are closest to balance.`;
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
        this.networks = this.listFromResponse<NetworkListItem>(networks);
        this.pipeSizingRuns = this.listFromResponse<PipeSizingRun>(runs);

        const firstRun = this.pipeSizingRuns[0];
        this.selectedNetworkId = firstRun?.network || this.networks[0]?.id || null;
        this.filterRunsForNetwork();
        this.selectedPipeSizingId = firstRun?.id || this.filteredRuns[0]?.id || null;

        if (this.selectedNetworkId && this.selectedPipeSizingId) {
          this.loadNetworkAnalysis();
        } else {
          this.error = 'No pipe sizing run is available. Create or run pipe sizing for a network first.';
        }
      });
  }

  onNetworkChange(networkId: number | string | null): void {
    this.selectedNetworkId = networkId ? Number(networkId) : null;
    this.filterRunsForNetwork();
    this.selectedPipeSizingId = this.filteredRuns[0]?.id || null;
    this.resetAnalysis();
    this.loadNetworkAnalysis();
  }

  onRunChange(runId: number | string | null): void {
    this.selectedPipeSizingId = runId ? Number(runId) : null;
    const run = this.selectedRun;
    if (run?.network) {
      this.selectedNetworkId = Number(run.network);
      this.filterRunsForNetwork();
    }
    this.resetAnalysis();
    this.loadNetworkAnalysis();
  }

  onAssumptionChange(): void {
    this.constants.electricity_cost = this.numberOr(this.electricityCost, this.constants.electricity_cost);
    this.constants.hours_per_year = this.numberOr(this.hoursPerYear, this.constants.hours_per_year);
    this.constants.lifespan_years = this.numberOr(this.lifespanYears, this.constants.lifespan_years);
    this.recalculate();
  }

  setLoadMultiplier(value: number | string): void {
    const next = this.numberOr(value, 1);
    this.loadMultiplier = Math.min(Math.max(next, 0.25), 2);
    this.recalculate();
  }

  onNetworkDiameterScenarioChange(): void {
    if (!this.currentScenario) return;
    this.buildCharts();
  }

  resetAssumptions(): void {
    this.loadMultiplier = 1;
    this.electricityCost = this.constants.electricity_cost;
    this.hoursPerYear = this.constants.hours_per_year;
    this.lifespanYears = this.constants.lifespan_years;
    this.recalculate();
  }

  openDetailedSection(sectionId: number): void {
    this.router.navigate(['/pages/pipe-sections', sectionId], {
      queryParams: { pipe_sizing: this.selectedPipeSizingId },
    });
  }

  onChartInit(key: string, chart: any): void {
    this.chartRefs[key] = chart;
  }

  async copyChart(key: string, filename: string): Promise<void> {
    try {
      const dataUrl = await this.chartDataUrl(key);
      if (!dataUrl) return;
      const blob = await this.dataUrlToBlob(dataUrl);
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if (!navigator.clipboard || !ClipboardItemCtor) {
        throw new Error('Clipboard image write is not available.');
      }
      await (navigator.clipboard as any).write([
        new ClipboardItemCtor({ 'image/png': blob }),
      ]);
      this.toastr.success('High-resolution graph copied as a PNG.', 'Copied');
    } catch {
      await this.downloadChart(key, filename, true);
    }
  }

  async downloadChart(key: string, filename: string, fromCopyFallback = false): Promise<void> {
    const dataUrl = await this.chartDataUrl(key);
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
    this.toastr.info(
      fromCopyFallback
        ? 'Clipboard image copy was blocked, so the high-resolution PNG was downloaded.'
        : 'High-resolution PNG downloaded.',
      'Graph Ready',
    );
  }

  private async chartDataUrl(key: string): Promise<string> {
    const chart = this.chartRefs[key];
    if (!chart?.getDataURL) {
      this.toastr.warning('The graph is still loading. Try again in a moment.', 'Graph not ready');
      return '';
    }

    const size = this.chartExportSize(key);
    const chartDom = chart.getDom?.() as HTMLElement | undefined;
    const rect = chartDom?.getBoundingClientRect();
    const originalWidth = Math.max(Math.round(rect?.width || 0), 320);
    const originalHeight = Math.max(Math.round(rect?.height || 0), 240);

    try {
      chart.resize({ width: size.width, height: size.height, silent: true });
      await this.waitForChartRender();
      return chart.getDataURL({
        type: 'png',
        pixelRatio: size.pixelRatio,
        backgroundColor: '#ffffff',
        excludeComponents: ['toolbox'],
      });
    } finally {
      chart.resize({ width: originalWidth, height: originalHeight, silent: true });
      await this.waitForChartRender();
    }
  }

  private chartExportSize(key: string): ChartExportSize {
    if (key === 'network-diameter') {
      return { width: 2560, height: 1500, pixelRatio: 2 };
    }
    if (key === 'lifecycle') {
      return { width: 2400, height: 1350, pixelRatio: 2 };
    }
    return { width: 2000, height: 1250, pixelRatio: 2 };
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    return (await fetch(dataUrl)).blob();
  }

  private waitForChartRender(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  formatNumber(value: number | null | undefined, digits = 1): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  formatCurrency(value: number | null | undefined, compact = true): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    if (compact && Math.abs(numeric) >= 1_000_000) {
      return `$${this.formatNumber(numeric / 1_000_000, 2)}M`;
    }
    if (compact && Math.abs(numeric) >= 1_000) {
      return `$${this.formatNumber(numeric / 1_000, 1)}k`;
    }
    return numeric.toLocaleString(undefined, {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    });
  }

  formatPercent(value: number): string {
    return `${this.formatNumber(value * 100, 0)}%`;
  }

  statusClass(value: number): string {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return '';
  }

  private loadNetworkAnalysis(): void {
    if (!this.selectedNetworkId || !this.selectedPipeSizingId) return;

    this.isAnalyzing = true;
    this.error = '';

    forkJoin({
      constants: this.api.get<any>(`network_design_constants/?network=${this.selectedNetworkId}`).pipe(catchError(() => of(null))),
      sections: this.api.get<any>(`edge_pipe_sizings/?pipe_sizing=${this.selectedPipeSizingId}&visualization=true`).pipe(catchError(() => of(null))),
    })
      .pipe(finalize(() => this.isAnalyzing = false))
      .subscribe(({ constants, sections }) => {
        this.constants = this.normalizeConstants(constants);
        this.electricityCost = this.constants.electricity_cost;
        this.hoursPerYear = this.constants.hours_per_year;
        this.lifespanYears = this.constants.lifespan_years;
        this.sections = this.listFromResponse<PipeSectionRow>(sections)
          .filter((section) => this.sectionLength(section) > 0)
          .sort((a, b) => this.peakLoadKw(b) - this.peakLoadKw(a));

        if (!this.sections.length) {
          this.resetAnalysis();
          this.error = 'This pipe sizing run has no sized pipe sections to analyze.';
          return;
        }

        this.recalculate();
      });
  }

  private recalculate(): void {
    if (!this.sections.length) return;
    this.currentScenario = this.buildCurrentScenario();
    this.targetScenarios = this.targetPressureSteps().map((target) => this.buildTargetScenario(target));
    this.bestScenario = this.minimumBy(this.targetScenarios, (scenario) => scenario.lifecycleCad);
    this.capexMinimumScenario = this.minimumBy(this.targetScenarios, (scenario) => scenario.capexCad);
    this.segmentInsights = this.buildSegmentInsights();
    this.ensureNetworkDiameterScenarioSelection();
    this.buildCharts();
  }

  private filterRunsForNetwork(): void {
    if (!this.selectedNetworkId) {
      this.filteredRuns = this.pipeSizingRuns.slice();
      return;
    }
    this.filteredRuns = this.pipeSizingRuns.filter((run) => Number(run.network) === Number(this.selectedNetworkId));
  }

  private resetAnalysis(): void {
    this.sections = [];
    this.currentScenario = null;
    this.targetScenarios = [];
    this.bestScenario = null;
    this.capexMinimumScenario = null;
    this.segmentInsights = [];
    this.lifecycleTradeoffOption = {};
    this.diameterPumpOption = {};
    this.dnDistributionOption = {};
    this.networkDiameterOption = {};
    this.segmentEconomicsOption = {};
    this.selectedNetworkDiameterScenarioKey = '';
  }

  private ensureNetworkDiameterScenarioSelection(): void {
    const options = this.networkDiameterScenarioOptions;
    if (!options.length) {
      this.selectedNetworkDiameterScenarioKey = 'current';
      return;
    }

    if (!this.selectedNetworkDiameterScenarioKey) {
      const designTarget = this.numberOr(this.constants.target_pressure_drop, 100);
      const designOption = options.find((option) =>
        option.targetPaM !== null && Math.abs(this.numberOr(option.targetPaM, 0) - designTarget) < 0.001);
      this.selectedNetworkDiameterScenarioKey = designOption?.key || 'current';
      return;
    }

    if (!options.some((option) => option.key === this.selectedNetworkDiameterScenarioKey)) {
      this.selectedNetworkDiameterScenarioKey = options[0].key;
    }
  }

  private selectedNetworkDiameterScenario(): NetworkScenario | null {
    if (this.selectedNetworkDiameterScenarioKey === 'current') return this.currentScenario;

    const rawTarget = this.selectedNetworkDiameterScenarioKey.replace('target:', '');
    const targetPaM = Number(rawTarget);
    if (!Number.isFinite(targetPaM)) return this.currentScenario;

    return this.targetScenarios.find((scenario) =>
      Math.abs(this.numberOr(scenario.targetPaM, 0) - targetPaM) < 0.001) || this.currentScenario;
  }

  private selectedNetworkDiameterLabel(scenario: NetworkScenario | null): string {
    if (!scenario || scenario.targetPaM === null) {
      const designTarget = this.numberOr(this.constants.target_pressure_drop, 100);
      return `Saved sizing view (network target: ${this.formatNumber(designTarget, 0)} Pa/m)`;
    }
    return `Scenario view: ${this.formatNumber(scenario.targetPaM, 0)} Pa/m pressure-drop target`;
  }

  private selectedNetworkDesignPressure(scenario: NetworkScenario | null): number {
    return this.numberOr(scenario?.targetPaM, this.constants.target_pressure_drop || 100);
  }

  private pressureScenarioCeilingLabel(scenario: NetworkScenario): string {
    return `< ${this.formatNumber(scenario.targetPaM || 0, 0)} Pa/m`;
  }

  private scenarioKey(targetPaM: number): string {
    return `target:${targetPaM}`;
  }

  private buildCurrentScenario(): NetworkScenario {
    const segments = this.sections.map((section) => {
      const currentPipe = this.currentPipeForSection(section);
      return this.evaluateSection(section, currentPipe, true);
    });
    return this.aggregateScenario(
      'Current design',
      null,
      'Uses the diameters saved by the pipe sizing run.',
      segments,
    );
  }

  private buildTargetScenario(targetPaM: number): NetworkScenario {
    const segments = this.sections.map((section) => {
      const selectedPipe = this.pipeForPressureTarget(section, targetPaM);
      return this.evaluateSection(section, selectedPipe, false);
    });
    return this.aggregateScenario(
      `${this.formatNumber(targetPaM, 0)} Pa/m`,
      targetPaM,
      'Smallest catalog pipe that respects max velocity and the pressure-gradient target.',
      segments,
    );
  }

  private buildSegmentInsights(): SegmentInsight[] {
    const insights = this.sections.map((section) => {
      const current = this.evaluateSection(section, this.currentPipeForSection(section), true);
      const economic = this.minimumBy(
        this.catalog().map((pipe) => this.evaluateSection(section, pipe, false))
          .filter((option) => option.velocityMS <= this.constants.max_velocity || option.massFlowKgS <= 0),
        (option) => option.lifecycleCad,
      ) || current;

      const extraPipeCapexCad = economic.capexCad - current.capexCad;
      const lifetimePumpSavingCad = current.lifetimePumpCad - economic.lifetimePumpCad;
      const netLifecycleSavingCad = current.lifecycleCad - economic.lifecycleCad;

      let decision = 'Current size is economical';
      if (economic.pipe.dn > current.pipe.dn && netLifecycleSavingCad > 0) {
        decision = 'Upsizing pays back';
      } else if (economic.pipe.dn < current.pipe.dn && netLifecycleSavingCad > 0) {
        decision = 'Smaller pipe is cheaper';
      } else if (current.velocityMS > this.constants.max_velocity) {
        decision = 'Current velocity is high';
      }

      return {
        sectionId: section.id,
        sectionName: current.sectionName,
        lengthM: current.lengthM,
        peakLoadKw: current.peakLoadKw,
        currentDn: current.pipe.dn,
        economicDn: economic.pipe.dn,
        currentPumpKw: current.pumpingPowerKw,
        economicPumpKw: economic.pumpingPowerKw,
        currentVelocity: current.velocityMS,
        economicVelocity: economic.velocityMS,
        currentPressurePaM: current.pressureDropPaM,
        economicPressurePaM: economic.pressureDropPaM,
        extraPipeCapexCad,
        lifetimePumpSavingCad,
        netLifecycleSavingCad,
        decision,
      };
    });

    return insights.sort((a, b) => {
      if (b.netLifecycleSavingCad !== a.netLifecycleSavingCad) {
        return b.netLifecycleSavingCad - a.netLifecycleSavingCad;
      }
      return b.currentPumpKw - a.currentPumpKw;
    });
  }

  private aggregateScenario(
    label: string,
    targetPaM: number | null,
    description: string,
    segments: SegmentAlternative[],
  ): NetworkScenario {
    const totalLengthM = this.sum(segments, (segment) => segment.lengthM);
    const capexCad = this.sum(segments, (segment) => segment.capexCad);
    const lifetimePumpCad = this.sum(segments, (segment) => segment.lifetimePumpCad);
    const lifetimeHeatLossCad = this.sum(segments, (segment) => segment.lifetimeHeatLossCad);
    const annualPumpEnergyKwh = this.sum(segments, (segment) => segment.annualPumpEnergyKwh);
    const annualHeatLossKwh = this.sum(segments, (segment) => segment.annualHeatLossKwh);
    const pumpingPowerKw = this.sum(segments, (segment) => segment.pumpingPowerKw);
    const heatLossKw = this.sum(segments, (segment) => segment.heatLossKw);
    const lifecycleCad = capexCad + lifetimePumpCad + lifetimeHeatLossCad;
    const weighted = (selector: (segment: SegmentAlternative) => number) => {
      if (!totalLengthM) return 0;
      return this.sum(segments, (segment) => selector(segment) * segment.lengthM) / totalLengthM;
    };

    const dnDistributionKm: Record<string, number> = {};
    segments.forEach((segment) => {
      const key = `DN${segment.pipe.dn}`;
      dnDistributionKm[key] = (dnDistributionKm[key] || 0) + (segment.lengthM / 1000);
    });

    return {
      label,
      targetPaM,
      description,
      segments,
      totalLengthM,
      capexCad,
      annualPumpEnergyKwh,
      annualHeatLossKwh,
      lifetimePumpCad,
      lifetimeHeatLossCad,
      lifecycleCad,
      pumpingPowerKw,
      heatLossKw,
      averageDn: weighted((segment) => segment.pipe.dn),
      averageVelocityMS: weighted((segment) => segment.velocityMS),
      averagePressurePaM: weighted((segment) => segment.pressureDropPaM),
      maxVelocityMS: Math.max(...segments.map((segment) => segment.velocityMS), 0),
      maxPressurePaM: Math.max(...segments.map((segment) => segment.pressureDropPaM), 0),
      dnDistributionKm,
    };
  }

  private evaluateSection(section: PipeSectionRow, pipe: PipeCatalogPipe, useStoredPressure: boolean): SegmentAlternative {
    const constants = this.constants;
    const lengthM = this.sectionLength(section);
    const peakLoadKw = this.peakLoadKw(section);
    const deltaT = this.deltaT(section);
    const massFlowKgS = this.massFlow(section, peakLoadKw, deltaT);
    const volumeFlowM3S = constants.rho ? massFlowKgS / constants.rho : 0;
    const diameterM = Math.max(this.numberOr(pipe.di, 0), 0.0001);
    const areaM2 = Math.PI * diameterM * diameterM / 4;
    const velocityMS = areaM2 ? volumeFlowM3S / areaM2 : 0;
    const reynolds = constants.mu ? (constants.rho * velocityMS * diameterM) / constants.mu : 0;
    const roughness = this.numberOr(pipe.roughness, 0.000045);
    const friction = this.frictionFactor(reynolds, diameterM, roughness);
    let pressureDropPa = friction * (lengthM / diameterM) * (constants.rho * velocityMS * velocityMS / 2);

    const storedPressure = this.numberOr(section.pressure_drop_pa, 0);
    if (useStoredPressure && storedPressure > 0) {
      pressureDropPa = storedPressure;
    }

    const pressureDropPaM = lengthM ? pressureDropPa / lengthM : 0;
    const headLossM = constants.rho ? pressureDropPa / (constants.rho * this.gravity) : 0;
    const pumpEfficiency = Math.max(constants.pump_efficiency, 0.0001);
    const pumpingPowerKw = (volumeFlowM3S * pressureDropPa) / (pumpEfficiency * 1000);
    const annualPumpEnergyKwh = pumpingPowerKw * constants.hours_per_year;
    const lifetimePumpCad = annualPumpEnergyKwh * constants.electricity_cost * constants.lifespan_years;
    const meanWaterTemperatureC = (constants.supply_temperature_c + constants.return_temperature_c) / 2;
    const heatLossKw = this.heatLossKw(lengthM, meanWaterTemperatureC);
    const annualHeatLossKwh = heatLossKw * constants.hours_per_year;
    const lifetimeHeatLossCad = annualHeatLossKwh * constants.electricity_cost * constants.lifespan_years;
    const capexCad = lengthM * this.pipeCost(pipe);

    return {
      sectionId: section.id,
      sectionName: section.edge_name || `Pipe section ${section.id}`,
      lengthM,
      peakLoadKw,
      massFlowKgS,
      pipe,
      velocityMS,
      pressureDropPa,
      pressureDropPaM,
      headLossM,
      pumpingPowerKw,
      annualPumpEnergyKwh,
      heatLossKw,
      annualHeatLossKwh,
      capexCad,
      lifetimePumpCad,
      lifetimeHeatLossCad,
      lifecycleCad: capexCad + lifetimePumpCad + lifetimeHeatLossCad,
      velocityStatus: velocityMS > constants.max_velocity ? 'high' : (velocityMS > 0 && velocityMS < constants.min_velocity ? 'low' : 'target'),
      pressureStatus: pressureDropPaM > constants.target_pressure_drop ? 'high' : 'target',
    };
  }

  private pipeForPressureTarget(section: PipeSectionRow, targetPaM: number): PipeCatalogPipe {
    const catalog = this.catalog();
    for (const pipe of catalog) {
      const option = this.evaluateSection(section, pipe, false);
      if (option.velocityMS <= this.constants.max_velocity && option.pressureDropPaM <= targetPaM) {
        return pipe;
      }
    }
    return catalog[catalog.length - 1];
  }

  private currentPipeForSection(section: PipeSectionRow): PipeCatalogPipe {
    const diameter = this.numberOr(section.diameter_m, 0);
    const catalog = this.catalog();
    if (!diameter) {
      return this.pipeForPressureTarget(section, this.constants.target_pressure_drop);
    }
    return catalog.reduce((best, pipe) => {
      return Math.abs(pipe.di - diameter) < Math.abs(best.di - diameter) ? pipe : best;
    }, catalog[0]);
  }

  private buildCharts(): void {
    const pressureRows = this.scenariosByPressureTarget();
    const rows = pressureRows;
    const pressureLabels = pressureRows.map((row) => this.pressureScenarioCeilingLabel(row));
    const economic = this.bestScenario;
    const chartLifecycleCad = (row: NetworkScenario) => row.capexCad + row.lifetimePumpCad;
    const costEconomic = this.minimumBy(pressureRows, chartLifecycleCad);
    const costEconomicLabel = costEconomic ? this.pressureScenarioCeilingLabel(costEconomic) : '';
    const pressureData = (selector: (row: NetworkScenario) => number) => {
      return pressureRows.map((row) => selector(row));
    };
    const rowFromAxis = (params: any[]): NetworkScenario | undefined => {
      const first = params?.[0];
      return pressureRows[first?.dataIndex || 0];
    };
    const makePressureXAxis = () => ({
      type: 'category',
      data: pressureLabels,
      name: 'Design pressure-drop target (Pa/m)',
      nameLocation: 'middle',
      nameGap: 54,
      axisLabel: {
        color: '#475569',
        fontWeight: 900,
        rotate: pressureLabels.length > 7 ? 18 : 0,
      },
      axisTick: { show: false },
    });
    const noDataGraphic = rows.length ? [] : [{
      type: 'text',
      left: 'center',
      top: 'middle',
      style: { text: 'No pipe sizing data available', fill: '#be123c', fontSize: 18, fontWeight: 900 },
    }];

    this.lifecycleTradeoffOption = {
      backgroundColor: '#ffffff',
      color: ['#475569', '#ea580c', '#be123c', '#2563eb'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 78, right: 86, top: 58, bottom: 86 },
      graphic: noDataGraphic,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          const row = rowFromAxis(params);
          if (!row) return '';
          return [
            `<strong>${this.formatNumber(row.targetPaM || 0, 0)} Pa/m target · ${this.pressurePolicyLabel(row)}</strong>`,
            `Average selected diameter: DN${this.formatNumber(row.averageDn, 0)}`,
            `Pipe CAPEX: ${this.formatCurrency(row.capexCad, false)}`,
            `Lifetime pumping: ${this.formatCurrency(row.lifetimePumpCad, false)}`,
            `Pipe + pump lifecycle: ${this.formatCurrency(chartLifecycleCad(row), false)}`,
            `Pump power: ${this.formatNumber(row.pumpingPowerKw, 2)} kW`,
            costEconomic && row === costEconomic
              ? 'Minimum pipe + pumping cost under current assumptions'
              : '',
          ].join('<br/>');
        },
      },
      xAxis: makePressureXAxis(),
      yAxis: [
        {
          type: 'value',
          name: 'Pipe + pump cost (CAD)',
          axisLabel: { formatter: (value: number) => this.formatCurrency(value), color: '#475569', fontWeight: 900 },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
        },
        {
          type: 'value',
          name: 'Pump power (kW)',
          axisLabel: { formatter: (value: number) => this.formatNumber(value, 0), color: '#475569', fontWeight: 900 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Pipe CAPEX',
          type: 'bar',
          stack: 'cost',
          barMaxWidth: 42,
          data: pressureData((row) => row.capexCad),
        },
        {
          name: 'Lifetime pumping',
          type: 'bar',
          stack: 'cost',
          barMaxWidth: 42,
          data: pressureData((row) => row.lifetimePumpCad),
        },
        {
          name: 'Pipe + pump lifecycle',
          type: 'line',
          smooth: false,
          symbolSize: 10,
          data: pressureData((row) => chartLifecycleCad(row)),
          lineStyle: { width: 4 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#0f172a', width: 2, type: 'dashed' },
            label: {
              formatter: () => `Minimum cost target\n${costEconomicLabel}`,
              color: '#0f172a',
              fontWeight: 950,
            },
            data: costEconomicLabel ? [{ xAxis: costEconomicLabel }] : [],
          },
          markPoint: {
            symbol: 'diamond',
            symbolSize: 24,
            itemStyle: {
              color: '#ffffff',
              borderColor: '#0f766e',
              borderWidth: 4,
              shadowBlur: 8,
              shadowColor: 'rgba(15, 118, 110, 0.25)',
            },
            label: {
              formatter: 'Minimum cost',
              position: 'top',
              distance: 10,
              color: '#0f172a',
              fontWeight: 950,
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderColor: '#cbd5e1',
              borderWidth: 1,
              borderRadius: 4,
              padding: [4, 7],
            },
            data: costEconomicLabel ? [{ coord: [costEconomicLabel, costEconomic ? chartLifecycleCad(costEconomic) : 0] }] : [],
          },
        },
        {
          name: 'Pump power',
          type: 'line',
          yAxisIndex: 1,
          smooth: false,
          symbolSize: 9,
          data: pressureData((row) => row.pumpingPowerKw),
          lineStyle: { width: 4, type: 'dotted' },
        },
      ],
    };

    this.diameterPumpOption = {
      backgroundColor: '#ffffff',
      color: ['#ea580c', '#2563eb'],
      legend: { top: 4, textStyle: { color: '#334155', fontWeight: 900 } },
      grid: { left: 72, right: 78, top: 58, bottom: 86 },
      graphic: noDataGraphic,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          const row = rowFromAxis(params);
          if (!row) return '';
          return [
            `<strong>${this.formatNumber(row.targetPaM || 0, 0)} Pa/m design target · ${this.pressurePolicyLabel(row)}</strong>`,
            `Average selected diameter: DN${this.formatNumber(row.averageDn, 0)}`,
            `Pump power: ${this.formatNumber(row.pumpingPowerKw, 2)} kW`,
            `Actual pressure drop per meter: ${this.formatNumber(row.averagePressurePaM, 1)} Pa/m`,
            `Max velocity: ${this.formatNumber(row.maxVelocityMS, 2)} m/s`,
            economic && row.pumpingPowerKw > economic.pumpingPowerKw
              ? 'Above the crossover pump threshold: larger pipe may be economical.'
              : 'Below/at the crossover pump threshold under current assumptions.',
          ].join('<br/>');
        },
      },
      xAxis: makePressureXAxis(),
      yAxis: [
        {
          type: 'value',
          name: 'Actual pressure drop per meter (Pa/m)',
          axisLabel: { color: '#475569', fontWeight: 900 },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
        },
        {
          type: 'value',
          name: 'Pump power (kW)',
          axisLabel: { color: '#475569', fontWeight: 900 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Actual average pressure drop',
          type: 'line',
          smooth: false,
          symbolSize: 9,
          data: pressureData((row) => row.averagePressurePaM),
          lineStyle: { width: 4 },
        },
        {
          name: 'Total pumping power',
          type: 'line',
          yAxisIndex: 1,
          smooth: false,
          symbolSize: 10,
          data: pressureData((row) => row.pumpingPowerKw),
          lineStyle: { width: 4 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#be123c', width: 2, type: 'dashed' },
            label: {
              formatter: () => `Pump threshold\n${this.formatNumber(economic?.pumpingPowerKw || 0, 1)} kW`,
              color: '#be123c',
              fontWeight: 950,
            },
            data: economic ? [{ yAxis: economic.pumpingPowerKw }] : [],
          },
        },
      ],
    };

    const distributionKeys = this.distributionKeys(pressureRows);
    const selectedNetworkScenario = this.selectedNetworkDiameterScenario();
    const networkSegments = (selectedNetworkScenario?.segments || [])
      .slice()
      .sort((a, b) => b.lengthM - a.lengthM);
    const networkKeys = this.segmentDiameterKeys(networkSegments);
    const diameterKeys = Array.from(new Set([...distributionKeys, ...networkKeys]))
      .sort((a, b) => Number(a.replace('DN', '')) - Number(b.replace('DN', '')));
    const diameterColorByKey = this.diameterColorMap(diameterKeys);
    const distributionColors = distributionKeys.map((key) => diameterColorByKey[key]);
    this.dnDistributionOption = {
      backgroundColor: '#ffffff',
      color: distributionColors,
      legend: {
        top: 4,
        left: 12,
        right: 12,
        itemGap: 10,
        textStyle: { color: '#334155', fontWeight: 900 },
      },
      grid: { left: 72, right: 36, top: 104, bottom: 76 },
      graphic: noDataGraphic,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: number) => `${this.formatNumber(value, 2)} km`,
      },
      xAxis: {
        type: 'category',
        data: pressureRows.map((row) => this.pressureScenarioCeilingLabel(row)),
        axisLabel: { color: '#475569', fontWeight: 900, rotate: pressureRows.length > 7 ? 24 : 0 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Pipe length (km)',
        axisLabel: { color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: distributionKeys.map((key) => ({
        name: key,
        type: 'bar',
        stack: 'dn',
        barMaxWidth: 42,
        itemStyle: {
          color: distributionColors[distributionKeys.indexOf(key)],
          borderColor: '#ffffff',
          borderWidth: 1,
        },
        data: pressureRows.map((row) => row.dnDistributionKm[key] || 0),
      })),
    };

    const networkLines = this.networkDiameterLines(networkSegments);
    const networkExtents = this.networkLineExtents(networkLines);
    const designMaxPressurePaM = this.selectedNetworkDesignPressure(selectedNetworkScenario);
    const pressureLabelPoints = this.networkPressureLabelPoints(networkLines);
    const pressureGraphic = networkLines.length ? [{
      type: 'text',
      left: 12,
      top: 34,
      style: {
        text: this.selectedNetworkDiameterLabel(selectedNetworkScenario),
        fill: '#0f172a',
        fontSize: 13,
        fontWeight: 900,
        lineHeight: 18,
        backgroundColor: 'rgba(248, 250, 252, 0.96)',
        borderColor: '#cbd5e1',
        borderWidth: 1,
        borderRadius: 6,
        padding: [8, 10],
      },
    }] : noDataGraphic;
    this.networkDiameterOption = {
      backgroundColor: '#ffffff',
      color: networkKeys.map((key) => diameterColorByKey[key]),
      legend: {
        data: networkKeys,
        top: 4,
        left: 12,
        right: 12,
        type: 'scroll',
        itemGap: 10,
        textStyle: { color: '#334155', fontWeight: 900 },
      },
      grid: { left: 20, right: 20, top: 110, bottom: 20 },
      graphic: pressureGraphic,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params?.data || {};
          const pressureDropPaM = this.numberOr(data.pressureDropPaM, 0);
          const pressureDropPa = this.numberOr(data.pressureDropPa, 0);
          const isOverDesign = pressureDropPaM > designMaxPressurePaM;
          return [
            `<strong>${data.sectionName || params.seriesName}</strong>`,
            `Diameter: ${data.diameterKey || params.seriesName}`,
            `Length: ${this.formatNumber((data.lengthM || 0) / 1000, 2)} km`,
            `Velocity: ${this.formatNumber(data.velocityMS || 0, 2)} m/s`,
            `Pressure drop: ${this.formatNumber(pressureDropPaM, 1)} Pa/m`,
            `Total pressure drop: ${this.formatNumber(pressureDropPa / 1000, 2)} kPa`,
            `Design max: ${this.formatNumber(designMaxPressurePaM, 0)} Pa/m`,
            `Status: ${isOverDesign ? 'Above design max' : 'Within design max'}`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        scale: true,
        min: networkExtents.minX,
        max: networkExtents.maxX,
        show: false,
      },
      yAxis: {
        type: 'value',
        scale: true,
        min: networkExtents.minY,
        max: networkExtents.maxY,
        show: false,
      },
      series: [
        ...networkKeys.map((key) => ({
          name: key,
          type: 'lines',
          coordinateSystem: 'cartesian2d',
          polyline: true,
          data: networkLines.filter((line) => line.diameterKey === key),
          lineStyle: {
            color: diameterColorByKey[key],
            width: 4,
            opacity: 0.92,
          },
          emphasis: {
            lineStyle: {
              width: 7,
              opacity: 1,
            },
          },
          progressive: 400,
        })),
        {
          name: 'Section pressure drop',
          type: 'scatter',
          coordinateSystem: 'cartesian2d',
          data: pressureLabelPoints,
          symbolSize: 1,
          itemStyle: { opacity: 0 },
          silent: true,
          z: 12,
          label: {
            show: true,
            position: 'top',
            distance: 5,
            formatter: (params: any) => {
              const pressureDropPaM = this.numberOr(params?.data?.pressureDropPaM, 0);
              const token = pressureDropPaM > designMaxPressurePaM ? 'over' : 'ok';
              return `{${token}|dP ${this.formatNumber(pressureDropPaM, 0)} Pa/m}`;
            },
            rich: {
              ok: {
                color: '#0f172a',
                fontSize: 12,
                fontWeight: 900,
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                borderColor: '#cbd5e1',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 5],
              },
              over: {
                color: '#991b1b',
                fontSize: 12,
                fontWeight: 900,
                backgroundColor: 'rgba(254, 226, 226, 0.94)',
                borderColor: '#dc2626',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 5],
              },
            },
          },
          labelLayout: {
            hideOverlap: false,
            moveOverlap: 'shiftY',
          },
        },
      ],
    };

    const insightData = this.segmentInsights
      .slice(0, 40)
      .map((row) => [
        row.extraPipeCapexCad,
        row.lifetimePumpSavingCad,
        Math.max(Math.abs(row.netLifecycleSavingCad), 1),
        row.sectionName,
        row.currentDn,
        row.economicDn,
        row.netLifecycleSavingCad,
        row.currentPressurePaM,
        row.economicPressurePaM,
      ]);
    const maxTrade = Math.max(
      ...insightData.map((row) => Math.max(Number(row[0] || 0), Number(row[1] || 0))),
      1,
    );

    this.segmentEconomicsOption = {
      backgroundColor: '#ffffff',
      color: ['#2563eb'],
      grid: { left: 86, right: 40, top: 34, bottom: 74 },
      graphic: insightData.length ? [] : noDataGraphic,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value || [];
          return [
            `<strong>${value[3]}</strong>`,
            `Saved run: DN${value[4]} at ${this.formatNumber(value[7], 0)} Pa/m`,
            `Compared option: DN${value[5]} at ${this.formatNumber(value[8], 0)} Pa/m`,
            `Extra pipe CAPEX: ${this.formatCurrency(value[0], false)}`,
            `Lifetime pump saving: ${this.formatCurrency(value[1], false)}`,
            `Net saving: ${this.formatCurrency(value[6], false)}`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        name: 'Extra pipe CAPEX (CAD)',
        nameLocation: 'middle',
        nameGap: 48,
        axisLabel: { formatter: (value: number) => this.formatCurrency(value), color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Lifetime pump saving (CAD)',
        nameLocation: 'middle',
        nameGap: 64,
        axisLabel: { formatter: (value: number) => this.formatCurrency(value), color: '#475569', fontWeight: 900 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Pipe section',
          type: 'scatter',
          data: insightData,
          symbolSize: (value: any[]) => 12 + Math.min(Math.sqrt(Number(value?.[2] || 1)) / 60, 24),
          itemStyle: {
            color: (params: any) => Number(params.value?.[6] || 0) > 0 ? '#047857' : '#dc2626',
            borderColor: '#0f172a',
            borderWidth: 1,
            opacity: 0.88,
          },
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: '#64748b', type: 'dashed', width: 2 },
            label: { formatter: 'break-even', color: '#334155', fontWeight: 900 },
            data: [[{ coord: [0, 0] }, { coord: [maxTrade, maxTrade] }]],
          },
        },
      ],
    };
  }

  private segmentDiameterKey(segment: SegmentAlternative): string {
    return `DN${segment.pipe.dn}`;
  }

  private segmentDiameterKeys(segments: SegmentAlternative[]): string[] {
    return Array.from(new Set(segments.map((segment) => this.segmentDiameterKey(segment))))
      .sort((a, b) => Number(a.replace('DN', '')) - Number(b.replace('DN', '')));
  }

  private diameterColorMap(keys: string[]): Record<string, string> {
    return keys.reduce((map, key, index) => {
      map[key] = this.diameterColor(index, keys.length);
      return map;
    }, {} as Record<string, string>);
  }

  private truncateLabel(label: string, maxLength: number): string {
    if (!label || label.length <= maxLength) return label || '';
    return `${label.slice(0, Math.max(0, maxLength - 1))}...`;
  }

  private networkDiameterLines(segments: SegmentAlternative[]): any[] {
    const sectionById = new Map(this.sections.map((section) => [section.id, section]));
    const candidates = segments
      .map((segment) => {
        const section = sectionById.get(segment.sectionId);
        const points = section ? this.sectionPath(section) : [];
        return { segment, points };
      })
      .filter((item) => item.points.length > 1);

    const allPoints = candidates.reduce((points, item) => {
      points.push(...item.points);
      return points;
    }, [] as Array<{ lat: number; lng: number }>);
    if (!allPoints.length) return [];

    const centerLat = this.sum(allPoints, (point) => point.lat) / allPoints.length;
    const centerLng = this.sum(allPoints, (point) => point.lng) / allPoints.length;
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.max(Math.cos(centerLat * Math.PI / 180), 0.1);

    return candidates.map(({ segment, points }) => ({
      coords: points.map((point) => [
        (point.lng - centerLng) * metersPerDegreeLng,
        (point.lat - centerLat) * metersPerDegreeLat,
      ]),
      diameterKey: this.segmentDiameterKey(segment),
      sectionName: segment.sectionName,
      lengthM: segment.lengthM,
      velocityMS: segment.velocityMS,
      pressureDropPaM: segment.pressureDropPaM,
      pressureDropPa: segment.pressureDropPa,
    }));
  }

  private networkPressureLabelPoints(lines: any[]): any[] {
    return lines
      .map((line) => {
        const value = this.lineMidpoint(line.coords || []);
        if (!value) return null;
        return {
          ...line,
          value,
        };
      })
      .filter(Boolean);
  }

  private lineMidpoint(coords: any[]): [number, number] | null {
    const points = coords
      .map((coord) => [Number(coord?.[0]), Number(coord?.[1])] as [number, number])
      .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
    if (!points.length) return null;
    if (points.length === 1) return points[0];

    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let index = 1; index < points.length; index += 1) {
      const length = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
      segmentLengths.push(length);
      totalLength += length;
    }
    if (!totalLength) return points[Math.floor(points.length / 2)];

    let traversed = 0;
    const halfway = totalLength / 2;
    for (let index = 1; index < points.length; index += 1) {
      const length = segmentLengths[index - 1];
      if (traversed + length >= halfway) {
        const ratio = length ? (halfway - traversed) / length : 0;
        return [
          points[index - 1][0] + (points[index][0] - points[index - 1][0]) * ratio,
          points[index - 1][1] + (points[index][1] - points[index - 1][1]) * ratio,
        ];
      }
      traversed += length;
    }
    return points[points.length - 1];
  }

  private networkLineExtents(lines: any[]): { minX: number; maxX: number; minY: number; maxY: number } {
    const coords = lines.reduce((items, line) => {
      if (Array.isArray(line.coords)) {
        items.push(...line.coords);
      }
      return items;
    }, [] as any[]);
    if (!coords.length) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }

    const xs = coords.map((coord) => Number(coord[0])).filter((value) => Number.isFinite(value));
    const ys = coords.map((coord) => Number(coord[1])).filter((value) => Number.isFinite(value));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = Math.max(maxX - minX, maxY - minY, 50) * 0.08;
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
    };
  }

  private sectionPath(section: PipeSectionRow): Array<{ lat: number; lng: number }> {
    const explicitPath = this.normalizePath(section.segment_path);
    if (explicitPath.length > 1) return explicitPath;

    const routePath = this.decodePolyline(section.route?.polyline);
    if (routePath.length > 1) return routePath;

    return this.edgeEndpointPath(section.edge);
  }

  private normalizePath(path: any): Array<{ lat: number; lng: number }> {
    if (!Array.isArray(path)) return [];
    return path
      .map((point) => this.normalizePoint(point))
      .filter((point): point is { lat: number; lng: number } => !!point);
  }

  private normalizePoint(point: any): { lat: number; lng: number } | null {
    const lat = this.numberOr(point?.lat ?? point?.latitude, NaN);
    const lng = this.numberOr(point?.lng ?? point?.longitude, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  private edgeEndpointPath(edge: any): Array<{ lat: number; lng: number }> {
    const start = this.normalizePoint(edge?.start_node);
    const end = this.normalizePoint(edge?.end_node);
    return start && end ? [start, end] : [];
  }

  private decodePolyline(encoded: string | null | undefined): Array<{ lat: number; lng: number }> {
    if (!encoded) return [];
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    try {
      while (index < encoded.length) {
        const latResult = this.decodePolylineValue(encoded, index);
        lat += latResult.value;
        index = latResult.index;
        const lngResult = this.decodePolylineValue(encoded, index);
        lng += lngResult.value;
        index = lngResult.index;
        points.push({ lat: lat / 1e5, lng: lng / 1e5 });
      }
    } catch {
      return [];
    }

    return points;
  }

  private decodePolylineValue(encoded: string, index: number): { value: number; index: number } {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      if (index >= encoded.length) throw new Error('Invalid polyline');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return {
      value: result & 1 ? ~(result >> 1) : result >> 1,
      index,
    };
  }

  private listFromResponse<T>(response: any): T[] {
    if (Array.isArray(response)) return response as T[];
    if (Array.isArray(response?.results)) return response.results as T[];
    return [];
  }

  private normalizeConstants(response: any): DesignConstants {
    const saved = this.listFromResponse<any>(response)[0] || {};
    const defaults = this.defaultConstants();
    const merged = { ...defaults, ...saved };
    merged.pipe_catalog = this.normalizeCatalog(saved.pipe_catalog || defaults.pipe_catalog);
    return merged;
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

  private targetPressureSteps(): number[] {
    const base = [40, 60, 80, 100, 120, 150, 200, 300, 450];
    const target = this.numberOr(this.constants.target_pressure_drop, 100);
    return Array.from(new Set([...base, target].filter((value) => value > 0)))
      .sort((a, b) => a - b);
  }

  private scenariosByPressureTarget(): NetworkScenario[] {
    return this.targetScenarios.slice().sort((a, b) => {
      const targetA = this.numberOr(a.targetPaM, 0);
      const targetB = this.numberOr(b.targetPaM, 0);
      if (targetA !== targetB) return targetA - targetB;
      return a.averageDn - b.averageDn;
    });
  }

  private pressurePolicyLabel(row: NetworkScenario): string {
    if (!row.targetPaM) return 'saved run';
    const target = this.numberOr(row.targetPaM, 0);
    const standard = this.numberOr(this.constants.target_pressure_drop, 100);
    if (target <= standard * 0.6) return 'very low loss';
    if (target < standard) return 'low loss';
    if (Math.abs(target - standard) < 0.1) return 'standard';
    if (target <= standard * 2) return 'compact';
    return 'very compact';
  }

  private sectionLength(section: PipeSectionRow): number {
    return Math.max(this.numberOr(section.length_m, 0), 0);
  }

  private peakLoadKw(section: PipeSectionRow): number {
    return Math.max(this.numberOr(section.peak_load_kw, 0), 0) * this.loadMultiplier;
  }

  private deltaT(section: PipeSectionRow): number {
    const stored = this.numberOr(section.delta_t, 0);
    const configured = this.constants.supply_temperature_c - this.constants.return_temperature_c;
    return Math.max(stored || configured || 30, 1);
  }

  private massFlow(section: PipeSectionRow, peakLoadKw: number, deltaT: number): number {
    const stored = this.numberOr(section.mass_flow_kg_s, 0);
    if (stored > 0) return stored * this.loadMultiplier;
    return this.constants.cp && deltaT ? peakLoadKw / (this.constants.cp * deltaT) : 0;
  }

  private pipeCost(pipe: PipeCatalogPipe): number {
    return this.numberOr(pipe.cost, this.constants.fallback_pipe_cost_per_meter || 150);
  }

  private heatLossKw(lengthM: number, meanWaterTemperatureC: number): number {
    const coefficient = Math.max(this.numberOr(this.constants.thermal_loss_coefficient_w_m_k, 0), 0);
    const ambientTemperatureC = this.numberOr(this.constants.ambient_temperature_c, 10);
    const temperatureLift = Math.max(meanWaterTemperatureC - ambientTemperatureC, 0);
    return coefficient * Math.max(lengthM, 0) * temperatureLift / 1000;
  }

  private frictionFactor(reynolds: number, diameterM: number, roughnessM: number): number {
    if (!Number.isFinite(reynolds) || reynolds <= 0 || diameterM <= 0) return 0;
    if (reynolds < 2000) return 64 / reynolds;
    if (reynolds < 4000) return 0.04;
    const term = (roughnessM / (3.7 * diameterM)) + (5.74 / Math.pow(reynolds, 0.9));
    return 0.25 / Math.pow(Math.log10(term), 2);
  }

  private distributionKeys(rows: NetworkScenario[]): string[] {
    const keys = new Set<string>();
    rows.forEach((row) => Object.keys(row.dnDistributionKm).forEach((key) => keys.add(key)));
    return Array.from(keys).sort((a, b) => Number(a.replace('DN', '')) - Number(b.replace('DN', '')));
  }

  private diameterColor(index: number, total: number): string {
    const palette = [
      '#2563eb', '#dc2626', '#16a34a', '#f97316', '#7c3aed',
      '#0891b2', '#be123c', '#84cc16', '#ca8a04', '#4f46e5',
      '#0f766e', '#a21caf', '#92400e', '#64748b', '#22c55e',
      '#e11d48', '#0369a1', '#b45309', '#4338ca', '#15803d',
    ];
    if (index < palette.length) {
      return palette[index];
    }
    const hue = Math.round((index * 137.508) % 360);
    const lightness = total > 20 && index % 2 ? 42 : 52;
    return `hsl(${hue}, 74%, ${lightness}%)`;
  }

  private minimumBy<T>(rows: T[], selector: (row: T) => number): T | null {
    if (!rows.length) return null;
    return rows.reduce((best, row) => selector(row) < selector(best) ? row : best, rows[0]);
  }

  private sum<T>(rows: T[], selector: (row: T) => number): number {
    return rows.reduce((total, row) => total + this.numberOr(selector(row), 0), 0);
  }

  private numberOr(value: any, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
}
