import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClusterConfigurationComponent } from './cluster-configuration.component';

describe('ClusterConfigurationComponent', () => {
  let component: ClusterConfigurationComponent;
  let fixture: ComponentFixture<ClusterConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClusterConfigurationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClusterConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
