import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeComparisonComponent } from './edge-comparison.component';

describe('EdgeComparisonComponent', () => {
  let component: EdgeComparisonComponent;
  let fixture: ComponentFixture<EdgeComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeComparisonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
