import { Injectable } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { expand, reduce } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';

export interface HeatingModel {
  id: string; name: string; family: string; description: string;
  use_case: string; limitation: string; source: string; source_label?: string;
}
export interface StudyOptions {
  project_id: number; network_id: number | null; building_ids?: number[];
  year: number; location: string; models: string[]; reference: string;
  energy_scenario: string; commercial_energy_preset: string; thermo_archetype: string;
  residential_total_intensity_kwh_m2?: number; commercial_total_intensity_kwh_m2?: number;
  residential_space_fraction: number; residential_water_fraction: number;
  commercial_space_fraction: number; commercial_water_fraction: number;
  space_heat_conversion: number; water_heat_conversion: number;
  energy_basis: string; intensity_kwh_m2: number; dhw_fraction: number;
  balance_temperature_c: number; envelope_w_m2k: number; air_changes_per_hour: number;
  internal_gains_w_m2: number; storey_height_m: number; schedule_group: string;
  normalize_physical: boolean; delta_t_c: number; peak_threshold_fraction: number;
}
export interface ModelResult {
  model: string; name: string; hourly_kw: number[]; duration_curve_kw: number[];
  metrics: { [key: string]: number | null | { [resolution: string]: number } };
  feeder: { dn: number | null; status: string; reference_violation_hours: number | null;
    catalog_cost_cad_per_m: number | null };
  buildings: Array<{ id: number; name: string; annual_kwh: number; peak_kw: number }>;
}
export interface HeatingStudy {
  run_id: string; project_id: number; network_id: number | null; building_count: number;
  options: StudyOptions; timestamps: string[]; results: ModelResult[]; reference_hourly_kw: number[];
  reference_label: string; threshold_kw: number; assumptions: string[]; sources: string[];
  weather: { provider: string; timezone: string; sha256: string; note: string; source: string;
    location: { name: string }; year: number; hours: number };
  existing_coverage: { complete_buildings: number; selected_buildings: number; sources: object };
  energy_summary: { [key: string]: number }; thermo_provenance: object;
  energy_sources: { [key: string]: number }; building_inputs: object[]; design: object;
}

@Injectable({ providedIn: 'root' })
export class HeatingProfileService {
  constructor(private api: RestApiService) {}

  getCatalog(): Observable<{ energy_presets: { [key: string]: { label: string; intensity_kwh_m2: number; year: number; source: string } }; models: HeatingModel[]; locations: Array<{ id: string; name: string }> }> {
    return this.api.get('heating-models/');
  }

  getOptions(path: string): Observable<Array<{ id: number; name: string }>> {
    return this.api.get<any>(path).pipe(
      expand(page => page.next ? this.api.get<any>(page.next.replace(this.api.apiUrl, '')) : EMPTY),
      reduce((all, page) => all.concat(Array.isArray(page) ? page : page.results || []), []),
    );
  }

  compare(options: StudyOptions): Observable<HeatingStudy> {
    return this.api.post<HeatingStudy>(options, 'heating-profile-comparison/');
  }

  getBuildings(projectId: number, networkId: number | null, search: string): Observable<{ count: number; results: Array<{ id: number; name: string; floor_area: number }> }> {
    return this.api.get(`heating-study-buildings/?project_id=${projectId}${networkId ? '&network_id=' + networkId : ''}&search=${encodeURIComponent(search)}`);
  }

  apply(runId: string, model: string): Observable<{ created: number; archive_id: string }> {
    return this.api.post({ run_id: runId, model }, 'heating-profile-apply/');
  }
}
