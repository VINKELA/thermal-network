import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import {catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { query } from '@angular/animations';

@Injectable({
  providedIn: 'root'
})
export class RestApiService {
  apiUrl = environment?.appUrl + '/'
  constructor(private http: HttpClient) { }
  httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    }),
  };
    // HttpClient API get() method => Fetch resources list
    get<T>(path:string, token?:string): Observable<T>
    {
      this.authorizeRequest(token)
      let url = path;
      return this.http
        .get<T>(this.apiUrl + url,
          this.httpOptions
          )
          .pipe(
          map(response => (<T>response)),
          catchError(async (error) => <T>(error.error)))
    }

    getAll(path:string, token?:string
      ):Promise<any>
    {
      const url = this.apiUrl;
     return fetch(this.apiUrl + url,   {
        headers: {
          'Content-Type': 'application/json',
          'Authorization':`Bearer ${token}`
        }
      })
            .then(response => response.json())
            .then((resp:any) =>{
             const data =  resp?.data
        
            return data
        })
    }

      // HttpClient API get() method => Fetch resource
getById<T>(id: any, url:string, token:string | undefined = undefined): Observable<T>
  {
  this.authorizeRequest(token)
  return this.http
    .get<T>(this.apiUrl + url + id, this.httpOptions)
    .pipe(
      map(response => (<T>response)),
      catchError(async (error) => <T>(error.error)))
}
  // HttpClient API post() method => Create resource
post<T>(resource: any, url:string, token:string|undefined = undefined): Observable<T>
{
this.authorizeRequest(token)
return this.http
  .post<T>(
    this.apiUrl + url,
    resource,
    this.httpOptions
  )
  .pipe(
    map(response => (<T>response)),
    catchError(async (error) => <T>(error.error)))
}
  // HttpClient API put() method => Update resource
update<T>(id: any, resource: any, url:string, token:string|undefined = undefined): Observable<T> {
this.authorizeRequest(token)
return this.http
    .patch<T>(
      this.apiUrl + url + id +'/',
      resource,
      this.httpOptions
    )
    .pipe(
      map(response => (<T>response)),
      catchError(async (error) => <T>(error.error)))
}
  // HttpClient API delete() method => Delete resource
delete<T>(id: any, url:string, token:string|undefined = undefined) {
  this.authorizeRequest(token)
  const path = this.apiUrl + url + `${id}`;
  console.log("Deleting resource at path:", path);
return this.http
    .delete<T>(path, this.httpOptions)
    .pipe(
      map(response => (<T>response)),
      catchError(async (error) => <T>(error.error)))
}
private authorizeRequest(token:string|undefined){
  if(token)
  {
    this.httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization':`Bearer ${token}`
      })
  }
}
else{
  this.httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
}

}
}
handleError(error: any) {
  let errorMessage = '';
  if (error.error instanceof ErrorEvent) {
    // Get client-side error
    errorMessage = error.error.message;
  } else {
    // Get server-side error
    errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
  }
console.log(errorMessage);
  return throwError(() => {
    return errorMessage;
  });
}
}

