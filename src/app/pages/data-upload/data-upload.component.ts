import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http'; 
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-data-upload',
  templateUrl: './data-upload.component.html',
  styleUrls: ['./data-upload.component.scss']
})
export class DataUploadComponent implements OnInit {
  
  projects: any[] = [];
  selectedProjectId: number | null = null;
  
  // File Holders
  buildingFile: File | null = null;
  profileFile: File | null = null;
  detailedFile: File | null = null; // New for Detailed Import
  
  isUploading = false;

  constructor(
    private api: RestApiService,
    private http: HttpClient, 
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects() {
    this.api.get<any>('projects/').subscribe(data => {
      if (data && data.results && Array.isArray(data.results)) {
        this.projects = data.results;
      } else if (Array.isArray(data)) {
        this.projects = data;
      } else {
        this.projects = [];
      }
    });
  }

  // Updated to handle the new 'detailed' type
  onFileChange(event: any, type: 'building' | 'profile' | 'detailed') {
    const file = event.target.files[0];
    if (file) {
      if (type === 'building') this.buildingFile = file;
      else if (type === 'profile') this.profileFile = file;
      else if (type === 'detailed') this.detailedFile = file;
    }
  }

  // Original Method (Preserved)
  uploadBuildings() {
    if (!this.buildingFile || !this.selectedProjectId) {
      this.toastr.warning('Please select a project and a file.', 'Missing Data');
      return;
    }
    this.upload('buildings', this.buildingFile, { project_id: this.selectedProjectId });
  }

  // Original Method (Preserved)
  uploadProfiles() {
    if (!this.profileFile) {
      this.toastr.warning('Please select a file.', 'Missing Data');
      return;
    }
    this.upload('profiles', this.profileFile, {});
  }

  // New Method for Detailed Import
  uploadDetailedBuildings() {
    if (!this.detailedFile || !this.selectedProjectId) {
      this.toastr.warning('Please select a project and a file.', 'Missing Data');
      return;
    }
    // We target the same 'buildings' endpoint as it now supports the detailed columns
    this.upload('buildings', this.detailedFile, { project_id: this.selectedProjectId });
  }

  private upload(type: string, file: File, extraData: any) {
    this.isUploading = true;
    const formData = new FormData();
    formData.append('file', file);
    
    Object.keys(extraData).forEach(key => {
      formData.append(key, extraData[key]);
    });

    const url = `http://127.0.0.1:8000/api/upload/${type}/`; 

    this.http.post(url, formData).subscribe({
      next: (res: any) => {
        this.toastr.success(res.message, 'Upload Successful');
        this.isUploading = false;
        
        // Reset inputs
        if (type === 'buildings') {
           this.buildingFile = null;
           this.detailedFile = null;
        } else {
           this.profileFile = null;
        }
      },
      error: (err) => {
        this.isUploading = false;
        const msg = err.error?.error || 'Upload failed';
        this.toastr.danger(msg, 'Error');
      }
    });
  }
}