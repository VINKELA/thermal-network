import { Component, OnInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';

type HydraulicAnalysisMode = 'flow' | 'diameter' | 'temperature' | 'combined';
type HydraulicMetricKey =
  | 'mass_flow_kg_s'
  | 'diameter_mm'
  | 'velocity_m_s'
  | 'pressure_drop_kpa'
  | 'head_loss_m'
  | 'pumping_power_kw'
  | 'required_supply_temperature_c';
type GuideFieldKey =
  | 'peakLoadKw'
  | 'deltaTC'
  | 'returnTempC'
  | 'supplyTempC'
  | 'pumpEfficiencyPct'
  | 'lengthM';

interface HydraulicAnalysisRow {
  label: string;
  peak_load_kw: number;
  served_load_kw: number;
  mass_flow_kg_s: number;
  volume_flow_m3_s?: number;
  volume_flow_m3_h?: number;
  diameter_m?: number;
  diameter_mm: number;
  nominal_dn?: number;
  velocity_m_s: number;
  pressure_drop_pa?: number;
  pressure_drop_kpa: number;
  pressure_drop_pa_per_m: number;
  head_loss_m: number;
  pumping_power_kw: number;
  delta_t_c: number;
  return_temperature_c?: number;
  required_delta_t_c?: number;
  required_supply_temperature_c: number;
  configured_supply_temperature_c: number;
  reynolds_number?: number;
  friction_factor?: number;
  velocity_status?: string;
  pressure_drop_status?: string;
  supply_temperature_status?: string;
}

interface HydraulicAnalysis {
  id: number;
  segment_name: string;
  pipe_sizing_id: number;
  network_id: number;
  length_m: number;
  is_shared_segment?: boolean;
  overlap_count?: number;
  source_route_ids?: number[];
  source_edge_ids?: number[];
  constants: {
    rho_kg_m3: number;
    cp_kj_kg_k: number;
    mu_pa_s: number;
    min_velocity_m_s: number;
    max_velocity_m_s: number;
    target_pressure_drop_pa_m: number;
    pump_efficiency: number;
    supply_temperature_c: number;
    return_temperature_c: number;
  };
  baseline: HydraulicAnalysisRow;
  variations: Record<HydraulicAnalysisMode, HydraulicAnalysisRow[]>;
}

interface MetricOption {
  key: HydraulicMetricKey;
  label: string;
  unit: string;
  color: string;
}

interface DiameterOption {
  label: string;
  dn: number;
  diameterMm: number;
}

interface GuideInputs {
  peakLoadKw: number;
  diameterMm: number;
  deltaTC: number;
  returnTempC: number;
  supplyTempC: number;
  pumpEfficiencyPct: number;
  lengthM: number;
}

interface GuideRange {
  key: GuideFieldKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

interface DesignInsight {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

interface DesignMove {
  label: string;
  outcome: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

interface DiameterTradeoffRow {
  label: string;
  diameterMm: number;
  velocityMS: number;
  pressureGradientPaM: number;
  pumpingPowerKw: number;
  relativePipeArea: number;
  velocityPct: number;
  pressurePct: number;
  pumpPct: number;
  pipeBodyPct: number;
  velocityStatus: string;
  pressureStatus: string;
  isCurrent: boolean;
}

interface FeasibleCombination extends HydraulicAnalysisRow {
  dnLabel: string;
  designScore: number;
}

@Component({
  selector: 'ngx-pipe-section-analysis',
  templateUrl: './pipe-section-analysis.component.html',
  styleUrls: ['./pipe-section-analysis.component.scss'],
})
export class PipeSectionAnalysisComponent implements OnInit {
  analysis: HydraulicAnalysis | null = null;
  isLoading = true;
  error = '';
  analysisMode: HydraulicAnalysisMode = 'combined';
  metricKey: HydraulicMetricKey = 'velocity_m_s';
  responseChartOption: any = {};
  focusedChartOption: any = {};
  guide: GuideInputs = {
    peakLoadKw: 0,
    diameterMm: 20,
    deltaTC: 20,
    returnTempC: 50,
    supplyTempC: 80,
    pumpEfficiencyPct: 75,
    lengthM: 1,
  };
  guideRanges: GuideRange[] = [];
  diameterOptions: DiameterOption[] = [];
  guidedResult: HydraulicAnalysisRow | null = null;
  guideRows: HydraulicAnalysisRow[] = [];
  feasibleCombinations: FeasibleCombination[] = [];
  designVerdict: DesignInsight = {
    label: 'Design diagnosis',
    value: 'Waiting',
    detail: 'Set the design assumptions to read the section constraints.',
    tone: 'neutral',
  };
  designInsights: DesignInsight[] = [];
  designMoves: DesignMove[] = [];
  diameterTradeoffRows: DiameterTradeoffRow[] = [];
  diameterChartOption: any = {};
  temperatureChartOption: any = {};
  chartRefs: Record<string, any> = {};

  readonly analysisModes: Array<{ key: HydraulicAnalysisMode; label: string }> = [
    { key: 'combined', label: 'Design scenarios' },
    { key: 'flow', label: 'Load sensitivity' },
    { key: 'diameter', label: 'DN sensitivity' },
    { key: 'temperature', label: 'Delta T sensitivity' },
  ];

  readonly metricOptions: MetricOption[] = [
    { key: 'mass_flow_kg_s', label: 'Mass flow', unit: 'kg/s', color: '#0891b2' },
    { key: 'velocity_m_s', label: 'Velocity', unit: 'm/s', color: '#2563eb' },
    { key: 'pressure_drop_kpa', label: 'Pressure drop', unit: 'kPa', color: '#dc2626' },
    { key: 'head_loss_m', label: 'Head loss', unit: 'm', color: '#9333ea' },
    { key: 'pumping_power_kw', label: 'Pumping power', unit: 'kW', color: '#f97316' },
    { key: 'required_supply_temperature_c', label: 'Supply temperature', unit: 'C', color: '#047857' },
    { key: 'diameter_mm', label: 'Diameter', unit: 'mm', color: '#475569' },
  ];

  private readonly gravity = 9.80665;
  private sectionId: number | null = null;

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.sectionId = Number.isFinite(id) ? id : null;
    if (!this.sectionId) {
      this.isLoading = false;
      this.error = 'Pipe section id is missing.';
      return;
    }
    this.loadAnalysis();
  }

  get baseline(): HydraulicAnalysisRow | null {
    return this.analysis?.baseline || null;
  }

  get currentRows(): HydraulicAnalysisRow[] {
    return this.feasibleCombinations;
  }

  get selectedMetric(): MetricOption {
    return this.metricOptions.find((metric) => metric.key === this.metricKey) || this.metricOptions[0];
  }

  get selectedModeLabel(): string {
    return `Feasible combinations for ${this.formatNumber(this.guide.peakLoadKw, 0)} kW heat duty`;
  }

  loadAnalysis(): void {
    if (!this.sectionId) return;
    this.isLoading = true;
    this.error = '';
    this.api.get<HydraulicAnalysis | { detail?: string }>(`edge_pipe_sizings/${this.sectionId}/hydraulics/`)
      .subscribe((response) => {
        if ((response as any)?.detail) {
          this.analysis = null;
          this.error = (response as any).detail;
          this.isLoading = false;
          return;
        }
        this.analysis = response as HydraulicAnalysis;
        this.setupGuide();
        this.recalculateGuide();
        this.isLoading = false;
      });
  }

  setAnalysisMode(mode: HydraulicAnalysisMode): void {
    this.analysisMode = mode;
    this.recalculateGuide();
  }

  setMetric(metric: HydraulicMetricKey): void {
    this.metricKey = metric;
    this.buildCharts();
  }

  guideValue(key: GuideFieldKey): number {
    return this.guide[key];
  }

  setGuideValue(key: GuideFieldKey | 'diameterMm', rawValue: number | string): void {
    const next = Number(rawValue);
    if (!Number.isFinite(next)) return;
    (this.guide as any)[key] = key === 'diameterMm' ? next : this.clampGuideValue(key, next);
    this.recalculateGuide();
  }

  resetGuide(): void {
    this.setupGuide();
    this.recalculateGuide();
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
      this.toastr.success('Graph copied as an image.', 'Copied');
    } catch {
      this.downloadChart(dataUrl, filename);
      this.toastr.info('Clipboard image copy was blocked, so the PNG was downloaded.', 'Graph Ready');
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

  metricDigits(key: HydraulicMetricKey): number {
    if (key === 'mass_flow_kg_s' || key === 'velocity_m_s' || key === 'head_loss_m' || key === 'pumping_power_kw') return 2;
    if (key === 'required_supply_temperature_c' || key === 'pressure_drop_kpa') return 1;
    return 0;
  }

  statusLabel(status?: string): string {
    switch (status) {
      case 'high':
        return 'High';
      case 'low':
        return 'Low';
      case 'shortfall':
        return 'Shortfall';
      case 'met':
        return 'Met';
      case 'target':
        return 'Target';
      default:
        return 'Check';
    }
  }

  statusClass(status?: string): string {
    if (status === 'high' || status === 'shortfall') return 'status-high';
    if (status === 'low') return 'status-low';
    if (status === 'target' || status === 'met') return 'status-target';
    return '';
  }

  goBack(): void {
    const pipeSizingId = this.analysis?.pipe_sizing_id || this.route.snapshot.queryParamMap.get('pipe_sizing');
    if (pipeSizingId) {
      this.router.navigate(['/pages/pipe-sizes', pipeSizingId]);
      return;
    }
    this.router.navigate(['/pages/pipe-sizes']);
  }

  private setupGuide(): void {
    if (!this.analysis?.baseline) return;
    const base = this.analysis.baseline;
    const constants = this.analysis.constants || ({} as HydraulicAnalysis['constants']);
    const designLoad = Math.max(Number(base.peak_load_kw || base.served_load_kw || 0), 0);
    const designLength = Math.max(Number(this.analysis.length_m || 0), 1);
    const designDeltaT = Math.max(Number(base.delta_t_c || 20), 1);
    const designReturn = Number(base.return_temperature_c || constants.return_temperature_c || 50);
    const designSupply = Number(base.configured_supply_temperature_c || constants.supply_temperature_c || designReturn + designDeltaT);

    this.guide = {
      peakLoadKw: designLoad,
      diameterMm: Math.max(Number(base.diameter_mm || 20), 1),
      deltaTC: designDeltaT,
      returnTempC: designReturn,
      supplyTempC: designSupply,
      pumpEfficiencyPct: Math.max(Number(constants.pump_efficiency || 0.75) * 100, 1),
      lengthM: designLength,
    };

    this.diameterOptions = this.buildDiameterOptions();
    this.guideRanges = [
      {
        key: 'peakLoadKw',
        label: 'Heat duty',
        unit: 'kW',
        min: Math.max(0, designLoad * 0.5),
        max: Math.max(designLoad * 2, designLoad + 1),
        step: this.smartStep(designLoad),
      },
    ];
  }

  private recalculateGuide(): void {
    if (!this.analysis) return;
    this.guidedResult = this.evaluateGuide('Selected heat duty');
    this.feasibleCombinations = this.buildFeasibleCombinations();
    this.guideRows = this.feasibleCombinations;
    this.buildDesignInsights();
    this.buildCharts();
  }

  private buildDiameterOptions(): DiameterOption[] {
    const rows = this.analysis?.variations?.diameter || [];
    const options = rows
      .map((row) => {
        const diameterMm = Number(row.diameter_mm);
        const dn = Number(row.nominal_dn || Math.round(diameterMm));
        return {
          label: `DN${Math.round(dn || diameterMm)}`,
          dn: Math.round(dn || diameterMm),
          diameterMm,
        };
      })
      .filter((option) => Number.isFinite(option.diameterMm) && option.diameterMm > 0);
    const baselineDiameter = Number(this.analysis?.baseline?.diameter_mm || this.guide.diameterMm);
    if (Number.isFinite(baselineDiameter) && baselineDiameter > 0) {
      options.push({
        label: `DN${Math.round(this.analysis?.baseline?.nominal_dn || baselineDiameter)}`,
        dn: Math.round(this.analysis?.baseline?.nominal_dn || baselineDiameter),
        diameterMm: baselineDiameter,
      });
    }
    const unique = new Map<string, DiameterOption>();
    options.forEach((option) => unique.set(option.diameterMm.toFixed(3), option));
    return Array.from(unique.values()).sort((a, b) => a.diameterMm - b.diameterMm);
  }

  private buildFeasibleCombinations(): FeasibleCombination[] {
    if (!this.analysis) return [];
    const constants = this.analysis.constants;
    const minVelocity = Number(constants.min_velocity_m_s || 0.5);
    const maxVelocity = Number(constants.max_velocity_m_s || 2.5);
    const targetDrop = Number(constants.target_pressure_drop_pa_m || 100);
    const currentDiameter = Math.max(Number(this.guide.diameterMm || this.analysis.baseline?.diameter_mm || 1), 1);

    const rows: FeasibleCombination[] = [];
    this.deltaTOptions().forEach((deltaT) => {
      this.diameterOptions.forEach((pipe) => {
        const row = this.evaluateGuide(`${pipe.label} @ ${this.formatNumber(deltaT, 0)} C Delta T`, {
          diameterMm: pipe.diameterMm,
          deltaTC: deltaT,
        });
        const hasFlow = row.peak_load_kw > 0 && row.mass_flow_kg_s > 0;
        const meetsTemperature = row.required_supply_temperature_c <= this.guide.supplyTempC + 0.0001;
        const meetsVelocity = !hasFlow || (row.velocity_m_s >= minVelocity && row.velocity_m_s <= maxVelocity);
        const meetsPressure = row.pressure_drop_pa_per_m <= targetDrop + 0.0001;

        if (meetsTemperature && meetsVelocity && meetsPressure) {
          const pipeAreaPenalty = Math.pow(pipe.diameterMm / currentDiameter, 2) * 0.01;
          const pressureUse = targetDrop ? row.pressure_drop_pa_per_m / targetDrop : 0;
          rows.push({
            ...row,
            label: `${pipe.label} | ${this.formatNumber(deltaT, 0)} C Delta T`,
            nominal_dn: pipe.dn,
            dnLabel: pipe.label,
            designScore: this.round(row.pumping_power_kw + pipeAreaPenalty + pressureUse * 0.001, 6),
          });
        }
      });
    });

    return rows.sort((a, b) => {
      if (a.designScore !== b.designScore) return a.designScore - b.designScore;
      if (a.diameter_mm !== b.diameter_mm) return a.diameter_mm - b.diameter_mm;
      return b.delta_t_c - a.delta_t_c;
    });
  }

  private deltaTOptions(): number[] {
    const availableDeltaT = Math.max(this.guide.supplyTempC - this.guide.returnTempC, 0);
    return this.uniqueSorted([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, this.guide.deltaTC, availableDeltaT])
      .filter((deltaT) => deltaT > 0 && deltaT <= availableDeltaT + 0.0001);
  }

  private buildGuideRows(): HydraulicAnalysisRow[] {
    if (!this.analysis) return [];
    if (this.analysisMode === 'diameter') {
      return this.diameterOptions.map((pipe) => this.evaluateGuide(pipe.label, { diameterMm: pipe.diameterMm }));
    }
    if (this.analysisMode === 'temperature') {
      const steps = this.uniqueSorted([10, 15, 20, 25, 30, 40, 50, 60, this.guide.deltaTC]);
      return steps.map((deltaT) => this.evaluateGuide(`${this.formatNumber(deltaT, 0)} C delta T`, { deltaTC: deltaT }));
    }
    if (this.analysisMode === 'flow') {
      return [0.5, 0.75, 1, 1.25, 1.5, 2].map((factor) => this.evaluateGuide(
        `${Math.round(factor * 100)}% demand`,
        { peakLoadKw: this.guide.peakLoadKw * factor },
      ));
    }

    const nextDiameter = this.nextDiameter(this.guide.diameterMm);
    return [
      this.evaluateDesignCase(),
      this.evaluateGuide('Current assumptions'),
      this.evaluateGuide('Peak +25%', { peakLoadKw: this.guide.peakLoadKw * 1.25 }),
      this.evaluateGuide('Lower delta T', { deltaTC: Math.max(this.guide.deltaTC * 0.75, 5) }),
      this.evaluateGuide(`Upsize ${nextDiameter.label}`, { diameterMm: nextDiameter.diameterMm }),
      this.evaluateGuide('Longer section', { lengthM: Math.min(this.guide.lengthM * 1.25, this.maxFor('lengthM')) }),
    ];
  }

  private evaluateDesignCase(): HydraulicAnalysisRow {
    const base = this.analysis!.baseline;
    return this.evaluateGuide('Design', {
      peakLoadKw: Number(base.peak_load_kw || base.served_load_kw || this.guide.peakLoadKw),
      diameterMm: Number(base.diameter_mm || this.guide.diameterMm),
      deltaTC: Number(base.delta_t_c || this.guide.deltaTC),
      returnTempC: Number(base.return_temperature_c || this.analysis!.constants.return_temperature_c || this.guide.returnTempC),
      supplyTempC: Number(base.configured_supply_temperature_c || this.analysis!.constants.supply_temperature_c || this.guide.supplyTempC),
      pumpEfficiencyPct: Number(this.analysis!.constants.pump_efficiency || 0.75) * 100,
      lengthM: Number(this.analysis!.length_m || this.guide.lengthM),
    } as Partial<GuideInputs>);
  }

  private evaluateGuide(label: string, overrides: Partial<GuideInputs> = {}): HydraulicAnalysisRow {
    const input = { ...this.guide, ...overrides };
    const constants = this.analysis?.constants || ({} as HydraulicAnalysis['constants']);
    const rho = Math.max(Number(constants.rho_kg_m3 || 971.8), 0.1);
    const cp = Math.max(Number(constants.cp_kj_kg_k || 4.19), 0.1);
    const mu = Math.max(Number(constants.mu_pa_s || 0.000355), 0.000001);
    const minVelocity = Number(constants.min_velocity_m_s || 0.5);
    const maxVelocity = Number(constants.max_velocity_m_s || 2.5);
    const targetDrop = Number(constants.target_pressure_drop_pa_m || 100);
    const diameterM = Math.max(Number(input.diameterMm || 0) / 1000, 0.0001);
    const lengthM = Math.max(Number(input.lengthM || 0), 0);
    const peakLoadKw = Math.max(Number(input.peakLoadKw || 0), 0);
    const deltaT = Math.max(Number(input.deltaTC || 0), 0.1);
    const pumpEfficiency = Math.max(Number(input.pumpEfficiencyPct || 0) / 100, 0.01);

    const massFlow = peakLoadKw / (cp * deltaT);
    const volumeFlow = massFlow / rho;
    const area = Math.PI * diameterM * diameterM / 4;
    const velocity = area ? volumeFlow / area : 0;
    const reynolds = velocity && diameterM ? (rho * velocity * diameterM) / mu : 0;
    const friction = this.frictionFactor(reynolds, diameterM);
    const pressureDropPa = friction * (lengthM / diameterM) * (rho * velocity * velocity / 2);
    const pressureDropPaPerM = lengthM ? pressureDropPa / lengthM : 0;
    const headLossM = pressureDropPa / (rho * this.gravity);
    const pumpingPowerKw = (volumeFlow * pressureDropPa) / (pumpEfficiency * 1000);
    const requiredSupply = Number(input.returnTempC || 0) + deltaT;

    return {
      label,
      peak_load_kw: this.round(peakLoadKw, 3),
      served_load_kw: this.round(massFlow * cp * deltaT, 3),
      mass_flow_kg_s: this.round(massFlow, 5),
      volume_flow_m3_s: this.round(volumeFlow, 7),
      volume_flow_m3_h: this.round(volumeFlow * 3600, 4),
      diameter_m: this.round(diameterM, 5),
      diameter_mm: this.round(diameterM * 1000, 2),
      velocity_m_s: this.round(velocity, 5),
      pressure_drop_pa: this.round(pressureDropPa, 3),
      pressure_drop_kpa: this.round(pressureDropPa / 1000, 5),
      pressure_drop_pa_per_m: this.round(pressureDropPaPerM, 5),
      head_loss_m: this.round(headLossM, 5),
      pumping_power_kw: this.round(pumpingPowerKw, 5),
      delta_t_c: this.round(deltaT, 3),
      return_temperature_c: this.round(Number(input.returnTempC || 0), 3),
      required_delta_t_c: this.round(deltaT, 3),
      required_supply_temperature_c: this.round(requiredSupply, 3),
      configured_supply_temperature_c: this.round(Number(input.supplyTempC || 0), 3),
      reynolds_number: this.round(reynolds, 0),
      friction_factor: this.round(friction, 6),
      velocity_status: velocity > maxVelocity ? 'high' : velocity < minVelocity && velocity > 0 ? 'low' : 'target',
      pressure_drop_status: pressureDropPaPerM > targetDrop ? 'high' : 'target',
      supply_temperature_status: requiredSupply > Number(input.supplyTempC || 0) ? 'shortfall' : 'met',
    };
  }

  private buildDesignInsights(): void {
    if (!this.analysis || !this.guidedResult) return;
    const constants = this.analysis.constants;
    const maxVelocity = Number(constants.max_velocity_m_s || 2.5);
    const minVelocity = Number(constants.min_velocity_m_s || 0.5);
    const targetDrop = Number(constants.target_pressure_drop_pa_m || 100);
    const availableDeltaT = Math.max(this.guide.supplyTempC - this.guide.returnTempC, 0);
    const combinations = this.feasibleCombinations;
    const best = combinations[0] || null;
    const dnValues = this.uniqueSorted(combinations.map((row) => Number(row.nominal_dn || row.diameter_mm)));
    const deltaTValues = this.uniqueSorted(combinations.map((row) => row.delta_t_c));
    const lowestPumpRow = combinations.length
      ? combinations.reduce((minimum, row) => row.pumping_power_kw < minimum.pumping_power_kw ? row : minimum, combinations[0])
      : null;

    if (best) {
      this.designVerdict = {
        label: 'Feasibility',
        value: `${combinations.length} feasible combinations`,
        detail: `For ${this.formatNumber(this.guide.peakLoadKw, 0)} kW, a compact balanced option is ${best.dnLabel} at ${this.formatNumber(best.delta_t_c, 0)} C Delta T.`,
        tone: 'good',
      };
    } else {
      this.designVerdict = {
        label: 'Feasibility',
        value: 'No feasible combination',
        detail: `No catalog DN and temperature differential pair satisfies supply temperature, ${this.formatNumber(minVelocity, 1)}-${this.formatNumber(maxVelocity, 1)} m/s velocity, and ${this.formatNumber(targetDrop, 0)} Pa/m pressure-gradient limits.`,
        tone: 'bad',
      };
    }

    this.designInsights = [
      {
        label: 'Heat duty',
        value: `${this.formatNumber(this.guide.peakLoadKw, 0)} kW`,
        detail: 'This is the only variable input on this page. Every table row is recalculated from this heat duty.',
        tone: 'neutral',
      },
      {
        label: 'Available temperature differential',
        value: `${this.formatNumber(availableDeltaT, 1)} C`,
        detail: `${this.formatNumber(this.guide.supplyTempC, 1)} C supply and ${this.formatNumber(this.guide.returnTempC, 1)} C return define the largest usable Delta T.`,
        tone: availableDeltaT > 0 ? 'good' : 'bad',
      },
      {
        label: 'Feasible DN range',
        value: dnValues.length
          ? `DN${this.formatNumber(dnValues[0], 0)}-DN${this.formatNumber(dnValues[dnValues.length - 1], 0)}`
          : 'None in catalog',
        detail: dnValues.length
          ? `${dnValues.length} catalog sizes can carry this duty under the velocity and pressure-gradient constraints.`
          : 'The available pipe catalog cannot carry this duty under the current fixed assumptions.',
        tone: dnValues.length ? 'good' : 'bad',
      },
      {
        label: 'Lowest pumping power',
        value: lowestPumpRow ? `${this.formatNumber(lowestPumpRow.pumping_power_kw, 3)} kW` : '--',
        detail: lowestPumpRow
          ? `Lowest-pump row: ${lowestPumpRow.dnLabel}, ${this.formatNumber(lowestPumpRow.delta_t_c, 0)} C Delta T, ${this.formatNumber(lowestPumpRow.velocity_m_s, 2)} m/s, ${this.formatNumber(lowestPumpRow.pressure_drop_pa_per_m, 0)} Pa/m.`
          : 'No feasible row is available to estimate pump power.',
        tone: lowestPumpRow ? 'good' : 'bad',
      },
    ];

    this.designMoves = best
      ? combinations.slice(0, 3).map((row, index) => ({
          label: `Option ${index + 1}: ${row.dnLabel}`,
          outcome: `${this.formatNumber(row.delta_t_c, 0)} C Delta T`,
          detail: `${this.formatNumber(row.mass_flow_kg_s, 2)} kg/s, ${this.formatNumber(row.velocity_m_s, 2)} m/s, ${this.formatNumber(row.pressure_drop_pa_per_m, 0)} Pa/m, ${this.formatNumber(row.head_loss_m, 2)} m head loss, ${this.formatNumber(row.pumping_power_kw, 3)} kW pump power.`,
          tone: 'good' as const,
        }))
      : [
          {
            label: 'No passing design',
            outcome: 'Revise assumptions',
            detail: `Lower the heat duty, increase available Delta T, allow a larger catalog DN, or relax the ${this.formatNumber(targetDrop, 0)} Pa/m pressure-gradient target.`,
            tone: 'bad',
          },
        ];
  }

  private buildDiameterTradeoffRows(): DiameterTradeoffRow[] {
    if (!this.analysis || !this.guidedResult) return [];
    const constants = this.analysis.constants;
    const maxVelocity = Number(constants.max_velocity_m_s || 2.5);
    const targetDrop = Number(constants.target_pressure_drop_pa_m || 100);
    const currentDiameter = this.guide.diameterMm || this.guidedResult.diameter_mm || 1;
    const currentPump = Math.max(this.guidedResult.pumping_power_kw, 0.00001);
    return this.diameterOptions.map((pipe) => {
      const row = this.evaluateGuide(pipe.label, { diameterMm: pipe.diameterMm });
      return {
        label: pipe.label,
        diameterMm: pipe.diameterMm,
        velocityMS: row.velocity_m_s,
        pressureGradientPaM: row.pressure_drop_pa_per_m,
        pumpingPowerKw: row.pumping_power_kw,
        relativePipeArea: this.round(Math.pow(pipe.diameterMm / currentDiameter, 2), 2),
        velocityPct: this.round(maxVelocity ? (row.velocity_m_s / maxVelocity) * 100 : 0, 1),
        pressurePct: this.round(targetDrop ? (row.pressure_drop_pa_per_m / targetDrop) * 100 : 0, 1),
        pumpPct: this.round((row.pumping_power_kw / currentPump) * 100, 1),
        pipeBodyPct: this.round(Math.pow(pipe.diameterMm / currentDiameter, 2) * 100, 1),
        velocityStatus: row.velocity_status || 'target',
        pressureStatus: row.pressure_drop_status || 'target',
        isCurrent: Math.abs(pipe.diameterMm - currentDiameter) < 0.01,
      };
    });
  }

  private buildCharts(): void {
    if (!this.analysis?.baseline || !this.guidedResult) return;
    const constants = this.analysis.constants;
    const targetDrop = Number(constants.target_pressure_drop_pa_m || 100);
    const combinations = this.feasibleCombinations;
    const deltaTValues = this.uniqueSorted(combinations.map((row) => row.delta_t_c));
    const dnValues = this.uniqueSorted(combinations.map((row) => Number(row.nominal_dn || row.diameter_mm)));
    const deltaTLabels = deltaTValues.map((deltaT) => `${this.formatNumber(deltaT, 0)} C`);
    const dnLabels = dnValues.map((dn) => `DN${this.formatNumber(dn, 0)}`);
    const pumpValues = combinations.map((row) => row.pumping_power_kw);
    const pressureValues = combinations.map((row) => row.pressure_drop_pa_per_m);
    const minPump = pumpValues.length ? Math.min(...pumpValues) : 0;
    const maxPump = pumpValues.length ? Math.max(...pumpValues) : 1;
    const minPressure = pressureValues.length ? Math.min(...pressureValues) : 0;
    const maxPressure = pressureValues.length ? Math.max(...pressureValues) : 1;
    const scatterData = combinations.map((row) => {
      const dn = Number(row.nominal_dn || row.diameter_mm);
      return [
        deltaTValues.indexOf(row.delta_t_c),
        dnValues.indexOf(dn),
        row.pumping_power_kw,
        row.pressure_drop_pa_per_m,
        row.velocity_m_s,
        row.mass_flow_kg_s,
        row.head_loss_m,
        row.dnLabel,
        row.delta_t_c,
        row.required_supply_temperature_c,
      ];
    });
    const bestByDeltaT = deltaTValues
      .map((deltaT) => combinations
        .filter((row) => row.delta_t_c === deltaT)
        .sort((a, b) => a.designScore - b.designScore)[0])
      .filter(Boolean) as FeasibleCombination[];
    const noDataGraphic = combinations.length
      ? []
      : [{
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: 'No feasible DN / Delta T combination for this heat duty',
            fill: '#be123c',
            fontSize: 18,
            fontWeight: 900,
          },
        }];

    this.diameterChartOption = {
      backgroundColor: '#ffffff',
      grid: { left: 82, right: 110, top: 34, bottom: 82 },
      graphic: noDataGraphic,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params?.value || [];
          return [
            `<strong>${value[7] || ''} at ${this.formatNumber(value[8], 0)} C Delta T</strong>`,
            `Mass flow: ${this.formatNumber(value[5], 2)} kg/s`,
            `Velocity: ${this.formatNumber(value[4], 2)} m/s`,
            `Pressure gradient: ${this.formatNumber(value[3], 0)} Pa/m`,
            `Head loss: ${this.formatNumber(value[6], 2)} m`,
            `Pumping power: ${this.formatNumber(value[2], 3)} kW`,
            `Required supply: ${this.formatNumber(value[9], 1)} C`,
          ].join('<br/>');
        },
      },
      visualMap: {
        show: combinations.length > 0,
        type: 'continuous',
        min: minPressure,
        max: Math.max(maxPressure, minPressure + 0.0001),
        dimension: 3,
        right: 8,
        top: 34,
        text: ['High Pa/m', 'Low Pa/m'],
        textStyle: { color: '#334155', fontWeight: 900 },
        calculable: true,
        inRange: { color: ['#047857', '#facc15', '#dc2626'] },
      },
      xAxis: {
        type: 'category',
        name: 'Temperature differential',
        nameLocation: 'middle',
        nameGap: 46,
        data: deltaTLabels,
        axisLabel: { color: '#475569', fontWeight: 900 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category',
        name: 'Pipe catalog size',
        nameLocation: 'middle',
        nameGap: 58,
        data: dnLabels,
        axisLabel: { color: '#475569', fontWeight: 900 },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Feasible design',
          type: 'scatter',
          data: scatterData,
          symbolSize: (value: any[]) => {
            const pump = Number(value?.[2] || 0);
            const span = Math.max(maxPump - minPump, 0.0001);
            return 12 + ((pump - minPump) / span) * 22;
          },
          itemStyle: {
            borderColor: '#0f172a',
            borderWidth: 1.5,
            opacity: 0.9,
          },
        },
      ],
    };

    this.temperatureChartOption = {
      backgroundColor: '#ffffff',
      color: ['#ea580c', '#2563eb'],
      legend: {
        top: 0,
        textStyle: { color: '#334155', fontWeight: 900 },
      },
      grid: { left: 80, right: 82, top: 58, bottom: 72 },
      graphic: noDataGraphic,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          const items = Array.isArray(params) ? params : [params];
          const row = bestByDeltaT[items[0]?.dataIndex || 0];
          return [
            `<strong>${row?.dnLabel || ''} at ${this.formatNumber(row?.delta_t_c, 0)} C Delta T</strong>`,
            `Mass flow: ${this.formatNumber(row?.mass_flow_kg_s, 2)} kg/s`,
            `Velocity: ${this.formatNumber(row?.velocity_m_s, 2)} m/s`,
            `Pressure gradient: ${this.formatNumber(row?.pressure_drop_pa_per_m, 0)} Pa/m`,
            `Head loss: ${this.formatNumber(row?.head_loss_m, 2)} m`,
            `Pumping power: ${this.formatNumber(row?.pumping_power_kw, 3)} kW`,
            `Required supply: ${this.formatNumber(row?.required_supply_temperature_c, 1)} C`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: bestByDeltaT.map((row) => `${this.formatNumber(row.delta_t_c, 0)} C`),
        axisLabel: { color: '#475569', fontWeight: 900 },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Pressure gradient (Pa/m)',
          axisLabel: { color: '#475569', fontWeight: 900 },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
        },
        {
          type: 'value',
          name: 'Pumping power (kW)',
          axisLabel: { color: '#475569', fontWeight: 900 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Pressure gradient (Pa/m)',
          type: 'bar',
          barMaxWidth: 44,
          data: bestByDeltaT.map((row) => ({
            value: row.pressure_drop_pa_per_m,
            itemStyle: { borderRadius: [6, 6, 0, 0] },
          })),
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => bestByDeltaT[params.dataIndex]?.dnLabel || '',
            color: '#0f172a',
            fontWeight: 900,
          },
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: '#be123c', type: 'dashed', width: 2 },
            label: { formatter: `Target ${this.formatNumber(targetDrop, 0)} Pa/m`, color: '#be123c', fontWeight: 900 },
            data: [{ yAxis: targetDrop }],
          },
        },
        {
          name: 'Pumping power (kW)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 10,
          data: bestByDeltaT.map((row) => row.pumping_power_kw),
          lineStyle: { width: 4 },
        },
      ],
    };
  }

  private metricValue(row: HydraulicAnalysisRow, key: HydraulicMetricKey): number {
    return Number(row?.[key] || 0);
  }

  private relativeToBaseline(row: HydraulicAnalysisRow, key: HydraulicMetricKey): number {
    const baseline = this.analysis?.baseline;
    const baselineValue = baseline ? this.metricValue(baseline, key) : 0;
    const value = this.metricValue(row, key);
    if (!baselineValue) return 0;
    return this.round((value / baselineValue) * 100, 1);
  }

  private frictionFactor(reynolds: number, diameterM: number): number {
    if (!Number.isFinite(reynolds) || reynolds <= 0 || diameterM <= 0) return 0;
    if (reynolds < 2000) return 64 / reynolds;
    if (reynolds < 4000) return 0.04;
    const roughness = 0.000045;
    const term = (roughness / (3.7 * diameterM)) + (5.74 / Math.pow(reynolds, 0.9));
    return 0.25 / Math.pow(Math.log10(term), 2);
  }

  private nextDiameter(current: number): DiameterOption {
    if (!this.diameterOptions.length) return { label: `DN${Math.round(current)}`, dn: Math.round(current), diameterMm: current };
    return this.diameterOptions.find((option) => option.diameterMm > current) || this.diameterOptions[this.diameterOptions.length - 1];
  }

  private maxFor(key: GuideFieldKey): number {
    return this.guideRanges.find((range) => range.key === key)?.max || this.guide[key];
  }

  private clampGuideValue(key: GuideFieldKey, value: number): number {
    const range = this.guideRanges.find((item) => item.key === key);
    if (!range) return value;
    return Math.min(Math.max(value, range.min), range.max);
  }

  private uniqueSorted(values: number[]): number[] {
    return Array.from(new Set(values.map((value) => Math.max(Number(value), 0)).filter(Boolean)))
      .sort((a, b) => a - b);
  }

  private smartStep(value: number): number {
    const numeric = Math.abs(Number(value || 0));
    if (numeric >= 1000) return 50;
    if (numeric >= 100) return 5;
    if (numeric >= 10) return 0.5;
    return 0.1;
  }

  private round(value: number, digits: number): number {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  private downloadChart(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
