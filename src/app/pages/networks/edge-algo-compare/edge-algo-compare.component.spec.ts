import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeAlgoCompareComponent } from './edge-algo-compare.component';

describe('EdgeAlgoCompareComponent', () => {
  let component: EdgeAlgoCompareComponent;
  let fixture: ComponentFixture<EdgeAlgoCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeAlgoCompareComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeAlgoCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
