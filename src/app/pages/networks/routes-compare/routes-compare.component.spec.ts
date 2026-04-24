import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoutesCompareComponent } from './routes-compare.component';

describe('RoutesCompareComponent', () => {
  let component: RoutesCompareComponent;
  let fixture: ComponentFixture<RoutesCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RoutesCompareComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoutesCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
