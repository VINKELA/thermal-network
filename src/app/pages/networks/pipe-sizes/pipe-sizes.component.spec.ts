import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PipeSizesComponent } from './pipe-sizes.component';

describe('PipeSizesComponent', () => {
  let component: PipeSizesComponent;
  let fixture: ComponentFixture<PipeSizesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PipeSizesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PipeSizesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
