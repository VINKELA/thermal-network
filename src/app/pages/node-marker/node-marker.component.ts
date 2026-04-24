import { Component, ElementRef, Input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'ngx-node-marker',
  templateUrl: './node-marker.component.html',
  styleUrls: ['./node-marker.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class NodeMarkerComponent {
@Input() node: any;
  @Input() map!: google.maps.Map; // We need the raw Google Map object
  
  // Internal Overlay wrapper
  private overlay: google.maps.OverlayView;
  showLabel = false;

  constructor(private el: ElementRef) {
    // Create a barebones OverlayView class
    this.overlay = new google.maps.OverlayView();
  }

  ngOnInit(): void {
    if (!this.map || !this.node) return;

    // 1. Setup onAdd: Append this component's DOM to the map's pane
    this.overlay.onAdd = () => {
      const pane = this.overlay.getPanes()?.floatPane; // floatPane sits above markers
      if (pane) {
        pane.appendChild(this.el.nativeElement);
      }
    };

    // 2. Setup draw: Calculate position on screen
    this.overlay.draw = () => {
      const projection = this.overlay.getProjection();
      if (!projection) return;

      const latLng = new google.maps.LatLng(this.node.latitude, this.node.longitude);
      const point = projection.fromLatLngToDivPixel(latLng);

      if (point) {
        // Offset logic: Center the marker (assuming 30px width/height)
        const x = point.x - 15; 
        const y = point.y - 15;
        
        this.el.nativeElement.style.position = 'absolute';
        this.el.nativeElement.style.left = `${x}px`;
        this.el.nativeElement.style.top = `${y}px`;
        this.el.nativeElement.style.cursor = 'pointer';
      }
    };

    // 3. Setup onRemove
    this.overlay.onRemove = () => {
      if (this.el.nativeElement.parentElement) {
        this.el.nativeElement.parentElement.removeChild(this.el.nativeElement);
      }
    };

    // 4. Mount it
    this.overlay.setMap(this.map);
  }

  ngOnDestroy(): void {
    if (this.overlay) {
      this.overlay.setMap(null); // Cleanup
    }
  }

  // --- Visual Logic ---
  getIcon(): string {
    switch (this.node.node_type) {
      case 'producer': return 'eva eva-arrow-upward-outline';
      case 'consumer': return 'eva eva-arrow-downward-outline';
      case 'storage': return 'eva eva-battery-outline';
      case 'cluster': return 'eva eva-grid-outline';
      default: return 'eva eva-radio-button-on-outline';
    }
  }

  handleClick() {
    this.showLabel = !this.showLabel; // Toggle label on click
    console.log('Clicked Node:', this.node);
  }
}
