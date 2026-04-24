import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NodeMarkerComponent } from './node-marker.component';

describe('NodeMarkerComponent', () => {
  let component: NodeMarkerComponent;
  let fixture: ComponentFixture<NodeMarkerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NodeMarkerComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NodeMarkerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
