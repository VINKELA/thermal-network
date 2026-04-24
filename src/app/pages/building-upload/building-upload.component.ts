import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../@core/utils/rest-api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ngx-building-upload',
  templateUrl: './building-upload.component.html',
  styleUrls: ['./building-upload.component.scss']
})
export class BuildingUploadComponent implements OnInit {

  // State
  projects: any[] = [];
  selectedProjectId: number | null = null;
  selectedFile: File | null = null;
  isUploading = false;

  constructor(
    private api: RestApiService,
    private http: HttpClient, // Direct HTTP for FormData
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects() {
    this.api.get<any>('projects/').subscribe(data => {
      // Handle pagination or flat array
      this.projects = (data && data.results) ? data.results : (Array.isArray(data) ? data : []);
    });
  }

  onFileSelected(event: any) {
    if (event.target.files && event.target.files[0]) {
      this.selectedFile = event.target.files[0];
    }
  }

  /**
   * Generates a CSV template in the browser so users know exactly what columns to fill.
   */
  downloadTemplate() {
    const headers = [
      'latitude', 'longitude', 'name', 
      'heating_demand', 'cooling_demand', 
      'waste_heat_source_type','floor_area', 'height', 'fsa','area','type', 'load_type'
    ];
    
    // Example Row
    const example = '43.6532,-79.3832,Datacenter A,250.5,0,data_centre,5000,12,L7L,0.90, commercial, cool_dominant';
    const csvContent = headers.join(',') + '\n' + example;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'building_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  upload() {
    if (!this.selectedFile || !this.selectedProjectId) {
      this.toastr.warning('Please select a project and a file.');
      return;
    }

    this.isUploading = true;
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('project_id', this.selectedProjectId.toString());

    // Matches the BulkUploadView in your Django Backend
    const url = `${environment.appUrl}/upload/buildings/`;

    this.http.post(url, formData).subscribe({
      next: (res: any) => {
        this.toastr.success(res.message, 'Import Successful');
        this.isUploading = false;
        this.selectedFile = null;
        // Optional: Emit event to refresh parent list
      },
      error: (err) => {
        this.isUploading = false;
        const msg = err.error?.error || 'Upload failed';
        this.toastr.danger(msg, 'Error');
      }
    });
  }
}