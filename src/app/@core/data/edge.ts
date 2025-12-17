import { Node } from './node'; // Assuming previous model exists

export interface Edge {
  id: number;
  network: number;
  name?: string;
  start_node: Node; // Expecting full object or serializer with lat/lng
  end_node: Node;   // Expecting full object or serializer with lat/lng
  length: number;   // meters
  is_default: boolean;
  edge_algorithm?: number;
}