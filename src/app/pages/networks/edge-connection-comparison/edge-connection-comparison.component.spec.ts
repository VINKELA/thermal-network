import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeConnectionComparisonComponent } from './edge-connection-comparison.component';

describe('EdgeConnectionComparisonComponent', () => {
  let component: EdgeConnectionComparisonComponent;
  let fixture: ComponentFixture<EdgeConnectionComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeConnectionComparisonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeConnectionComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
