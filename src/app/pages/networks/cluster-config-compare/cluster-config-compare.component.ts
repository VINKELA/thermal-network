import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';
import { EChartsOption } from 'echarts';

// Interfaces for Type Safety
interface ClusterNode {
  id: number;
  buildings: any[];
  latitude: number;
  longitude: number;
}

interface Weights {
  alpha: number; // Density
  beta: number;  // Heterogeneity
  gamma: number; // Magnitude
  delta: number; // Waste Heat
}

interface ConfigDetail {
  id: number;
  name: string;
  description: string;
  clusters: ClusterNode[];
  weights?: Weights;
  uiColor?: string;
  parameters?: any; // To support JSON parameter reading
  stats?: {
    totalClusters: number;
    totalBuildings: number;
    avgSize: number;
    stdDev: number;
    maxSize: number;
  };
}

@Component({
  selector: 'ngx-cluster-config-compare',
  templateUrl: './cluster-config-compare.component.html',
  styleUrls: ['./cluster-config-compare.component.scss']
})
export class ClusterConfigCompareComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data State
  configList: any[] = [];
  selectedIds: number[] = [];
  comparisonData: ConfigDetail[] = [];

  // Visuals
  barChartOption: EChartsOption = {};
  boxPlotOption: EChartsOption = {};
  
  // UI State
  isLoadingList = false;
  isLoadingCompare = false;

  // Map Config
  mapOptions: google.maps.MapOptions = { 
    disableDefaultUI: false, 
    zoomControl: true,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ] 
  };
  center = { lat: 43.40, lng: -79.78 }; 

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchConfigList();
  }

  // --- 1. SELECTION LOGIC ---

  fetchConfigList() {
    this.isLoadingList = true;
    this.api.get<any>('cluster_configurations/?limit=100').subscribe({
      next: (res) => {
        this.configList = res.results || [];
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false
    });
  }

  toggleSelection(id: number) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      this.selectedIds.push(id);
    }
    
    this.selectedIds.length > 0 ? this.fetchComparisonData() : (this.comparisonData = []);
  }

  // --- 2. DATA PROCESSING ---

  fetchComparisonData() {
    this.isLoadingCompare = true;
    this.api.post({ ids: this.selectedIds }, 'cluster_configurations/compare/').subscribe({
      next: (data: any[]) => {
        this.comparisonData = data.map((config, index) => {
          
          // A. Calculate Stats
          const clusterSizes = config.clusters.map((c: any) => c.buildings?.length || 0);
          const totalBuildings = clusterSizes.reduce((a: number, b: number) => a + b, 0);
          
          const avgSize = clusterSizes.length > 0 ? totalBuildings / clusterSizes.length : 0;
          
          const variance = clusterSizes.length > 0 
            ? clusterSizes.reduce((sum: number, val: number) => sum + Math.pow(val - avgSize, 2), 0) / clusterSizes.length
            : 0;
          
          // B. Extract Weights using the helper
          let weights = this.extractWeights(config);
          
          // C. Fallback: If still zero, force equal parts so the bar shows up
          const totalW = weights.alpha + weights.beta + weights.gamma + weights.delta;
          if (totalW === 0) {
             console.warn(`No weights found for config ${config.id}. Defaulting to equal distribution.`);
             weights = { alpha: 1, beta: 1, gamma: 1, delta: 1 }; 
          }

          return {
            ...config,
            uiColor: this.getColor(index),
            weights: weights,
            stats: {
              totalClusters: config.clusters.length,
              totalBuildings,
              avgSize,
              maxSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
              stdDev: Math.sqrt(variance)
            }
          };
        });

        this.generateVisualizations();
        this.fitMapBounds();
        this.isLoadingCompare = false;
      },
      error: (err) => {
          console.error('Error fetching comparison:', err);
          this.isLoadingCompare = false;
      }
    });
  }

  // Helper: Parses weights from JSON, Array String, or Key-Value String
  private extractWeights(config: any): Weights {
      
      // STRATEGY A: Check the 'parameters' JSON field (Best Data Source)
      if (config.parameters) {
          const p = config.parameters;
          const alpha = p.alpha ?? p.Alpha ?? p.density ?? 0;
          const beta = p.beta ?? p.Beta ?? p.heterogeneity ?? 0;
          const gamma = p.gamma ?? p.Gamma ?? p.magnitude ?? 0;
          const delta = p.delta ?? p.Delta ?? p.waste_heat ?? 0;
          
          if (alpha || beta || gamma || delta) {
              return { 
                  alpha: Number(alpha), 
                  beta: Number(beta), 
                  gamma: Number(gamma), 
                  delta: Number(delta) 
              };
          }
      }

      const desc = config.description || "";

      // STRATEGY B: Parse Array Format -> "Weights: [0.1, 0.2, 0.3, 0.4]"
      // Your specific format: Weights: [0.0, 0.0, 0.9482, 0.0518]
      // Assumes Order: [Alpha, Beta, Gamma, Delta]
      const arrayRegex = /Weights:\s*\[\s*([\d\.]+)\s*,\s*([\d\.]+)\s*,\s*([\d\.]+)\s*,\s*([\d\.]+)\s*\]/i;
      const arrayMatch = desc.match(arrayRegex);

      if (arrayMatch) {
          return {
              alpha: parseFloat(arrayMatch[1]), 
              beta:  parseFloat(arrayMatch[2]), 
              gamma: parseFloat(arrayMatch[3]), 
              delta: parseFloat(arrayMatch[4])  
          };
      }

      // STRATEGY C: Fallback to Key-Value Regex ("Alpha: 0.1, Beta: 0.2")
      const getVal = (key: string) => {
        const regex = new RegExp(`${key}[^0-9\\.]*([\\d\\.]+)`, 'i');
        const match = desc.match(regex);
        return match ? parseFloat(match[1]) : 0;
      };

      return {
        alpha: getVal('Alpha') || getVal('Density') || 0,
        beta:  getVal('Beta')  || getVal('Heterogeneity') || 0,
        gamma: getVal('Gamma') || getVal('Magnitude') || 0,
        delta: getVal('Delta') || getVal('Waste') || 0,
      };
  }

  // --- 3. VISUALIZATIONS ---

  generateVisualizations() {
    this.theme.getJsTheme().subscribe(config => {
      const colors = config.variables;
      const echarts: any = config.variables.echarts;
      const categories = this.comparisonData.map(c => c.name);

      // A. STACKED BAR CHART
      const seriesAlpha: number[] = [];
      const seriesBeta: number[] = [];
      const seriesGamma: number[] = [];
      const seriesDelta: number[] = [];

      this.comparisonData.forEach(c => {
        const w = c.weights!;
        const totalWeight = w.alpha + w.beta + w.gamma + w.delta || 1;
        const meanSize = c.stats!.avgSize;

        seriesAlpha.push((w.alpha / totalWeight) * meanSize);
        seriesBeta.push((w.beta / totalWeight) * meanSize);
        seriesGamma.push((w.gamma / totalWeight) * meanSize);
        seriesDelta.push((w.delta / totalWeight) * meanSize);
      });

      this.barChartOption = {
        backgroundColor: echarts.bg,
        tooltip: { 
            trigger: 'axis', 
            axisPointer: { type: 'shadow' },
            formatter: (params: any) => {
                let tooltip = `<b>${params[0].name}</b><br/>`;
                let total = 0;
                params.forEach((p: any) => {
                    if(p.value > 0) {
                        tooltip += `${p.seriesName}: ${p.value.toFixed(1)}<br/>`;
                        total += p.value;
                    }
                });
                tooltip += `<b>Mean Size: ${total.toFixed(1)}</b>`;
                return tooltip;
            }
        },
        legend: { 
            data: ['Density (W1)', 'Diversity (W2)', 'Magnitude (W3)', 'Waste Heat (W4)'], 
            textStyle: { color: echarts.textColor },
            bottom: 0 
        },
        grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
        xAxis: {
          type: 'category',
          data: categories,
          axisLabel: { color: echarts.textColor, rotate: 30, interval: 0 },
          axisLine: { lineStyle: { color: echarts.axisLineColor } },
        },
        yAxis: {
          type: 'value',
          name: 'Mean Buildings / Cluster',
          nameTextStyle: { color: echarts.textColor },
          axisLabel: { color: echarts.textColor },
          splitLine: { lineStyle: { color: echarts.splitLineColor } },
        },
        series: [
          { name: 'Density (W1)', type: 'bar', stack: 'total', data: seriesAlpha, color: '#3366ff' },
          { name: 'Diversity (W2)', type: 'bar', stack: 'total', data: seriesBeta, color: '#00d68f' },
          { name: 'Magnitude (W3)', type: 'bar', stack: 'total', data: seriesGamma, color: '#ffaa00' },
          { name: 'Waste Heat (W4)', type: 'bar', stack: 'total', data: seriesDelta, color: '#ff3d71' }
        ]
      };

      // B. BOXPLOT
      const boxData: number[][] = [];
      this.comparisonData.forEach(c => {
        const sizes = c.clusters.map((cl: any) => cl.buildings?.length || 0).sort((a, b) => a - b);
        boxData.push(sizes);
      });

      this.boxPlotOption = {
        backgroundColor: echarts.bg,
        tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
        xAxis: { 
          type: 'category', 
          data: categories, 
          axisLabel: { color: echarts.textColor, rotate: 30, interval: 0 } 
        },
        yAxis: { 
          type: 'value', 
          name: 'Cluster Size Dist.',
          splitLine: { lineStyle: { color: echarts.splitLineColor } }
        },
        series: [{
          name: 'boxplot',
          type: 'boxplot',
          itemStyle: { 
              color: 'transparent', 
              borderColor: '#3366ff',
              borderWidth: 2
          },
          data: boxData.map(d => {
             const min = d[0];
             const max = d[d.length-1];
             const q1 = d[Math.floor(d.length * 0.25)];
             const med = d[Math.floor(d.length * 0.5)];
             const q3 = d[Math.floor(d.length * 0.75)];
             return [min, q1, med, q3, max];
          })
        }]
      };
    });
  }

  // --- 4. HELPERS ---

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    this.comparisonData.forEach(conf => {
      conf.clusters.forEach(c => {
        if(c.latitude && c.longitude) {
          bounds.extend({ lat: c.latitude, lng: c.longitude });
          hasPoints = true;
        }
      });
    });
    if (hasPoints && this.map) setTimeout(() => this.map.fitBounds(bounds), 200);
  }

  getColor(index: number): string {
    const palette = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#965dfe', '#888888', '#2CE69B', '#FF708D'];
    return palette[index % palette.length];
  }

  get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
}