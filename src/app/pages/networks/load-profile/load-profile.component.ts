import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { BehaviorSubject, Subject, forkJoin, of } from 'rxjs';
import { takeWhile, debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';

type ChartView = 'trend' | 'sankey' | 'utilization' | 'summary';

interface PresentationValueRow {
  label: string;
  value: number;
  unit: string;
}

interface ChartLegendItem {
  label: string;
  color: string;
  detail: string;
}

@Component({
  selector: 'ngx-load-profile',
  templateUrl: './load-profile.component.html',
  styleUrls: ['./load-profile.component.scss']
})
export class LoadProfileComponent implements OnInit, OnDestroy {
  private alive = true;

  // --- 1. REACTIVE STATE MANAGEMENT ---
  // The single source of truth for our UI filters
  filterState$ = new BehaviorSubject({
    project: null as number | null,
    network: 'all' as number | string | null,
    type: 'building' as 'building' | 'boiler',
    search: '',
    page: 1
  });

  // --- UI DROPDOWN DATA ---
  projects: any[] = [];
  networks: any[] = [];
  availableYears: number[] = [];
  selectedYear: number = new Date().getFullYear() - 1; 
  
  // --- DIRECTORY & DRILL-DOWN DATA ---
  directoryNodes: any[] = [];
  hasMoreData: boolean = false;
  isListLoading: boolean = false;
  
  selectedNodes = new Map<number, any>(); // Track selected nodes natively by Node ID
  nodeProfilesCache = new Map<number, Map<number, { supply: number, demand: number }>>(); 
  
  // --- MACRO SYSTEM DATA ---
  aggregateSystemData: any[] = []; 
  systemUtilizationData: any[] = [];
  systemUtilizationSummary: any = null;
  displayUtilizationSummary: any = null;
  totalSystemSupply: number = 0;
  totalSystemDemand: number = 0;
  isChartLoading: boolean = false;

  // --- CHARTING STATE ---
  analysisScope: 'system' | 'selection' = 'system'; 
  selectedChartView: ChartView = 'trend';
  echartsOptions: any = {}; 
  chartColors: any;
  currentTheme: any;
  presentationRows: PresentationValueRow[] = [];
  chartLegendItems: ChartLegendItem[] = [];
  copyFeedback: string | null = null;
  chartInstance: any = null;
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: RestApiService, private theme: NbThemeService) {
    const current = new Date().getFullYear();
    for (let i = current + 1; i >= current - 5; i--) this.availableYears.push(i);
  }

  ngOnInit(): void {
    this.theme.getJsTheme()
      .pipe(takeWhile(() => this.alive))
      .subscribe(config => {
        this.currentTheme = config;
        this.extractThemeColors();
        this.renderChart();
      });

    this.fetchProjects();
    this.setupReactiveStreams();
  }

  ngOnDestroy(): void {
    this.alive = false;
    this.filterState$.complete();
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
  }

  extractThemeColors() {
    const vars = this.currentTheme.variables;
    this.chartColors = {
      excess: vars.success || '#00d68f',
      deficit: vars.danger || '#ff3d71',
      producer: vars.info || '#0095ff',
      consumer: vars.warning || '#ffaa00',
      utilized: vars.primary || '#3366ff',
      served: vars.warning || '#ffaa00',
      unused: vars.success || '#00d68f',
      unserved: vars.danger || '#ff3d71',
      textColor: vars.fgText || '#000000',
      axisLine: vars.separator || '#cccccc',
      bg: 'transparent',
      palette: ['#3366ff', '#0095ff', '#a16eff', '#ffaa00', '#e3a8ff', '#00d68f']
    };
  }

  // ==========================================
  // 1. REACTIVE PIPELINE (The Magic)
  // ==========================================
// ==========================================
  // 1. REACTIVE PIPELINE (The Magic)
  // ==========================================
  setupReactiveStreams() {
    this.filterState$.pipe(
      takeWhile(() => this.alive),
      debounceTime(300), // Wait 300ms after user stops typing
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      switchMap(filters => {
        this.isListLoading = true;
        
// FIX: Swapped 'limit' for 'page_size'
        let params = `?node_type=${filters.type}&page=${filters.page}&page_size=100`;
        if (filters.project) params += `&network__project=${filters.project}`;
        if (filters.network && filters.network !== 'all') params += `&network=${filters.network}`;
        if (filters.search) params += `&search=${encodeURIComponent(filters.search)}`;
        return this.api.get<any>(`nodes/${params}`).pipe(
          map(res => {
            // 1. Extract the raw array from the DRF pagination wrapper
            const rawArray = res.results || (Array.isArray(res) ? res : []);
            
            // 2. THE CRUCIAL FIX: Normalize the DRF Node data into what the HTML expects
            const normalizedResults = rawArray.map((node: any) => ({
              ...node,
              // Map the actual foreign key ID to 'entity_id'
              entity_id: node.building || node.boiler || node.id, 
              entity_type: node.node_type,
              name: node.name || `Node ${node.id}`,
              building_type: node.building_type || node.building_details?.building_type || null
            }));

            // Pass the normalized data down the stream
            return { filters, normalizedResults, hasNext: !!res.next };
          }),
          catchError((err) => {
            console.error('API Fetch Error:', err);
            return of({ filters, normalizedResults: [], hasNext: false });
          })
        );
      })
    ).subscribe(({ filters, normalizedResults, hasNext }) => {
      
      // If page 1, replace data. If page > 1, append data.
      if (filters.page === 1) {
        this.directoryNodes = normalizedResults;
      } else {
        this.directoryNodes = [...this.directoryNodes, ...normalizedResults];
      }
      
      this.hasMoreData = hasNext;
      this.isListLoading = false;
    });
  }
  // ==========================================
  // 2. UI EVENT HANDLERS
  // ==========================================
  
  // Triggers when Project dropdown changes
  onProjectChange(projectId: number) {
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, project: projectId, network: 'all', page: 1 });
    this.resetSelectionScope();
    this.clearSystemUtilization();
    
    if (projectId) {
      this.api.get<any>(`networks/?project_id=${projectId}`).subscribe(res => {
        this.networks = res.results || res || [];
      });
      this.fetchSystemAggregate(); // Refresh macro data
      if (this.isUtilizationBackedView()) this.fetchSystemUtilization();
    } else {
      this.networks = [];
      this.aggregateSystemData = [];
      this.systemUtilizationData = [];
      this.systemUtilizationSummary = null;
      this.displayUtilizationSummary = null;
      this.renderChart();
    }
  }

  onNetworkChange(networkId: number | string) {
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, network: networkId, page: 1 });
    this.resetSelectionScope();
    this.clearSystemUtilization();
    this.fetchSystemAggregate();
    if (this.isUtilizationBackedView()) this.fetchSystemUtilization();
  }

  onYearChange(year: number) {
    this.selectedYear = year;
    this.nodeProfilesCache.clear();
    this.clearSystemUtilization();

    if (this.analysisScope === 'system') {
      this.fetchSystemAggregate();
      if (this.isUtilizationBackedView()) this.fetchSystemUtilization();
    } else {
      this.selectedNodes.forEach(node => this.fetchIndividualProfile(node));
      this.renderChart();
    }
  }

  onTypeChange(type: 'building' | 'boiler') {
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, type, page: 1 });
  }

  onSearchChange(searchTerm: string) {
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, search: searchTerm, page: 1 });
  }

  loadNextPage() {
    if (!this.hasMoreData || this.isListLoading) return;
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, page: state.page + 1 });
  }

  fetchProjects() {
    this.api.get<any>('projects/').subscribe(res => {
      this.projects = res.results || res || [];
    });
  }

  // ==========================================
  // 3. MACRO (SYSTEM) DATA PIPELINE
  // ==========================================
  fetchSystemAggregate() {
    const state = this.filterState$.getValue();
    if (!state.project) {
      this.aggregateSystemData = [];
      this.renderChart();
      return;
    }
    
    this.isChartLoading = true;
    const start = `${this.selectedYear}-01-01T00:00:00`;
    const end = `${this.selectedYear + 1}-01-01T00:00:00`;
    
    let url = `aggregate-profile/?project_id=${state.project}&start_date__gte=${start}&end_date__lte=${end}`;
    if (state.network && state.network !== 'all') url += `&network_id=${state.network}`;

    this.api.get<any>(url).subscribe({
      next: (data) => {
        this.aggregateSystemData = data.results || data || [];
        this.totalSystemSupply = 0;
        this.totalSystemDemand = 0;
        
        this.aggregateSystemData.forEach(item => {
          this.totalSystemSupply += item.total_supply || 0;
          this.totalSystemDemand += item.total_demand || 0;
        });
        
        this.isChartLoading = false;
        if (this.analysisScope === 'system') this.renderChart();
      },
      error: () => this.isChartLoading = false
    });
  }

  fetchSystemUtilization() {
    const state = this.filterState$.getValue();
    if (!state.project) {
      this.systemUtilizationData = [];
      this.systemUtilizationSummary = null;
      this.renderChart();
      return;
    }

    this.isChartLoading = true;
    let url = `heat-utilization/?project_id=${state.project}&year=${this.selectedYear}`;
    if (state.network && state.network !== 'all') url += `&network_id=${state.network}`;

    this.api.get<any>(url).subscribe({
      next: (data) => {
        this.systemUtilizationData = data.results || [];
        this.systemUtilizationSummary = data.summary || null;
        this.isChartLoading = false;
        if (this.analysisScope === 'system' && this.isUtilizationBackedView()) this.renderChart();
      },
      error: () => {
        this.systemUtilizationData = [];
        this.systemUtilizationSummary = null;
        this.isChartLoading = false;
        this.renderChart();
      }
    });
  }

  clearSystemUtilization() {
    this.systemUtilizationData = [];
    this.systemUtilizationSummary = null;
    this.displayUtilizationSummary = null;
  }

  resetSelectionScope() {
    this.selectedNodes.clear();
    this.nodeProfilesCache.clear();
    this.analysisScope = 'system';
  }

  // ==========================================
  // 4. MICRO (DRILL-DOWN) DATA PIPELINE
  // ==========================================
toggleNodeSelection(node: any) {
    if (this.selectedNodes.has(node.id)) {
      this.selectedNodes.delete(node.id);
      
      // Auto-revert to System view if they unselect everything
      if (this.selectedNodes.size === 0) {
        this.analysisScope = 'system';
      }
      this.renderChart();
    } else {
      this.selectedNodes.set(node.id, node);
      
      // THE FIX: Automatically switch the chart to Drill-Down view so they see what they clicked!
      this.analysisScope = 'selection'; 
      
      this.fetchIndividualProfile(node);
    }
  }

  selectAllVisible() {
    this.directoryNodes.forEach(node => {
      if (!this.selectedNodes.has(node.id)) {
        this.selectedNodes.set(node.id, node);
        this.fetchIndividualProfile(node);
      }
    });
    
    // Auto-switch to Drill-Down view
    this.analysisScope = 'selection';
  }

  removeNodeSelection(nodeId: number) {
    this.selectedNodes.delete(nodeId);
    this.nodeProfilesCache.delete(nodeId);
    if (this.selectedNodes.size === 0) this.analysisScope = 'system';
    this.renderChart();
  }

  fetchIndividualProfile(node: any) {
    if (this.nodeProfilesCache.has(node.id)) {
      this.renderChart();
      return;
    }

    this.isChartLoading = true;
    const start = `${this.selectedYear}-01-01T00:00:00`;
    const end = `${this.selectedYear + 1}-01-01T00:00:00`;
    
    // Check if it's a building or boiler to query LoadProfile correctly
    let param = '';
    if (node.building) param = `building=${node.building}`;
    else if (node.boiler) param = `boiler=${node.boiler}`;
    else param = `node=${node.id}`; // Fallback

    const url = `load-profiles/?${param}&start_date__gte=${start}&end_date__lte=${end}&ordering=start_date`;

    this.api.get<any>(url).subscribe({
      next: (data) => {
        const results = data.results || data || [];
        const timeMap = new Map<number, { supply: number, demand: number }>();
        let totalSupplied = 0;
        let totalDemanded = 0;

        results.forEach((item: any) => {
          const time = new Date(item.start_date).getTime();
          const val = item.value || 0;
          const pType = (item.profile_type || '').toLowerCase();
          
          let isSupply = false;
          if (node.node_type === 'boiler') isSupply = true;
          else if (pType === 'waste_heat' || pType === 'cooling') isSupply = true; 
          else if (pType === 'heating') isSupply = false; 

          if (!isNaN(time)) {
            if (!timeMap.has(time)) timeMap.set(time, { supply: 0, demand: 0 });
            if (isSupply) { timeMap.get(time)!.supply += val; totalSupplied += val; }
            else { timeMap.get(time)!.demand += val; totalDemanded += val; }
          }
        });

        // Store metadata directly on the node object map
        const storedNode = this.selectedNodes.get(node.id);
        if (storedNode) {
          storedNode.totalSupplied = totalSupplied;
          storedNode.totalDemanded = totalDemanded;
          storedNode.isProducer = totalSupplied > totalDemanded;
        }
        
        this.nodeProfilesCache.set(node.id, timeMap);
        this.isChartLoading = false;
        
        if (this.analysisScope === 'selection') this.renderChart();
      },
      error: () => this.isChartLoading = false
    });
  }

  // ==========================================
  // 5. ECHARTS RENDERING ENGINE
  // ==========================================
  setChartView(view: ChartView) {
    this.selectedChartView = view;

    if (this.analysisScope === 'system' && this.isUtilizationBackedView(view) && this.systemUtilizationData.length === 0) {
      this.fetchSystemUtilization();
      return;
    }

    if (this.analysisScope === 'system' && !this.isUtilizationBackedView(view) && this.aggregateSystemData.length === 0) {
      this.fetchSystemAggregate();
      return;
    }

    this.renderChart();
  }

  setAnalysisScope(scope: 'system' | 'selection') { this.analysisScope = scope; this.renderChart(); }

  isUtilizationBackedView(view: ChartView = this.selectedChartView) {
    return view === 'utilization' || view === 'summary';
  }

  onChartInit(chart: any) {
    this.chartInstance = chart;
  }

  renderChart() {
    if (!this.isUtilizationBackedView()) {
      this.displayUtilizationSummary = null;
      this.presentationRows = [];
    }

    if (this.analysisScope === 'system') {
      if (this.isUtilizationBackedView()) {
        if (this.systemUtilizationData.length === 0) {
          this.chartLegendItems = [];
          this.echartsOptions = { title: { text: 'Select a Project to view producer/consumer utilization.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
          return;
        }
        this.selectedChartView === 'summary' ? this.generateSystemPresentationSummary() : this.generateSystemUtilization();
        return;
      }

      if (this.aggregateSystemData.length === 0) {
        this.chartLegendItems = [];
        this.echartsOptions = { title: { text: 'Select a Project to view macro system data.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
        return;
      }
      this.selectedChartView === 'trend' ? this.generateSystemTrend() : this.generateSystemSankey();
    } else {
      if (this.selectedNodes.size === 0) {
        this.chartLegendItems = [];
        this.echartsOptions = { title: { text: 'Select assets from the directory to perform isolated drill-down.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
        return;
      }

      if (this.isUtilizationBackedView()) {
        this.selectedChartView === 'summary' ? this.generateSelectionPresentationSummary() : this.generateSelectionUtilization();
        return;
      }

      this.selectedChartView === 'trend' ? this.generateSelectionTrend() : this.generateSelectionSankey();
    }
  }

  generateSystemTrend() {
    this.chartLegendItems = [
      { label: 'System Excess', color: this.chartColors.excess, detail: 'Producer heat above consumer demand' },
      { label: 'System Deficit', color: this.chartColors.deficit, detail: 'Consumer demand above producer heat' },
    ];
    const seriesList: any[] = [];
    const legendData: string[] = ['System Excess', 'System Deficit'];
    const excessData: any[] = []; const deficitData: any[] = []; const timestamps: number[] = [];

    this.aggregateSystemData.forEach(item => {
      const time = new Date(item.timestamp).getTime();
      if (isNaN(time)) return;
      timestamps.push(time);
      excessData.push([time, item.net_balance > 0 ? item.net_balance : 0]);
      deficitData.push([time, item.net_balance < 0 ? item.net_balance : 0]);
    });

    seriesList.push({ name: 'System Excess', type: 'line', showSymbol: false, data: excessData, yAxisIndex: 1, lineStyle: { width: 1, color: this.chartColors.excess }, areaStyle: { color: this.chartColors.excess, opacity: 0.3 }, itemStyle: { color: this.chartColors.excess }});
    seriesList.push({ name: 'System Deficit', type: 'line', showSymbol: false, data: deficitData, yAxisIndex: 1, lineStyle: { width: 1, color: this.chartColors.deficit }, areaStyle: { color: this.chartColors.deficit, opacity: 0.3 }, itemStyle: { color: this.chartColors.deficit }});

    this.buildEChartsConfig(legendData, seriesList, 'System Balance', 'Heat');
  }

  generateSystemSankey() {
    this.chartLegendItems = [
      { label: 'Producers', color: this.chartColors.producer, detail: 'Available heat sources' },
      { label: 'Consumers', color: this.chartColors.consumer, detail: 'Heat demand' },
      { label: 'Excess heat', color: this.chartColors.excess, detail: 'Producer heat not used' },
      { label: 'Unmet demand', color: this.chartColors.deficit, detail: 'Demand not served by producers' },
    ];
    const nodes: any[] = [];
    const links: any[] = [];
    const suppliedHeat = Math.min(this.totalSystemSupply, this.totalSystemDemand);
    const excessHeat = Math.max(this.totalSystemSupply - this.totalSystemDemand, 0);
    const unmetHeat = Math.max(this.totalSystemDemand - this.totalSystemSupply, 0);

    if (this.totalSystemSupply > 0) nodes.push({ name: 'Project Producers', itemStyle: { color: this.chartColors.producer } });
    if (this.totalSystemDemand > 0) nodes.push({ name: 'Project Consumers', itemStyle: { color: this.chartColors.consumer } });

    if (suppliedHeat > 0) {
      links.push({ source: 'Project Producers', target: 'Project Consumers', value: Math.round(suppliedHeat), lineStyle: { opacity: 0.45 } });
    }
    if (excessHeat > 0) {
      nodes.push({ name: 'System Excess Heat', itemStyle: { color: this.chartColors.excess } });
      links.push({ source: 'Project Producers', target: 'System Excess Heat', value: Math.round(excessHeat), lineStyle: { color: this.chartColors.excess, opacity: 0.6 } });
    }
    if (unmetHeat > 0) {
      nodes.push({ name: 'System Unmet Demand', itemStyle: { color: this.chartColors.deficit } });
      links.push({ source: 'System Unmet Demand', target: 'Project Consumers', value: Math.round(unmetHeat), lineStyle: { color: this.chartColors.deficit, opacity: 0.6 } });
    }

    this.buildSankeyConfig(nodes, links);
  }

  generateSelectionTrend() {
    this.chartLegendItems = [
      { label: 'Isolated Excess', color: this.chartColors.excess, detail: 'Selected producer heat above selected demand' },
      { label: 'Isolated Deficit', color: this.chartColors.deficit, detail: 'Selected demand above selected producer heat' },
      { label: 'Selected assets', color: this.chartColors.utilized, detail: 'Individual selected load traces' },
    ];
    const seriesList: any[] = [];
    const legendData: string[] = ['Isolated Excess', 'Isolated Deficit'];
    
    const timestampSet = new Set<number>();
    this.selectedNodes.forEach(node => {
      this.nodeProfilesCache.get(node.id)?.forEach((_, t) => timestampSet.add(t));
    });
    const timestamps = Array.from(timestampSet).sort();

    const excessData: any[] = []; const deficitData: any[] = [];
    timestamps.forEach(time => {
      let localSupply = 0; let localDemand = 0;
      this.selectedNodes.forEach(node => {
        const vals = this.nodeProfilesCache.get(node.id)?.get(time);
        if (vals) { localSupply += vals.supply; localDemand += vals.demand; }
      });
      const balance = localSupply - localDemand;
      excessData.push([time, balance > 0 ? balance : 0]);
      deficitData.push([time, balance < 0 ? balance : 0]);
    });

    seriesList.push({ name: 'Isolated Excess', type: 'line', showSymbol: false, data: excessData, yAxisIndex: 1, lineStyle: { width: 1, color: this.chartColors.excess }, areaStyle: { color: this.chartColors.excess, opacity: 0.3 }, itemStyle: { color: this.chartColors.excess }});
    seriesList.push({ name: 'Isolated Deficit', type: 'line', showSymbol: false, data: deficitData, yAxisIndex: 1, lineStyle: { width: 1, color: this.chartColors.deficit }, areaStyle: { color: this.chartColors.deficit, opacity: 0.3 }, itemStyle: { color: this.chartColors.deficit }});

    let i = 0;
    this.selectedNodes.forEach(node => {
      const nodeName = node.name || `Node ${node.id}`;
      legendData.push(nodeName);
      seriesList.push({ 
        name: nodeName, type: 'line', showSymbol: false, 
        data: timestamps.map(t => [t, Math.abs((this.nodeProfilesCache.get(node.id)?.get(t)?.supply || 0) - (this.nodeProfilesCache.get(node.id)?.get(t)?.demand || 0))]), 
        yAxisIndex: 0, lineStyle: { width: 2 }, itemStyle: { color: this.chartColors.palette[i % this.chartColors.palette.length] }
      });
      i++;
    });

    this.buildEChartsConfig(legendData, seriesList, 'Individual Load', 'Isolated Balance');
  }

  generateSelectionSankey() {
    this.chartLegendItems = [
      { label: 'Selected source', color: this.chartColors.producer, detail: 'Selected assets supplying heat' },
      { label: 'Selected sink', color: this.chartColors.consumer, detail: 'Selected assets consuming heat' },
      { label: 'Excess heat', color: this.chartColors.excess, detail: 'Unused selected heat' },
      { label: 'Deficit', color: this.chartColors.deficit, detail: 'Unserved selected demand' },
    ];
    const nodes: any[] = [{ name: 'Isolated Loop', itemStyle: { color: '#8f9bb3' } }];
    const links: any[] = [];
    let localSupply = 0; let localDemand = 0;

    let i = 0;
    this.selectedNodes.forEach(node => {
      const color = this.chartColors.palette[i % this.chartColors.palette.length];
      const nodeName = node.name || `Node ${node.id}`;
      
      if (node.totalSupplied > 0) {
        localSupply += node.totalSupplied;
        nodes.push({ name: `${nodeName} (Source)`, itemStyle: { color } });
        links.push({ source: `${nodeName} (Source)`, target: 'Isolated Loop', value: Math.round(node.totalSupplied), lineStyle: { opacity: 0.4 } });
      }
      
      if (node.totalDemanded > 0) {
        localDemand += node.totalDemanded;
        nodes.push({ name: `${nodeName} (Sink)`, itemStyle: { color } });
        links.push({ source: 'Isolated Loop', target: `${nodeName} (Sink)`, value: Math.round(node.totalDemanded), lineStyle: { opacity: 0.4 } });
      }
      i++;
    });

    const netBalance = localSupply - localDemand;
    if (netBalance > 0) {
      nodes.push({ name: 'Isolated Excess', itemStyle: { color: this.chartColors.excess } });
      links.push({ source: 'Isolated Loop', target: 'Isolated Excess', value: Math.round(netBalance), lineStyle: { color: this.chartColors.excess, opacity: 0.6 } });
    } else if (netBalance < 0) {
      nodes.push({ name: 'Isolated Deficit', itemStyle: { color: this.chartColors.deficit } });
      links.push({ source: 'Isolated Deficit', target: 'Isolated Loop', value: Math.round(Math.abs(netBalance)), lineStyle: { color: this.chartColors.deficit, opacity: 0.6 } });
    }

    this.buildSankeyConfig(nodes, links);
  }

  generateSystemUtilization() {
    this.displayUtilizationSummary = this.systemUtilizationSummary;
    this.presentationRows = this.buildPresentationRows(this.systemUtilizationSummary);
    this.buildUtilizationConfig(this.systemUtilizationData, 'System Heat Utilization');
  }

  generateSelectionUtilization() {
    const result = this.buildSelectionUtilizationData();
    this.displayUtilizationSummary = result.summary;
    this.presentationRows = this.buildPresentationRows(result.summary);
    this.buildUtilizationConfig(result.rows, 'Selected Heat Utilization');
  }

  generateSystemPresentationSummary() {
    this.displayUtilizationSummary = this.systemUtilizationSummary;
    this.presentationRows = this.buildPresentationRows(this.systemUtilizationSummary);
    this.buildPresentationSummaryConfig(this.systemUtilizationSummary, 'Annual Heat Utilization Summary');
  }

  generateSelectionPresentationSummary() {
    const result = this.buildSelectionUtilizationData();
    this.displayUtilizationSummary = result.summary;
    this.presentationRows = this.buildPresentationRows(result.summary);
    this.buildPresentationSummaryConfig(result.summary, 'Selected Annual Heat Utilization');
  }

  buildSelectionUtilizationData() {
    const timestampSet = new Set<number>();
    this.selectedNodes.forEach(node => {
      this.nodeProfilesCache.get(node.id)?.forEach((_, time) => timestampSet.add(time));
    });

    const timestamps = Array.from(timestampSet).sort();
    const rows = timestamps.map(time => {
      let producerHeat = 0;
      let consumerHeat = 0;

      this.selectedNodes.forEach(node => {
        const vals = this.nodeProfilesCache.get(node.id)?.get(time);
        if (vals) {
          producerHeat += vals.supply;
          consumerHeat += vals.demand;
        }
      });

      const utilizedHeat = Math.min(producerHeat, consumerHeat);
      return {
        timestamp: time,
        producer_heat_kw: producerHeat,
        consumer_heat_kw: consumerHeat,
        utilized_heat_kw: utilizedHeat,
        unused_producer_heat_kw: Math.max(producerHeat - consumerHeat, 0),
        unserved_consumer_heat_kw: Math.max(consumerHeat - producerHeat, 0),
      };
    });

    const producerCapacity = rows.reduce((max, row) => Math.max(max, row.producer_heat_kw), 0);
    const consumerCapacity = rows.reduce((max, row) => Math.max(max, row.consumer_heat_kw), 0);

    rows.forEach((row: any) => {
      row['producer_utilization_pct'] = row.producer_heat_kw > 0 ? (row.utilized_heat_kw / row.producer_heat_kw) * 100 : 0;
      row['consumer_utilization_pct'] = row.consumer_heat_kw > 0 ? (row.utilized_heat_kw / row.consumer_heat_kw) * 100 : 0;
      row['producer_heat_used_pct'] = row['producer_utilization_pct'];
      row['consumer_demand_served_pct'] = row['consumer_utilization_pct'];
      row['heat_match_pct'] = row.consumer_heat_kw > 0 ? (row.utilized_heat_kw / row.consumer_heat_kw) * 100 : 0;
    });

    return {
      rows,
      summary: this.buildUtilizationSummary(rows, producerCapacity, consumerCapacity),
    };
  }

  buildUtilizationSummary(rows: any[], producerCapacity: number, consumerCapacity: number) {
    const annualProducer = rows.reduce((sum, row) => sum + (row.producer_heat_kw || 0), 0);
    const annualConsumer = rows.reduce((sum, row) => sum + (row.consumer_heat_kw || 0), 0);
    const annualUtilized = rows.reduce((sum, row) => sum + (row.utilized_heat_kw || 0), 0);
    const hours = rows.length;

    return {
      producer_capacity_kw: producerCapacity,
      consumer_capacity_kw: consumerCapacity,
      producer_capacity_source: 'observed_peak',
      consumer_capacity_source: 'observed_peak',
      annual_producer_heat_kwh: annualProducer,
      annual_consumer_heat_kwh: annualConsumer,
      annual_utilized_heat_kwh: annualUtilized,
      annual_unused_producer_heat_kwh: Math.max(annualProducer - annualUtilized, 0),
      annual_unserved_consumer_heat_kwh: Math.max(annualConsumer - annualUtilized, 0),
      producer_annual_utilization_pct: annualProducer > 0 ? (annualUtilized / annualProducer) * 100 : 0,
      consumer_annual_utilization_pct: annualConsumer > 0 ? (annualUtilized / annualConsumer) * 100 : 0,
      heat_match_pct: annualConsumer > 0 ? (annualUtilized / annualConsumer) * 100 : 0,
      hours,
    };
  }

  buildPresentationRows(summary: any): PresentationValueRow[] {
    if (!summary) return [];
    return [
      { label: 'Producer heat available', value: summary.annual_producer_heat_kwh || 0, unit: 'kWh' },
      { label: 'Consumer heat demand', value: summary.annual_consumer_heat_kwh || 0, unit: 'kWh' },
      { label: 'Heat used by consumers', value: summary.annual_utilized_heat_kwh || 0, unit: 'kWh' },
      { label: 'Unused producer heat', value: summary.annual_unused_producer_heat_kwh || 0, unit: 'kWh' },
      { label: 'Unserved consumer demand', value: summary.annual_unserved_consumer_heat_kwh || 0, unit: 'kWh' },
      { label: 'Producer heat used', value: summary.producer_annual_utilization_pct || 0, unit: '%' },
      { label: 'Demand served', value: summary.consumer_annual_utilization_pct || 0, unit: '%' },
    ];
  }

  buildPresentationSummaryConfig(summary: any, title: string) {
    if (!summary) {
      this.chartLegendItems = [];
      this.echartsOptions = { title: { text: 'No utilization data available.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
      return;
    }

    const utilizedHeat = summary.annual_utilized_heat_kwh || 0;
    const unusedHeat = summary.annual_unused_producer_heat_kwh || 0;
    const unservedDemand = summary.annual_unserved_consumer_heat_kwh || 0;
    const producerPct = summary.producer_annual_utilization_pct || 0;
    const consumerPct = summary.consumer_annual_utilization_pct || 0;
    const unusedPct = Math.max(100 - producerPct, 0);
    const unservedPct = Math.max(100 - consumerPct, 0);
    const producerTotal = summary.annual_producer_heat_kwh || 0;
    const consumerTotal = summary.annual_consumer_heat_kwh || 0;
    const labelFormatter = (params: any) => {
      const value = Number(params.value || 0);
      const kwh = Number(params.data?.kwh || 0);
      return value >= 4 ? `${value.toFixed(1)}%\n${this.formatCompactNumber(kwh)} kWh` : '';
    };

    this.chartLegendItems = [
      { label: 'Heat used by consumers', color: this.chartColors.utilized, detail: `${producerPct.toFixed(1)}% of producer heat` },
      { label: 'Unused producer heat', color: this.chartColors.unused, detail: `${unusedPct.toFixed(1)}% of producer heat` },
      { label: 'Demand served', color: this.chartColors.served, detail: `${consumerPct.toFixed(1)}% of consumer demand` },
      { label: 'Unserved demand', color: this.chartColors.unserved, detail: `${unservedPct.toFixed(1)}% of consumer demand` },
    ];

    this.echartsOptions = {
      backgroundColor: '#ffffff',
      animationDuration: 500,
      color: [this.chartColors.utilized, this.chartColors.unused, this.chartColors.served, this.chartColors.unserved],
      title: {
        text: title,
        subtext: `Producer available: ${this.formatCompactNumber(producerTotal)} kWh   |   Consumer demand: ${this.formatCompactNumber(consumerTotal)} kWh`,
        left: 24,
        top: 18,
        textStyle: { color: this.chartColors.textColor, fontSize: 18, fontWeight: 800 },
        subtextStyle: { color: this.chartColors.textColor, fontSize: 12, lineHeight: 18 },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['Heat Used by Consumers', 'Unused Producer Heat', 'Demand Served', 'Unserved Demand'],
        textStyle: { color: this.chartColors.textColor },
        top: 22,
        right: 24,
        orient: 'vertical',
        itemWidth: 13,
        itemHeight: 13,
      },
      grid: { top: 116, left: 166, right: 54, bottom: 52, containLabel: true },
      xAxis: {
        type: 'value',
        max: 100,
        name: 'Share of annual total',
        axisLabel: {
          formatter: '{value}%',
          textStyle: { color: this.chartColors.textColor },
        },
        axisLine: { lineStyle: { color: this.chartColors.axisLine } },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      },
      yAxis: {
        type: 'category',
        data: [
          `Producer heat\n${this.formatCompactNumber(producerTotal)} kWh`,
          `Consumer demand\n${this.formatCompactNumber(consumerTotal)} kWh`,
        ],
        axisLabel: { color: this.chartColors.textColor, fontWeight: 800, fontSize: 13, lineHeight: 18 },
        axisLine: { lineStyle: { color: this.chartColors.axisLine } },
      },
      series: [
        {
          name: 'Heat Used by Consumers',
          type: 'bar',
          stack: 'annual',
          data: [{ value: producerPct, kwh: utilizedHeat }, { value: 0, kwh: 0 }],
          barWidth: 50,
          label: { show: true, formatter: labelFormatter, color: '#ffffff', fontWeight: 700 },
          itemStyle: { color: this.chartColors.utilized, barBorderRadius: [6, 0, 0, 6] },
        },
        {
          name: 'Unused Producer Heat',
          type: 'bar',
          stack: 'annual',
          data: [{ value: unusedPct, kwh: unusedHeat }, { value: 0, kwh: 0 }],
          barWidth: 50,
          label: { show: true, formatter: labelFormatter, color: '#12372a', fontWeight: 700 },
          itemStyle: { color: this.chartColors.unused, opacity: 0.86, barBorderRadius: [0, 6, 6, 0] },
        },
        {
          name: 'Demand Served',
          type: 'bar',
          stack: 'annual',
          data: [{ value: 0, kwh: 0 }, { value: consumerPct, kwh: utilizedHeat }],
          barWidth: 50,
          label: { show: true, formatter: labelFormatter, color: '#ffffff', fontWeight: 700 },
          itemStyle: { color: this.chartColors.served, barBorderRadius: [6, 0, 0, 6] },
        },
        {
          name: 'Unserved Demand',
          type: 'bar',
          stack: 'annual',
          data: [{ value: 0, kwh: 0 }, { value: unservedPct, kwh: unservedDemand }],
          barWidth: 50,
          label: { show: true, formatter: labelFormatter, color: '#ffffff', fontWeight: 700 },
          itemStyle: { color: this.chartColors.unserved, opacity: 0.86, barBorderRadius: [0, 6, 6, 0] },
        },
      ],
    };
  }

  buildUtilizationConfig(rows: any[], title: string) {
    this.chartLegendItems = [
      { label: 'Producer heat used', color: this.chartColors.producer, detail: 'Available producer heat used each hour' },
      { label: 'Demand served', color: this.chartColors.consumer, detail: 'Consumer demand served each hour' },
      { label: 'Utilized heat', color: this.chartColors.utilized, detail: 'Heat transferred to consumers each hour' },
    ];
    const producerUtilization = rows.map(row => [new Date(row.timestamp).getTime(), row.producer_utilization_pct || 0]);
    const consumerUtilization = rows.map(row => [new Date(row.timestamp).getTime(), row.consumer_utilization_pct || 0]);
    const utilizedHeat = rows.map(row => [new Date(row.timestamp).getTime(), row.utilized_heat_kw || 0]);

    this.echartsOptions = {
      backgroundColor: 'transparent',
      animationDuration: 500,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!params.length) return '';
          let tip = `<div style="font-weight:bold; margin-bottom:5px;">${new Date(params[0].value[0]).toLocaleString()}</div>`;
          params.forEach((p: any) => {
            const unit = p.seriesName === 'Utilized Heat' ? 'kW' : '%';
            tip += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]?.toFixed(2)} ${unit}</b></div>`;
          });
          return tip;
        },
      },
      legend: { data: ['Producer Heat Used', 'Demand Served', 'Utilized Heat'], textStyle: { color: this.chartColors.textColor }, bottom: 0, type: 'scroll' },
      grid: { top: 44, left: 64, right: 72, bottom: 82, containLabel: true },
      dataZoom: [{ type: 'slider', show: true, bottom: 30, xAxisIndex: [0] }, { type: 'inside', xAxisIndex: [0] }],
      xAxis: { type: 'time', boundaryGap: false, axisLine: { lineStyle: { color: this.chartColors.axisLine } }, axisLabel: { textStyle: { color: this.chartColors.textColor } } },
      yAxis: [
        {
          type: 'value',
          name: 'Utilization',
          position: 'left',
          axisLabel: { formatter: '{value}%', textStyle: { color: this.chartColors.textColor } },
          axisLine: { show: true, lineStyle: { color: this.chartColors.axisLine } },
          splitLine: { lineStyle: { type: 'dashed', opacity: 0.5 } },
        },
        {
          type: 'value',
          name: 'Heat',
          position: 'right',
          axisLabel: { formatter: '{value} kW', textStyle: { color: this.chartColors.textColor } },
          axisLine: { show: true, lineStyle: { color: this.chartColors.axisLine } },
          splitLine: { show: false },
        },
      ],
      series: [
        { name: 'Producer Heat Used', type: 'line', showSymbol: false, smooth: true, data: producerUtilization, yAxisIndex: 0, lineStyle: { width: 2, color: this.chartColors.producer }, itemStyle: { color: this.chartColors.producer } },
        { name: 'Demand Served', type: 'line', showSymbol: false, smooth: true, data: consumerUtilization, yAxisIndex: 0, lineStyle: { width: 2, color: this.chartColors.consumer }, itemStyle: { color: this.chartColors.consumer } },
        { name: 'Utilized Heat', type: 'bar', data: utilizedHeat, yAxisIndex: 1, barMaxWidth: 8, itemStyle: { color: this.chartColors.utilized, opacity: 0.35 } },
      ],
      title: { text: title, left: 16, top: 8, textStyle: { color: this.chartColors.textColor, fontSize: 13, fontWeight: 600 } },
    };
  }

  buildEChartsConfig(legendData: string[], seriesList: any[], y1Name: string, y2Name: string) {
    this.echartsOptions = {
      backgroundColor: 'transparent', animationDuration: 500,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: (params: any) => {
          if (!params.length) return '';
          let tip = `<div style="font-weight:bold; margin-bottom:5px;">${new Date(params[0].value[0]).toLocaleDateString()}</div>`;
          params.forEach((p: any) => { if (p.value[1] !== 0) tip += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]?.toFixed(2)} kW</b></div>`; });
          return tip;
      }},
      legend: { data: legendData, textStyle: { color: this.chartColors.textColor }, bottom: 0, type: 'scroll' },
      grid: { top: 40, left: 60, right: 60, bottom: 80, containLabel: true },
      dataZoom: [{ type: 'slider', show: true, bottom: 30, xAxisIndex: [0] }, { type: 'inside', xAxisIndex: [0] }],
      xAxis: { type: 'time', boundaryGap: false, axisLine: { lineStyle: { color: this.chartColors.axisLine } }, axisLabel: { textStyle: { color: this.chartColors.textColor } } },
      yAxis: [
        { type: 'value', name: y1Name, position: 'left', axisLine: { show: true, lineStyle: { color: this.chartColors.axisLine } }, axisLabel: { textStyle: { color: this.chartColors.textColor } }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.5 } } },
        { type: 'value', name: y2Name, position: 'right', axisLine: { show: true, lineStyle: { color: this.chartColors.axisLine } }, axisLabel: { textStyle: { color: this.chartColors.textColor } }, splitLine: { show: false } }
      ],
      series: seriesList
    };
  }

  buildSankeyConfig(nodes: any[], links: any[]) {
    const legendChildren: any[] = [
      {
        type: 'text',
        left: 0,
        top: 0,
        style: {
          text: 'Legend',
          fill: this.chartColors.textColor,
          font: '700 13px system-ui',
        },
      },
    ];

    this.chartLegendItems.forEach((item, index) => {
      const y = 26 + (index * 24);
      legendChildren.push(
        {
          type: 'rect',
          left: 0,
          top: y,
          shape: { width: 12, height: 12, r: 3 },
          style: { fill: item.color },
        },
        {
          type: 'text',
          left: 20,
          top: y - 2,
          style: {
            text: item.label,
            fill: this.chartColors.textColor,
            font: '12px system-ui',
          },
        },
      );
    });

    this.echartsOptions = {
      backgroundColor: '#ffffff',
      title: { text: 'Heat Flow Summary', left: 16, top: 10, textStyle: { color: this.chartColors.textColor, fontSize: 15, fontWeight: 700 } },
      graphic: [{ type: 'group', right: 20, top: 18, children: legendChildren }],
      tooltip: { trigger: 'item', triggerOn: 'mousemove', formatter: (p: any) => p.dataType === 'edge' ? `${p.data.source} ➔ ${p.data.target}<br/><b>${p.data.value.toLocaleString()} kW</b>` : p.name },
      series: [{
        type: 'sankey',
        layout: 'none',
        left: 24,
        right: 190,
        top: 58,
        bottom: 24,
        emphasis: { focus: 'adjacency' },
        data: nodes,
        links: links,
        lineStyle: { curveness: 0.5, opacity: 0.42 },
        label: { color: this.chartColors.textColor, fontFamily: 'system-ui', fontSize: 13, fontWeight: 'bold' },
      }]
    };
  }

  async copyCurrentVisualization() {
    if (!this.chartInstance?.getDataURL) {
      this.showCopyFeedback('No visual to copy');
      return;
    }

    const dataUrl = this.chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 3,
      backgroundColor: '#ffffff',
    });

    try {
      await this.copyImageDataUrl(dataUrl);
      this.showCopyFeedback('Visual copied');
    } catch (err) {
      this.downloadDataUrl(dataUrl);
      this.showCopyFeedback('PNG downloaded');
    }
  }

  copyUtilizationSummary() {
    if (!this.displayUtilizationSummary) return;
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ...this.buildPresentationRows(this.displayUtilizationSummary).map(row => [row.label, this.formatCopyNumber(row.value), row.unit]),
    ];
    this.copyRows(rows, 'Summary copied');
  }

  copyPresentationRows() {
    if (this.presentationRows.length === 0) return;
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ...this.presentationRows.map(row => [row.label, this.formatCopyNumber(row.value), row.unit]),
    ];
    this.copyRows(rows, 'Chart data copied');
  }

  private copyRows(rows: string[][], successLabel: string) {
    const text = rows.map(row => row.join('\t')).join('\n');
    this.copyText(text, successLabel);
  }

  private copyText(text: string, successLabel: string) {
    const write = navigator.clipboard
      ? navigator.clipboard.writeText(text).catch(() => this.fallbackCopyText(text))
      : this.fallbackCopyText(text);
    write
      .then(() => this.showCopyFeedback(successLabel))
      .catch(() => this.showCopyFeedback('Copy failed'));
  }

  private fallbackCopyText(text: string): Promise<void> {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied ? Promise.resolve() : Promise.reject();
  }

  private async copyImageDataUrl(dataUrl: string): Promise<void> {
    const clipboard = navigator.clipboard as any;
    const ClipboardItemCtor = (window as any).ClipboardItem;

    if (!clipboard?.write || !ClipboardItemCtor) {
      return Promise.reject();
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    await clipboard.write([
      new ClipboardItemCtor({ [blob.type || 'image/png']: blob }),
    ]);
  }

  private downloadDataUrl(dataUrl: string) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `heat-utilization-${this.selectedYear}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  private showCopyFeedback(message: string) {
    this.copyFeedback = message;
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
    this.copyFeedbackTimer = setTimeout(() => {
      this.copyFeedback = null;
    }, 1800);
  }

  private formatCopyNumber(value: number) {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return '0';
    return numberValue.toFixed(Math.abs(numberValue) >= 1000 ? 0 : 2);
  }

  private formatCompactNumber(value: number) {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return '0';
    return new Intl.NumberFormat(undefined, {
      notation: numberValue >= 100000 ? 'compact' : 'standard',
      maximumFractionDigits: numberValue >= 100000 ? 1 : 0,
    }).format(numberValue);
  }
}
