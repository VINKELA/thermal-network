import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NetworkComparisonComponent } from './network-comparison.component';

describe('NetworkComparisonComponent', () => {
  let component: NetworkComparisonComponent;
  let fixture: ComponentFixture<NetworkComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NetworkComparisonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NetworkComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
