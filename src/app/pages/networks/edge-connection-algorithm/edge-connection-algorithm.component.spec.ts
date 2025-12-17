import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeConnectionAlgorithmComponent } from './edge-connection-algorithm.component';

describe('EdgeConnectionAlgorithmComponent', () => {
  let component: EdgeConnectionAlgorithmComponent;
  let fixture: ComponentFixture<EdgeConnectionAlgorithmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeConnectionAlgorithmComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeConnectionAlgorithmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
