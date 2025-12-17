import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Clusters2Component } from './clusters2.component';

describe('Clusters2Component', () => {
  let component: Clusters2Component;
  let fixture: ComponentFixture<Clusters2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ Clusters2Component ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Clusters2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
