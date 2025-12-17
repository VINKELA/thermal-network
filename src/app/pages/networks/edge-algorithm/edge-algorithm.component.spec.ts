import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeAlgorithmComponent } from './edge-algorithm.component';

describe('EdgeAlgorithmComponent', () => {
  let component: EdgeAlgorithmComponent;
  let fixture: ComponentFixture<EdgeAlgorithmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeAlgorithmComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeAlgorithmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
