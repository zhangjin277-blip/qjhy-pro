export interface UserColumnPreset {
  id: number;
  name: string;
  columns: string[];
  project: "all" | "ddz" | "three";
  created_at: string;
  updated_at: string;
}
