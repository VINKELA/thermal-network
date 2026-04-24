import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BuildingUploadComponent } from './building-upload.component';

describe('BuildingUploadComponent', () => {
  let component: BuildingUploadComponent;
  let fixture: ComponentFixture<BuildingUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ BuildingUploadComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BuildingUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
