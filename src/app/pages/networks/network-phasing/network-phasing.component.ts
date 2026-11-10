import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GoogleMap } from '@angular/google-maps';
import { NbToastrService } from '@nebular/theme';
import { forkJoin, Subscription, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BackgroundOperation, BackgroundOperationService } from '../../../@core/utils/background-operation.service';

interface ChartExportSize {
  width: number;
  height: number;
  pixelRatio: number;
}

interface PhaseControl {
  year: number;
  available_heat_kw: number | null;
  capex_budget_cad: number | null;
  max_new_connections: number | null;
}

type PhasingSolverMode = 'greedy' | 'milp' | 'full_chronology_milp';

@Component({
  selector: 'ngx-network-phasing',
  templateUrl: './network-phasing.component.html',
  styleUrls: ['./network-phasing.component.scss'],
})
export class NetworkPhasingComponent implements OnInit, OnDestroy {
  @ViewChild('candidateMap') candidateMap?: GoogleMap;
  @ViewChild('phaseMap') phaseMap?: GoogleMap;

  networks: any[] = [];
  studies: any[] = [];
  buildings: any[] = [];
  clusters: any[] = [];
  allClusters: any[] = [];
  complementaryConfigurations: any[] = [];
  selectedNetworkId: number | null = null;
  selectedStudyId: number | null = null;

  studyName = '';
  solverMode: PhasingSolverMode = 'greedy';
  scenarioDecisionMode: 'expected_value' | 'scenario_specific' = 'expected_value';
  yearsInput = '2028, 2030, 2035';
  phaseControls: PhaseControl[] = [
    { year: 2028, available_heat_kw: null, capex_budget_cad: null, max_new_connections: null },
    { year: 2030, available_heat_kw: null, capex_budget_cad: null, max_new_connections: null },
    { year: 2035, available_heat_kw: null, capex_budget_cad: null, max_new_connections: null },
  ];
  maxDistanceM = 250;
  minLinearHeatDensity = 0.05;
  availableHeatKw: number | null = null;
  assumeUnlimitedAvailableHeat = false;
  demandYear: number | null = null;
  annualFullLoadHours: number | null = null;
  pipeCostPerM: number | null = null;
  heatPriceCadPerMwh = 90;
  gasPriceCadPerMwh: number | null = null;
  gasRates: any[] = [];
  gasPriceBasis: any = null;
  projectLifespanYears = 30;
  electricityCostCadPerKwh = 0.15;
  gridEmissionFactorKgPerKwh = 0.04;
  gasEmissionFactorKgPerKwh = 0.185;
  baseBoilerEfficiency = 0.9;
  carbonPriceCadPerTonne: number | null = null;
  carbonTaxRates: any[] = [];
  carbonTaxBasis: any = null;
  designDeltaTC = 30;
  targetPressureDropPaPerM = 100;
  pumpEfficiency = 0.75;
  minVelocityMS = 0.5;
  maxVelocityMS = 2.5;
  includeClusters = false;
  createNetworks = true;
  tagFilter = '';
  candidateMode: 'auto' | 'selected' = 'auto';
  candidateSourceMode: 'buildings_and_clusters' | 'clusters_only' | 'buildings_only' = 'buildings_and_clusters';
  selectedBuildingIds: number[] = [];
  selectedClusterIds: number[] = [];
  selectedComplementaryConfigId: number | null = null;
  preparePipeline = true;
  reuseSizedNetwork = true;
  edgeGenerationMethod = 'delaunay';
  edgeConnectionMethod = 'mst';
  routeTracingMode = 'driving';
  pipeSizingMethod = 'velocity_limited';
  pipeSizingYear = 2024;
  ensureComplementaryClusters = false;
  complementaryClusterRadiusKm = 0.1;

  edgeGenerationMethods = [
    { value: 'delaunay', label: 'Delaunay' },
    { value: 'knn', label: 'KNN' },
    { value: 'mutual_knn', label: 'Mutual KNN' },
    { value: 'gabriel', label: 'Gabriel graph' },
    { value: 'beta_skeleton', label: 'Beta skeleton' },
    { value: 'rng', label: 'Relative neighborhood' },
    { value: 'distance_threshold', label: 'Distance threshold' },
    { value: 'complete', label: 'Complete graph (benchmark)' },
  ];
  edgeConnectionMethods = [
    { value: 'mst', label: 'Minimum spanning tree' },
    { value: 'shortest_path_tree', label: 'Source-rooted shortest path tree' },
    { value: 'steiner_tree', label: 'Approximate Steiner tree' },
    { value: 'redundant_mst', label: 'Reliability-augmented MST' },
  ];
  routeTracingModes = [
    { value: 'driving', label: 'Road shortest path' },
    { value: 'walking', label: 'Pedestrian corridor' },
    { value: 'bicycling', label: 'Cycling corridor' },
    { value: 'direct', label: 'Direct baseline' },
  ];
  pipeSizingMethods = [
    { value: 'velocity_limited', label: 'Velocity limited' },
    { value: 'pressure_gradient', label: 'Velocity + pressure gradient' },
    { value: 'lifecycle_cost', label: 'Lifecycle economic' },
  ];
  candidateSourceModes = [
    { value: 'buildings_and_clusters', label: 'Buildings and clusters' },
    { value: 'clusters_only', label: 'Clusters only' },
    { value: 'buildings_only', label: 'Buildings only' },
  ];
  solverModes = [
    { value: 'greedy', label: 'Greedy baseline' },
    { value: 'milp', label: 'MILP optimizer' },
    { value: 'full_chronology_milp', label: 'Full chronology MILP' },
  ];
  scenarioDecisionModes = [
    // Expected-value mode displays one robust/shared build plan. Scenario-
    // specific mode lets Low / Reference / High demand produce different maps,
    // timelines, output networks, and chart values.
    { value: 'expected_value', label: 'Expected-value shared plan' },
    { value: 'scenario_specific', label: 'Scenario-specific plans' },
  ];

  scenarios = [
    { name: 'Low demand', probability: 0.25, discount_rate: 0.045, demand_multiplier: 0.85, fuel_price_multiplier: 0.85 },
    { name: 'Reference demand', probability: 0.50, discount_rate: 0.045, demand_multiplier: 1.00, fuel_price_multiplier: 1.00 },
    { name: 'High demand', probability: 0.25, discount_rate: 0.045, demand_multiplier: 1.20, fuel_price_multiplier: 1.25 },
  ];

  preview: any = null;
  report: any = null;
  isLoading = false;
  isLoadingCandidates = false;
  isPreviewing = false;
  isRunning = false;
  errorMessage = '';
  activeOperations: BackgroundOperation[] = [];
  taskStatus = '';
  taskMessage = '';
  private taskPolling?: Subscription;

  capexOption: any = {};
  heatOption: any = {};
  candidateScreeningOption: any = {};
  scenarioHeatOption: any = {};
  scenarioValueOption: any = {};
  scenarioMatrixOption: any = {};
  selectionFunnelOption: any = {};
  phaseGateMatrixOption: any = {};
  phaseDriverBalanceOption: any = {};
  clusterScaleOption: any = {};
  candidateEconomicsOption: any = {};
  candidateHydraulicsOption: any = {};
  phaseComparisonOption: any = {};
  phaseEfficiencyOption: any = {};
  phaseConstraintOption: any = {};
  heatHeadroomOption: any = {};
  phaseValueOption: any = {};
  candidateQueueOption: any = {};
  chronologyMatrixOption: any = {};
  phaseCompositionOption: any = {};
  buildingsAddedOption: any = {};
  phaseSelectionFrontierOption: any = {};
  chartRefs: Record<string, any> = {};
  expandedChartKey = '';
  expandedChartTitle = '';
  expandedChartOption: any = {};
  selectedScenarioName = '';
  selectedPhaseYear: number | null = null;
  phasePathMode: 'new' | 'cumulative' = 'new';
  comparisonStudyIds: number[] = [];
  selectedComparisonPhaseKeys: string[] = [];
  comparisonReports: Record<string, any> = {};
  isLoadingComparison = false;
  comparisonError = '';

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  mapOptions: google.maps.MapOptions = {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  };

  private readonly phaseColors = ['#0f766e', '#2563eb', '#7c3aed', '#f97316', '#0891b2', '#65a30d', '#b45309', '#0d9488'];

  constructor(
    private http: HttpClient,
    private toastr: NbToastrService,
    private operations: BackgroundOperationService,
  ) {}

  ngOnInit(): void {
    this.syncPhaseControlsFromYears();
    this.loadNetworks();
    this.loadStudies();
    this.loadGasRates();
    this.loadCarbonTaxRates();
    this.restoreActiveOperations();
  }

  ngOnDestroy(): void {
    this.stopTaskPolling();
  }

  onChartInit(key: string, chart: any): void {
    this.chartRefs[key] = chart;
  }

  expandChart(key: string, title: string): void {
    this.expandedChartKey = key;
    this.expandedChartTitle = title;
    this.expandedChartOption = this.chartOptionFor(key);
    setTimeout(() => {
      this.chartRefs[`expanded-${key}`]?.resize?.();
    }, 80);
  }

  closeExpandedChart(): void {
    this.expandedChartKey = '';
    this.expandedChartTitle = '';
    this.expandedChartOption = {};
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
      this.toastr.success('High-resolution chart copied as a PNG.', 'Copied');
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
      'Chart Ready',
    );
  }

  private async chartDataUrl(key: string): Promise<string> {
    const chart = this.chartRefs[key];
    if (!chart?.getDataURL) {
      this.toastr.warning('The chart is still loading. Try again in a moment.', 'Chart not ready');
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
    if (
      key === 'candidate-screening' ||
      key === 'candidate-economics' ||
      key === 'candidate-hydraulics' ||
      key === 'phase-gate-matrix' ||
      key === 'phase-driver-balance' ||
      key === 'cluster-scale' ||
      key === 'heat-headroom' ||
      key === 'phase-value' ||
      key === 'candidate-queue' ||
      key === 'chronology-matrix' ||
      key === 'phase-composition' ||
      key === 'buildings-added' ||
      key === 'phase-selection-frontier'
    ) {
      return { width: 2200, height: 1400, pixelRatio: 2 };
    }
    if (key === 'selection-funnel') {
      return { width: 1900, height: 1100, pixelRatio: 2 };
    }
    if (key === 'phase-comparison' || key === 'phase-efficiency') {
      return { width: 2400, height: 1350, pixelRatio: 2 };
    }
    if (key === 'phase-constraints') {
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

  private chartOptionFor(key: string): any {
    const options: Record<string, any> = {
      'candidate-screening': this.candidateScreeningOption,
      'candidate-economics': this.candidateEconomicsOption,
      'candidate-hydraulics': this.candidateHydraulicsOption,
      'selection-funnel': this.selectionFunnelOption,
      'phase-gate-matrix': this.phaseGateMatrixOption,
      'phase-driver-balance': this.phaseDriverBalanceOption,
      'cluster-scale': this.clusterScaleOption,
      'scenario-demand': this.scenarioHeatOption,
      'scenario-value': this.scenarioValueOption,
      'capex-phase': this.capexOption,
      'connections-heat': this.heatOption,
      'phase-comparison': this.phaseComparisonOption,
      'phase-efficiency': this.phaseEfficiencyOption,
      'phase-constraints': this.phaseConstraintOption,
      'heat-headroom': this.heatHeadroomOption,
      'phase-value': this.phaseValueOption,
      'candidate-queue': this.candidateQueueOption,
      'chronology-matrix': this.chronologyMatrixOption,
      'phase-composition': this.phaseCompositionOption,
      'buildings-added': this.buildingsAddedOption,
      'phase-selection-frontier': this.phaseSelectionFrontierOption,
    };
    return options[key] || {};
  }

  get currentData(): any {
    return this.report || this.preview;
  }

  get candidateRows(): any[] {
    return this.currentData?.candidates || [];
  }

  get timelineRows(): any[] {
    return this.timelineForScenario(this.currentData);
  }

  get selectedConnectionCount(): number {
    return this.timelineRows.reduce((total, row) => total + Number(row.new_connections || 0), 0);
  }

  get mapRoutes(): any[] {
    return this.currentData?.map?.routes || [];
  }

  get mapCandidatePaths(): any[] {
    return this.currentData?.map?.candidate_paths || [];
  }

  get resultRows(): any[] {
    return this.currentData?.results || [];
  }

  get scenarioRows(): any[] {
    return this.currentData?.scenarios || this.scenarios || [];
  }

  get scenarioNames(): string[] {
    return this.scenarioRows.map((scenario: any) => scenario.name).filter(Boolean);
  }

  get planningYears(): number[] {
    const timelineYears = this.timelineRows.map(row => Number(row.year)).filter(year => Number.isFinite(year));
    if (timelineYears.length) return timelineYears;
    return (this.currentData?.periods || []).map((period: any) => Number(period.year)).filter((year: number) => Number.isFinite(year));
  }

  get candidateMapNodes(): any[] {
    return this.candidateRows
      .map(candidate => ({
        ...candidate,
        position: this.candidatePosition(candidate),
        markerOptions: this.initialCandidateMarkerOptions(candidate),
      }))
      .filter(candidate => candidate.position);
  }

  get initialCandidateCount(): number {
    return this.candidateRows.length;
  }

  get eligibleCandidateCount(): number {
    return this.candidateRows.filter(candidate => candidate.status !== 'rejected').length;
  }

  get visibleCandidatePaths(): any[] {
    const paths = this.mapCandidatePaths.length ? this.mapCandidatePaths : this.candidateRows;
    return paths.filter(path => this.hasPath(path?.service_path));
  }

  get phaseConnectionRows(): any[] {
    // These are the routed service paths drawn on the Scenario-Year Build-Out
    // Map. In scenario-specific mode, changing selectedScenarioName changes
    // which result rows are visible here.
    const scenario = this.selectedScenarioName || this.scenarioNames[0];
    const year = this.selectedPhaseYear || this.planningYears[0];
    const builtYearByCandidate = this.phaseBuiltYearLookup(scenario);
    return this.resultRows.filter(row => {
      const matchesScenario = !scenario || row.scenario === scenario;
      const matchesYear = !year || Number(row.year) === Number(year);
      const isVisible = this.phasePathMode === 'cumulative' ? row.node_connected : row.node_newly_connected;
      return matchesScenario && matchesYear && isVisible && this.hasPath(row.service_path);
    }).map(row => this.withPhaseDisplay(row, builtYearByCandidate));
  }

  get phaseDecisionRows(): any[] {
    // Decision rows include both connected and not-connected candidates for the
    // active scenario/year. Marker colors and counts are derived from this set.
    const scenario = this.selectedScenarioName || this.scenarioNames[0];
    const year = this.selectedPhaseYear || this.planningYears[0];
    const builtYearByCandidate = this.phaseBuiltYearLookup(scenario);
    return this.resultRows.filter(row => {
      const matchesScenario = !scenario || row.scenario === scenario;
      const matchesYear = !year || Number(row.year) === Number(year);
      return matchesScenario && matchesYear;
    }).map(row => this.withPhaseDisplay(row, builtYearByCandidate));
  }

  get phaseSelectedCount(): number {
    return this.phaseDecisionRows.filter(row => row.node_connected || row.node_newly_connected).length;
  }

  get phaseRejectedCount(): number {
    return this.phaseDecisionRows.filter(row => !row.node_connected).length;
  }

  get phaseMapNodes(): any[] {
    return this.phaseDecisionRows
      .map(row => ({
        ...row,
        key: `phase:${row.id || row.result_id || row.candidate_key || row.candidate_id}:${row.year}:${row.scenario}`,
        position: this.candidatePosition(row),
        markerOptions: this.phaseDecisionMarkerOptions(row),
      }))
      .filter(row => row.position);
  }

  get phaseLegendRows(): any[] {
    return this.timelineRows.map((phase, index) => ({
      year: Number(phase.year),
      label: phase.label || phase.year,
      color: this.phaseColor(index),
      newConnections: Number(phase.new_connections || 0),
      active: Number(phase.year) === Number(this.selectedPhaseYear),
    }));
  }

  get comparisonPhaseOptions(): any[] {
    return Object.keys(this.comparisonReports)
      .map(key => this.comparisonReports[key])
      .filter(Boolean)
      .reduce((rows: any[], report: any) => {
        const phases = report?.timeline || [];
        return [
          ...rows,
          ...phases.map((phase: any, index: number) => this.comparisonPhaseRow(report, phase, index)),
        ];
      }, []);
  }

  get selectedComparisonRows(): any[] {
    const selected = new Set((this.selectedComparisonPhaseKeys || []).map(key => String(key)));
    return this.comparisonPhaseOptions.filter(row => selected.has(String(row.key)));
  }

  get comparisonAddedHeatKw(): number {
    return this.selectedComparisonRows.reduce((total, row) => total + Number(row.added_heat_kw || 0), 0);
  }

  get comparisonPhaseCapexCad(): number {
    return this.selectedComparisonRows.reduce((total, row) => total + Number(row.phase_capex_cad || 0), 0);
  }

  get comparisonServiceLengthM(): number {
    return this.selectedComparisonRows.reduce((total, row) => total + Number(row.service_length_m || 0), 0);
  }

  get selectedNetwork(): any {
    return this.networks.find(network => Number(network.id) === Number(this.selectedNetworkId));
  }

  get selectedAssetCount(): number {
    return (this.usesBuildingCandidates ? (this.selectedBuildingIds?.length || 0) : 0) +
      (this.usesClusterCandidates ? (this.selectedClusterIds?.length || 0) : 0);
  }

  get usesBuildingCandidates(): boolean {
    return this.candidateSourceMode !== 'clusters_only';
  }

  get usesClusterCandidates(): boolean {
    return this.candidateSourceMode !== 'buildings_only';
  }

  get availableHeatSummary(): string {
    const parameters = this.currentData?.parameters || {};
    if (parameters.available_heat_is_unlimited || parameters.assume_unlimited_available_heat) {
      return 'Unlimited';
    }
    const value = Number(parameters.available_heat_kw || 0);
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} kW`;
  }

  get currentSolverLabel(): string {
    const raw = this.currentData?.parameters?.solver_mode || this.currentData?.solver || this.solverMode;
    const value = String(raw || 'greedy').toLowerCase();
    if (value.includes('full_chronology') || value.includes('chronology')) return 'Full chronology MILP';
    if (value.includes('milp')) return 'MILP optimizer';
    return 'Greedy baseline';
  }

  get candidateAssetSummary(): string {
    const parts = [];
    if (this.usesBuildingCandidates) {
      parts.push(`${this.buildings.length} buildings`);
    }
    if (this.usesClusterCandidates) {
      parts.push(`${this.complementaryConfigurations.length} complementary configs`);
      if (this.selectedComplementaryConfigId) {
        parts.push(`${this.clusters.length} clusters`);
      }
    }
    return parts.join(' · ') || 'No candidate assets';
  }

  loadNetworks(): void {
    this.isLoading = true;
    this.http.get<any>(`${environment.appUrl}/networks/?limit=500`).subscribe({
      next: (response) => {
        const rows = response?.results || response || [];
        this.networks = rows;
        if (!this.selectedNetworkId && this.networks.length) {
          this.onNetworkChange(this.networks[0].id);
        }
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Networks could not be loaded.';
        this.isLoading = false;
      },
    });
  }

  onNetworkChange(networkId: number): void {
    this.selectedNetworkId = networkId;
    const network = this.selectedNetwork;
    if (network) {
      this.studyName = `${network.name} - Phasing Study`;
    }
    this.selectedBuildingIds = [];
    this.selectedClusterIds = [];
    this.selectedComplementaryConfigId = null;
    this.loadNetworkConstants(networkId);
    this.loadCandidateAssets();
  }

  loadNetworkConstants(networkId: number): void {
    this.http.get<any>(`${environment.appUrl}/network_design_constants/?network=${networkId}`).subscribe({
      next: (response) => {
        const constants = this.responseRows(response)[0];
        if (!constants) return;
        this.pipeCostPerM = Number(constants.fallback_pipe_cost_per_meter || this.pipeCostPerM || 150);
        this.annualFullLoadHours = Number(constants.hours_per_year || this.annualFullLoadHours || 4000);
        this.electricityCostCadPerKwh = Number(constants.electricity_cost || this.electricityCostCadPerKwh);
        this.pumpEfficiency = Number(constants.pump_efficiency || this.pumpEfficiency);
        this.targetPressureDropPaPerM = Number(constants.target_pressure_drop || this.targetPressureDropPaPerM);
        this.minVelocityMS = Number(constants.min_velocity || this.minVelocityMS);
        this.maxVelocityMS = Number(constants.max_velocity || this.maxVelocityMS);
        this.projectLifespanYears = Number(constants.lifespan_years || this.projectLifespanYears);
        const supply = Number(constants.supply_temperature_c);
        const ret = Number(constants.return_temperature_c);
        if (Number.isFinite(supply) && Number.isFinite(ret) && supply > ret) {
          this.designDeltaTC = Number((supply - ret).toFixed(1));
        }
      },
    });
  }

  loadCandidateAssets(): void {
    const projectId = this.selectedNetwork?.project_id || this.selectedNetwork?.project?.id;
    if (!projectId) {
      this.buildings = [];
      this.clusters = [];
      return;
    }

    this.isLoadingCandidates = true;
    forkJoin({
      buildings: this.http.get<any>(`${environment.appUrl}/buildings/?project_id=${projectId}&limit=1000`),
      clusters: this.http.get<any>(`${environment.appUrl}/clusters/?project_id=${projectId}&limit=1000`),
      complementaryConfigurations: this.http.get<any>(
        `${environment.appUrl}/cluster_configurations/?project_id=${projectId}&cluster_type=complementary&base_network=${this.selectedNetworkId}&limit=500`,
      ),
    }).subscribe({
      next: (response) => {
        this.buildings = this.responseRows(response.buildings);
        this.allClusters = this.responseRows(response.clusters);
        this.complementaryConfigurations = this.responseRows(response.complementaryConfigurations);
        const selectedConfigStillExists = this.complementaryConfigurations
          .some(config => Number(config.id) === Number(this.selectedComplementaryConfigId));
        if (!selectedConfigStillExists) {
          this.selectedComplementaryConfigId = null;
        }
        this.applyComplementaryClusterFilter();
        this.isLoadingCandidates = false;
      },
      error: () => {
        this.buildings = [];
        this.allClusters = [];
        this.clusters = [];
        this.complementaryConfigurations = [];
        this.isLoadingCandidates = false;
      },
    });
  }

  onComplementaryConfigChange(configId: number | null): void {
    this.selectedComplementaryConfigId = configId;
    this.selectedClusterIds = [];
    this.applyComplementaryClusterFilter();
    this.clearCurrentResults();
  }

  onCandidateSourceModeChange(mode: 'buildings_and_clusters' | 'clusters_only' | 'buildings_only'): void {
    this.candidateSourceMode = mode;
    if (!this.usesBuildingCandidates) {
      this.selectedBuildingIds = [];
      this.tagFilter = '';
    }
    if (!this.usesClusterCandidates) {
      this.selectedClusterIds = [];
      this.selectedComplementaryConfigId = null;
      this.clusters = [];
    } else {
      this.applyComplementaryClusterFilter();
    }
    this.clearCurrentResults();
  }

  onPhaseViewChange(): void {
    if (this.currentData) {
      this.updateCharts(this.currentData);
    }
  }

  loadStudies(): void {
    this.http.get<any>(`${environment.appUrl}/phasing-studies/?limit=100`).subscribe({
      next: (response) => {
        this.studies = response?.results || response || [];
      },
    });
  }

  loadGasRates(): void {
    this.http.get<any>(`${environment.appUrl}/ontario-natural-gas-rates/?ordering=-effective_date`).subscribe({
      next: (response) => {
        this.gasRates = this.responseRows(response);
        this.gasPriceBasis = this.gasRates[0] || null;
        if (this.gasPriceBasis && this.gasPriceCadPerMwh === null) {
          this.gasPriceCadPerMwh = Number(this.gasPriceBasis.cad_per_mwh_useful_heat || this.gasPriceBasis.cad_per_mwh || 0);
        }
      },
    });
  }

  loadCarbonTaxRates(): void {
    this.http.get<any>(`${environment.appUrl}/carbon-tax-rates/?ordering=year`).subscribe({
      next: (response) => {
        this.carbonTaxRates = this.responseRows(response);
        const year = new Date().getFullYear();
        this.carbonTaxBasis =
          this.carbonTaxRates.find(rate => Number(rate.year) === year) ||
          [...this.carbonTaxRates].reverse().find(rate => Number(rate.year) <= year) ||
          this.carbonTaxRates[0] ||
          null;
        if (this.carbonTaxBasis && this.carbonPriceCadPerTonne === null) {
          this.carbonPriceCadPerTonne = Number(this.carbonTaxBasis.price_cad_per_tonne || 0);
        }
      },
    });
  }

  previewPhasing(): void {
    if (!this.selectedNetworkId) return;
    this.isPreviewing = true;
    this.errorMessage = '';
    this.http.post<any>(
      `${environment.appUrl}/networks/${this.selectedNetworkId}/phasing-preview/`,
      { ...this.payload(), prepare_pipeline: false },
    ).subscribe({
      next: (preview) => {
        this.preview = preview;
        this.report = null;
        this.setVisualizationDefaults(preview);
        this.updateCharts(preview);
        this.fitBounds();
        this.isPreviewing = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Phasing preview failed.';
        this.isPreviewing = false;
      },
    });
  }

  runPhasing(): void {
    if (!this.selectedNetworkId) return;
    this.isRunning = true;
    this.errorMessage = '';
    this.http.post<any>(
      `${environment.appUrl}/networks/${this.selectedNetworkId}/phasing-run/`,
      this.payload(),
    ).subscribe({
      next: (response) => {
        if (response?.task_id) {
          this.operations.track({
            taskId: response.task_id,
            type: 'network-phasing',
            label: this.preparePipeline
              ? `${this.studyName || this.selectedNetwork?.name || 'Network'} pipeline + phasing`
              : this.studyName || `${this.selectedNetwork?.name || 'Network'} phasing`,
            status: response.status || 'PENDING',
            message: response.message || (this.preparePipeline ? 'Preparation pipeline and phasing are running.' : 'Network phasing is running.'),
            sourceId: this.selectedNetworkId || undefined,
          });
          this.toastr.info(
            this.preparePipeline ? 'Preparation pipeline and phasing are running in the background.' : 'Network phasing is running in the background.',
            'Network Phasing',
          );
          this.restoreActiveOperations();
        }
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Could not queue network phasing.';
        this.isRunning = false;
      },
    });
  }

  openStudy(studyId: number): void {
    if (!studyId) return;
    this.selectedStudyId = studyId;
    this.http.get<any>(`${environment.appUrl}/phasing-studies/${studyId}/report/`).subscribe({
      next: (report) => {
        this.report = report;
        this.preview = null;
        this.selectedNetworkId = report?.base_network?.id || this.selectedNetworkId;
        this.applyStudyParameters(report?.parameters || {}, report?.periods || []);
        if (report?.id) {
          this.comparisonReports[String(report.id)] = report;
          if (!this.comparisonStudyIds.some(id => Number(id) === Number(report.id))) {
            this.comparisonStudyIds = [...this.comparisonStudyIds, Number(report.id)];
          }
          if (!this.selectedComparisonPhaseKeys.length) {
            this.selectedComparisonPhaseKeys = this.comparisonPhaseOptions.slice(0, 4).map(row => row.key);
          }
        }
        this.loadCandidateAssets();
        this.setVisualizationDefaults(report);
        this.updateCharts(report);
        this.updatePhaseComparisonCharts();
        this.fitBounds();
      },
      error: () => {
        this.errorMessage = 'Could not open the selected phasing study.';
      },
    });
  }

  addScenario(): void {
    this.scenarios = [
      ...this.scenarios,
      { name: `Scenario ${this.scenarios.length + 1}`, probability: 0.1, discount_rate: 0.045, demand_multiplier: 1.0, fuel_price_multiplier: 1.0 },
    ];
  }

  removeScenario(index: number): void {
    if (this.scenarios.length <= 1) return;
    this.scenarios = this.scenarios.filter((_, i) => i !== index);
  }

  onYearsInputChange(value?: string): void {
    if (typeof value === 'string') {
      this.yearsInput = value;
    }
    this.syncPhaseControlsFromYears();
    this.clearCurrentResults();
  }

  onPhaseLimitChange(): void {
    this.clearCurrentResults();
  }

  routeOptions(): google.maps.PolylineOptions {
    return {
      strokeColor: '#475569',
      strokeOpacity: 0.62,
      strokeWeight: 5,
      clickable: false,
      zIndex: 3,
    };
  }

  candidatePathOptions(path: any): google.maps.PolylineOptions {
    const year = Number(path?.year || 0);
    const years = this.timelineRows.map(row => Number(row.year));
    const rejected = path?.status === 'rejected';
    const selected = !!path?.selected;
    const color = selected
      ? this.phaseColors[Math.max(0, years.indexOf(year)) % this.phaseColors.length] || '#16a34a'
      : rejected ? '#94a3b8' : '#64748b';
    return {
      strokeColor: color,
      strokeOpacity: selected ? 0.92 : rejected ? 0.18 : 0.32,
      strokeWeight: selected ? 4.5 : 2,
      clickable: false,
      zIndex: path?.selected ? 12 : 2,
    };
  }

  phasePathOptions(path: any): google.maps.PolylineOptions {
    const color = path?.phase_color || this.phaseColorForYear(path?.phase_year || path?.year || this.selectedPhaseYear);
    return {
      strokeColor: color,
      strokeOpacity: path?.node_newly_connected ? 0.95 : 0.55,
      strokeWeight: path?.node_newly_connected ? 5 : 3,
      clickable: false,
      zIndex: path?.node_newly_connected ? 16 : 8,
    };
  }

  phaseColor(index: number): string {
    return this.phaseColors[index % this.phaseColors.length];
  }

  phaseColorForYear(year: any): string {
    const target = Number(year);
    const timelineIndex = this.timelineRows.findIndex(row => Number(row.year) === target);
    if (timelineIndex >= 0) return this.phaseColor(timelineIndex);
    const planningIndex = this.planningYears.findIndex(item => Number(item) === target);
    return this.phaseColor(planningIndex >= 0 ? planningIndex : 0);
  }

  trackById(_: number, item: any): number {
    return item.id;
  }

  buildingDemandLabel(building: any): string {
    const heat = Number(building?.heating_demand || 0);
    const source = building?.waste_heat_source_type;
    if (source) return `${source} source`;
    return `${heat.toLocaleString(undefined, { maximumFractionDigits: 0 })} kW`;
  }

  buildingMetaLabel(building: any): string {
    const parts = [
      building?.tag ? `tag: ${building.tag}` : '',
      building?.building_type || '',
    ].filter(Boolean);
    return parts.join(' · ') || 'untagged';
  }

  clusterMetaLabel(cluster: any): string {
    const demand = Number(cluster?.heating_demand || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const count = Number(cluster?.no_of_buildings || 0);
    return `${count} buildings · ${demand} kW`;
  }

  candidateBuildingCount(candidate: any): number {
    const raw =
      candidate?.building_count ??
      candidate?.metadata?.building_count ??
      candidate?.cluster_building_count ??
      candidate?.no_of_buildings;
    const count = Number(raw);
    if (Number.isFinite(count) && count > 0) return count;
    return candidate?.candidate_type === 'building' ? 1 : 0;
  }

  complementaryConfigLabel(config: any): string {
    const clusters = Number(config?.cluster_count || 0);
    const buildings = Number(config?.total_buildings || 0);
    return `${config?.name || 'Complementary configuration'} · ${clusters} clusters · ${buildings} buildings`;
  }

  gasRateLabel(rate = this.gasPriceBasis): string {
    if (!rate) return 'Ontario gas rate not loaded';
    const date = rate.effective_date || 'latest';
    const price = Number(rate.effective_price_cents_per_m3 || 0).toFixed(4);
    const useful = Number(rate.cad_per_mwh_useful_heat || 0).toFixed(2);
    return `${rate.region || 'Ontario'} · ${date} · ${price} c/m3 · $${useful}/MWh useful heat`;
  }

  carbonTaxLabel(rate = this.carbonTaxBasis): string {
    if (!rate) return 'Carbon tax schedule not loaded';
    return `Carbon value basis: ${rate.year} · $${Number(rate.price_cad_per_tonne || 0).toFixed(0)}/tCO2e`;
  }

  private normalizeSolverMode(raw: any): PhasingSolverMode {
    const value = String(raw || 'greedy').toLowerCase();
    if (value.includes('full_chronology') || value.includes('chronology')) return 'full_chronology_milp';
    if (value.includes('milp')) return 'milp';
    return 'greedy';
  }

  private applyStudyParameters(parameters: any, periods: any[] = []): void {
    if (!parameters) return;
    const numberValue = (key: string, current: number | null): number | null => {
      const value = Number(parameters[key]);
      return Number.isFinite(value) ? value : current;
    };
    this.maxDistanceM = numberValue('max_distance_m', this.maxDistanceM) as number;
    this.solverMode = this.normalizeSolverMode(parameters.solver_mode || this.solverMode);
    const decisionMode = String(parameters.scenario_decision_mode || this.scenarioDecisionMode);
    this.scenarioDecisionMode = decisionMode === 'scenario_specific' ? 'scenario_specific' : 'expected_value';
    const candidateSourceMode = String(parameters.candidate_source_mode || this.candidateSourceMode);
    if (['buildings_and_clusters', 'clusters_only', 'buildings_only'].includes(candidateSourceMode)) {
      this.candidateSourceMode = candidateSourceMode as 'buildings_and_clusters' | 'clusters_only' | 'buildings_only';
    }
    this.selectedComplementaryConfigId = numberValue(
      'complementary_cluster_configuration_id',
      this.selectedComplementaryConfigId,
    );
    this.minLinearHeatDensity = numberValue('min_linear_heat_density_mwh_per_m_year', this.minLinearHeatDensity) as number;
    this.availableHeatKw = parameters.available_heat_is_unlimited ? null : numberValue('available_heat_kw', this.availableHeatKw);
    this.assumeUnlimitedAvailableHeat = !!parameters.available_heat_is_unlimited || !!parameters.assume_unlimited_available_heat;
    this.demandYear = numberValue('demand_year', this.demandYear);
    this.annualFullLoadHours = numberValue('annual_full_load_hours', this.annualFullLoadHours);
    this.pipeCostPerM = numberValue('pipe_cost_per_m', this.pipeCostPerM);
    this.heatPriceCadPerMwh = numberValue('heat_price_cad_per_mwh', this.heatPriceCadPerMwh) as number;
    this.gasPriceCadPerMwh = numberValue('gas_price_cad_per_mwh', this.gasPriceCadPerMwh);
    this.projectLifespanYears = numberValue('project_lifespan_years', this.projectLifespanYears) as number;
    this.electricityCostCadPerKwh = numberValue('electricity_cost_cad_per_kwh', this.electricityCostCadPerKwh) as number;
    this.gridEmissionFactorKgPerKwh = numberValue('grid_emission_factor_kgco2e_per_kwh', this.gridEmissionFactorKgPerKwh) as number;
    this.gasEmissionFactorKgPerKwh = numberValue('gas_emission_factor_kgco2e_per_kwh', this.gasEmissionFactorKgPerKwh) as number;
    this.baseBoilerEfficiency = numberValue('base_boiler_efficiency', this.baseBoilerEfficiency) as number;
    this.carbonPriceCadPerTonne = numberValue('carbon_price_cad_per_tonne', this.carbonPriceCadPerTonne);
    this.designDeltaTC = numberValue('design_delta_t_c', this.designDeltaTC) as number;
    this.targetPressureDropPaPerM = numberValue('target_pressure_drop_pa_per_m', this.targetPressureDropPaPerM) as number;
    this.pumpEfficiency = numberValue('pump_efficiency', this.pumpEfficiency) as number;
    this.minVelocityMS = numberValue('min_velocity_m_s', this.minVelocityMS) as number;
    this.maxVelocityMS = numberValue('max_velocity_m_s', this.maxVelocityMS) as number;
    this.syncPhaseControlsFromYears(periods.length ? periods : parameters.periods || []);
  }

  trackByMapKey(_: number, item: any): string {
    return String(item?.key || item?.id || item?.candidate_id || item?.candidate_key || item?.name || _);
  }

  trackByKey(_: number, item: any): string {
    return String(item?.key || item?.id || _);
  }

  onComparisonStudiesChange(studyIds: number[]): void {
    this.comparisonStudyIds = (studyIds || []).map(id => Number(id)).filter(id => Number.isFinite(id));
    this.loadComparisonReports();
  }

  onComparisonPhasesChange(keys: string[]): void {
    this.selectedComparisonPhaseKeys = (keys || []).map(key => String(key));
    this.updatePhaseComparisonCharts();
  }

  loadComparisonReports(): void {
    const ids = this.comparisonStudyIds || [];
    this.comparisonError = '';
    if (!ids.length) {
      this.comparisonReports = {};
      this.selectedComparisonPhaseKeys = [];
      this.updatePhaseComparisonCharts();
      return;
    }

    this.isLoadingComparison = true;
    forkJoin(ids.map(id => this.http.get<any>(`${environment.appUrl}/phasing-studies/${id}/report/`))).subscribe({
      next: (reports) => {
        const nextReports: Record<string, any> = {};
        reports.forEach(report => {
          if (report?.id) nextReports[String(report.id)] = report;
        });
        this.comparisonReports = nextReports;
        const validKeys = new Set(this.comparisonPhaseOptions.map(row => String(row.key)));
        this.selectedComparisonPhaseKeys = this.selectedComparisonPhaseKeys.filter(key => validKeys.has(String(key)));
        if (!this.selectedComparisonPhaseKeys.length) {
          this.selectedComparisonPhaseKeys = this.comparisonPhaseOptions.slice(0, 4).map(row => row.key);
        }
        this.updatePhaseComparisonCharts();
        this.isLoadingComparison = false;
      },
      error: () => {
        this.comparisonReports = {};
        this.comparisonError = 'Could not load the selected phasing studies for comparison.';
        this.isLoadingComparison = false;
        this.updatePhaseComparisonCharts();
      },
    });
  }

  private setVisualizationDefaults(data: any): void {
    const scenarioNames = (data?.scenarios || []).map((scenario: any) => scenario.name).filter(Boolean);
    if (!scenarioNames.includes(this.selectedScenarioName)) {
      this.selectedScenarioName = scenarioNames[0] || '';
    }
    const years = (data?.timeline || data?.periods || [])
      .map((row: any) => Number(row.year))
      .filter((year: number) => Number.isFinite(year));
    if (!years.includes(Number(this.selectedPhaseYear))) {
      this.selectedPhaseYear = years[0] || null;
    }
  }

  private candidatePosition(item: any): google.maps.LatLngLiteral | null {
    const point = item?.candidate_point || item?.service_path?.[0] || item?.metadata?.service_path?.[0];
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  private hasPath(path: any[]): boolean {
    return Array.isArray(path) && path.some(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
  }

  private initialCandidateMarkerOptions(candidate: any): google.maps.MarkerOptions {
    const isCluster = candidate?.candidate_type === 'cluster';
    const count = this.candidateBuildingCount(candidate);
    const title = isCluster && count ? `${candidate?.name || 'Candidate'} · ${count} buildings` : candidate?.name || 'Candidate';
    return this.svgMarkerOptions(
      title,
      '#2563eb',
      '#1e3a8a',
      '',
      18,
      isCluster ? 'rect' : 'circle',
    );
  }

  private phaseDecisionMarkerOptions(row: any): google.maps.MarkerOptions {
    const isSource = row?.candidate_role === 'source';
    const isCluster = row?.candidate_type === 'cluster';
    const rejected = !row?.node_connected;
    const baseTitle = row?.candidate_name || row?.name || 'Candidate';
    const count = this.candidateBuildingCount(row);
    const title = isCluster && count ? `${baseTitle} · ${count} buildings` : baseTitle;
    if (rejected) {
      return this.svgMarkerOptions(`${title} rejected`, '#dc2626', '#7f1d1d', '', 18, isCluster ? 'rect' : 'circle');
    }
    const label = isSource ? 'S' : isCluster ? 'C' : 'B';
    const fill = row?.phase_color || this.phaseColorForYear(row?.phase_year || row?.year);
    const stroke = '#0f172a';
    const phaseYear = row?.phase_year || row?.year;
    return this.svgMarkerOptions(
      row?.node_newly_connected ? `${title} selected in ${phaseYear}` : `${title} selected in earlier phase ${phaseYear}`,
      fill,
      stroke,
      label,
      row?.node_newly_connected ? 27 : 22,
      isCluster ? 'rect' : 'circle',
    );
  }

  private withPhaseDisplay(row: any, builtYearByCandidate: Map<string, number>): any {
    const candidateKey = this.phaseCandidateKey(row);
    const builtYear = row?.node_newly_connected
      ? Number(row.year)
      : row?.node_connected
        ? builtYearByCandidate.get(candidateKey) || Number(row.year)
        : null;
    return {
      ...row,
      phase_year: builtYear,
      phase_color: builtYear ? this.phaseColorForYear(builtYear) : '#dc2626',
    };
  }

  private phaseBuiltYearLookup(scenarioName: string): Map<string, number> {
    const lookup = new Map<string, number>();
    this.resultRows
      .filter(row => (!scenarioName || row.scenario === scenarioName) && row.node_newly_connected)
      .forEach(row => {
        const key = this.phaseCandidateKey(row);
        const year = Number(row.year);
        if (!key || !Number.isFinite(year)) return;
        const previous = lookup.get(key);
        if (previous === undefined || year < previous) {
          lookup.set(key, year);
        }
      });
    return lookup;
  }

  private phaseCandidateKey(row: any): string {
    if (row?.candidate_key !== undefined && row?.candidate_key !== null) return String(row.candidate_key);
    if (row?.candidate_id !== undefined && row?.candidate_id !== null) return `${row?.candidate_type || 'candidate'}:${row.candidate_id}`;
    return row?.candidate_name || row?.name || '';
  }

  private svgMarkerOptions(title: string, fill: string, stroke: string, label: string, size: number, shape: 'circle' | 'rect'): google.maps.MarkerOptions {
    const svg = this.markerSvg(fill, stroke, label, shape);
    const icon: any = { url: svg };
    if (typeof google !== 'undefined') {
      icon.scaledSize = new google.maps.Size(size, size);
      icon.anchor = new google.maps.Point(Math.round(size / 2), Math.round(size / 2));
    }
    return {
      title,
      icon,
      optimized: true,
      zIndex: size > 24 ? 45 : 30,
    };
  }

  private markerSvg(fill: string, stroke: string, label: string, shape: 'circle' | 'rect'): string {
    const body = shape === 'rect'
      ? `<rect x="9" y="9" width="30" height="30" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`
      : `<circle cx="24" cy="24" r="16" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
    const labelMarkup = label
      ? `<text x="24" y="29" text-anchor="middle" font-size="15" font-family="Arial, sans-serif" font-weight="900" fill="#ffffff">${label}</text>`
      : '';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" fill="#ffffff" opacity="0.9"/>
        ${body}
        ${labelMarkup}
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  private payload(): any {
    const selectedClusterIds = this.selectedClusterIds || [];
    const includeClusters = this.usesClusterCandidates && (
      this.candidateSourceMode === 'clusters_only' ||
      !!this.selectedComplementaryConfigId ||
      selectedClusterIds.length > 0
    );

    return {
      name: this.studyName,
      solver_mode: this.solverMode,
      scenario_decision_mode: this.scenarioDecisionMode,
      years: this.yearsInput,
      periods: this.phasePeriodPayload(),
      max_distance_m: this.maxDistanceM,
      min_linear_heat_density_mwh_per_m_year: this.minLinearHeatDensity,
      available_heat_kw: this.assumeUnlimitedAvailableHeat ? null : this.availableHeatKw,
      assume_unlimited_available_heat: this.assumeUnlimitedAvailableHeat,
      demand_year: this.demandYear,
      annual_full_load_hours: this.annualFullLoadHours,
      pipe_cost_per_m: this.pipeCostPerM,
      heat_price_cad_per_mwh: this.heatPriceCadPerMwh,
      gas_price_cad_per_mwh: this.gasPriceCadPerMwh,
      gas_price_region: this.gasPriceBasis?.region || 'Union South Rate Zone',
      project_lifespan_years: this.projectLifespanYears,
      electricity_cost_cad_per_kwh: this.electricityCostCadPerKwh,
      grid_emission_factor_kgco2e_per_kwh: this.gridEmissionFactorKgPerKwh,
      gas_emission_factor_kgco2e_per_kwh: this.gasEmissionFactorKgPerKwh,
      base_boiler_efficiency: this.baseBoilerEfficiency,
      carbon_price_cad_per_tonne: this.carbonPriceCadPerTonne,
      design_delta_t_c: this.designDeltaTC,
      target_pressure_drop_pa_per_m: this.targetPressureDropPaPerM,
      pump_efficiency: this.pumpEfficiency,
      min_velocity_m_s: this.minVelocityMS,
      max_velocity_m_s: this.maxVelocityMS,
      prepare_pipeline: this.preparePipeline,
      reuse_sized_network: this.reuseSizedNetwork,
      edge_generation_method: this.edgeGenerationMethod,
      edge_connection_method: this.edgeConnectionMethod,
      route_tracing_mode: this.routeTracingMode,
      route_mode: this.routeTracingMode,
      pipe_sizing_method: this.pipeSizingMethod,
      pipe_sizing_year: this.pipeSizingYear,
      ensure_complementary_clusters: this.ensureComplementaryClusters,
      complementary_cluster_radius_km: this.complementaryClusterRadiusKm,
      pipeline_name_prefix: this.studyName || this.selectedNetwork?.name,
      include_clusters: includeClusters,
      create_networks: this.createNetworks,
      candidate_source_mode: this.candidateSourceMode,
      candidate_selection_mode: this.candidateMode,
      building_ids: this.candidateMode === 'selected' && this.usesBuildingCandidates ? this.selectedBuildingIds : [],
      cluster_ids: this.usesClusterCandidates ? selectedClusterIds : [],
      complementary_cluster_configuration_id: this.usesClusterCandidates ? this.selectedComplementaryConfigId : null,
      tags: this.candidateMode === 'auto' && this.usesBuildingCandidates && this.tagFilter ? [this.tagFilter] : [],
      scenarios: this.scenarios,
    };
  }

  private planningYearValues(): number[] {
    return String(this.yearsInput || '')
      .split(',')
      .map(item => Number(String(item).trim()))
      .filter(year => Number.isFinite(year) && year >= 2000 && year <= 2200);
  }

  private syncPhaseControlsFromYears(savedPeriods: any[] = []): void {
    if (Array.isArray(savedPeriods) && savedPeriods.length) {
      const rows = savedPeriods
        .map(period => ({
          year: Number(period?.year),
          available_heat_kw: this.optionalNumber(period?.available_heat_kw),
          capex_budget_cad: this.optionalNumber(period?.capex_budget_cad),
          max_new_connections: this.optionalPositiveInteger(period?.max_new_connections),
        }))
        .filter(period => Number.isFinite(period.year));
      if (rows.length) {
        this.phaseControls = rows;
        this.yearsInput = rows.map(row => row.year).join(', ');
        return;
      }
    }

    const existingByYear = new Map<number, PhaseControl>(
      (this.phaseControls || []).map(phase => [Number(phase.year), phase]),
    );
    const uniqueYears = Array.from(new Set(this.planningYearValues())).sort((a, b) => a - b);
    this.phaseControls = uniqueYears.map(year => {
      const existing = existingByYear.get(year);
      return {
        year,
        available_heat_kw: existing?.available_heat_kw ?? null,
        capex_budget_cad: existing?.capex_budget_cad ?? null,
        max_new_connections: existing?.max_new_connections ?? null,
      };
    });
  }

  private phasePeriodPayload(): any[] {
    const controls = this.phaseControls?.length ? this.phaseControls : [];
    return controls
      .map((phase, index) => {
        const year = Number(phase.year);
        return {
          year,
          label: `Phase ${index + 1} (${year})`,
          available_heat_kw: this.assumeUnlimitedAvailableHeat ? null : this.optionalNumber(phase.available_heat_kw),
          capex_budget_cad: this.optionalNumber(phase.capex_budget_cad),
          max_new_connections: this.optionalPositiveInteger(phase.max_new_connections),
        };
      })
      .filter(phase => Number.isFinite(phase.year));
  }

  private optionalNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private optionalPositiveInteger(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private applyComplementaryClusterFilter(): void {
    const configId = this.selectedComplementaryConfigId;
    this.clusters = configId
      ? this.allClusters.filter(cluster => Number(cluster.cluster_configuration) === Number(configId))
      : [];
    const clusterIds = new Set(this.clusters.map(cluster => Number(cluster.id)));
    this.selectedClusterIds = this.selectedClusterIds.filter(id => clusterIds.has(Number(id)));
  }

  clearCurrentResults(): void {
    this.preview = null;
    this.report = null;
    this.errorMessage = '';
  }

  private responseRows(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;
    return [];
  }

  private timelineForScenario(data: any, scenarioName: string = this.selectedScenarioName): any[] {
    // Saved reports and previews include a flat PhasingResult-style table. The
    // backend may also include a top-level timeline, but in scenario-specific
    // mode that top-level timeline is only a compatibility summary. This method
    // rebuilds the phase timeline from result rows for the active scenario so
    // charts and summaries change when the scenario dropdown changes.
    if (!data) return [];
    const results = data?.results || [];
    const scenario = scenarioName || (data?.scenarios || [])?.[0]?.name || '';
    if (!results.length || !scenario) {
      return data?.timeline || [];
    }
    const periods = (data?.periods?.length ? data.periods : data?.timeline || [])
      .map((period: any, index: number) => ({
        year: Number(period.year),
        label: period.label || `Phase ${index + 1} (${period.year})`,
      }))
      .filter((period: any) => Number.isFinite(period.year));
    const rowsByYear = new Map<number, any[]>();
    results
      .filter((row: any) => row.scenario === scenario)
      .forEach((row: any) => {
        const year = Number(row.year);
        if (!rowsByYear.has(year)) rowsByYear.set(year, []);
        rowsByYear.get(year)?.push(row);
      });

    let cumulativeCapex = 0;
    let cumulativeHeat = 0;
    return periods.map((period: any) => {
      const rows = rowsByYear.get(period.year) || [];
      const newly = this.uniqueRows(rows.filter(row => row.node_newly_connected));
      const phaseCapex = newly.reduce((total: number, row: any) => total + Number(row.capex_cad || row.estimated_connection_cost_cad || 0), 0);
      const addedHeat = newly
        .filter((row: any) => row.candidate_role !== 'source')
        .reduce((total: number, row: any) => total + Number(row.heat_supplied_kw || row.peak_heat_kw || 0), 0);
      const addedSource = newly
        .filter((row: any) => row.candidate_role === 'source')
        .reduce((total: number, row: any) => total + Number(row.heat_supplied_kw || row.available_heat_kw || 0), 0);
      cumulativeCapex += phaseCapex;
      cumulativeHeat += addedHeat;
      return {
        year: period.year,
        label: period.label,
        new_connections: newly.length,
        added_heat_kw: addedHeat,
        added_source_kw: addedSource,
        capex_cad: phaseCapex,
        cumulative_heat_kw: cumulativeHeat,
        cumulative_capex_cad: cumulativeCapex,
        candidates: newly,
      };
    });
  }

  private uniqueRows(rows: any[]): any[] {
    const seen = new Set<string>();
    return rows.filter(row => {
      const key = String(row.candidate_key || row.candidate_id || row.candidate_name || row.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private chartPayloadFromTimeline(timeline: any[]): any {
    // Most existing chart code expects arrays named like the backend chart
    // payload. This adapter lets the same chart code work with a timeline that
    // was rebuilt client-side for the selected scenario.
    return {
      years: timeline.map(row => row.year),
      new_connections: timeline.map(row => Number(row.new_connections || 0)),
      added_heat_kw: timeline.map(row => Number(row.added_heat_kw || 0)),
      capex_cad: timeline.map(row => Number(row.capex_cad || 0)),
      cumulative_capex_cad: timeline.map(row => Number(row.cumulative_capex_cad || 0)),
      cumulative_heat_kw: timeline.map(row => Number(row.cumulative_heat_kw || 0)),
    };
  }

  private updateCharts(data: any): void {
    // All phasing charts are drawn through the active scenario lens. For
    // expected-value studies the active timeline is effectively the shared
    // plan. For scenario-specific studies it is the selected scenario's plan.
    const activeTimeline = this.timelineForScenario(data);
    const chart = this.chartPayloadFromTimeline(activeTimeline);
    const years = chart.years || [];
    const results = data?.results || [];
    const candidates = data?.candidates || [];
    const scenarios = data?.scenarios || [];
    this.capexOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: { trigger: 'axis', padding: 12, confine: true },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 76, right: 36, top: 72, bottom: years.length > 8 ? 78 : 54, containLabel: true },
      dataZoom: years.length > 8 ? [
        { type: 'slider', height: 22, bottom: 20, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: years, axisLabel: { fontWeight: 800, hideOverlap: true } },
      yAxis: { type: 'value', name: 'CAD', nameGap: 44, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
      series: [
        { name: 'Phase CAPEX', type: 'bar', barMaxWidth: 46, data: chart.capex_cad || [], itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] } },
        { name: 'Cumulative CAPEX', type: 'line', smooth: true, symbolSize: 8, data: chart.cumulative_capex_cad || [], itemStyle: { color: '#dc2626' }, lineStyle: { width: 4 } },
      ],
    };
    this.heatOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: { trigger: 'axis', padding: 12, confine: true },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 76, right: 36, top: 72, bottom: years.length > 8 ? 78 : 54, containLabel: true },
      dataZoom: years.length > 8 ? [
        { type: 'slider', height: 22, bottom: 20, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: years, axisLabel: { fontWeight: 800, hideOverlap: true } },
      yAxis: { type: 'value', name: 'kW', nameGap: 38, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
      series: [
        { name: 'New connections', type: 'bar', barMaxWidth: 46, data: chart.new_connections || [], itemStyle: { color: '#0f766e', borderRadius: [4, 4, 0, 0] } },
        { name: 'Connected heat', type: 'line', smooth: true, symbolSize: 8, data: chart.cumulative_heat_kw || [], itemStyle: { color: '#f97316' }, lineStyle: { width: 4 } },
      ],
    };
    this.updatePhaseStoryCharts(data);
    this.updateChronologyInsightCharts(data);

    const activeSelection = this.activeScenarioSelection(data);
    const screeningRows = candidates
      .filter((candidate: any) => Number.isFinite(Number(candidate.distance_to_trunk_m)) && Number.isFinite(Number(candidate.linear_heat_density_mwh_per_m_year)))
      .map((candidate: any) => {
        const selected = this.candidateKeys(candidate).some(key => activeSelection.selectedKeys.has(key));
        return {
          name: candidate.name,
          candidateType: candidate.candidate_type,
          buildingCount: this.candidateBuildingCount(candidate),
          selected,
          selectedYear: this.selectedYearForCandidate(candidate, activeSelection.selectedYearByKey),
          rejected: candidate.status === 'rejected',
          role: candidate.candidate_role,
          heat: Number(candidate.peak_heat_kw || candidate.available_heat_kw || 0),
          value: [
            Number(candidate.distance_to_trunk_m || 0),
            Number(candidate.linear_heat_density_mwh_per_m_year || 0),
            Number(candidate.suitability_score || 0),
          ],
        };
      });
    const screeningSeries = [
      { name: 'Selected', rows: screeningRows.filter(row => row.selected) },
      { name: 'Eligible', rows: screeningRows.filter(row => !row.selected && !row.rejected) },
      { name: 'Rejected', rows: screeningRows.filter(row => row.rejected) },
    ];
    this.candidateScreeningOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const row = params.data?.row || {};
          return [
            `<strong>${row.name || 'Candidate'}</strong>`,
            row.selectedYear ? `Selected phase: ${row.selectedYear}` : row.rejected ? 'Screened out' : 'Eligible in active scenario',
            `Distance: ${this.formatPlainCompact(params.value?.[0] || 0)} m`,
            `Linear heat density: ${(params.value?.[1] || 0).toFixed(2)} MWh/m/year`,
            `Score: ${(params.value?.[2] || 0).toFixed(1)}`,
            `Heat: ${this.formatPlainCompact(row.heat || 0)} kW`,
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 82, right: 42, top: 76, bottom: 72, containLabel: true },
      dataZoom: [
        { type: 'slider', height: 22, bottom: 24, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0 },
      ],
      xAxis: { type: 'value', name: 'Distance to trunk (m)', nameLocation: 'middle', nameGap: 42, axisLabel: { fontWeight: 800 } },
      yAxis: { type: 'value', name: 'Linear heat density', nameGap: 48, axisLabel: { fontWeight: 800 } },
      series: screeningSeries.map((series, index) => ({
        name: series.name,
        type: 'scatter',
        data: series.rows.map(row => ({ value: row.value, row })),
        symbolSize: (value: any, params: any) => {
          const heat = Number(params?.data?.row?.heat || 0);
          const buildingCount = Number(params?.data?.row?.buildingCount || 1);
          return Math.max(8, Math.min(34, 8 + Math.log10(heat + 10) * 4 + Math.sqrt(buildingCount) * 0.8));
        },
        itemStyle: { color: ['#16a34a', '#2563eb', '#94a3b8'][index], opacity: 0.82, borderColor: '#ffffff', borderWidth: 1.5 },
        emphasis: { focus: 'series', scale: 1.25 },
        markLine: index === 0 ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#dc2626', width: 2, type: 'dashed' },
          label: { show: false },
          data: [
            { name: 'Max distance', xAxis: Number(data?.parameters?.max_distance_m || this.maxDistanceM) },
            { name: 'Minimum LHD', yAxis: Number(data?.parameters?.min_linear_heat_density_mwh_per_m_year || this.minLinearHeatDensity) },
          ],
        } : undefined,
      })),
    };

    const resultYears = years.length
      ? years
      : Array.from(new Set(results.map((row: any) => Number(row.year)).filter((year: number) => Number.isFinite(year)))).sort((a: number, b: number) => a - b);
    this.scenarioHeatOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const year = params?.[0]?.axisValue;
          return [
            `<strong>${year}</strong>`,
            ...params.map(param => {
              const scenario = scenarios.find((item: any) => item.name === param.seriesName) || {};
              return `${param.marker}${param.seriesName}: ${this.formatPlainCompact(param.value || 0)} kW · demand ${Number(scenario.demand_multiplier || 1).toFixed(2)}x · gas ${Number(scenario.fuel_price_multiplier || 1).toFixed(2)}x`;
            }),
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 86, right: 36, top: 76, bottom: resultYears.length > 8 ? 78 : 54, containLabel: true },
      dataZoom: resultYears.length > 8 ? [
        { type: 'slider', height: 22, bottom: 20, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: resultYears, axisLabel: { fontWeight: 800, hideOverlap: true } },
      yAxis: { type: 'value', name: 'Connected heat (kW)', nameGap: 52, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
      series: scenarios.map((scenario: any, index: number) => ({
        name: scenario.name,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: resultYears.map((year: number) => results
          .filter((row: any) => row.scenario === scenario.name && Number(row.year) === Number(year) && row.node_connected)
          .reduce((total: number, row: any) => total + Number(row.heat_supplied_kw || 0), 0)),
        itemStyle: { color: this.phaseColors[index % this.phaseColors.length] },
        lineStyle: { width: 4 },
      })),
    };

    this.scenarioValueOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const year = params?.[0]?.axisValue;
          return [
            `<strong>${year}</strong>`,
            ...params.map(param => {
              const scenario = scenarios.find((item: any) => item.name === param.seriesName) || {};
              return `${param.marker}${param.seriesName}: ${this.formatCompact(param.value || 0)} · gas ${Number(scenario.fuel_price_multiplier || 1).toFixed(2)}x`;
            }),
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 88, right: 36, top: 76, bottom: resultYears.length > 8 ? 78 : 54, containLabel: true },
      dataZoom: resultYears.length > 8 ? [
        { type: 'slider', height: 22, bottom: 20, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: resultYears, axisLabel: { fontWeight: 800, hideOverlap: true } },
      yAxis: { type: 'value', name: 'Discounted net benefit', nameGap: 54, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
      series: scenarios.map((scenario: any, index: number) => ({
        name: scenario.name,
        type: 'bar',
        stack: 'scenario-value',
        barMaxWidth: 48,
        data: resultYears.map((year: number) => results
          .filter((row: any) => row.scenario === scenario.name && Number(row.year) === Number(year) && row.node_newly_connected)
          .reduce((total: number, row: any) => total + Number(row.discounted_net_benefit_cad || 0), 0)),
        itemStyle: { color: this.phaseColors[index % this.phaseColors.length], borderRadius: [3, 3, 0, 0] },
      })),
    };

    this.updateCandidateSensitivityCharts(data);
    this.updatePhaseComparisonCharts();
  }

  private updatePhaseStoryCharts(data: any): void {
    // These executive charts explain "why this phase": which phase gates are
    // binding, how much heat headroom remains, whether value exceeds CAPEX, and
    // which eligible candidates are waiting for a later phase.
    const rows = this.phaseStoryRows(data);
    const labels = rows.map(row => String(row.year));
    const hasBudgetLimit = rows.some(row => Number.isFinite(row.budgetLimit) && row.budgetLimit > 0);
    const hasHeatLimit = rows.some(row => Number.isFinite(row.heatLimit) && row.heatLimit > 0);
    const hasConnectionLimit = rows.some(row => Number.isFinite(row.connectionLimit) && row.connectionLimit > 0);
    const hasAnyGate = hasBudgetLimit || hasHeatLimit || hasConnectionLimit;

    this.phaseConstraintOption = {
      backgroundColor: '#ffffff',
      title: hasAnyGate ? undefined : {
        text: 'No active phase gates',
        subtext: 'Add yearly heat, budget, or connection limits to force staged build-out.',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#111827', fontWeight: 950, fontSize: 22 },
        subtextStyle: { color: '#64748b', fontWeight: 850, fontSize: 14 },
      },
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params?.[0]?.dataIndex] || {};
          const lines = [`<strong>${row.year}</strong>`];
          if (hasBudgetLimit) lines.push(`Budget used: ${this.formatCompact(row.phaseCapex)} / ${row.budgetLimit ? this.formatCompact(row.budgetLimit) : 'uncapped'}`);
          if (hasHeatLimit) lines.push(`Heat committed: ${this.formatPlainCompact(row.cumulativeHeatKw)} / ${row.heatLimit ? `${this.formatPlainCompact(row.heatLimit)} kW` : 'uncapped'}`);
          if (hasConnectionLimit) lines.push(`Connection slots: ${row.newConnections} / ${row.connectionLimit || 'uncapped'}`);
          lines.push(`New connections: ${row.newConnections}`);
          return lines.join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 82, right: 46, top: 76, bottom: labels.length > 8 ? 92 : 58, containLabel: true },
      dataZoom: labels.length > 8 ? [
        { type: 'slider', height: 22, bottom: 24, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: labels, axisLabel: { fontWeight: 900, hideOverlap: true } },
      yAxis: { type: 'value', name: 'Utilization', max: 120, axisLabel: { formatter: (value: number) => `${value}%`, fontWeight: 800 } },
      series: [
        {
          name: 'Budget',
          type: 'bar',
          barMaxWidth: 36,
          data: rows.map(row => row.budgetPct),
          itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { formatter: 'Phase limit', color: '#0f172a', fontWeight: 900 },
            lineStyle: { color: '#0f172a', type: 'dashed', width: 2 },
            data: [{ yAxis: 100 }],
          },
        },
        { name: 'Heat', type: 'bar', barMaxWidth: 36, data: rows.map(row => row.heatPct), itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] } },
        { name: 'Connections', type: 'bar', barMaxWidth: 36, data: rows.map(row => row.connectionPct), itemStyle: { color: '#f97316', borderRadius: [4, 4, 0, 0] } },
      ],
    };

    const heatSeries = hasHeatLimit
      ? [
          { name: 'Committed heat', type: 'bar', stack: 'heat', barMaxWidth: 42, data: rows.map(row => Math.min(row.cumulativeHeatKw, row.heatLimit || row.cumulativeHeatKw)), itemStyle: { color: '#0f766e', borderRadius: [4, 4, 0, 0] } },
          { name: 'Remaining heat headroom', type: 'bar', stack: 'heat', barMaxWidth: 42, data: rows.map(row => Math.max((row.heatLimit || 0) - row.cumulativeHeatKw, 0)), itemStyle: { color: '#dcfce7', borderRadius: [4, 4, 0, 0] } },
          { name: 'Heat over limit', type: 'bar', stack: 'over', barMaxWidth: 42, data: rows.map(row => Math.max(row.cumulativeHeatKw - (row.heatLimit || 0), 0)), itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] } },
        ]
      : [
          { name: 'Cumulative connected heat', type: 'bar', barMaxWidth: 42, data: rows.map(row => row.cumulativeHeatKw), itemStyle: { color: '#0f766e', borderRadius: [4, 4, 0, 0] } },
        ];
    this.heatHeadroomOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.year}</strong>`,
            `Cumulative heat: ${this.formatPlainCompact(row.cumulativeHeatKw)} kW`,
            hasHeatLimit ? `Available heat: ${this.formatPlainCompact(row.heatLimit || 0)} kW` : 'Available heat: uncapped or baseline not set',
            hasHeatLimit ? `Headroom: ${this.formatPlainCompact(Math.max((row.heatLimit || 0) - row.cumulativeHeatKw, 0))} kW` : '',
            `New connections: ${row.newConnections}`,
            `Added heat: ${this.formatPlainCompact(row.addedHeatKw)} kW`,
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 88, right: 84, top: 76, bottom: labels.length > 8 ? 92 : 58, containLabel: true },
      dataZoom: labels.length > 8 ? [
        { type: 'slider', height: 22, bottom: 24, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: labels, axisLabel: { fontWeight: 900, hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'Heat (kW)', nameGap: 48, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
        { type: 'value', name: 'Connections', nameGap: 44, axisLabel: { fontWeight: 800 } },
      ],
      series: [
        ...heatSeries,
        { name: 'New connections', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 9, data: rows.map(row => row.newConnections), itemStyle: { color: '#f97316' }, lineStyle: { width: 4 } },
      ],
    };

    const cumulativeNet: number[] = [];
    let runningNet = 0;
    rows.forEach(row => {
      runningNet += row.expectedNetValue;
      cumulativeNet.push(runningNet);
    });
    this.phaseValueOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.year}</strong>`,
            `Phase CAPEX: ${this.formatCompact(row.phaseCapex)}`,
            `Expected net value: ${this.formatCompact(row.expectedNetValue)}`,
            `Cumulative net value: ${this.formatCompact(cumulativeNet[params?.[0]?.dataIndex] || 0)}`,
            `Value / CAPEX: ${row.valueCapexRatio.toFixed(2)}x`,
            `New connections: ${row.newConnections}`,
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 88, right: 84, top: 76, bottom: labels.length > 8 ? 92 : 58, containLabel: true },
      dataZoom: labels.length > 8 ? [
        { type: 'slider', height: 22, bottom: 24, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: labels, axisLabel: { fontWeight: 900, hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'CAD', nameGap: 52, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
        { type: 'value', name: 'Value / CAPEX', nameGap: 48, axisLabel: { formatter: (value: number) => `${Number(value || 0).toFixed(1)}x`, fontWeight: 800 } },
      ],
      series: [
        { name: 'Phase CAPEX', type: 'bar', barMaxWidth: 40, data: rows.map(row => row.phaseCapex), itemStyle: { color: '#475569', borderRadius: [4, 4, 0, 0] } },
        { name: 'Expected net value', type: 'bar', barMaxWidth: 40, data: rows.map(row => row.expectedNetValue), itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] } },
        { name: 'Cumulative net value', type: 'line', smooth: true, symbolSize: 8, data: cumulativeNet, itemStyle: { color: '#2563eb' }, lineStyle: { width: 4 } },
        { name: 'Value / CAPEX', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'diamond', symbolSize: 10, data: rows.map(row => row.valueCapexRatio), itemStyle: { color: '#f97316' }, lineStyle: { width: 4 } },
      ],
    };

    const activeScenario = this.selectedScenarioName || (data?.scenarios || [])?.[0]?.name || '';
    const activeSelected = new Set<string>();
    (data?.results || [])
      .filter((row: any) => (!activeScenario || row.scenario === activeScenario) && row.node_connected)
      .forEach((row: any) => {
        activeSelected.add(String(row.candidate_key || ''));
        activeSelected.add(String(row.candidate_id || ''));
        activeSelected.add(String(row.candidate_name || ''));
      });
    const queueRows = (data?.candidates || [])
      .filter((candidate: any) => {
        const key = String(candidate.key || '');
        const id = String(candidate.id || candidate.candidate_id || '');
        const name = String(candidate.name || candidate.candidate_name || '');
        return !activeSelected.has(key) && !activeSelected.has(id) && !activeSelected.has(name) && candidate.status !== 'rejected';
      })
      .map((candidate: any) => {
        const peakHeatKw = Number(candidate.peak_heat_kw || candidate.available_heat_kw || 0);
        const capex = Number(candidate.estimated_connection_cost_cad || 0);
        const capexPerKw = peakHeatKw > 0 ? capex / peakHeatKw : 0;
        return {
          name: candidate.name || 'Candidate',
          shortName: this.truncateLabel(candidate.name || 'Candidate', 28),
          candidateType: candidate.candidate_type,
          buildingCount: this.candidateBuildingCount(candidate),
          score: Number(candidate.suitability_score || 0),
          lhd: Number(candidate.linear_heat_density_mwh_per_m_year || 0),
          distanceM: Number(candidate.distance_to_trunk_m || 0),
          peakHeatKw,
          capex,
          capexPerKw,
        };
      })
      .sort((a: any, b: any) => b.score - a.score || b.lhd - a.lhd || a.distanceM - b.distanceM)
      .slice(0, 14);
    this.candidateQueueOption = {
      backgroundColor: '#ffffff',
      title: queueRows.length ? undefined : {
        text: 'No waiting eligible candidates',
        subtext: 'The current run selected all eligible candidates or rejected the remainder during screening.',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#111827', fontWeight: 950, fontSize: 22 },
        subtextStyle: { color: '#64748b', fontWeight: 850, fontSize: 14 },
      },
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = queueRows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.name || 'Candidate'}</strong>`,
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
            `Suitability score: ${Number(row.score || 0).toFixed(1)}`,
            `Linear heat density: ${Number(row.lhd || 0).toFixed(2)} MWh/m/year`,
            `Distance to trunk: ${this.formatPlainCompact(row.distanceM || 0)} m`,
            `Peak heat: ${this.formatPlainCompact(row.peakHeatKw || 0)} kW`,
            `CAPEX per kW: ${this.formatCompact(row.capexPerKw || 0)}/kW`,
          ].filter(Boolean).join('<br>');
        },
      },
      legend: queueRows.length ? { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } } : undefined,
      grid: { left: 190, right: 86, top: 76, bottom: 58, containLabel: true },
      xAxis: [
        { type: 'value', name: 'Suitability score', max: 100, nameGap: 42, axisLabel: { fontWeight: 800 } },
        { type: 'value', name: 'CAPEX per kW', position: 'top', nameGap: 38, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
      ],
      yAxis: { type: 'category', inverse: true, data: queueRows.map(row => row.shortName), axisLabel: { fontWeight: 850, width: 160, overflow: 'truncate' } },
      series: [
        {
          name: 'Suitability score',
          type: 'bar',
          barWidth: 24,
          data: queueRows.map(row => ({
            value: row.score,
            itemStyle: { color: row.score >= 70 ? '#16a34a' : row.score >= 45 ? '#f97316' : '#94a3b8', borderRadius: [0, 5, 5, 0] },
          })),
          label: { show: true, position: 'right', color: '#111827', fontWeight: 950, formatter: (param: any) => Number(param.value || 0).toFixed(0) },
        },
        {
          name: 'CAPEX per kW',
          type: 'scatter',
          xAxisIndex: 1,
          symbol: 'diamond',
          symbolSize: 16,
          data: queueRows.map((row, index) => [row.capexPerKw, index]),
          itemStyle: { color: '#2563eb', borderColor: '#ffffff', borderWidth: 2 },
        },
      ],
    };
  }

  private phaseStoryRows(data: any): any[] {
    // Phase story rows join phase-limit inputs with scenario-filtered solver
    // outputs. That lets the presentation charts compare what the user allowed
    // in each phase against what the optimization actually built.
    const params = data?.parameters || {};
    const periods = Array.isArray(data?.periods) && data.periods.length
      ? data.periods
      : Array.isArray(params?.periods) ? params.periods : [];
    const activeTimeline = this.timelineForScenario(data);
    const timelineByYear = new Map<number, any>(
      activeTimeline.map((row: any) => [Number(row.year), row]),
    );
    const netValueByYear = new Map<number, number>();
    const scenarioName = this.selectedScenarioName || (data?.scenarios || [])?.[0]?.name || '';
    (data?.results || [])
      .filter((row: any) => row.node_newly_connected && (!scenarioName || row.scenario === scenarioName))
      .forEach((row: any) => {
        const year = Number(row.year);
        netValueByYear.set(year, (netValueByYear.get(year) || 0) + Number(row.discounted_net_benefit_cad || 0));
      });
    const unlimitedHeat = !!(params.available_heat_is_unlimited || params.assume_unlimited_available_heat);
    const baselineHeat = unlimitedHeat
      ? null
      : this.optionalNumber(params.effective_available_heat_kw) ?? this.optionalNumber(params.available_heat_kw);

    return periods.map((period: any, index: number) => {
      const year = Number(period.year);
      const timeline = timelineByYear.get(year) || {};
      const phaseCapex = Number(timeline.capex_cad || 0);
      const cumulativeHeatKw = Number(timeline.cumulative_heat_kw || 0);
      const newConnections = Number(timeline.new_connections || 0);
      const budgetLimit = this.optionalNumber(period.capex_budget_cad);
      const heatLimit = unlimitedHeat ? null : this.optionalNumber(period.available_heat_kw) ?? baselineHeat;
      const connectionLimit = this.optionalPositiveInteger(period.max_new_connections);
      const expectedNetValue = Number(netValueByYear.get(year) || 0);
      return {
        year,
        sequence: Number(period.sequence || index + 1),
        label: period.label || `${year}`,
        phaseCapex,
        cumulativeCapex: Number(timeline.cumulative_capex_cad || 0),
        addedHeatKw: Number(timeline.added_heat_kw || 0),
        cumulativeHeatKw,
        newConnections,
        budgetLimit,
        heatLimit,
        connectionLimit,
        budgetPct: budgetLimit && budgetLimit > 0 ? Math.min((phaseCapex / budgetLimit) * 100, 120) : null,
        heatPct: heatLimit && heatLimit > 0 ? Math.min((cumulativeHeatKw / heatLimit) * 100, 120) : null,
        connectionPct: connectionLimit && connectionLimit > 0 ? Math.min((newConnections / connectionLimit) * 100, 120) : null,
        expectedNetValue,
        valueCapexRatio: phaseCapex > 0 ? expectedNetValue / phaseCapex : 0,
      };
    });
  }

  private updateChronologyInsightCharts(data: any): void {
    const years = this.planningYearsForData(data);
    const scenario = this.activeScenarioName(data);
    const results = (data?.results || []).filter((row: any) => !scenario || row.scenario === scenario);
    const candidateLookup = this.candidateLookup(data?.candidates || []);
    const selectedYearByKey = new Map<string, number>();
    const resultByCandidateYear = new Map<string, any>();

    results.forEach((result: any) => {
      const key = this.primaryCandidateKey(result);
      if (!key) return;
      const year = Number(result.year);
      if (!Number.isFinite(year)) return;
      resultByCandidateYear.set(`${key}:${year}`, result);
      if (result.node_newly_connected) {
        const previous = selectedYearByKey.get(key);
        selectedYearByKey.set(key, previous ? Math.min(previous, year) : year);
      }
    });

    const candidateRows = this.enrichedCandidateRows(data, candidateLookup, selectedYearByKey, results);
    const selectedRows = candidateRows
      .filter(row => row.selectedYear)
      .sort((a, b) => Number(a.selectedYear) - Number(b.selectedYear) || Number(b.score) - Number(a.score) || Number(b.buildingCount) - Number(a.buildingCount));
    const matrixRows = selectedRows.slice(0, 24);
    const matrixData = matrixRows.reduce((cells: any[], candidate, candidateIndex) => {
      years.forEach((year, yearIndex) => {
        const result = resultByCandidateYear.get(`${candidate.key}:${year}`);
        const state = result?.node_newly_connected ? 2 : result?.node_connected ? 1 : 0;
        cells.push({
          value: [yearIndex, candidateIndex, state],
          candidate,
          year,
          result,
        });
      });
      return cells;
    }, []);

    this.chronologyMatrixOption = {
      backgroundColor: '#ffffff',
      title: matrixRows.length ? undefined : {
        text: 'No selected candidates in this scenario',
        subtext: 'Run a phased study or loosen the candidate constraints.',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#111827', fontWeight: 950, fontSize: 22 },
        subtextStyle: { color: '#64748b', fontWeight: 850, fontSize: 14 },
      },
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const candidate = params.data?.candidate || {};
          const result = params.data?.result || {};
          const state = Number(params.value?.[2] || 0);
          return [
            `<strong>${candidate.name || 'Candidate'}</strong>`,
            `Year: ${params.data?.year}`,
            state === 2 ? 'State: newly connected' : state === 1 ? 'State: carried forward' : 'State: not connected yet',
            candidate.candidateType === 'cluster' ? `Buildings represented: ${candidate.buildingCount || 0}` : '',
            `Peak heat: ${this.formatPlainCompact(candidate.peakHeatKw || 0)} kW`,
            `LHD: ${Number(candidate.lhd || 0).toFixed(2)} MWh/m/year`,
            result.reason ? `Reason: ${result.reason}` : '',
          ].filter(Boolean).join('<br>');
        },
      },
      grid: { left: 210, right: 48, top: 64, bottom: years.length > 8 ? 82 : 44, containLabel: true },
      dataZoom: years.length > 8 ? [
        { type: 'slider', height: 22, bottom: 16, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0 },
      ] : [],
      xAxis: { type: 'category', data: years, axisLabel: { fontWeight: 950, interval: 0 } },
      yAxis: {
        type: 'category',
        inverse: true,
        data: matrixRows.map(row => row.shortName),
        axisLabel: { fontWeight: 850, width: 170, overflow: 'truncate' },
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 2,
        pieces: [
          { value: 0, color: '#f8fafc' },
          { value: 1, color: '#bfdbfe' },
          { value: 2, color: '#f97316' },
        ],
      },
      series: [{
        name: 'Chronology state',
        type: 'heatmap',
        data: matrixData,
        label: {
          show: true,
          color: '#111827',
          fontWeight: 950,
          formatter: (params: any) => {
            const state = Number(params.value?.[2] || 0);
            if (state === 2) return 'NEW';
            if (state === 1) return 'ON';
            return '';
          },
        },
        itemStyle: { borderColor: '#ffffff', borderWidth: 3, borderRadius: 5 },
        emphasis: { itemStyle: { borderColor: '#0f172a', borderWidth: 2 } },
      }],
    };

    const timeline = this.timelineForScenario(data);
    const compositionRows = timeline.map((phase: any) => {
      const newly = this.uniqueRows(results.filter((row: any) => Number(row.year) === Number(phase.year) && row.node_newly_connected));
      const clusters = newly.filter((row: any) => row.candidate_type === 'cluster');
      const buildings = newly.filter((row: any) => row.candidate_type === 'building');
      const clusterBreakdown = clusters
        .map((row: any) => {
          const meta = this.lookupCandidateMeta(candidateLookup, row);
          return {
            name: row.candidate_name || meta?.name || 'Cluster',
            buildingCount: this.candidateBuildingCount(meta || row),
            peakHeatKw: Number(row.heat_supplied_kw || row.peak_heat_kw || meta?.peak_heat_kw || 0),
            capexCad: Number(row.capex_cad || row.estimated_connection_cost_cad || meta?.estimated_connection_cost_cad || 0),
          };
        })
        .sort((a: any, b: any) => Number(b.buildingCount || 0) - Number(a.buildingCount || 0));
      const representedBuildings = newly.reduce((total: number, row: any) => {
        const meta = this.lookupCandidateMeta(candidateLookup, row);
        return total + this.candidateBuildingCount(meta || row);
      }, 0);
      const serviceLength = newly.reduce((total: number, row: any) => total + Number(row.connection_length_m || row.service_route_distance_m || 0), 0);
      const annualHeat = newly.reduce((total: number, row: any) => total + Number(row.annual_heat_mwh || this.lookupCandidateMeta(candidateLookup, row)?.annual_heat_mwh || 0), 0);
      return {
        year: Number(phase.year),
        clusters: clusters.length,
        buildings: buildings.length,
        representedBuildings,
        addedHeatKw: Number(phase.added_heat_kw || 0),
        capexCad: Number(phase.capex_cad || 0),
        serviceLength,
        averageLhd: serviceLength > 0 ? annualHeat / serviceLength : 0,
        clusterBreakdown,
      };
    });

    this.phaseCompositionOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row: any = compositionRows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.year}</strong>`,
            `New cluster nodes: ${row.clusters || 0}`,
            `New individual buildings: ${row.buildings || 0}`,
            `Buildings represented: ${row.representedBuildings || 0}`,
            `Added heat: ${this.formatPlainCompact(row.addedHeatKw || 0)} kW`,
            `Phase CAPEX: ${this.formatCompact(row.capexCad || 0)}`,
            `Average LHD: ${Number(row.averageLhd || 0).toFixed(2)} MWh/m/year`,
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 82, right: 88, top: 76, bottom: years.length > 8 ? 86 : 54, containLabel: true },
      dataZoom: years.length > 8 ? [
        { type: 'slider', height: 22, bottom: 18, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: compositionRows.map(row => row.year), axisLabel: { fontWeight: 900, hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'Count', nameGap: 40, axisLabel: { fontWeight: 800 } },
        { type: 'value', name: 'Heat / cost', nameGap: 46, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
      ],
      series: [
        { name: 'New cluster nodes', type: 'bar', stack: 'nodes', barMaxWidth: 44, data: compositionRows.map(row => row.clusters), itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] } },
        { name: 'New individual buildings', type: 'bar', stack: 'nodes', barMaxWidth: 44, data: compositionRows.map(row => row.buildings), itemStyle: { color: '#0ea5e9', borderRadius: [4, 4, 0, 0] } },
        { name: 'Buildings represented', type: 'line', smooth: true, symbolSize: 9, data: compositionRows.map(row => row.representedBuildings), itemStyle: { color: '#f97316' }, lineStyle: { width: 4 } },
        { name: 'Added heat kW', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'diamond', symbolSize: 9, data: compositionRows.map(row => row.addedHeatKw), itemStyle: { color: '#16a34a' }, lineStyle: { width: 4 } },
      ],
    };

    const cumulativeBuildings: number[] = [];
    let runningBuildings = 0;
    compositionRows.forEach(row => {
      runningBuildings += Number(row.representedBuildings || 0);
      cumulativeBuildings.push(runningBuildings);
    });
    const hasBuildingAdds = compositionRows.some(row => Number(row.representedBuildings || 0) > 0);
    this.buildingsAddedOption = {
      backgroundColor: '#ffffff',
      title: hasBuildingAdds ? undefined : {
        text: 'No buildings added in this scenario',
        subtext: 'The selected phase plan did not connect new building or cluster candidates.',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#111827', fontWeight: 950, fontSize: 22 },
        subtextStyle: { color: '#64748b', fontWeight: 850, fontSize: 14 },
      },
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row: any = compositionRows[params?.[0]?.dataIndex] || {};
          const clusterLines = (row.clusterBreakdown || [])
            .slice(0, 8)
            .map((cluster: any) => `${cluster.name}: ${Number(cluster.buildingCount || 0).toLocaleString()} buildings`);
          const hiddenCount = Math.max(Number(row.clusterBreakdown?.length || 0) - clusterLines.length, 0);
          return [
            `<strong>${row.year}</strong>`,
            `Buildings added: ${Number(row.representedBuildings || 0).toLocaleString()}`,
            `Cluster nodes added: ${Number(row.clusters || 0).toLocaleString()}`,
            `Individual buildings added: ${Number(row.buildings || 0).toLocaleString()}`,
            `Added peak heat: ${this.formatPlainCompact(row.addedHeatKw || 0)} kW`,
            `Phase CAPEX: ${this.formatCompact(row.capexCad || 0)}`,
            clusterLines.length ? '<strong>Selected clusters</strong>' : '',
            ...clusterLines,
            hiddenCount ? `+${hiddenCount} more clusters` : '',
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 88, right: 92, top: 78, bottom: years.length > 8 ? 86 : 54, containLabel: true },
      dataZoom: years.length > 8 ? [
        { type: 'slider', height: 22, bottom: 18, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: compositionRows.map(row => row.year), axisLabel: { fontWeight: 900, hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'Buildings', nameGap: 42, axisLabel: { fontWeight: 800 } },
        { type: 'value', name: 'Cluster nodes', nameGap: 46, axisLabel: { fontWeight: 800 } },
      ],
      series: [
        {
          name: 'Buildings added',
          type: 'bar',
          barMaxWidth: 48,
          data: compositionRows.map((row, index) => ({
            value: Number(row.representedBuildings || 0),
            itemStyle: { color: this.phaseColors[index % this.phaseColors.length], borderRadius: [5, 5, 0, 0] },
          })),
          label: {
            show: true,
            position: 'top',
            color: '#111827',
            fontWeight: 950,
            formatter: (param: any) => `${Number(param.value || 0).toLocaleString()}`,
          },
        },
        {
          name: 'Cumulative buildings',
          type: 'line',
          smooth: true,
          symbolSize: 9,
          data: cumulativeBuildings,
          itemStyle: { color: '#dc2626' },
          lineStyle: { width: 4 },
        },
        {
          name: 'Cluster nodes added',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 10,
          data: compositionRows.map(row => row.clusters),
          itemStyle: { color: '#0f172a' },
          lineStyle: { width: 3, type: 'dashed' },
        },
      ],
    };

    const selectedYears = Array.from(new Set(selectedRows.map(row => row.selectedYear))).sort((a, b) => a - b);
    const phaseColorMap = new Map<number, string>();
    selectedYears.forEach((year, index) => phaseColorMap.set(Number(year), this.phaseColors[index % this.phaseColors.length]));
    const frontierGroups = [
      ...selectedYears.map(year => ({
        name: `Selected ${year}`,
        rows: candidateRows.filter(row => Number(row.selectedYear) === Number(year)),
        color: phaseColorMap.get(Number(year)) || '#2563eb',
      })),
      {
        name: 'Eligible waiting',
        rows: candidateRows.filter(row => !row.selectedYear && !row.rejected),
        color: '#94a3b8',
      },
      {
        name: 'Screened out',
        rows: candidateRows.filter(row => row.rejected),
        color: '#dc2626',
      },
    ].filter(group => group.rows.length);

    const params = data?.parameters || {};
    this.phaseSelectionFrontierOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const row = params.data?.row || {};
          return [
            `<strong>${row.name || 'Candidate'}</strong>`,
            row.selectedYear ? `Selected phase: ${row.selectedYear}` : row.rejected ? 'Screened out' : 'Eligible waiting',
            row.candidateType === 'cluster' ? `Buildings represented: ${row.buildingCount || 0}` : '',
            `Distance / service length: ${this.formatPlainCompact(row.distanceM || 0)} m`,
            `Linear heat density: ${Number(row.lhd || 0).toFixed(2)} MWh/m/year`,
            `Peak heat: ${this.formatPlainCompact(row.peakHeatKw || 0)} kW`,
            `CAPEX: ${this.formatCompact(row.capex || 0)}`,
            row.reason ? `Reason: ${row.reason}` : '',
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 90, right: 46, top: 82, bottom: 78, containLabel: true },
      dataZoom: [
        { type: 'slider', height: 22, bottom: 24, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0 },
      ],
      xAxis: {
        type: 'value',
        name: 'Distance / service length (m)',
        nameLocation: 'middle',
        nameGap: 44,
        axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 },
      },
      yAxis: {
        type: 'value',
        name: 'Linear heat density',
        nameGap: 50,
        axisLabel: { fontWeight: 800 },
      },
      series: frontierGroups.map(group => ({
        name: group.name,
        type: 'scatter',
        data: group.rows.map(row => ({ value: [row.distanceM, row.lhd], row })),
        symbolSize: (_value: any, params: any) => {
          const buildingCount = Number(params?.data?.row?.buildingCount || 1);
          const heat = Number(params?.data?.row?.peakHeatKw || 0);
          return Math.max(8, Math.min(42, 8 + Math.sqrt(buildingCount) * 1.4 + Math.log10(heat + 10) * 3.5));
        },
        itemStyle: { color: group.color, opacity: 0.84, borderColor: '#ffffff', borderWidth: 1.7 },
        emphasis: { focus: 'series', scale: 1.22 },
        markLine: group === frontierGroups[0] ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#0f172a', width: 2, type: 'dashed' },
          label: { color: '#0f172a', fontWeight: 900 },
          data: [
            { name: 'Max distance', xAxis: Number(params.max_distance_m || this.maxDistanceM || 0) },
            { name: 'Min heat density', yAxis: Number(params.min_linear_heat_density_mwh_per_m_year || this.minLinearHeatDensity || 0) },
          ],
        } : undefined,
      })),
    };
  }

  private planningYearsForData(data: any): number[] {
    const periodYears = (data?.periods || [])
      .map((period: any) => Number(period.year))
      .filter((year: number) => Number.isFinite(year));
    if (periodYears.length) return periodYears;
    const resultYears = (data?.results || [])
      .map((row: any) => Number(row.year))
      .filter((year: number) => Number.isFinite(year));
    return Array.from(new Set<number>(resultYears)).sort((a: number, b: number) => a - b);
  }

  private activeScenarioName(data: any): string {
    return this.selectedScenarioName || (data?.scenarios || [])?.[0]?.name || '';
  }

  private activeScenarioSelection(data: any): { selectedKeys: Set<string>; selectedYearByKey: Map<string, number>; results: any[] } {
    const scenario = this.activeScenarioName(data);
    const results = (data?.results || []).filter((row: any) => !scenario || row.scenario === scenario);
    const selectedKeys = new Set<string>();
    const selectedYearByKey = new Map<string, number>();
    results
      .filter((row: any) => row.node_connected || row.node_newly_connected)
      .forEach((row: any) => {
        const year = Number(row.year);
        this.candidateKeys(row).forEach(key => {
          selectedKeys.add(key);
          if (row.node_newly_connected && Number.isFinite(year)) {
            const previous = selectedYearByKey.get(key);
            selectedYearByKey.set(key, previous ? Math.min(previous, year) : year);
          }
        });
      });
    return { selectedKeys, selectedYearByKey, results };
  }

  private selectedYearForCandidate(candidate: any, selectedYearByKey: Map<string, number>): number | null {
    for (const key of this.candidateKeys(candidate)) {
      const year = selectedYearByKey.get(key);
      if (year) return year;
    }
    return null;
  }

  private candidateLookup(candidates: any[]): Map<string, any> {
    const lookup = new Map<string, any>();
    (candidates || []).forEach(candidate => {
      this.candidateKeys(candidate).forEach(key => lookup.set(key, candidate));
    });
    return lookup;
  }

  private candidateKeys(row: any): string[] {
    const keys = [row?.key, row?.candidate_key];
    const type = row?.candidate_type;

    // Candidate rows and phasing result rows both expose an "id", but they do
    // not mean the same thing. On a candidate row, id is the candidate id. On a
    // result row, id is the PhasingResult id and candidate_id is the candidate
    // id. Keeping those separate prevents one scenario's result row from being
    // mistaken for another scenario's candidate selection.
    const isResultRow =
      row?.candidate_id !== undefined ||
      row?.result_id !== undefined ||
      row?.node_connected !== undefined ||
      row?.node_newly_connected !== undefined ||
      row?.scenario !== undefined ||
      row?.year !== undefined;

    const typedIds = [
      row?.candidate_id,
      isResultRow ? null : row?.id,
      row?.building,
      row?.cluster,
      row?.building_id,
      row?.cluster_id,
    ].filter(value => value !== null && value !== undefined && value !== '');
    if (type) {
      typedIds.forEach(value => keys.push(`${type}:${value}`));
    }
    keys.push(row?.candidate_id, isResultRow ? null : row?.id, row?.candidate_name, row?.name);
    return Array.from(new Set(keys.filter(value => value !== null && value !== undefined && value !== '').map(value => String(value))));
  }

  private primaryCandidateKey(row: any): string {
    return this.candidateKeys(row)[0] || '';
  }

  private lookupCandidateMeta(lookup: Map<string, any>, row: any): any {
    for (const key of this.candidateKeys(row)) {
      const candidate = lookup.get(key);
      if (candidate) return candidate;
    }
    return null;
  }

  private enrichedCandidateRows(data: any, _lookup: Map<string, any>, selectedYearByKey: Map<string, number>, activeResults: any[]): any[] {
    const resultReasonByKey = new Map<string, string>();
    activeResults.forEach((result: any) => {
      const key = this.primaryCandidateKey(result);
      if (key && result.reason && !resultReasonByKey.has(key)) {
        resultReasonByKey.set(key, result.reason);
      }
    });

    return (data?.candidates || []).map((candidate: any) => {
      const key = this.primaryCandidateKey(candidate);
      const selectedYear = selectedYearByKey.get(key) || Number(candidate.selected_year || candidate.selectedYear || 0) || null;
      const peakHeatKw = Number(candidate.peak_heat_kw || candidate.available_heat_kw || 0);
      const capex = Number(candidate.estimated_connection_cost_cad || 0);
      const annualMwh = Number(candidate.annual_heat_mwh || 0);
      const distanceM = Number(candidate.connection_length_m || candidate.distance_to_trunk_m || 0);
      const buildingCount = this.candidateBuildingCount(candidate);
      return {
        key,
        name: candidate.name || candidate.candidate_name || 'Candidate',
        shortName: this.truncateLabel(candidate.name || candidate.candidate_name || 'Candidate', 30),
        candidateType: candidate.candidate_type,
        role: candidate.candidate_role,
        selectedYear,
        rejected: candidate.status === 'rejected',
        reason: resultReasonByKey.get(key) || candidate.rejection_reason || '',
        peakHeatKw,
        annualMwh,
        capex,
        distanceM,
        lhd: Number(candidate.linear_heat_density_mwh_per_m_year || 0),
        score: Number(candidate.suitability_score || 0),
        buildingCount,
      };
    }).filter((row: any) => row.key);
  }

  private updateCandidateSensitivityCharts(data: any): void {
    const candidates = data?.candidates || [];
    const params = data?.parameters || {};
    const maxDistance = Number(params.max_distance_m || this.maxDistanceM || 0);
    const minLhd = Number(params.min_linear_heat_density_mwh_per_m_year || this.minLinearHeatDensity || 0);
    const unlimitedHeat = !!(params.available_heat_is_unlimited || params.assume_unlimited_available_heat || this.assumeUnlimitedAvailableHeat);
    const activeSelection = this.activeScenarioSelection(data);
    const rows = candidates
      .filter((candidate: any) => Number.isFinite(Number(candidate.linear_heat_density_mwh_per_m_year)))
      .map((candidate: any) => {
        const peakHeatKw = Number(candidate.peak_heat_kw || candidate.available_heat_kw || 0);
        const capex = Number(candidate.estimated_connection_cost_cad || 0);
        const annualMwh = Number(candidate.annual_heat_mwh || 0);
        const lengthM = Number(candidate.connection_length_m || candidate.distance_to_trunk_m || 0);
        const distanceM = Number(candidate.distance_to_trunk_m || candidate.connection_length_m || 0);
        const hydraulics = candidate.reference_hydraulic_economics || candidate.metadata?.reference_hydraulic_economics || {};
        const key = candidate.key || candidate.id;
        const selected = this.candidateKeys(candidate).some(candidateKey => activeSelection.selectedKeys.has(candidateKey));
        return {
          key,
          id: candidate.id,
          name: candidate.name || 'Candidate',
          shortName: this.truncateLabel(candidate.name || 'Candidate', 26),
          candidateType: candidate.candidate_type,
          buildingCount: this.candidateBuildingCount(candidate),
          role: candidate.candidate_role,
          selected,
          selectedYear: this.selectedYearForCandidate(candidate, activeSelection.selectedYearByKey),
          rejected: candidate.status === 'rejected',
          rejectionReason: candidate.rejection_reason,
          peakHeatKw,
          annualMwh,
          lengthM,
          distanceM,
          capex,
          lhd: Number(candidate.linear_heat_density_mwh_per_m_year || 0),
          score: Number(candidate.suitability_score || 0),
          capexPerKw: peakHeatKw > 0 ? capex / peakHeatKw : 0,
          capexPerAnnualMwh: annualMwh > 0 ? capex / annualMwh : 0,
          diameterMm: Number(hydraulics.diameter_m || candidate.estimated_diameter_m || 0) * 1000,
          massFlowKgS: Number(hydraulics.mass_flow_kg_s || candidate.mass_flow_kg_s || 0),
          pumpPowerKw: Number(hydraulics.pump_power_kw || candidate.pump_power_kw || 0),
        };
      });

    const candidateByKey = new Map(rows.map(row => [String(row.key), row]));
    const candidateById = new Map(rows.map(row => [String(row.id), row]));
    const decisionRows = this.phaseDecisionRows
      .map((result: any) => {
        const candidate =
          candidateByKey.get(String(result.candidate_key)) ||
          candidateById.get(String(result.candidate_id)) ||
          rows.find(row => row.name === result.candidate_name);
        if (!candidate) return null;
        const connected = !!result.node_connected;
        const netBenefit = Number(result.discounted_net_benefit_cad || 0);
        return {
          ...candidate,
          selected: connected,
          newly: !!result.node_newly_connected,
          rejected: !connected,
          netBenefit,
          reason: result.reason || candidate.rejectionReason || (connected ? 'Selected' : 'Not selected in this phase'),
        };
      })
      .filter(Boolean);
    const phaseRows = (decisionRows.length ? decisionRows : rows)
      .sort((a: any, b: any) => Number(b.selected) - Number(a.selected) || Number(b.score) - Number(a.score) || Number(a.distanceM) - Number(b.distanceM));

    const totalCandidates = rows.length;
    const passesDistance = rows.filter(row => !maxDistance || row.distanceM <= maxDistance).length;
    const passesDensity = rows.filter(row => (!maxDistance || row.distanceM <= maxDistance) && (!minLhd || row.lhd >= minLhd)).length;
    const eligibleCandidates = rows.filter(row => !row.rejected).length;
    const selectedCandidates = rows.filter(row => row.selected).length;
    const rejectedCandidates = rows.filter(row => row.rejected).length;
    const funnelStages = [
      { name: 'Candidate pool', value: totalCandidates, color: '#475569' },
      { name: 'Within distance', value: passesDistance, color: '#2563eb' },
      { name: 'Meets heat density', value: passesDensity, color: '#0f766e' },
      { name: 'Eligible after screening', value: eligibleCandidates, color: '#16a34a' },
      { name: 'Selected by phasing', value: selectedCandidates, color: '#f97316' },
      { name: 'Rejected', value: rejectedCandidates, color: '#dc2626' },
    ];
    this.selectionFunnelOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const param = params?.[0] || {};
          const value = Number(param.value || 0);
          const share = totalCandidates ? (value / totalCandidates) * 100 : 0;
          return `<strong>${param.name}</strong><br>${value} candidates<br>${share.toFixed(0)}% of candidate pool`;
        },
      },
      grid: { left: 170, right: 76, top: 28, bottom: 46, containLabel: true },
      xAxis: { type: 'value', name: 'Candidates', nameGap: 32, axisLabel: { fontWeight: 800 } },
      yAxis: { type: 'category', inverse: true, data: funnelStages.map(stage => stage.name), axisLabel: { fontWeight: 900 } },
      series: [{
        name: 'Candidates',
        type: 'bar',
        barWidth: 24,
        data: funnelStages.map(stage => ({
          value: stage.value,
          itemStyle: { color: stage.color, borderRadius: [0, 5, 5, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          color: '#111827',
          fontWeight: 950,
          formatter: (param: any) => `${Number(param.value || 0).toLocaleString()}`,
        },
      }],
    };

    const statusGroups = [
      { name: 'Selected', rows: rows.filter(row => row.selected), color: '#16a34a' },
      { name: 'Eligible', rows: rows.filter(row => !row.selected && !row.rejected), color: '#2563eb' },
      { name: 'Rejected', rows: rows.filter(row => row.rejected), color: '#94a3b8' },
    ];

    this.candidateEconomicsOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const row = params.data?.row || {};
          return [
            `<strong>${row.name}</strong>`,
            row.selectedYear ? `Selected phase: ${row.selectedYear}` : row.rejected ? 'Screened out' : 'Eligible in active scenario',
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
            `Linear heat density: ${row.lhd.toFixed(2)} MWh/m/year`,
            `Connection CAPEX: ${this.formatCompact(row.capex)}`,
            `CAPEX per kW: ${this.formatCompact(row.capexPerKw)}/kW`,
            `Peak heat: ${this.formatPlainCompact(row.peakHeatKw)} kW`,
            `Length: ${this.formatPlainCompact(row.lengthM)} m`,
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 96, right: 42, top: 76, bottom: 74, containLabel: true },
      dataZoom: [
        { type: 'slider', height: 22, bottom: 24, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0 },
      ],
      xAxis: { type: 'value', name: 'Linear heat density (MWh/m/year)', nameLocation: 'middle', nameGap: 44, axisLabel: { fontWeight: 800 } },
      yAxis: { type: 'value', name: 'CAPEX per kW', nameGap: 56, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
      series: statusGroups.map(group => ({
        name: group.name,
        type: 'scatter',
        data: group.rows.map(row => ({ value: [row.lhd, row.capexPerKw], row })),
        symbolSize: (_value: any, params: any) => {
          const heat = Number(params?.data?.row?.peakHeatKw || 0);
          const buildingCount = Number(params?.data?.row?.buildingCount || 1);
          return Math.max(8, Math.min(36, 8 + Math.log10(heat + 10) * 4 + Math.sqrt(buildingCount)));
        },
        itemStyle: { color: group.color, opacity: 0.82, borderColor: '#ffffff', borderWidth: 1.5 },
        emphasis: { focus: 'series', scale: 1.25 },
        markLine: group.name === 'Selected' ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#dc2626', width: 2, type: 'dashed' },
          label: { show: false },
          data: [
            { name: 'Minimum LHD', xAxis: minLhd },
          ],
        } : undefined,
      })),
    };

    this.candidateHydraulicsOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const row = params.data?.row || {};
          return [
            `<strong>${row.name}</strong>`,
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
            `Peak heat: ${this.formatPlainCompact(row.peakHeatKw)} kW`,
            `Mass flow: ${row.massFlowKgS.toFixed(2)} kg/s`,
            `Estimated diameter: ${row.diameterMm.toFixed(0)} mm`,
            `Pump power: ${row.pumpPowerKw.toFixed(2)} kW`,
            `Connection length: ${this.formatPlainCompact(row.lengthM)} m`,
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 90, right: 52, top: 76, bottom: 92, containLabel: true },
      dataZoom: [
        { type: 'slider', height: 22, bottom: 44, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0 },
      ],
      xAxis: { type: 'value', name: 'Peak heat demand (kW)', nameLocation: 'middle', nameGap: 44, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
      yAxis: { type: 'value', name: 'Estimated service diameter (mm)', nameGap: 52, axisLabel: { fontWeight: 800 } },
      visualMap: {
        type: 'continuous',
        min: 0,
        max: Math.max(...rows.map(row => row.pumpPowerKw), 1),
        dimension: 2,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        text: ['Higher pump', 'Lower pump'],
        textStyle: { color: '#334155', fontWeight: 800 },
        inRange: { color: ['#0ea5e9', '#f97316', '#dc2626'] },
      },
      series: [{
        name: 'Candidates',
        type: 'scatter',
        data: rows.map(row => ({ value: [row.peakHeatKw, row.diameterMm, row.pumpPowerKw], row })),
        symbolSize: (_value: any, params: any) => {
          const length = Number(params?.data?.row?.lengthM || 0);
          const buildingCount = Number(params?.data?.row?.buildingCount || 1);
          return Math.max(8, Math.min(38, 8 + Math.log10(length + 10) * 4 + Math.sqrt(buildingCount)));
        },
        itemStyle: { opacity: 0.86, borderColor: '#ffffff', borderWidth: 1.5 },
        emphasis: { focus: 'series', scale: 1.25 },
      }],
    };

    const gateRows = phaseRows.slice(0, 18);
    const gates = ['Distance', 'LHD', 'Heat', 'Value', 'Decision'];
    const gateData = gateRows.flatMap((row: any, rowIndex: number) => {
      const distancePass = !maxDistance || row.distanceM <= maxDistance;
      const densityPass = !minLhd || row.lhd >= minLhd;
      const heatPass = row.role === 'source' || unlimitedHeat || row.selected || !String(row.reason || '').toLowerCase().includes('heat');
      const valuePass = row.selected || row.netBenefit > 0 || row.score >= 50;
      const statuses = [
        { status: distancePass ? 2 : 0, detail: distancePass ? 'Within distance threshold' : 'Too far from trunk' },
        { status: densityPass ? 2 : 0, detail: densityPass ? 'Meets linear heat density' : 'Below linear heat density' },
        { status: heatPass ? 2 : 1, detail: heatPass ? 'Heat constraint satisfied or unlimited' : 'Heat availability needs review' },
        { status: valuePass ? 2 : 1, detail: valuePass ? 'Positive decision value or strong score' : 'Weak economic signal' },
        { status: row.selected ? 2 : 0, detail: row.selected ? (row.newly ? 'Selected in this phase' : 'Selected in an earlier phase') : (row.reason || 'Not selected') },
      ];
      return statuses.map((status, gateIndex) => ({
        value: [gateIndex, rowIndex, status.status],
        row,
        gate: gates[gateIndex],
        detail: status.detail,
      }));
    });
    this.phaseGateMatrixOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'item',
        padding: 12,
        confine: true,
        formatter: (params: any) => {
          const row = params.data?.row || {};
          return [
            `<strong>${row.name}</strong>`,
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
            `${params.data?.gate}: ${params.data?.detail}`,
            `Distance: ${this.formatPlainCompact(row.distanceM || 0)} m`,
            `LHD: ${Number(row.lhd || 0).toFixed(2)} MWh/m/year`,
            `Score: ${Number(row.score || 0).toFixed(1)}`,
            `Reason: ${row.reason || row.rejectionReason || '-'}`,
          ].filter(Boolean).join('<br>');
        },
      },
      grid: { left: 190, right: 32, top: 58, bottom: 34, containLabel: true },
      xAxis: { type: 'category', data: gates, axisLabel: { fontWeight: 950, interval: 0 } },
      yAxis: { type: 'category', inverse: true, data: gateRows.map((row: any) => row.shortName), axisLabel: { fontWeight: 850, width: 160, overflow: 'truncate' } },
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 2,
        pieces: [
          { value: 0, color: '#fee2e2' },
          { value: 1, color: '#fef3c7' },
          { value: 2, color: '#dcfce7' },
        ],
      },
      series: [{
        name: 'Decision gates',
        type: 'heatmap',
        data: gateData,
        label: {
          show: true,
          color: '#111827',
          fontWeight: 950,
          formatter: (params: any) => {
            const value = Number(params.value?.[2] || 0);
            if (value === 2) return 'OK';
            if (value === 1) return '?';
            return 'NO';
          },
        },
        itemStyle: { borderColor: '#ffffff', borderWidth: 3, borderRadius: 5 },
        emphasis: { itemStyle: { borderColor: '#0f172a', borderWidth: 2 } },
      }],
    };

    const driverRows = phaseRows.slice(0, 12);
    const heatValues = driverRows.map((row: any) => row.peakHeatKw);
    const costValues = driverRows.map((row: any) => row.capexPerKw).filter((value: number) => value > 0);
    const maxHeat = Math.max(...heatValues, 1);
    const minCost = costValues.length ? Math.min(...costValues) : 0;
    const maxCost = costValues.length ? Math.max(...costValues) : 1;
    const driverData = driverRows.map((row: any) => ({
      ...row,
      distanceDriver: maxDistance > 0 ? Math.max(0, Math.min(100, (1 - row.distanceM / maxDistance) * 100)) : 0,
      densityDriver: minLhd > 0 ? Math.max(0, Math.min(100, (row.lhd / (minLhd * 3)) * 100)) : Math.max(0, Math.min(100, row.lhd)),
      heatDriver: Math.max(0, Math.min(100, (row.peakHeatKw / maxHeat) * 100)),
      costDriver: maxCost > minCost && row.capexPerKw > 0
        ? Math.max(0, Math.min(100, ((maxCost - row.capexPerKw) / (maxCost - minCost)) * 100))
        : 50,
    }));
    const driverSeries = [
      { key: 'distanceDriver', name: 'Trunk proximity', color: '#2563eb' },
      { key: 'densityDriver', name: 'Heat density', color: '#16a34a' },
      { key: 'heatDriver', name: 'Load size', color: '#f97316' },
      { key: 'costDriver', name: 'Cost efficiency', color: '#7c3aed' },
    ];
    this.phaseDriverBalanceOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = driverData[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.name}</strong>`,
            row.candidateType === 'cluster' ? `Buildings in cluster: ${row.buildingCount || 0}` : '',
            row.selected ? (row.newly ? 'Decision: selected in this phase' : 'Decision: already selected') : 'Decision: rejected',
            `Score: ${Number(row.score || 0).toFixed(1)}`,
            `Distance: ${this.formatPlainCompact(row.distanceM || 0)} m`,
            `LHD: ${Number(row.lhd || 0).toFixed(2)} MWh/m/year`,
            `CAPEX per kW: ${this.formatCompact(row.capexPerKw || 0)}`,
            `Reason: ${row.reason || row.rejectionReason || '-'}`,
          ].filter(Boolean).join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 190, right: 54, top: 76, bottom: 50, containLabel: true },
      xAxis: { type: 'value', name: 'Relative driver strength', max: 400, axisLabel: { fontWeight: 800 } },
      yAxis: { type: 'category', inverse: true, data: driverData.map((row: any) => row.shortName), axisLabel: { fontWeight: 850, width: 160, overflow: 'truncate' } },
      series: driverSeries.map(series => ({
        name: series.name,
        type: 'bar',
        stack: 'driver',
        barWidth: 22,
        data: driverData.map((row: any) => Number(row[series.key] || 0)),
        itemStyle: { color: series.color, borderRadius: [3, 3, 3, 3] },
      })),
    };

    const clusterRows = phaseRows
      .filter((row: any) => row.candidateType === 'cluster' || Number(row.buildingCount || 0) > 1)
      .sort((a: any, b: any) => Number(b.selected) - Number(a.selected) || Number(b.buildingCount || 0) - Number(a.buildingCount || 0))
      .slice(0, 16);
    this.clusterScaleOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      title: clusterRows.length ? undefined : {
        text: 'No cluster candidates in this phasing view',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#64748b', fontWeight: 900, fontSize: 18 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = clusterRows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.name || 'Cluster'}</strong>`,
            `Buildings in cluster: ${row.buildingCount || 0}`,
            row.selected ? (row.newly ? 'Decision: selected in this phase' : 'Decision: already selected') : 'Decision: rejected',
            `Peak heat: ${this.formatPlainCompact(row.peakHeatKw || 0)} kW`,
            `LHD: ${Number(row.lhd || 0).toFixed(2)} MWh/m/year`,
            `Distance: ${this.formatPlainCompact(row.distanceM || 0)} m`,
            `Score: ${Number(row.score || 0).toFixed(1)}`,
          ].join('<br>');
        },
      },
      legend: clusterRows.length ? { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } } : undefined,
      grid: { left: 190, right: 76, top: 76, bottom: 54, containLabel: true },
      xAxis: [
        { type: 'value', name: 'Buildings in cluster', nameGap: 38, axisLabel: { fontWeight: 800 } },
        { type: 'value', name: 'Linear heat density', position: 'top', nameGap: 36, axisLabel: { fontWeight: 800 } },
      ],
      yAxis: { type: 'category', inverse: true, data: clusterRows.map((row: any) => row.shortName), axisLabel: { fontWeight: 850, width: 160, overflow: 'truncate' } },
      series: [
        {
          name: 'Buildings',
          type: 'bar',
          barWidth: 22,
          data: clusterRows.map((row: any) => ({
            value: Number(row.buildingCount || 0),
            itemStyle: {
              color: row.selected ? '#16a34a' : '#dc2626',
              borderRadius: [0, 5, 5, 0],
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: '#111827',
            fontWeight: 950,
            formatter: (param: any) => `${Number(param.value || 0).toLocaleString()}`,
          },
        },
        {
          name: 'Linear heat density',
          type: 'scatter',
          xAxisIndex: 1,
          symbol: 'diamond',
          symbolSize: 16,
          data: clusterRows.map((row: any, index: number) => [Number(row.lhd || 0), index]),
          itemStyle: { color: '#2563eb', borderColor: '#ffffff', borderWidth: 2 },
        },
      ],
    };
  }

  private comparisonPhaseRow(report: any, phase: any, index: number): any {
    const candidates = phase?.candidates || [];
    const consumerCandidates = candidates.filter((candidate: any) => candidate.candidate_role !== 'source');
    const annualMwh = consumerCandidates.reduce((total: number, candidate: any) => total + Number(candidate.annual_heat_mwh || 0), 0);
    const lengthM = candidates.reduce((total: number, candidate: any) => {
      return total + Number(candidate.connection_length_m || candidate.service_route_distance_m || candidate.distance_to_trunk_m || 0);
    }, 0);
    const scoreSum = candidates.reduce((total: number, candidate: any) => total + Number(candidate.suitability_score || 0), 0);
    const studyId = report?.id || `current-${report?.base_network?.id || 'preview'}`;
    const key = `${studyId}:${phase.year}:${phase.output_network_id || index}`;
    const capex = Number(phase.capex_cad || 0);
    const addedHeatKw = Number(phase.added_heat_kw || 0);
    return {
      key,
      study_id: studyId,
      study_name: report?.name || 'Current phasing result',
      year: Number(phase.year || 0),
      label: phase.label || `${phase.year}`,
      short_label: this.truncateLabel(`${phase.label || phase.year}`, 18),
      output_network_id: phase.output_network_id,
      new_connections: Number(phase.new_connections || candidates.length || 0),
      added_heat_kw: addedHeatKw,
      cumulative_heat_kw: Number(phase.cumulative_heat_kw || 0),
      phase_capex_cad: capex,
      cumulative_capex_cad: Number(phase.cumulative_capex_cad || capex),
      service_length_m: lengthM,
      annual_heat_mwh: annualMwh,
      avg_lhd: lengthM > 0 ? annualMwh / lengthM : 0,
      capex_per_kw: addedHeatKw > 0 ? capex / addedHeatKw : 0,
      capex_per_annual_mwh: annualMwh > 0 ? capex / annualMwh : 0,
      avg_score: candidates.length ? scoreSum / candidates.length : 0,
    };
  }

  private updatePhaseComparisonCharts(): void {
    const rows = this.selectedComparisonRows;
    const labels = rows.map(row => `${this.truncateLabel(row.study_name, 18)}\n${row.short_label || row.label || row.year}`);
    this.phaseComparisonOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.study_name}</strong>`,
            `${row.label || row.year}`,
            `Output network: ${row.output_network_id || '-'}`,
            `New connections: ${row.new_connections}`,
            `Added heat: ${this.formatPlainCompact(row.added_heat_kw)} kW`,
            `Phase CAPEX: ${this.formatCompact(row.phase_capex_cad)}`,
            `Cumulative CAPEX: ${this.formatCompact(row.cumulative_capex_cad)}`,
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 96, right: 86, top: 76, bottom: rows.length > 5 ? 116 : 84, containLabel: true },
      dataZoom: rows.length > 5 ? [
        { type: 'slider', height: 22, bottom: 24, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: rows.length > 5 ? 24 : 0, fontWeight: 800, width: 120, overflow: 'truncate' } },
      yAxis: [
        { type: 'value', name: 'Cost (CAD)', nameGap: 54, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
        { type: 'value', name: 'Heat / count', nameGap: 48, axisLabel: { formatter: (value: number) => this.formatPlainCompact(value), fontWeight: 800 } },
      ],
      series: [
        { name: 'Phase CAPEX', type: 'bar', barMaxWidth: 42, data: rows.map(row => row.phase_capex_cad), itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] } },
        { name: 'Cumulative CAPEX', type: 'bar', barMaxWidth: 42, data: rows.map(row => row.cumulative_capex_cad), itemStyle: { color: '#475569', borderRadius: [4, 4, 0, 0] } },
        { name: 'Cumulative heat kW', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 8, data: rows.map(row => row.cumulative_heat_kw), itemStyle: { color: '#f97316' }, lineStyle: { width: 4 } },
        { name: 'New connections', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 8, data: rows.map(row => row.new_connections), itemStyle: { color: '#16a34a' }, lineStyle: { width: 4 } },
      ],
    };

    this.phaseEfficiencyOption = {
      backgroundColor: '#ffffff',
      textStyle: { color: '#334155', fontFamily: 'Arial, sans-serif' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 12,
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params?.[0]?.dataIndex] || {};
          return [
            `<strong>${row.study_name}</strong>`,
            `${row.label || row.year}`,
            `Service length: ${this.formatPlainCompact(row.service_length_m)} m`,
            `Linear heat density: ${row.avg_lhd.toFixed(2)} MWh/m/year`,
            `CAPEX per annual MWh: ${this.formatCompact(row.capex_per_annual_mwh)}`,
            `Average score: ${row.avg_score.toFixed(1)}`,
          ].join('<br>');
        },
      },
      legend: { top: 4, type: 'scroll', textStyle: { fontWeight: 800 } },
      grid: { left: 96, right: 88, top: 76, bottom: rows.length > 5 ? 116 : 84, containLabel: true },
      dataZoom: rows.length > 5 ? [
        { type: 'slider', height: 22, bottom: 24, brushSelect: false },
        { type: 'inside' },
      ] : [],
      xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: rows.length > 5 ? 24 : 0, fontWeight: 800, width: 120, overflow: 'truncate' } },
      yAxis: [
        { type: 'value', name: 'Cost intensity', nameGap: 54, axisLabel: { formatter: (value: number) => this.formatCompact(value), fontWeight: 800 } },
        { type: 'value', name: 'LHD / score', nameGap: 48, axisLabel: { formatter: (value: number) => Number(value || 0).toFixed(1), fontWeight: 800 } },
      ],
      series: [
        { name: 'CAPEX per annual MWh', type: 'bar', barMaxWidth: 42, data: rows.map(row => row.capex_per_annual_mwh), itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] } },
        { name: 'CAPEX per kW', type: 'bar', barMaxWidth: 42, data: rows.map(row => row.capex_per_kw), itemStyle: { color: '#0ea5e9', borderRadius: [4, 4, 0, 0] } },
        { name: 'Linear heat density', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 8, data: rows.map(row => row.avg_lhd), itemStyle: { color: '#dc2626' }, lineStyle: { width: 4 } },
        { name: 'Average score', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 8, data: rows.map(row => row.avg_score), itemStyle: { color: '#16a34a' }, lineStyle: { width: 4 } },
      ],
    };
  }

  private restoreActiveOperations(): void {
    this.activeOperations = this.operations.active('network-phasing');
    this.isRunning = this.activeOperations.length > 0;
    if (this.activeOperations.length) {
      this.startTaskPolling();
    } else {
      this.stopTaskPolling();
      this.taskStatus = '';
      this.taskMessage = '';
      this.isRunning = false;
    }
  }

  private startTaskPolling(): void {
    if (this.taskPolling) return;
    this.taskPolling = timer(0, 2500).subscribe(() => {
      this.activeOperations.forEach(operation => this.pollTask(operation.taskId));
    });
  }

  private pollTask(taskId: string): void {
    this.http.get<any>(`${environment.appUrl}/tasks/${taskId}/status/`).subscribe({
      next: (response) => this.handleTaskStatus(response),
      error: () => {
        this.operations.update(taskId, {
          status: 'PENDING',
          message: 'Could not refresh task status. Will retry shortly.',
        });
        this.restoreActiveOperations();
      },
    });
  }

  private handleTaskStatus(response: any): void {
    const state = response?.status || response?.state || 'PENDING';
    const taskId = response?.task_id;
    this.taskStatus = state;
    this.taskMessage = response?.message || response?.meta?.message || 'Network phasing is running.';
    if (taskId) {
      this.operations.update(taskId, { status: state, message: this.taskMessage });
    }

    if (state === 'SUCCESS') {
      const result = response?.result || {};
      if (result.status === 'failed') {
        this.errorMessage = result.error || 'Network phasing failed.';
        this.toastr.danger(this.errorMessage, 'Network Phasing');
      } else if (result.study_id) {
        this.toastr.success('Network phasing study completed.', 'Network Phasing');
        this.loadStudies();
        this.openStudy(result.study_id);
      }
      if (taskId) this.operations.remove(taskId);
      this.restoreActiveOperations();
      return;
    }

    if (state === 'FAILURE') {
      this.errorMessage = response?.error || 'Network phasing failed.';
      this.toastr.danger(this.errorMessage, 'Network Phasing');
      if (taskId) this.operations.remove(taskId);
      this.restoreActiveOperations();
    }
  }

  private stopTaskPolling(): void {
    this.taskPolling?.unsubscribe();
    this.taskPolling = undefined;
  }

  private fitBounds(): void {
    if (typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    const addPoint = (point: any): void => {
      if (Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) {
        bounds.extend({ lat: Number(point.lat), lng: Number(point.lng) });
        hasPoint = true;
      }
    };
    this.mapRoutes.forEach(route => (route.path || []).forEach(addPoint));
    this.visibleCandidatePaths.forEach(path => (path.service_path || []).forEach(addPoint));
    this.phaseConnectionRows.forEach(row => (row.service_path || []).forEach(addPoint));
    this.candidateMapNodes.forEach(node => addPoint(node.position));
    this.phaseMapNodes.forEach(node => addPoint(node.position));
    if (hasPoint) {
      setTimeout(() => {
        this.candidateMap?.fitBounds(bounds);
        this.phaseMap?.fitBounds(bounds);
      }, 100);
    }
  }

  private formatCompact(value: number): string {
    const abs = Math.abs(value || 0);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value}`;
  }

  private formatPlainCompact(value: number): string {
    const abs = Math.abs(value || 0);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return `${Number(value || 0).toFixed(0)}`;
  }

  private truncateLabel(value: string, limit: number): string {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}...` : text;
  }
}
