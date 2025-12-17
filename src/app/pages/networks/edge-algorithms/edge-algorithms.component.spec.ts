import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeAlgorithmsComponent } from './edge-algorithms.component';

describe('EdgeAlgorithmsComponent', () => {
  let component: EdgeAlgorithmsComponent;
  let fixture: ComponentFixture<EdgeAlgorithmsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeAlgorithmsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeAlgorithmsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
