import { Injectable } from '@angular/core';
import { RestApiService } from '../../services/rest-api.service';
import { Observable } from 'rxjs/internal/Observable';
import { ResponseDataDto } from '../../dtos/shared/response-data.dto';

@Injectable({
  providedIn: 'root'
})
export class BulkOperationService {
  token = localStorage.getItem("jwt") as string;
  client = parseInt(localStorage.getItem('client')??'')
  school = parseInt(localStorage.getItem('school')??'')
constructor(private apiService:RestApiService) {

   }
  uploadData(data:any, url:string):Observable<ResponseDataDto<boolean>>
  {
    const resource = {
      data: data,
      client: this.client,
      school: this.school
    }
    return this.apiService.post(resource, url, this.token)
  }


}
