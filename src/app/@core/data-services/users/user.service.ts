import { UpdateUser } from './../../dtos/users/update-user';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { RestApiService } from '../../services/rest-api.service';
import { ResponseDataDto } from '../../dtos/shared/response-data.dto';
import { GetUsers } from '../../dtos/users/get-users';
import { CreateUser } from '../../dtos/users/create-user';
import { RoleDto } from '../../dtos/users/user-role';
import { PagedList } from '../../dtos/shared/paged-list';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  path = 'api/app-users/';
  url = `${this.path}/`

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
      return this.api.get<any>(this.path, this.token,query, page, size, this.columnsToSearch)
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
