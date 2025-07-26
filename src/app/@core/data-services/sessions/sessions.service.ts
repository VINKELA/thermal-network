import { Injectable } from '@angular/core';
import { RestApiService } from '../../services/rest-api.service';

@Injectable({
  providedIn: 'root'
})
export class SessionsService {

  constructor(private api: RestApiService) {
    this.token= localStorage.getItem("jwt") as string;
    this.client = parseInt(localStorage.getItem('client') ?? "0")
  }
  path = 'api/sessions';
  url = `${this.path}/`
  columnsToSearch:any= ['name'];
  private token :string|undefined
  private client:number|undefined
  update(id: number, data: any) {
    return this.api.update(id, data, this.url, this.token)
  }
  deactivate(id: number)
  {
    const data = {
      active: false
    }
    return this.api.update(id, data, this.url, this.token);
  }
  activate(id: number)
  {
    const data = {
      active: true
    }
    return this.api.update(id, data, this.url, this.token);
  }
  delete(id: number) {
    const data = {
       data: {
        isDeleted: true,
        active:false
       }
    }
    return this.api.update(id, data, this.url, this.token);
  }
  create(school: any){
    const resource = {
      data:{
        ...school,
        client: this.client
      }
    }
     return this.api.post(resource, this.path, this.token);
  }
  get(query?:string, page?:number , size? :number)
  {
      return this.api.get<any>(this.path, this.token,query, page, size, this.columnsToSearch)
  }
  getById(id:number){
    return this.api.getById(id, this.url,this.token);
  }
}
