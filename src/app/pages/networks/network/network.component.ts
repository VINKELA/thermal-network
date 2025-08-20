import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { RestApiService } from '../../../@core/utils/rest-api.service';

interface NetworkData {
  network: any;
  translation: any;
  routes: any[];
  nodes: any[];
  statistics: any;
}
@Component({
  selector: 'ngx-network',
  templateUrl: './network.component.html',
  styleUrls: ['./network.component.scss']
})

export class NetworkComponent {
   apiUrl = environment.appUrl;
   
   networkData: NetworkData | null = null;
   loading = false;
   error: string | null = null;
   
   // Google Maps options
   center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
   zoom = 12;
   mapOptions: google.maps.MapOptions = {
     mapTypeId: 'roadmap',
     zoomControl: true,
     scrollwheel: true,
     disableDoubleClickZoom: false,
     maxZoom: 20,
     minZoom: 4,
   };
   
   // Map markers and polylines
   markers: google.maps.MarkerOptions[] = [];
   polylines: any[] = [];
   nodeInfoWindow: any = null;
   selectedNode: any = null;
   options: unknown;
   networkID: number;
   bounds: google.maps.LatLngBounds;
 
   constructor(private route: ActivatedRoute, private api: RestApiService) {}
   primaryOptions: any[] = [];
   secondaryOptions: any[] = [];
   selectedPrimary: string | null = null;
   selectedSecondary: string | null = null;
   loadingSecondary = false;
 
   ngOnInit(): void {
     this.loadPrimaryOptions();
   }
 
   loadNetworkData(): void {
     this.loading = true;
     this.error = null;
  
       // You can also perform actions here that depend on the ID
       this.api.get(`edge_algorithms/${this.selectedPrimary}/translations/${this.selectedSecondary}/`)
       .subscribe({
         next: (data:NetworkData) => {
           this.networkData = data;
           this.initializeMap(data);
           this.loading = false;
         },
         error: (err) => {
           this.error = 'Failed to load network data';
           this.loading = false;
           console.error(err);
         }
       });
     
   }
   
   loadPrimaryOptions(): void {
    this.route.paramMap.subscribe(params => {
     this.networkID = Number(params.get('id'));
     this.api.get(`getAlgorithmByNetworkID/${this.networkID}/`).subscribe({
       next: (data) => {
         this.primaryOptions = data['algorithms'] || [];
         // Auto-select first option if available
         if (this.primaryOptions.length > 0) {
           this.onPrimaryChange(this.primaryOptions[0].id);
         }
       },
       error: (err) => {
         console.error('Error fetching primary options:', err);
       }
     });})
   }
 
   onPrimaryChange(primaryId: string): void {
     this.selectedPrimary = primaryId;
     this.loadingSecondary = true;
     
     this.updateTranslations();
   }
 
   private updateTranslations() {
     this.api.get(`getTranslationByAlgorithmID/${this.selectedPrimary}/`).subscribe({
       next: (data) => {
         this.secondaryOptions = data['translations'];
         this.loadingSecondary = true;
         // Auto-select first option if available
         if (this.secondaryOptions.length > 0) {
           this.selectedSecondary = this.secondaryOptions[0].id;
         }
         this.loadNetworkData();
       },
       error: (err) => {
         console.error('Error fetching secondary options:', err);
         this.loadingSecondary = false;
       }
     });
   }
 
   onSecondaryChange(secondaryId: string): void {
     this.selectedSecondary = secondaryId;
     this.loadNetworkData();
   }
   initializeMap(data: NetworkData): void {
     if (!data.nodes?.length) return;
 
     // Calculate center based on nodes
      this.bounds = new google.maps.LatLngBounds();     
     // Create markers for nodes
     this.markers = data.nodes.map(node => {
       const position = { lat: node.latitude, lng: node.longitude };
       this.bounds.extend(position);
       const iconUrls: Record<string, string> = {
        producer: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        return: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
        consumer: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        storage: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png', // or teal if you have a custom icon
      };


       return {
         position,
         title: node.name,
         label: {
           text: node.name,
           color: this.getNodeColor(node.node_type),
           fontSize: '12px',
           fontWeight: 'bold',
         },
         options: {
          icon: {
              url: iconUrls[node.node_type], // Default Google Maps marker
              // OR use the standard red pin:
              // url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
              
              // Customization options:
              scaledSize: new google.maps.Size(32, 32), // Standard marker size
              origin: new google.maps.Point(0, 0),
              anchor: new google.maps.Point(16, 32) // Anchor at bottom center
          }
         },
         nodeData: node,
       };
     });
 
     this.polylines = data.routes.map((route, index) => {
       const path = this.decodePolyline(route.polyline);
       const color = this.getRouteColor(route);
       path.forEach(coord => {
       this.bounds.extend(coord);
     });
       return {
         path,
         strokeColor: color,
         strokeOpacity: 0.8,
         strokeWeight: 4,
         routeData: route,
         name: index
       };
     });
 
     // Set map center to bounds
     
     const center = this.bounds.getCenter();
     this.center = { lat: center.lat(), lng: center.lng() };
     this.zoom = 17;
   }
 
   getNodeColor(nodeType: string): string {
     const colors: Record<string, string> = {
       'producer': '#FF0000',      // Red
       'return': '#00FF00',      // Green
       'consumer': '#0000FF',    // Blue
       'storage': '#008080',     // Teal
     };
     return colors[nodeType] || '#333333'; // Default gray
   }
   getRouteColor(route:any): string {
     const colors: Record<string, string> = {
       'producer': '#FF0000',      // Red
       'return': '#00FF00',      // Green
       'consumer': '#0000FF',    // Blue
       'storage': '#008080',     // Teal
     };
     return  route.route_type == 'supply' ? '#FF0000':  '#0000FF'; // Default gray
   }
 
   decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
     const poly: google.maps.LatLngLiteral[] = [];
     let index = 0;
     const len = encoded.length;
     let lat = 0;
     let lng = 0;
 
     while (index < len) {
       let b;
       let shift = 0;
       let result = 0;
       do {
         b = encoded.charCodeAt(index++) - 63;
         result |= (b & 0x1f) << shift;
         shift += 5;
       } while (b >= 0x20);
       const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
       lat += dlat;
 
       shift = 0;
       result = 0;
       do {
         b = encoded.charCodeAt(index++) - 63;
         result |= (b & 0x1f) << shift;
         shift += 5;
       } while (b >= 0x20);
       const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
       lng += dlng;
 
       poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
     }
 
     return poly;
   }
 
   onNodeClick(node: any): void {
     this.selectedNode = node;
   }
 
   onRouteClick(route: any): void {
     console.log('Route clicked:', route);
     // You can implement route details display here
   }
}
