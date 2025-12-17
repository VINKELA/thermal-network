export interface ClusterAlgorithm {
  id: number;
  name: string;
  algorithm: string; // 'dbscan', 'kmeans', etc.
  parameters: any;   // JSON object
  description?: string;
  created_at: string;
  // We assume the API embeds the clusters in the response, 
  // OR we fetch them separately. Let's assume embedded for simpler UI logic.
  clusters?: Cluster[]; 
}

export interface Cluster {
  id: number;
  name: string;
  heating_demand?: number;
  cooling_demand?: number;
  latitude: number;
  longitude: number;
  no_of_buildings: number;
  total_edge_length?: number;
  effective_radius?: number; // In meters
}
