import { TestBed } from '@angular/core/testing';

import { BulkOperationService } from './bulk-operation.service';

describe('BulkOperationService', () => {
  let service: BulkOperationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BulkOperationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
