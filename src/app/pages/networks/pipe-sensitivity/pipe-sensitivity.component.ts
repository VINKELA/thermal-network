import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, timer } from 'rxjs';
import { exhaustMap, takeUntil, finalize } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { HeatingProfileService, HeatingModel } from '../load-profile-comparison/heating-profile.service';
import { modelVisual } from '../load-profile-comparison/heating-profile-charts';
import { describeHeatingProfileError } from '../load-profile-comparison/heating-profile-errors';

@Component({ selector: 'ngx-pipe-sensitivity', templateUrl: './pipe-sensitivity.component.html', styleUrls: ['./pipe-sensitivity.component.scss'] })
export class PipeSensitivityComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  projects: Array<{id: number; name: string}> = [];
  networks: Array<{id: number; name: string}> = [];
  connections: Array<{id: number; name: string}> = [];
  models: HeatingModel[] = [];
  projectId: number = null;
  networkId: number = null;
  connectionId: number = null;
  caseMode = 'network';
  experiment = 'both';
  yearsText = Array.from({length: 5}, (_, i) => new Date().getFullYear() - 5 + i).join(', ');
  selectedModels = ['hdd_daily_ca_v1', 'heat_balance_ca_v1', 'necb_slp_ca_v1'];
  common = { location: 'burlington', commercial_energy_preset: 'office', delta_t_c: 30,
    envelope_w_m2k: .8, air_changes_per_hour: .5, internal_gains_w_m2: 4,
    residential_space_fraction: .636, residential_water_fraction: .172,
    commercial_space_fraction: .566, commercial_water_fraction: .057,
    space_heat_conversion: .85, water_heat_conversion: .85,
    residential_total_intensity_kwh_m2: null, commercial_total_intensity_kwh_m2: null };
  ranges = { energy_low: .75, energy_high: 1.25, envelope_low: .6, envelope_high: 1., ach_low: .3, ach_high: .7, gains_low: 2, gains_high: 6 };
  justification = 'Exploratory sensitivity bounds around published Canadian annual-energy anchors; not confidence intervals. Physical bounds are analyst assumptions pending building-envelope data.';
  designPercentile = '99.6';
  indoorDesign = 21;
  includeDhw = true;
  availablePressure = 200000;
  terminalPressure = 50000;
  busy = false;
  error = '';
  progress = '';
  result: any = null;
  presentation = false;
  composition = 'mixed';
  experimentFilter = 'shape';
  yearFilter: number = null;
  selectedBranch: number = null;
  stabilityChart: any = {};
  decisionChart: any = {};
  weatherChart: any = {};
  benchmarkChart: any = {};
  benchmarkHeight = 340;
  costChart: any = {};
  topologyChart: any = {};
  private destroyed$ = new Subject<void>();
  private stopPolling$ = new Subject<void>();
  private scopeChange$ = new Subject<void>();
  readonly modelVisual = modelVisual;

  constructor(private api: RestApiService, private context: ProjectContextService, private heating: HeatingProfileService, private route: ActivatedRoute) {}
  ngOnInit(): void {
    const linkedRun = this.route.snapshot.queryParamMap.get('run');
    if (linkedRun && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(linkedRun)) { this.presentation = true; this.resume(linkedRun); }
    this.heating.getCatalog().pipe(takeUntil(this.destroyed$)).subscribe({next: c => this.models = c.models, error: e => this.showError(e)});
    this.heating.getOptions('projects/').pipe(takeUntil(this.destroyed$)).subscribe({next: p => this.projects = p, error: e => this.showError(e)});
    this.context.selectedProject$.pipe(takeUntil(this.destroyed$)).subscribe(id => { this.projectId = id; this.loadNetworks(); });
  }
  ngOnDestroy(): void { this.destroyed$.next(); this.destroyed$.complete(); this.stopPolling$.next(); this.stopPolling$.complete(); this.scopeChange$.next(); this.scopeChange$.complete(); }
  selectProject(id: number): void { this.context.setProject(id); }
  loadNetworks(): void {
    this.scopeChange$.next(); this.networks = []; this.connections = []; this.networkId = null; this.connectionId = null;
    if (this.projectId) this.heating.getOptions(`networks/?project_id=${this.projectId}`).pipe(takeUntil(this.scopeChange$), takeUntil(this.destroyed$)).subscribe({next: n => this.networks = n, error: e => this.showError(e)});
  }
  loadConnections(): void {
    this.scopeChange$.next(); this.connections = []; this.connectionId = null;
    if (this.networkId) this.heating.getOptions(`edge_connection_algorithms/?network_id=${this.networkId}`).pipe(takeUntil(this.scopeChange$), takeUntil(this.destroyed$)).subscribe({next: n => this.connections = n, error: e => this.showError(e)});
  }
  toggleModel(id: string, selected: boolean): void { this.selectedModels = selected ? Array.from(new Set([...this.selectedModels, id])) : this.selectedModels.filter(m => m !== id); }
  showError(error: any): void { this.error = describeHeatingProfileError(error); }
  run(): void {
    const tokens = this.yearsText.split(',').map(t => t.trim());
    const years = tokens.map(Number);
    if (tokens.some(t => !/^\d{4}$/.test(t)) || !years.length || years.length > 10) { this.error = 'Enter one to ten complete years, separated by commas.'; return; }
    if (!this.projectId) { this.error = 'Select your project first.'; return; }
    this.busy = true; this.error = ''; this.progress = 'Preparing fixed case snapshot…'; this.result = null;
    this.api.post<any>({ project_id: this.projectId, case: this.caseMode, network_id: this.networkId, connection_id: this.connectionId,
      years, models: this.selectedModels, experiments: this.experiment === 'both' ? ['shape', 'input'] : [this.experiment],
      common: this.common, ...this.ranges, range_justification: this.justification, design_percentile: this.designPercentile,
      indoor_design_c: this.indoorDesign, include_dhw_design: this.includeDhw, available_pressure_pa: this.availablePressure, terminal_pressure_pa: this.terminalPressure }, 'pipe-sensitivity/')
      .pipe(takeUntil(this.destroyed$)).subscribe({next: run => { localStorage.setItem('pipeSensitivityRun', run.run_id); this.poll(run.run_id); }, error: e => { this.busy = false; this.showError(e); }});
  }
  resume(runId?: string): void { const id = runId || localStorage.getItem('pipeSensitivityRun'); if (id) { this.busy = true; this.error = ''; this.progress = 'Loading saved study'; this.poll(id); } else this.error = 'No previous study is recorded in this browser.'; }
  private poll(id: string): void {
    this.stopPolling$.next();
    timer(0, 2000).pipe(exhaustMap(() => this.api.get<any>(`pipe-sensitivity/${id}/`)), takeUntil(this.stopPolling$), takeUntil(this.destroyed$), finalize(() => this.busy = false))
      .subscribe({next: state => {
        this.progress = state.message;
        if (state.status === 'complete') {
          localStorage.setItem('pipeSensitivityRun', id);
          this.result = state.result; this.caseMode = this.result.case.demonstration ? 'demo' : 'network'; this.networkId = this.result.case.network_id || null; this.yearFilter = this.result.coldest_tested_year;
          this.composition = this.result.scenarios[0].composition; this.experimentFilter = this.result.scenarios[0].experiment;
          this.selectedBranch = this.result.case.branches[0].id; this.renderCharts(); this.stopPolling$.next();
        } else if (state.status !== 'running') { this.error = state.message; this.stopPolling$.next(); }
      }, error: e => this.showError(e)});
  }
  get compositions(): string[] { return this.result ? Array.from(new Set<string>(this.result.scenarios.map(s => s.composition))) : []; }
  get stability(): any[] { return this.result ? this.result.stability.filter(s => s.composition === this.composition && s.experiment === this.experimentFilter) : []; }
  get stableCount(): number { return this.stability.filter(s => s.stable).length; }
  get filteredScenarios(): any[] { return this.result ? this.result.scenarios.filter(s => s.composition === this.composition && s.experiment === this.experimentFilter && s.year === Number(this.yearFilter)) : []; }
  togglePresentation(): void { this.presentation = !this.presentation; setTimeout(() => window.dispatchEvent(new Event('resize'))); }
  private chartBase(name: string): any { return { backgroundColor: '#fff', aria: {enabled: true}, toolbox: {feature: {saveAsImage: {title: 'Save chart', name}}}, tooltip: {trigger: 'axis', renderMode: 'richText'}, grid: {left: 110, right: 45, top: 35, bottom: 65} }; }
  renderCharts(): void {
    if (!this.result) return;
    const stability = this.stability;
    this.stabilityChart = {...this.chartBase('branch-stability'), xAxis: {type: 'value', min: 0, max: 100, name: '% differing from modal DN', nameLocation: 'middle', nameGap: 30},
      yAxis: {type: 'category', inverse: true, data: stability.map(s => s.name)},
      series: [{type: 'bar', data: stability.map(s => ({value: s.changed_from_modal_pct, itemStyle: {color: s.no_fit_count ? '#dc2626' : s.stable ? '#059669' : '#d97706'}})), label: {show: true, position: 'right', formatter: p => `${Number(p.value).toFixed(1)}%`}}]};
    const rows = this.filteredScenarios; const branches = this.result.case.branches;
    this.decisionChart = {...this.chartBase('branch-diameter-decisions'), grid: {left: 115,right: 35,top: 20,bottom: 100},
      tooltip: {position: 'top', renderMode: 'richText', formatter: p => { const s=rows[p.value[0]], b=s.branches[p.value[1]]; return `${branches[p.value[1]].name}\n${modelVisual(s.model).name} · ${s.label}\n${s.resolution_hours} h: ${b.status === 'inactive' ? 'Inactive' : b.dn == null ? 'No catalogue fit' : 'DN '+b.dn}\nPeak ${b.peak_kw.toFixed(1)} kW\nCommon-test violation hours: ${b.common_violation_hours == null ? 'N/A' : b.common_violation_hours}`; }},
      xAxis: {type: 'category', data: rows.map(s => `#${s.id}`), axisLabel: {rotate: 60}}, yAxis: {type: 'category', data: branches.map(b => b.name)},
      visualMap: {min: 0, max: Math.max(20,...rows.reduce((all, s) => all.concat(s.branches.map(b => b.dn || 0)), [])), calculable: true, orient: 'horizontal',left: 'center',bottom: 0, inRange: {color: ['#e2e8f0','#bfdbfe','#60a5fa','#2563eb','#312e81']}},
      dataZoom: [{type: 'slider',xAxisIndex:0,bottom:45, height:15}],
      series: [{type:'heatmap', data: rows.reduce((all,s,x) => all.concat(s.branches.map((b,y) => ({value:[x,y,b.dn || 0],itemStyle:b.status==='no_fit'?{color:'#ef4444'}:undefined}))), []), emphasis:{itemStyle:{borderColor:'#111827',borderWidth:2}}}]};
    this.weatherChart = {...this.chartBase('weather-severity'), xAxis:{type:'category',data:this.result.weather.map(w=>String(w.year))},yAxis:{type:'value',name:'HDD'},
      series:[{type:'bar',data:this.result.weather.map(w=>({value:w.hdd,itemStyle:{color:w.year===this.result.coldest_tested_year?'#2563eb':'#cbd5e1'}})),label:{show:true,position:'top',formatter:p=>Number(p.value).toFixed(0)}}]};
    const bi=branches.findIndex(b=>b.id===Number(this.selectedBranch));
    const benchmark=this.result.benchmark.by_composition[this.composition][bi];
    const peaks=rows.filter(s=>s.resolution_hours===1);
    this.benchmarkHeight = Math.max(340, peaks.length * 42 + 100);
    this.benchmarkChart={...this.chartBase('design-benchmark'),grid:{left:220,right:95,top:35,bottom:50},
      xAxis:{type:'value',name:'kW'}, yAxis:{type:'category',inverse:true,data:peaks.map(s=>`${modelVisual(s.model).name}\n${s.label}`),axisLabel:{fontSize:11}},
      series:[{type:'bar',data:peaks.map(s=>({value:s.branches[bi].peak_kw,itemStyle:{color:modelVisual(s.model).color}})),
        label:{show:true,position:'right',formatter:p=>Number(p.value).toFixed(1)},
        markLine:{silent:true,symbol:'none',data:[{xAxis:benchmark.total_kw,name:'Design check'}],lineStyle:{color:'#dc2626',type:'dashed'},label:{formatter:`Design check ${benchmark.total_kw.toFixed(1)} kW`}}}]};
    this.costChart={...this.chartBase('cost-and-feasibility'),legend:{top:0},xAxis:{type:'value',name:'Scenario',nameLocation:'middle',nameGap:30},yAxis:{type:'value',name:'Pipe-only CAD'},
      series:[true,false].map(pass=>({type:'scatter',name:pass?'Passes common screens':'Requires further checking',symbolSize:9,itemStyle:{color:pass?'#059669':'#d97706'}, data:rows.filter(s=>s.common_test_feasible===pass&&s.pipe_cost_cad!=null).map(s=>[s.id,s.pipe_cost_cad])}))};
    const depths=new Map<number,number>([[this.result.case.root,0]]); branches.forEach(b=>depths.set(b.end,(depths.get(b.start)||0)+1));
    const levels: {[key:number]:number}={}; const totals:{[key:number]:number}={}; this.result.case.nodes.forEach(n=>{const d=depths.get(n.id)||0;totals[d]=(totals[d]||0)+1;});
    this.topologyChart={...this.chartBase('fixed-network-layout'),tooltip:{renderMode:'richText'},series:[{type:'graph',layout:'none',roam:true,symbolSize:20,
      data:this.result.case.nodes.map(n=>{const d=depths.get(n.id)||0;levels[d]=(levels[d]||0)+1;return {id:String(n.id),name:n.name,x:d*200,y:levels[d]*500/(totals[d]+1),label:{show:true,position:n.id===this.result.case.root || branches.some(b=>b.start===n.id)?'bottom':'right'},itemStyle:{color:n.kind==='producer'?'#2563eb':'#64748b'}};}),
      links:branches.map(b=>{const s=stability.find(x=>x.branch_id===b.id);return {source:String(b.start),target:String(b.end),name:b.name,lineStyle:{width:4,color:!s?'#cbd5e1':s.stable?'#059669':'#d97706'},label:{show:true,formatter:!s?'inactive':s.no_fit_count?'no fit in some cases':`DN${s.min_dn}–${s.max_dn}`}};}),edgeSymbol:['none','arrow']}]};
  }
  exportJson(): void { this.download('pipe-sensitivity-study.json',JSON.stringify(this.result,null,2),'application/json'); }
  exportCsv(): void {
    const quote=(v:any)=>'"'+(typeof v==='string'?v.replace(/^[=+@-]/,"'"):String(v==null?'':v)).replace(/"/g,'""')+'"';
    const header=['scenario','experiment','year','composition','model','case','resolution_hours','branch','peak_kw','annual_kwh','flow_kg_s','dn','status','common_violation_hours','design_pass','pipe_cost_cad','network_passes_common_screens','hdd_baseline_scenario','peak_difference_from_hdd_pct','dn_differs_from_hdd'];
    const rows=this.result.scenarios.reduce((all,s)=>all.concat(s.branches.map(b=>[s.id,s.experiment,s.year,s.composition,s.model,s.label,s.resolution_hours,b.branch_id,b.peak_kw,b.annual_kwh,b.flow_kg_s,b.dn,b.status,b.common_violation_hours,b.design_pass,b.pipe_cost_cad,s.common_test_feasible,s.hdd_baseline_scenario_id,b.peak_difference_from_hdd_pct,b.dn_differs_from_hdd])),[]);
    this.download('pipe-sensitivity-decisions.csv',[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv');
  }
  private download(name:string,text:string,type:string):void { const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
