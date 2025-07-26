import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NetworkAlgorithmComponent } from './network-algorithm.component';

describe('NetworkAlgorithmComponent', () => {
  let component: NetworkAlgorithmComponent;
  let fixture: ComponentFixture<NetworkAlgorithmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NetworkAlgorithmComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NetworkAlgorithmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
