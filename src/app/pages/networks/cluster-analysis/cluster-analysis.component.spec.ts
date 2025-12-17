import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterAnalysisComponent } from './cluster-analysis.component';

describe('ClusterAnalysisComponent', () => {
  let component: ClusterAnalysisComponent;
  let fixture: ComponentFixture<ClusterAnalysisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterAnalysisComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
