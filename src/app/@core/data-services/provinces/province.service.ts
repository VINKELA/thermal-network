import { Injectable } from '@angular/core';
import { RestApiService } from '../../utils/rest-api.service';

@Injectable({
  providedIn: 'root'
})
export class ProvinceService {

  path = 'provinces/?format=json';
      url = `${this.path}`
    
      private token :string|undefined
      client: number;
      columnsToSearch:any= ['email'];
    
      constructor(private api: RestApiService ) {
        this.token= localStorage.getItem("jwt") as string;
        this.client = parseInt(localStorage.getItem('client') ?? "0")
    
       }
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
          return this.api.get<any>(this.path, this.token)
      }
      getRoles()
      {
          const route = `${this.path}roles`
          return this.api.get<any>(route, this.token)
      }
    
      getById(id:number){
        return this.api.getById(id, this.path,this.token);
      }
}
