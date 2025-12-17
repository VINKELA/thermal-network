import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapImporterComponent } from './map-importer.component';

describe('MapImporterComponent', () => {
  let component: MapImporterComponent;
  let fixture: ComponentFixture<MapImporterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MapImporterComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapImporterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
