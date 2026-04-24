import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EdgeTranslationCompareComponent } from './edge-translation-compare.component';

describe('EdgeTranslationCompareComponent', () => {
  let component: EdgeTranslationCompareComponent;
  let fixture: ComponentFixture<EdgeTranslationCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EdgeTranslationCompareComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EdgeTranslationCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
