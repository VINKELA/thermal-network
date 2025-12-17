export type NetworkType = 'district_heating' | 'district_cooling' | 'combined';

// Assuming Location has lat/lng/address based on your description
export interface Network {
  id: number;
  project: number; // ID of the parent Project
  name: string;
  description?: string;
  network_type: NetworkType;
  // Inherited from Location
  address?: string; 
  latitude?: number;
  longitude?: number;
  nodes: Node[]; // Array of associated Nodes
}