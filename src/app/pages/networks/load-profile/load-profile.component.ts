import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { BehaviorSubject, Subject, forkJoin, of } from 'rxjs';
import { takeWhile, debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';

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
  totalSystemSupply: number = 0;
  totalSystemDemand: number = 0;
  isChartLoading: boolean = false;

  // --- CHARTING STATE ---
  analysisScope: 'system' | 'selection' = 'system'; 
  selectedChartView: 'trend' | 'sankey' = 'trend';
  echartsOptions: any = {}; 
  chartColors: any;
  currentTheme: any;

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
  }

  extractThemeColors() {
    const vars = this.currentTheme.variables;
    this.chartColors = {
      excess: vars.success || '#00d68f',
      deficit: vars.danger || '#ff3d71',
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
        let params = `?node_type=${filters.type}&page=${filters.page}&page_size=5`;
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
    
    if (projectId) {
      this.api.get<any>(`networks/?project_id=${projectId}`).subscribe(res => {
        this.networks = res.results || res || [];
      });
      this.fetchSystemAggregate(); // Refresh macro data
    } else {
      this.networks = [];
      this.aggregateSystemData = [];
      this.renderChart();
    }
  }

  onNetworkChange(networkId: number | string) {
    const state = this.filterState$.getValue();
    this.filterState$.next({ ...state, network: networkId, page: 1 });
    this.fetchSystemAggregate(); 
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
    if (!state.project) return;
    
    this.isChartLoading = true;
    const start = `${this.selectedYear}-01-01T00:00:00`;
    const end = `${this.selectedYear}-12-31T23:59:59`;
    
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
    this.renderChart();
  }

  fetchIndividualProfile(node: any) {
    if (this.nodeProfilesCache.has(node.id)) {
      this.renderChart();
      return;
    }

    this.isChartLoading = true;
    const start = `${this.selectedYear}-01-01T00:00:00`;
    const end = `${this.selectedYear}-12-31T23:59:59`;
    
    // Check if it's a building or boiler to query LoadProfile correctly
    let param = '';
    if (node.node_type === 'building' && node.building) param = `building=${node.building}`;
    else if (node.node_type === 'boiler' && node.boiler) param = `boiler=${node.boiler}`;
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
  setChartView(view: 'trend' | 'sankey') { this.selectedChartView = view; this.renderChart(); }
  setAnalysisScope(scope: 'system' | 'selection') { this.analysisScope = scope; this.renderChart(); }

  renderChart() {
    if (this.analysisScope === 'system') {
      if (this.aggregateSystemData.length === 0) {
        this.echartsOptions = { title: { text: 'Select a Project to view macro system data.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
        return;
      }
      this.selectedChartView === 'trend' ? this.generateSystemTrend() : this.generateSystemSankey();
    } else {
      if (this.selectedNodes.size === 0) {
        this.echartsOptions = { title: { text: 'Select assets from the directory to perform isolated drill-down.', left: 'center', top: 'center', textStyle: { color: this.chartColors?.textColor } } };
        return;
      }
      this.selectedChartView === 'trend' ? this.generateSelectionTrend() : this.generateSelectionSankey();
    }
  }

  generateSystemTrend() {
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

    let i = 0;
    this.selectedNodes.forEach(node => {
      const nodeName = node.name || `Node ${node.id}`;
      legendData.push(nodeName);
      const cacheMap = this.nodeProfilesCache.get(node.id);
      
      seriesList.push({ 
        name: nodeName, type: 'line', showSymbol: false, 
        data: timestamps.map(t => {
          const vals = cacheMap?.get(t);
          return [t, vals ? Math.abs(vals.supply - vals.demand) : 0];
        }), 
        yAxisIndex: 0, lineStyle: { width: 2 }, itemStyle: { color: this.chartColors.palette[i % this.chartColors.palette.length] }
      });
      i++;
    });

    this.buildEChartsConfig(legendData, seriesList, 'Individual Load', 'System Balance');
  }

  generateSystemSankey() {
    const nodes: any[] = [{ name: 'Thermal Ambient Loop', itemStyle: { color: '#8f9bb3' } }];
    const links: any[] = [];

    let i = 0;
    this.selectedNodes.forEach(node => {
      const color = this.chartColors.palette[i % this.chartColors.palette.length];
      const nodeName = node.name || `Node ${node.id}`;
      
      if (node.totalSupplied > 0) {
        nodes.push({ name: `${nodeName} (Source)`, itemStyle: { color } });
        links.push({ source: `${nodeName} (Source)`, target: 'Thermal Ambient Loop', value: Math.round(node.totalSupplied), lineStyle: { opacity: 0.4 } });
      }
      if (node.totalDemanded > 0) {
        nodes.push({ name: `${nodeName} (Sink)`, itemStyle: { color } });
        links.push({ source: 'Thermal Ambient Loop', target: `${nodeName} (Sink)`, value: Math.round(node.totalDemanded), lineStyle: { opacity: 0.4 } });
      }
      i++;
    });

    const netBalance = this.totalSystemSupply - this.totalSystemDemand;
    if (netBalance > 0) {
      nodes.push({ name: 'System Excess Heat', itemStyle: { color: this.chartColors.excess } });
      links.push({ source: 'Thermal Ambient Loop', target: 'System Excess Heat', value: Math.round(netBalance), lineStyle: { color: this.chartColors.excess, opacity: 0.6 } });
    } else if (netBalance < 0) {
      nodes.push({ name: 'System Unmet Demand', itemStyle: { color: this.chartColors.deficit } });
      links.push({ source: 'System Unmet Demand', target: 'Thermal Ambient Loop', value: Math.round(Math.abs(netBalance)), lineStyle: { color: this.chartColors.deficit, opacity: 0.6 } });
    }

    this.buildSankeyConfig(nodes, links);
  }

  generateSelectionTrend() {
    const seriesList: any[] = [];
    const legendData: string[] = ['Isolated Excess', 'Isolated Deficit'];
    
    const timestampSet = new Set<number>();
    this.nodeProfilesCache.forEach(map => map.forEach((_, t) => timestampSet.add(t)));
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
    this.echartsOptions = {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', triggerOn: 'mousemove', formatter: (p: any) => p.dataType === 'edge' ? `${p.data.source} ➔ ${p.data.target}<br/><b>${p.data.value.toLocaleString()} kW</b>` : `${p.name}: <b>${p.value.toLocaleString()} kW</b>` },
      series: [{ type: 'sankey', layout: 'none', emphasis: { focus: 'adjacency' }, data: nodes, links: links, lineStyle: { curveness: 0.5 }, label: { color: this.chartColors.textColor, fontFamily: 'system-ui', fontSize: 13, fontWeight: 'bold' } }]
    };
  }
}