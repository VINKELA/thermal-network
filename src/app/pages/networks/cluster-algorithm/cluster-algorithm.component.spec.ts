import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterAlgorithmComponent } from './cluster-algorithm.component';

describe('ClusterAlgorithmComponent', () => {
  let component: ClusterAlgorithmComponent;
  let fixture: ComponentFixture<ClusterAlgorithmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterAlgorithmComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterAlgorithmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
