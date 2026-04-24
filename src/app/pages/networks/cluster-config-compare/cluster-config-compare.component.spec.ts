import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterConfigCompareComponent } from './cluster-config-compare.component';

describe('ClusterConfigCompareComponent', () => {
  let component: ClusterConfigCompareComponent;
  let fixture: ComponentFixture<ClusterConfigCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterConfigCompareComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterConfigCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
