import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Clusters4Component } from './clusters4.component';

describe('Clusters4Component', () => {
  let component: Clusters4Component;
  let fixture: ComponentFixture<Clusters4Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ Clusters4Component ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Clusters4Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
