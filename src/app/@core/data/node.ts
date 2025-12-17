export type NodeType = 'consumer' | 'producer' | 'storage';

// Minimal interfaces for the related assets (expand as needed)
export interface LinkedAsset { id: number; name: string; [key: string]: any; }

export interface Node {
  id: number;
  network: number; // ID of parent network
  name?: string;
  node_type: NodeType;
  is_default: boolean;
  
  // Location Data
  latitude?: number;
  longitude?: number;
  address?: string;

  // The Connected Infrastructure (Only one of these should ideally be populated)
  building?: LinkedAsset;
  pv?: LinkedAsset;
  geothermal?: LinkedAsset;
  boiler?: LinkedAsset;
  thermal_storage?: LinkedAsset;
  cluster?: number;
}