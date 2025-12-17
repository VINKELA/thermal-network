import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Clusters3Component } from './clusters3.component';

describe('Clusters3Component', () => {
  let component: Clusters3Component;
  let fixture: ComponentFixture<Clusters3Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ Clusters3Component ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Clusters3Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
