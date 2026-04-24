import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PipeSizeComponent } from './pipe-size.component';

describe('PipeSizeComponent', () => {
  let component: PipeSizeComponent;
  let fixture: ComponentFixture<PipeSizeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PipeSizeComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PipeSizeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
