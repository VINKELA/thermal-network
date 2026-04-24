// --- 1. Lightweight Summary (For the Sidebar List) ---
export interface ClusterConfigSummary {
  id: number;
  name: string;
  description: string; // e.g. "Weights: [0.0, 1.0...]"
}

// --- 2. Heavy Detail (For the Visualization) ---
export interface Building {
  id: number;
  latitude: number;
  longitude: number;
  building_type: string;
}

export interface Cluster {
  id: number;
  name: string;
  latitude: number; // Centroid Lat
  longitude: number; // Centroid Lng
  buildings: Building[];
}

export interface ClusterConfigDetail extends ClusterConfigSummary {
  clusters: Cluster[];
  parameters?: any;
  // Frontend Helpers
  uiColor?: string;
  stats?: {
    totalBuildings: number;
    avgClusterSize: number;
    totalClusters: number;
  };
}