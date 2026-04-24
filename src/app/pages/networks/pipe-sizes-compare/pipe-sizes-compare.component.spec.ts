import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PipeSizesCompareComponent } from './pipe-sizes-compare.component';

describe('PipeSizesCompareComponent', () => {
  let component: PipeSizesCompareComponent;
  let fixture: ComponentFixture<PipeSizesCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PipeSizesCompareComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PipeSizesCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
