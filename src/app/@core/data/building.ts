export type BuildingType = 'residential' | 'commercial' | 'industrial' | 'public' | 'other';
export type LoadType = 'cooling_dominant' | 'heating_dominant';

export interface Building {
  id: number;
  project: number; // ID of the parent project
  name?: string;
  building_type: BuildingType;
  fsa?: string;
  load_type: LoadType;
  floor_area?: number;    // m2
  heating_demand?: number; // kW
  cooling_demand?: number; // kW
  height?: number;        // m
  number_of_floors?: number;
}