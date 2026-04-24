import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { takeWhile } from 'rxjs/operators';

@Component({
  selector: 'ngx-load-profile',
  templateUrl: './load-profile.component.html',
  styleUrls: ['./load-profile.component.scss']
})
export class LoadProfileComponent implements OnInit, OnDestroy {
  
  private alive = true;

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
  searchTimeout: any; 

  // --- DATA STATE ---
  entities: any[] = [];
  filteredEntities: any[] = [];
  
  // Cache Structure
  cachedSeriesData: { [key: string]: any[] } = {};

  // --- ECHARTS CONFIG ---
  // Initialize with empty object to prevent HTML errors
  echartsOptions: any = {}; 
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
    // 1. Theme Subscription
    this.theme.getJsTheme()
      .pipe(takeWhile(() => this.alive))
      .subscribe(config => {
        this.currentTheme = config;
        // Re-render chart if theme changes
        if (this.selectedEntity) {
          this.updateChartOptions();
        }
      });

    // 2. Initial Data Load
    this.fetchEntities(); 
  }

  ngOnDestroy(): void {
    this.alive = false;
  }

  // --- SEARCH & FILTERING ---

  fetchEntities(searchTerm: string = '') {
    this.isListLoading = true;
    
    const endpoint = this.selectedType === 'building' ? 'buildings/' : 'boilers/';
    let params = `?limit=100`; 
    if (searchTerm) {
      params += `&search=${encodeURIComponent(searchTerm)}`;
    }

    this.api.get<any>(`${endpoint}${params}`).subscribe({
      next: (data) => {
        // Handle both paginated results and raw arrays
        const results = (data && data.results) ? data.results : (Array.isArray(data) ? data : []);
        this.entities = results;
        this.filteredEntities = results;
        this.isListLoading = false;
      },
      error: (err) => {
        console.error('Fetch error:', err);
        this.entities = [];
        this.filteredEntities = [];
        this.isListLoading = false;
      }
    });
  }

  filterEntities() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.fetchEntities(this.searchText);
    }, 400); 
  }

  onTypeChange(type: string) {
    this.selectedType = type;
    this.searchPlaceholder = type === 'building' ? 'Search Building...' : 'Search Boiler...';
    this.searchText = ''; 
    this.selectedEntity = null;
    this.filteredEntities = [];
    this.fetchEntities();
  }

  selectEntity(entity: any) {
    this.selectedEntity = entity;
    this.fetchLoadProfile();
  }

  // --- CHART DATA FETCHING ---

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
        console.error('Profile fetch error:', err);
        this.cachedSeriesData = {};
        this.updateChartOptions(); // Clear chart on error
        this.isChartLoading = false;
      }
    });
  }

  processChartData(data: any[]) {
    this.cachedSeriesData = {};

    if (!data || data.length === 0) {
      this.updateChartOptions(); 
      return;
    }

    data.forEach(item => {
      const type = item.profile_type || 'Unknown';
      if (!this.cachedSeriesData[type]) {
        this.cachedSeriesData[type] = [];
      }
      
      const dateObj = new Date(item.start_date);
      if (!isNaN(dateObj.getTime())) {
        this.cachedSeriesData[type].push([dateObj.getTime(), item.value]);
      }
    });

    this.updateChartOptions();
  }

  // --- CHART RENDERING ---

  updateChartOptions() {
    if (!this.currentTheme) return;

    // Safety: Fallback colors if theme vars are missing
    const vars = this.currentTheme.variables;
    const colors = {
      danger: vars.danger || '#ff3d71',
      success: vars.success || '#00d68f',
      info: vars.info || '#0095ff',
      warning: vars.warning || '#ffaa00',
      primary: vars.primary || '#3366ff',
      textColor: vars.fgText || '#000000',
      axisLine: vars.separator || '#cccccc',
      bg: 'transparent'
    };

    // 1. Empty Data State
    if (Object.keys(this.cachedSeriesData).length === 0) {
      this.echartsOptions = {
        title: { 
          text: 'No Data Available for Selected Year', 
          left: 'center', top: 'center',
          textStyle: { color: colors.textColor } 
        }
      };
      return;
    }

    // 2. Define Series Styles
    const STYLE_MAP: any = {
      'heating': { color: colors.danger, name: 'Heating' },
      'waste_heat': { color: colors.success, name: 'Waste Heat' },
      'cooling': { color: colors.info, name: 'Cooling' },
      'electricity': { color: colors.warning, name: 'Electricity' }
    };

    // 3. Build Series Data
    const seriesList = Object.keys(this.cachedSeriesData).map(key => {
      const style = STYLE_MAP[key] || { color: colors.primary, name: key };
      return {
        name: style.name,
        type: 'line',
        sampling: 'lttb',
        symbol: 'none',
        smooth: false,
        data: this.cachedSeriesData[key],
        lineStyle: { width: 2, color: style.color },
        itemStyle: { color: style.color },
        areaStyle: { opacity: 0.1, color: style.color }
      };
    });

    // 4. Construct ECharts Option
    this.echartsOptions = {
      backgroundColor: colors.bg,
      color: seriesList.map(s => s.itemStyle.color),
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!params.length) return '';
          const date = new Date(params[0].value[0]);
          let tip = `<div style="font-weight:bold; margin-bottom:5px;">${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
          params.forEach((p: any) => {
            const val = p.value[1]?.toFixed(2) || '0.00';
            tip += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: <b>${val} kW</b></div>`;
          });
          return tip;
        }
      },
      legend: {
        data: seriesList.map(s => s.name),
        textStyle: { color: colors.textColor },
        bottom: 0
      },
      grid: {
        top: 40, left: 60, right: 40, bottom: 80, containLabel: true
      },
      dataZoom: [
        { type: 'slider', show: true, bottom: 30, xAxisIndex: [0] },
        { type: 'inside', xAxisIndex: [0] }
      ],
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisLabel: { textStyle: { color: colors.textColor } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Load (kW)',
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisLabel: { textStyle: { color: colors.textColor } },
        splitLine: { lineStyle: { color: colors.axisLine, type: 'dashed', opacity: 0.5 } }
      },
      series: seriesList
    };
  }
}