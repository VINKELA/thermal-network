import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RouteTraceComponent } from './route-trace.component';

describe('RouteTraceComponent', () => {
  let component: RouteTraceComponent;
  let fixture: ComponentFixture<RouteTraceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RouteTraceComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RouteTraceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
