import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';
import { EChartsOption } from 'echarts';

interface Node {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

interface Edge {
  id: number;
  length: number;
  start_node: number; // ID reference
  end_node: number;   // ID reference
}

interface AlgorithmDetail {
  id: number;
  name: string;
  algorithm: string;
  total_edge_length: number;
  edges: Edge[];
  nodes: Node[];
  // Calculated for UI
  uiColor?: string;
  avgEdgeLength?: number;
  maxEdgeLength?: number;
  edgeCount?: number;
}

@Component({
  selector: 'ngx-edge-connection-comparison',
  templateUrl: './edge-connection-comparison.component.html',
  styleUrls: ['./edge-connection-comparison.component.scss']
})
export class EdgeConnectionComparisonComponent {
 @ViewChild(GoogleMap) map!: GoogleMap;
 
   // Data State
   summaryList: any[] = [];
   selectedIds: number[] = [];
   comparisonData: AlgorithmDetail[] = [];
   
   // Lookup map for fast geometry drawing: { NodeID: {lat, lng} }
   nodeLocationMap: { [key: number]: google.maps.LatLngLiteral } = {};
 
   // Visuals
   costChartOption: EChartsOption = {};
   distributionChartOption: EChartsOption = {};
   
   // UI State
   isLoadingList = false;
   isLoadingCompare = false;
 
   // Map Config
   mapOptions: google.maps.MapOptions = { 
     disableDefaultUI: true, 
     zoomControl: true,
     styles: [
       { featureType: 'poi', stylers: [{ visibility: 'off' }] },
       { featureType: 'road', stylers: [{ visibility: 'simplified' }, { lightness: 40 }] }
     ] 
   };
   center = { lat: 0, lng: 0 }; 
 
   // Palette: Professional Engineering tones
   palette = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#965dfe'];
 
   constructor(private api: RestApiService, private theme: NbThemeService) {}
 
   ngOnInit() {
     this.fetchSummaryList();
   }
 
   // --- 1. SELECTION LOGIC ---
 
   fetchSummaryList() {
     this.isLoadingList = true;
     this.api.get<any>('edge_connection_algorithms/?limit=50').subscribe({
       next: (res) => {
         this.summaryList = res.results || [];
         this.isLoadingList = false;
       },
       error: () => this.isLoadingList = false
     });
   }
 
   toggleSelection(id: number) {
     if (this.selectedIds.includes(id)) {
       this.selectedIds = this.selectedIds.filter(x => x !== id);
     } else {
       if (this.selectedIds.length >= 5) this.selectedIds.shift(); 
       this.selectedIds.push(id);
     }
     
     this.selectedIds.length > 0 ? this.fetchComparisonData() : (this.comparisonData = []);
   }
 
   // --- 2. DATA PROCESSING ---
 
   fetchComparisonData() {
     this.isLoadingCompare = true;
     this.api.post({ ids: this.selectedIds }, 'edge_connection_algorithms/compare/').subscribe({
       next: (data: AlgorithmDetail[]) => {
         this.comparisonData = data.map((algo, index) => {
           
           // 1. Calculate Stats
           const lengths = algo.edges.map(e => e.length);
           const totalLength = algo.total_edge_length || lengths.reduce((a, b) => a + b, 0);
           
           // 2. Build Node Map (Last one wins, assuming nodes are static per network)
           algo.nodes.forEach(n => {
             this.nodeLocationMap[n.id] = { lat: n.latitude, lng: n.longitude };
           });
 
           return {
             ...algo,
             uiColor: this.palette[index % this.palette.length],
             total_edge_length: totalLength,
             edgeCount: lengths.length,
             avgEdgeLength: totalLength / (lengths.length || 1),
             maxEdgeLength: Math.max(...lengths)
           };
         });
 
         this.generateVisualizations();
         this.fitMapBounds();
         this.isLoadingCompare = false;
       },
       error: () => this.isLoadingCompare = false
     });
   }
 
   // --- 3. CHARTS ---
 
   generateVisualizations() {
     this.theme.getJsTheme().subscribe(config => {
       const echarts: any = config.variables.echarts;
 
       // CHART A: Piping Cost (Total Length) vs Complexity (Edge Count)
       // Double Y-Axis Chart
       this.costChartOption = {
         color: this.comparisonData.map(c => c.uiColor),
         tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
         legend: { textStyle: { color: echarts.textColor } },
         grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
         xAxis: { 
           type: 'category', 
           data: this.comparisonData.map(c => c.name),
           axisLabel: { color: echarts.textColor, interval: 0, rotate: 15 }
         },
         yAxis: [
           { type: 'value', name: 'Total Length (m)', position: 'left', axisLabel: { color: echarts.textColor } },
           { type: 'value', name: 'Edge Count', position: 'right', axisLine: { show: false }, axisLabel: { color: echarts.textColor } }
         ],
         series: [
           {
             name: 'Total Length',
             type: 'bar',
             data: this.comparisonData.map(c => c.total_edge_length),
             itemStyle: { borderRadius: [5, 5, 0, 0] }
           },
           {
             name: 'Edge Count',
             type: 'line',
             yAxisIndex: 1,
             data: this.comparisonData.map(c => c.edgeCount),
             smooth: true,
             lineStyle: { width: 3, type: 'dashed' }
           }
         ]
       };
 
       // CHART B: Edge Length Distribution (Boxplot)
       // Visualizes if the algorithm creates uniform hops or long "highway" connections
       const boxData = this.comparisonData.map(c => {
         // Sort lengths for boxplot logic
         return c.edges.map(e => e.length).sort((a, b) => a - b);
       });
 
       this.distributionChartOption = {
         color: this.comparisonData.map(c => c.uiColor),
         tooltip: { trigger: 'item' },
         xAxis: { 
             type: 'category', 
             data: this.comparisonData.map(c => c.name),
             axisLabel: { color: echarts.textColor }
         },
         yAxis: { type: 'value', name: 'Individual Edge Lengths (m)' },
         series: [{
             name: 'Length Distribution',
             type: 'boxplot',
             data: boxData.map(d => {
                 // Simplified Boxplot Calc (Min, Q1, Median, Q3, Max)
                 const q1 = d[Math.floor(d.length * 0.25)];
                 const median = d[Math.floor(d.length * 0.5)];
                 const q3 = d[Math.floor(d.length * 0.75)];
                 return [d[0], q1, median, q3, d[d.length - 1]];
             })
         }]
       };
     });
   }
 
   // --- 4. GEOMETRY HELPERS ---
 
   fitMapBounds() {
     if (!this.comparisonData.length || typeof google === 'undefined') return;
     const bounds = new google.maps.LatLngBounds();
     let hasPoints = false;
 
     // Use nodes to determine bounds (faster than checking every edge)
     this.comparisonData[0]?.nodes.forEach(n => {
       bounds.extend({ lat: n.latitude, lng: n.longitude });
       hasPoints = true;
     });
 
     if (hasPoints && this.map) setTimeout(() => this.map.fitBounds(bounds), 200);
   }
 
   get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
   // Updated Helper in edge-algo-compare.component.ts
 getEdgePath(edge: Edge): google.maps.LatLngLiteral[] {
   const start = this.nodeLocationMap[edge.start_node];
   const end = this.nodeLocationMap[edge.end_node];
 
   if (start && end) {
     return [
       // Force conversion to Number with unary plus (+)
       { lat: +start.lat, lng: +start.lng },
       { lat: +end.lat, lng: +end.lng }
     ];
   }
   return [];
 }

}
