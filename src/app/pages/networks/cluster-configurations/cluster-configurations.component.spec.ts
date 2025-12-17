import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterConfigurationsComponent } from './cluster-configurations.component';

describe('ClusterConfigurationsComponent', () => {
  let component: ClusterConfigurationsComponent;
  let fixture: ComponentFixture<ClusterConfigurationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterConfigurationsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterConfigurationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
