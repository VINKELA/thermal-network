import { Injectable } from '@angular/core';
import { RestApiService } from '../../utils/rest-api.service';

@Injectable({
  providedIn: 'root'
})
export class CitiesApiService {

        url = 'cities/';
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
          return this.api.delete(id, this.url, this.token);
        }
        create(data: any){
          
           return this.api.post(data, this.url, this.token);
        }
        get(query?:string, page?:number , size? :number)
        {
            const url = `${this.url}`+ '?format=json'
            return this.api.get<any>(url, this.token)
        }
        getRoles()
        {
            const route = `${this.url}roles`
            return this.api.get<any>(route, this.token)
        }
      
        getById(id:number){
          return this.api.getById(id, this.url,this.token);
        }
}
