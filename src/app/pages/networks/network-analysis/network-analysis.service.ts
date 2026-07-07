import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RestApiService } from '../../../@core/utils/rest-api.service';

export interface NetworkAnalysisReport {
  kpis: {
    total_capex_cad: number;
    total_lifecycle_cost_cad: number;
    lcoh_cad_per_kwh: number;
    total_carbon_debt_cad: number;
    embodied_carbon_tco2e?: number;
    embodied_carbon_cost_cad?: number;
    annual_operational_emissions_tco2e?: number;
    discounted_heat_kwh?: number;
  };
  capex_breakdown: AnalysisComponentValue[];
  component_breakdown?: {
    capex: AnalysisComponentValue[];
    annual_opex: AnalysisComponentValue[];
    annual_emissions_tco2e: AnalysisComponentValue[];
    annual_carbon_cost: AnalysisComponentValue[];
  };
  lifecycle_projection_20yr: Array<{
    year: number;
    cumulative_capex: number;
    cumulative_opex: number;
    cumulative_carbon: number;
    cumulative_total?: number;
    annual_opex?: number;
    discounted_opex?: number;
    annual_operational_carbon_cost?: number;
    discounted_operational_carbon_cost?: number;
  }>;
  component_lifecycle_20yr?: AnalysisComponentLifecycleRow[];
  analysis_assumptions?: NetworkAnalysisAssumptions;
}

export interface AnalysisComponentValue {
  category: string;
  value: number;
}

export interface AnalysisComponentLifecycleRow {
  year: number;
  carbon_price_cad_per_tonne: number;
  discount_factor?: number;
  capex: AnalysisComponentValue[];
  annual_opex: AnalysisComponentValue[];
  cumulative_opex: AnalysisComponentValue[];
  annual_emissions_tco2e: AnalysisComponentValue[];
  annual_carbon_cost: AnalysisComponentValue[];
  discounted_opex?: AnalysisComponentValue[];
  discounted_carbon_cost?: AnalysisComponentValue[];
  cumulative_carbon_cost: AnalysisComponentValue[];
}

export interface NetworkAnalysisAssumptions {
  method?: string;
  start_year?: number;
  horizon_years?: number;
  discount_rate?: number;
  fixed_om_rate?: number;
  source_cop?: number;
  energy_cost_cad_per_kwh?: number;
  ontario_grid_kgco2_per_kwh?: number;
  carbon_price_year_0_cad_per_tonne?: number;
  boundary?: string;
  capex_localization?: {
    eur_to_cad?: number;
    material_premium?: number;
    civil_labor_premium?: number;
  };
}

export interface NetworkAnalysisCompareItem {
  network: {
    id: number;
    name: string;
    network_type?: string;
    project_id?: number;
    project_name?: string;
    derivation_stage?: string;
    derivation_method?: string;
  };
  report: NetworkAnalysisReport;
}

export interface CarbonTaxRate {
  id?: number;
  year: number;
  price_cad_per_tonne: number;
}

@Injectable()
export class NetworkAnalysisService {
  constructor(private api: RestApiService) {}

  listNetworks(): Observable<any> {
    return this.api.get<any>('networks/?limit=500&ordering=-created_at,-id');
  }

  getReport(networkId: number): Observable<NetworkAnalysisReport> {
    return this.api.get<NetworkAnalysisReport>(`networks/${networkId}/analysis/`);
  }

  compareReports(ids: number[]): Observable<NetworkAnalysisCompareItem[]> {
    return this.api.post<NetworkAnalysisCompareItem[]>({ ids }, 'networks/compare-analysis/');
  }

  getCarbonTaxSchedule(): Observable<CarbonTaxRate[] | { results: CarbonTaxRate[] }> {
    return this.api.get<CarbonTaxRate[] | { results: CarbonTaxRate[] }>('carbon-tax-rates/?ordering=year');
  }
}
