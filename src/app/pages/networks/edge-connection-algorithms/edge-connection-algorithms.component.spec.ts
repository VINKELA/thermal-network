import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeConnectionAlgorithmsComponent } from './edge-connection-algorithms.component';

describe('EdgeConnectionAlgorithmsComponent', () => {
  let component: EdgeConnectionAlgorithmsComponent;
  let fixture: ComponentFixture<EdgeConnectionAlgorithmsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeConnectionAlgorithmsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeConnectionAlgorithmsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
