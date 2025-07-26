import { TestBed } from '@angular/core/testing';

import { NetworkApiService } from './network-api.service';

describe('NetworkApiService', () => {
  let service: NetworkApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NetworkApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
