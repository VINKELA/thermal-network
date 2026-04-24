import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NodeComparisonComponent } from './node-comparison.component';

describe('NodeComparisonComponent', () => {
  let component: NodeComparisonComponent;
  let fixture: ComponentFixture<NodeComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NodeComparisonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NodeComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
