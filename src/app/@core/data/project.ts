// project.model.ts

export interface Country {
  id: number;
  name: string;
}

export interface Province {
  id: number;
  name: string;
}

export interface City {
  id: number;
  name: string;
}

export type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface Project {
  id: number;
  name: string;
  description?: string; // blank=True
  country: Country;
  province?: Province;  // blank=True
  city?: City;          // blank=True
  start_date: string;
  end_date?: string;    // blank=True
  budget?: number;      // blank=True
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}