import { SearchQueryService } from '../../services/search-query.service';
import { UpdateUser } from '../../dtos/users/update-user';
import { RestApiService } from '../../services/rest-api.service';
import { Injectable } from '@angular/core';
@Injectable({
  providedIn: 'root'
})
export class ClientService {
  constructor(private api: RestApiService, private queryService: SearchQueryService) {
    this.token= localStorage.getItem("jwt") as string;
  }
  path = 'api/clients';
  url = `${this.path}/`
  columnsToSearch:any= ['name','created_by_email'];
  private token :string|undefined
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
        deleted: true,
        active:false
       }
    }
    return this.api.update(id, data, this.url, this.token);
  }
  create(client: any){
     return this.api.post(client, this.path);
  }
  get(query?:string, page?:number , size? :number)
  {
      return this.api.get<any>(this.path, this.token,query, page, size, this.columnsToSearch)
  }
  getById(id:number){
    const resourceUrl = `${id}?populate=logo`
    return this.api.getById(resourceUrl, this.url,this.token);
  }
}
