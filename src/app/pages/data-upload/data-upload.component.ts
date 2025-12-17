import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http'; // Import HttpClient for file upload
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
  
  isUploading = false;

  constructor(
    private api: RestApiService,
    private http: HttpClient, // Direct HTTP used for FormData
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

 loadProjects() {
  // Change <any[]> to <any> so we can check properties
  this.api.get<any>('projects/').subscribe(data => {
    
    // FIX: Check if the response is paginated
    if (data && data.results && Array.isArray(data.results)) {
      this.projects = data.results;
    } 
    // Or if it is already a flat array
    else if (Array.isArray(data)) {
      this.projects = data;
    } 
    // Fallback
    else {
      this.projects = [];
    }
    
  });
}

  onFileChange(event: any, type: 'building' | 'profile') {
    const file = event.target.files[0];
    if (type === 'building') this.buildingFile = file;
    else this.profileFile = file;
  }

  uploadBuildings() {
    if (!this.buildingFile || !this.selectedProjectId) {
      this.toastr.warning('Please select a project and a file.', 'Missing Data');
      return;
    }
    
    this.upload('buildings', this.buildingFile, { project_id: this.selectedProjectId });
  }

  uploadProfiles() {
    if (!this.profileFile) {
      this.toastr.warning('Please select a file.', 'Missing Data');
      return;
    }
    this.upload('profiles', this.profileFile, {});
  }

  private upload(type: string, file: File, extraData: any) {
    this.isUploading = true;
    const formData = new FormData();
    formData.append('file', file);
    
    // Append extra data (like project_id)
    Object.keys(extraData).forEach(key => {
      formData.append(key, extraData[key]);
    });

    // Note: Adjust URL to match your full API path
    // Using http directly because RestApiService might set JSON headers that conflict with FormData
    const url = `http://127.0.0.1:8000/api/upload/${type}/`; 

    this.http.post(url, formData).subscribe({
      next: (res: any) => {
        this.toastr.success(res.message, 'Upload Successful');
        this.isUploading = false;
        // Reset inputs
        if(type === 'buildings') this.buildingFile = null;
        else this.profileFile = null;
      },
      error: (err) => {
        this.isUploading = false;
        const msg = err.error?.error || 'Upload failed';
        this.toastr.danger(msg, 'Error');
      }
    });
  }
}