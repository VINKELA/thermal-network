import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterAlgorithmsComponent } from './cluster-algorithms.component';

describe('ClusterAlgorithmsComponent', () => {
  let component: ClusterAlgorithmsComponent;
  let fixture: ComponentFixture<ClusterAlgorithmsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterAlgorithmsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterAlgorithmsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
