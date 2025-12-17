import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cluster5Component } from './cluster5.component';

describe('Cluster5Component', () => {
  let component: Cluster5Component;
  let fixture: ComponentFixture<Cluster5Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ Cluster5Component ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Cluster5Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
