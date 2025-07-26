import { Injectable } from '@angular/core';
import { RestApiService } from '../../services/rest-api.service';
import { HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FileService {

  constructor(private api: RestApiService) {
    this.token= localStorage.getItem("jwt") as string;
  }
  path = 'api/upload';
  private token :string|undefined
  update(id: number, data: any) {
    return this.api.update(id, data, this.path, this.token)
  }

  delete(id: number) {
    const data = {
       data: {
        isDeleted: true,
        active:false
       }
    }
    return this.api.update(id, data, this.path, this.token);
  }
  upload(data: FormData){
    const token= localStorage.getItem("jwt") as string;
    const headers = {
      "Authorization": `Bearer ${token}`
    }
    const url = environment.appUrl +  '/api/upload'
    return fetch(url, {
         method: 'POST',
         body:data,
         headers: headers
     })
     .then(response => response.json()).catch();

  }
  get(query:string|undefined=undefined, page:number = 1, size :number=10)
  {
      const url = query? `${this.path}?searchText=${query}&&page=${page}&&size=${size}`:
      `${this.path}`
      return this.api.get<any>(url, this.token)
  }
  getById(id:number){
    const url = `${id}?populate=logo`
    return this.api.getById(url, this.path,this.token);
  }
}
