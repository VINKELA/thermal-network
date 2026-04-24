import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterComparisonComponent } from './cluster-comparison.component';

describe('ClusterComparisonComponent', () => {
  let component: ClusterComparisonComponent;
  let fixture: ComponentFixture<ClusterComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterComparisonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
