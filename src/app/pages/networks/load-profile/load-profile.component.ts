import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';

@Component({
  selector: 'ngx-load-profile',
  templateUrl: './load-profile.component.html',
  styleUrls: ['./load-profile.component.scss']
})
export class LoadProfileComponent implements OnInit, OnDestroy {
  
  // --- SELECTION STATE ---
  selectedType: string = 'building';
  selectedYear: number = new Date().getFullYear() - 1; 
  selectedEntity: any = null;
  availableYears: number[] = [];

  // --- UI STATE ---
  searchPlaceholder: string = 'Search Building...';
  searchText: string = '';
  isListLoading = false;
  isChartLoading = false;
  
  // Timer for search debounce
  searchTimeout: any; 

  // --- DATA STATE ---
  entities: any[] = [];
  filteredEntities: any[] = [];
  
  // Cache Structure: { 'heating': [[ts, val], ...], 'waste_heat': [[ts, val], ...] }
  cachedSeriesData: { [key: string]: any[] } = {};

  // --- ECHARTS CONFIG ---
  echartsOptions: any = {};
  themeSubscription: any;
  currentTheme: any;

  constructor(
    private api: RestApiService,
    private theme: NbThemeService
  ) {
    const current = new Date().getFullYear();
    for (let i = current + 1; i >= current - 5; i--) {
      this.availableYears.push(i);
    }
  }

  ngOnInit(): void {
    this.themeSubscription = this.theme.getJsTheme().subscribe(config => {
      this.currentTheme = config;
      if (Object.keys(this.cachedSeriesData).length > 0) {
        this.updateChartOptions();
      }
    });

    this.fetchEntities(); // Load initial list
  }

  ngOnDestroy(): void {
    if (this.themeSubscription) this.themeSubscription.unsubscribe();
  }

  // --- 1. SERVER-SIDE SEARCH (Fixes "Search not getting all buildings") ---

  fetchEntities(searchTerm: string = '') {
    this.isListLoading = true;
    this.selectedEntity = null;
    this.echartsOptions = {}; 
    
    const endpoint = this.selectedType === 'building' ? 'buildings/' : 'boilers/';
    
    // Use limit=100 and search param
    let params = `?limit=100`; 
    if (searchTerm) {
      params += `&search=${encodeURIComponent(searchTerm)}`;
    }

    this.api.get<any>(`${endpoint}${params}`).subscribe({
      next: (data) => {
        let results = [];
        if (data && data.results && Array.isArray(data.results)) results = data.results;
        else if (Array.isArray(data)) results = data;

        this.entities = results;
        this.filteredEntities = results; 
        this.isListLoading = false;
      },
      error: (err) => {
        console.error('Failed to fetch entities', err);
        this.entities = [];
        this.filteredEntities = [];
        this.isListLoading = false;
      }
    });
  }

  filterEntities() {
    // Debounce search to avoid spamming API
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.fetchEntities(this.searchText);
    }, 300);
  }

  onTypeChange(type: string) {
    this.selectedType = type;
    if (type === 'building') this.searchPlaceholder = 'Search Building...';
    else this.searchPlaceholder = 'Search Boiler...';
    
    this.searchText = ''; 
    this.fetchEntities();
  }

  selectEntity(entity: any) {
    this.selectedEntity = entity;
    this.fetchLoadProfile();
  }

  // --- 2. DATA FETCHING (Gets Heating AND Waste Heat) ---

  fetchLoadProfile() {
    if (!this.selectedEntity) return;
    this.isChartLoading = true;
    
    const startDate = `${this.selectedYear}-01-01T00:00:00`;
    const endDate = `${this.selectedYear}-12-31T23:59:59`;
    
    let params = `?start_date__gte=${startDate}&end_date__lte=${endDate}`;
    
    if (this.selectedType === 'building') params += `&building=${this.selectedEntity.id}`;
    else params += `&boiler=${this.selectedEntity.id}`;

    params += `&ordering=start_date`;

    this.api.get<any>(`load-profiles/${params}`).subscribe({
      next: (data) => {
        const results = (data && data.results) ? data.results : (Array.isArray(data) ? data : []);
        this.processChartData(results);
        this.isChartLoading = false;
      },
      error: (err) => {
        console.error('Failed to fetch profiles', err);
        this.isChartLoading = false;
      }
    });
  }

  processChartData(data: any[]) {
    this.cachedSeriesData = {};

    data.forEach(item => {
      // Group by 'heating', 'waste_heat', 'cooling', etc.
      const type = item.profile_type || 'Unknown';
      if (!this.cachedSeriesData[type]) {
        this.cachedSeriesData[type] = [];
      }
      
      const timestamp = new Date(item.start_date).getTime();
      const val = item.value;
      this.cachedSeriesData[type].push([timestamp, val]);
    });

    this.updateChartOptions();
  }

  // --- 3. CHART CONFIG (Colors & Overlays) ---

  updateChartOptions() {
    if (!this.currentTheme || Object.keys(this.cachedSeriesData).length === 0) return;

    const themeVars: any = this.currentTheme.variables;
    const echartsVars: any = this.currentTheme.variables.echarts;

    // A. Define Distinct Colors & Names
    const STYLE_MAP: any = {
      'heating': { color: themeVars.danger, name: 'Heating Demand' },       // Red
      'waste_heat': { color: themeVars.success, name: 'Waste Heat Supply' }, // Green
      'cooling': { color: themeVars.info, name: 'Cooling Demand' },         // Blue
      'electricity': { color: themeVars.warning, name: 'Electricity' }      // Orange
    };

    // B. Build Series
    const seriesList = Object.keys(this.cachedSeriesData).map(key => {
      const style = STYLE_MAP[key] || { color: themeVars.primary, name: key };
      
      return {
        name: style.name,
        type: 'line',
        sampling: 'lttb', 
        symbol: 'none',
        smooth: false,
        data: this.cachedSeriesData[key],
        lineStyle: { width: 2, color: style.color },
        itemStyle: { color: style.color, opacity: 0.8 },
        // Add areaStyle if you want them filled (optional)
        // areaStyle: { opacity: 0.1 } 
      };
    });

    const startOfYear = new Date(this.selectedYear, 0, 1).getTime();
    const endOfYear = new Date(this.selectedYear, 11, 31, 23, 59).getTime();

    this.echartsOptions = {
      backgroundColor: echartsVars.bg,
      
      // Auto-assign colors based on our series order logic
      color: seriesList.map(s => s.itemStyle.color),
      
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const date = new Date(params[0].value[0]);
          let tip = `<div style="margin-bottom:5px; font-weight:bold;">${date.toLocaleString()}</div>`;
          
          params.forEach((p: any) => {
             const val = p.value[1] !== undefined ? p.value[1].toFixed(2) : '0.00';
             // Use the specific series color dot
             tip += `<div style="display:flex; justify-content:space-between; align-items:center;">
                      <span>${p.marker} ${p.seriesName}: </span>
                      <span style="font-weight:bold; margin-left:10px;">${val} kW</span>
                    </div>`;
          });
          return tip;
        }
      },
      
      legend: {
        data: seriesList.map(s => s.name),
        textStyle: { color: echartsVars.textColor },
        bottom: 0 
      },
      
      grid: {
        top: 40,
        left: 60,
        right: 40,
        bottom: 90, 
        containLabel: true
      },

      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          start: 0,
          end: 100,
          bottom: 35,
          borderColor: echartsVars.axisLineColor,
          textStyle: { color: echartsVars.textColor }
        },
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: 100
        }
      ],

      xAxis: {
        type: 'time',
        min: startOfYear,
        max: endOfYear,
        boundaryGap: false,
        axisLine: { lineStyle: { color: echartsVars.axisLineColor } },
        splitLine: { show: false },
        axisLabel: { 
          textStyle: { color: echartsVars.textColor },
          formatter: (value: number) => {
            const date = new Date(value);
            if (date.getDate() === 1 && date.getHours() === 0) {
              return date.toLocaleString('en-US', { month: 'short' });
            }
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
          }
        }
      },
      
      yAxis: {
        type: 'value',
        name: 'Load (kW)',
        axisLine: { lineStyle: { color: echartsVars.axisLineColor } },
        splitLine: { lineStyle: { color: echartsVars.splitLineColor } },
        axisLabel: { textStyle: { color: echartsVars.textColor } }
      },
      
      series: seriesList
    };
  }
}