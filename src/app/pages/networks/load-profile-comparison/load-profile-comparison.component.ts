import { buildMetricChart, modelVisual, peakWeekBounds } from './heating-profile-charts';
import { describeHeatingProfileError } from './heating-profile-errors';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { HeatingModel, HeatingProfileService, HeatingStudy, ModelResult, StudyOptions } from './heating-profile.service';

@Component({
  selector: 'ngx-load-profile-comparison',
  templateUrl: './load-profile-comparison.component.html',
  styleUrls: ['./load-profile-comparison.component.scss'],
})
export class LoadProfileComparisonComponent implements OnInit, OnDestroy {
  models: HeatingModel[] = [];
  energyPresets: { [key: string]: { label: string; intensity_kwh_m2: number; year: number; source: string } } = {};
  commercialPresets: string[] = [];
  get scenarioMultiplier(): number { return this.options.energy_scenario === 'low' ? .75 : this.options.energy_scenario === 'high' ? 1.25 : 1; }
  previewHeatIntensity(residential: boolean): number {
    const preset = this.energyPresets[residential ? 'residential' : this.options.commercial_energy_preset];
    const override = residential ? this.options.residential_total_intensity_kwh_m2 : this.options.commercial_total_intensity_kwh_m2;
    const intensity = override == null ? (preset ? preset.intensity_kwh_m2 : 0) : override;
    const space = residential ? this.options.residential_space_fraction : this.options.commercial_space_fraction;
    const water = residential ? this.options.residential_water_fraction : this.options.commercial_water_fraction;
    return intensity * this.scenarioMultiplier * (space * this.options.space_heat_conversion + water * this.options.water_heat_conversion);
  }
  get energyFlowChart(): any {
    if (!this.result) return {};
    const s = this.result.energy_summary;
    return { backgroundColor: '#ffffff', aria: { enabled: true }, tooltip: { trigger: 'axis' },
      grid: { left: 145, right: 65, top: 15, bottom: 40 },
      xAxis: { type: 'value', name: 'MWh/year', nameLocation: 'middle', nameGap: 25 },
      yAxis: { type: 'category', inverse: true, data: ['All final energy', 'Space-heating input', 'DHW input', 'Useful space heat', 'Useful DHW'] },
      series: [{ type: 'bar', barMaxWidth: 28, label: { show: true, position: 'right', formatter: p => Number(p.value).toFixed(1) },
        data: ['total_final_energy_kwh', 'space_input_kwh', 'dhw_input_kwh', 'annual_space_kwh', 'annual_dhw_kwh'].map((key, i) => ({ value: s[key] / 1000, itemStyle: { color: ['#64748b','#93c5fd','#fdba74','#2563eb','#d97706'][i] } })) }] };
  }
  locations: Array<{ id: string; name: string }> = [];
  projects: Array<{ id: number; name: string }> = [];
  networks: Array<{ id: number; name: string }> = [];
  result: HeatingStudy | null = null;
  busy = false;
  applying = false;
  error = '';
  notice = '';
  applyModel = '';
  buildingIds = '';
  buildingSearch = '';
  buildingMatches: Array<{ id: number; name: string; floor_area: number }> = [];
  buildingMatchCount = 0;
  chartOptions: any = {};
  chartView = 'peakWeek';
  presentationMode = false;
  peakChart: any = {};
  flowChart: any = {};
  differenceChart: any = {};
  eventChart: any = {};
  modelVisual = modelVisual;

  togglePresentation(): void {
    this.presentationMode = !this.presentationMode;
    setTimeout(() => window.dispatchEvent(new Event('resize')));
  }

  get peakSpreadPercent(): number | null {
    if (!this.result) return null;
    const peaks = this.result.results.map(r => Number(r.metrics.peak_kw));
    const minimum = Math.min(...peaks);
    return minimum > 0 ? 100 * (Math.max(...peaks) - minimum) / minimum : null;
  }

  readonly latestYear = new Date().getFullYear() - 1;
  readonly scheduleGroups = ['auto', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  options: StudyOptions = {
    project_id: null, network_id: null, year: 2023, location: 'burlington',
    models: ['burlington_envelope', 'burlington_peak', 'burlington_hdd18'], reference: 'burlington_hdd18',
    energy_basis: 'stored_burlington', energy_scenario: 'central', commercial_energy_preset: 'office',
    residential_space_fraction: .636, residential_water_fraction: .172,
    commercial_space_fraction: .566, commercial_water_fraction: .057,
    space_heat_conversion: .85, water_heat_conversion: .85, thermo_archetype: 'detached', intensity_kwh_m2: 120, dhw_fraction: .15,
    balance_temperature_c: 18, envelope_w_m2k: .8, air_changes_per_hour: .5,
    internal_gains_w_m2: 4, storey_height_m: 3, schedule_group: 'auto',
    normalize_physical: false, delta_t_c: 30, peak_threshold_fraction: .9,
  };
  readonly metrics = [
    { key: 'annual_energy_kwh', label: 'Annual delivered heat', unit: 'kWh' },
    { key: 'annual_energy_bias_pct', label: 'Annual energy difference', unit: '%' },
    { key: 'peak_kw', label: 'Peak demand', unit: 'kW' },
    { key: 'peak_bias_pct', label: 'Peak difference', unit: '%' },
    { key: 'p95_kw', label: '95th percentile', unit: 'kW' },
    { key: 'p99_kw', label: '99th percentile', unit: 'kW' },
    { key: 'p999_kw', label: '99.9th percentile', unit: 'kW' },
    { key: 'p99_bias_pct', label: '99th percentile difference', unit: '%' },
    { key: 'coincidence_factor', label: 'Coincidence factor', unit: 'ratio' },
    { key: 'load_factor', label: 'Mean / peak load', unit: 'ratio' },
    { key: 'hours_above_threshold', label: 'Time above reference threshold', unit: 'hours' },
    { key: 'longest_peak_event_hours', label: 'Longest event above threshold', unit: 'hours' },
    { key: 'mae_kw', label: 'Mean absolute difference', unit: 'kW' },
    { key: 'rmse_kw', label: 'Chronological RMSE', unit: 'kW' },
    { key: 'cvrmse_pct', label: 'RMSE / reference mean', unit: '%' },
    { key: 'ldc_rmse_kw', label: 'Load-duration curve RMSE', unit: 'kW' },
    { key: 'upper_1pct_ldc_rmse_kw', label: 'Highest 1% duration-curve RMSE', unit: 'kW' },
    { key: 'peak_mass_flow_kg_s', label: 'Peak mass flow', unit: 'kg/s' },
    { key: 'peak_flow_bias_pct', label: 'Peak flow difference', unit: '%' },
  ];
  private destroyed$ = new Subject<void>();
  private cancelComparison$ = new Subject<void>();
  private cancelNetworks$ = new Subject<void>();

  constructor(private service: HeatingProfileService, private projectContext: ProjectContextService) {}

  ngOnInit(): void {
    this.service.getCatalog().pipe(takeUntil(this.destroyed$)).subscribe({
      next: catalog => { this.models = catalog.models; this.locations = catalog.locations; this.energyPresets = catalog.energy_presets; this.commercialPresets = Object.keys(catalog.energy_presets).filter(k => k !== 'residential'); },
      error: error => this.showError(error),
    });
    this.service.getOptions('projects/').pipe(takeUntil(this.destroyed$)).subscribe({
      next: projects => { this.projects = projects; if (!this.options.project_id && projects.length) this.selectProject((projects.find(p => p.name === 'Burlington HDD Study') || projects[0]).id); }, error: error => this.showError(error),
    });
    this.projectContext.selectedProject$.pipe(takeUntil(this.destroyed$)).subscribe(id => {
      this.options.project_id = id;
      this.options.network_id = null;
      this.buildingIds = ''; this.buildingMatches = []; this.buildingMatchCount = 0;
      this.invalidateResult();
      this.loadNetworks();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next(); this.destroyed$.complete();
    this.cancelComparison$.next(); this.cancelComparison$.complete();
    this.cancelNetworks$.next(); this.cancelNetworks$.complete();
  }

  selectProject(projectId: number): void {
    this.projectContext.setProject(projectId);
  }

  loadNetworks(): void {
    this.cancelNetworks$.next();
    this.networks = [];
    if (!this.options.project_id) return;
    this.service.getOptions(`networks/?project_id=${this.options.project_id}`)
      .pipe(takeUntil(this.cancelNetworks$), takeUntil(this.destroyed$)).subscribe({
        next: networks => this.networks = networks, error: error => this.showError(error),
      });
  }

  changeScope(): void {
    this.buildingIds = ''; this.buildingMatches = []; this.buildingMatchCount = 0;
    this.invalidateResult();
  }

  findBuildings(): void {
    if (!this.options.project_id) return;
    const project = this.options.project_id, network = this.options.network_id;
    this.service.getBuildings(project, network, this.buildingSearch).pipe(takeUntil(this.destroyed$)).subscribe({
      next: page => {
        if (project !== this.options.project_id || network !== this.options.network_id) return;
        this.buildingMatches = page.results; this.buildingMatchCount = page.count;
      }, error: error => this.showError(error),
    });
  }

  selectBuilding(id: number, checked: boolean): void {
    const selected = this.buildingIds.trim() ? this.buildingIds.split(',').map(Number) : [];
    this.buildingIds = (checked ? Array.from(new Set([...selected, id])) : selected.filter(value => value !== id)).join(',');
    this.invalidateResult();
  }

  isBuildingSelected(id: number): boolean {
    return this.buildingIds.split(',').map(Number).includes(id);
  }

  selectVisibleBuildings(): void {
    this.buildingIds = this.buildingMatches.map(b => b.id).join(','); this.invalidateResult();
  }

  selectModel(modelId: string, selected: boolean): void {
    this.options.models = selected ? [...this.options.models, modelId] : this.options.models.filter(id => id !== modelId);
    if (this.options.reference !== 'existing' && !this.options.models.includes(this.options.reference)) {
      this.options.reference = this.options.models[0] || '';
    }
    this.compare();
  }

  invalidateResult(): void {
    this.cancelComparison$.next();
    this.presentationMode = false;
    this.result = null; this.busy = false; this.applyModel = ''; this.notice = ''; this.error = '';
  }

  compare(): void {
    this.invalidateResult();
    if (!this.options.project_id || !this.options.models.length) return;
    const ids = this.buildingIds.trim() ? this.buildingIds.split(',').map(id => Number(id.trim())) : [];
    if (ids.some(id => !Number.isInteger(id) || id < 1)) {
      this.error = 'Building IDs must be positive integers separated by commas.'; return;
    }
    const payload = { ...this.options, models: [...this.options.models], building_ids: ids };
    this.busy = true;
    this.service.compare(payload).pipe(takeUntil(this.cancelComparison$), takeUntil(this.destroyed$)).subscribe({
      next: result => { this.result = result; this.busy = false; this.renderChart(); },
      error: error => { this.busy = false; this.showError(error); },
    });
  }

  renderChart(): void {
    if (!this.result) return;
    this.peakChart = buildMetricChart(this.result, 'peak_kw', 'Peak heat demand (kW)');
    this.flowChart = buildMetricChart(this.result, 'peak_mass_flow_kg_s', 'Peak mass flow (kg/s)');
    this.differenceChart = buildMetricChart(this.result, 'cvrmse_pct', 'RMSE / reference mean (%)');
    this.eventChart = buildMetricChart(this.result, 'hours_above_threshold', 'Hours above shared threshold');
    const bounds = this.chartView === 'peakWeek' ? peakWeekBounds(this.result.reference_hourly_kw) : [0, this.result.timestamps.length];
    const duration = this.chartView === 'duration';
    const resolution = this.chartView === 'resolution';
    const categories = resolution ? ['1', '3', '6', '24'] : duration
      ? this.result.timestamps.map((_, index) => index + 1) : this.result.timestamps.slice(bounds[0], bounds[1]).map(t => t.slice(0, 16).replace('T', ' '));
    this.chartOptions = {
      aria: { enabled: true }, backgroundColor: '#ffffff',
      toolbox: { feature: { saveAsImage: { title: 'Save chart', name: `heating-${this.chartView}` } } },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      legend: { type: 'scroll', bottom: 0 },
      grid: { top: 40, bottom: 95, left: 90, right: 25 },
      xAxis: { type: 'category', data: categories, name: resolution ? 'Averaging hours' : duration ? 'Exceedance hours' : 'Local standard time', nameLocation: 'middle', nameGap: 30 },
      yAxis: { type: 'value', name: 'Heat demand (kW)' },
      dataZoom: resolution ? [] : [{ type: 'inside' }, { type: 'slider', bottom: 40 }],
      series: this.result.results.map(row => ({
        name: modelVisual(row.model).name, itemStyle: { color: modelVisual(row.model).color }, lineStyle: { color: modelVisual(row.model).color }, type: resolution ? 'bar' : 'line', showSymbol: false, sampling: 'lttb',
        data: resolution ? ['1', '3', '6', '24'].map(h => row.metrics.resolution_peaks_kw[h])
          : duration ? row.duration_curve_kw : row.hourly_kw.slice(bounds[0], bounds[1]),
      })),
    };
    if (this.result.options.reference === 'existing' && !resolution) {
      this.chartOptions.series.push({ name: 'Existing reference', type: 'line', showSymbol: false,
        data: duration ? [...this.result.reference_hourly_kw].sort((a, b) => b - a) : this.result.reference_hourly_kw.slice(bounds[0], bounds[1]), lineStyle: { color: '#64748b', type: 'dashed' }, itemStyle: { color: '#64748b' } });
    }
  }

  applySelectedModel(): void {
    if (!this.result || !this.applyModel || this.applying) return;
    this.applying = true;
    this.service.apply(this.result.run_id, this.applyModel).pipe(takeUntil(this.destroyed$)).subscribe({
      next: saved => {
        this.applying = false; this.applyModel = '';
        this.notice = `Saved ${saved.created.toLocaleString()} hourly records. Previous profiles archived as ${saved.archive_id}. Run a new comparison before applying again.`;
      },
      error: error => { this.applying = false; this.showError(error); },
    });
  }

  exportStudy(): void {
    if (this.result) this.downloadFile(JSON.stringify(this.result, null, 2), 'json', 'application/json');
  }

  exportHourlyCsv(): void {
    if (!this.result) return;
    const header = ['timestamp', ...this.result.results.map(r => `${r.model}_kw`), 'reference_kw'];
    const rows = this.result.timestamps.map((t, i) => [t, ...this.result.results.map(r => r.hourly_kw[i]), this.result.reference_hourly_kw[i]].join(','));
    this.downloadFile([header.join(','), ...rows].join('\r\n'), 'csv', 'text/csv');
  }

  metricValue(result: ModelResult, key: string): string {
    const value = result.metrics[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: key.includes('factor') ? 3 : 2 }) : 'N/A';
  }

  private downloadFile(content: string, extension: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `heating-model-comparison-${this.result.options.year}.${extension}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private showError(error: any): void {
    this.error = describeHeatingProfileError(error);
  }
}
