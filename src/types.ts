export interface CargoItem {
  id: string;
  name: string;
  length: number; // in cm
  width: number;  // in cm
  height: number; // in cm
  weight: number; // in kg
  quantity: number;
  color: string;
  allowRotation: boolean;
}

export interface Container {
  id: string;
  name: string;
  length: number; // in cm
  width: number;  // in cm
  height: number; // in cm
  maxWeight: number; // in kg
}

export interface Pallet {
  id: string;
  name: string;
  length: number; // in cm
  width: number;  // in cm
  height: number; // in cm (pallet board height)
  maxHeight: number; // max stacked height in cm (including pallet board)
  maxWeight: number; // in kg
  dynKg?: number; // Dynamic load limit (kg)
  rackKg?: number; // Racking load limit (kg)
}

export interface Position3D {
  x: number; // position from origin (cm)
  y: number; // position from origin (cm)
  z: number; // position from origin (cm)
  w: number; // actual width in this orientation (cm)
  l: number; // actual length in this orientation (cm)
  h: number; // actual height in this orientation (cm)
}

export interface PackedItem {
  itemId: string;
  name: string;
  color: string;
  position: Position3D;
  weight: number;
}

export interface CoGResult {
  x: number; // in cm
  y: number; // in cm
  z: number; // in cm
  xPercent: number; // percentage along length (0-100)
  yPercent: number; // percentage along width (0-100)
  zPercent: number; // percentage along height (0-100)
  statusX: 'balanced' | 'warning' | 'danger';
  statusY: 'balanced' | 'warning' | 'danger';
  statusZ: 'balanced' | 'warning';
  messageX: string;
  messageY: string;
  messageZ: string;
}

export interface LoadingStep {
  stepNumber: number;
  itemName: string;
  quantity: number;
  color: string;
  dimensions: { l: number; w: number; h: number };
  startCoords: { x: number; y: number; z: number };
  endCoords: { x: number; y: number; z: number };
  description: string;
}

export interface PackingResult {
  packedItems: PackedItem[];
  unpackedItems: { item: CargoItem; count: number }[];
  totalVolume: number; // m3
  packedVolume: number; // m3
  volumeEfficiency: number; // %
  totalWeight: number; // kg
  weightEfficiency: number; // %
  cog: CoGResult;
  loadingSteps: LoadingStep[];
}

export interface PalletPatternResult {
  boxesPerLayer: number;
  layersCount: number;
  totalBoxes: number;
  totalWeight: number; // kg
  totalHeight: number; // cm
  efficiency: number; // %
  patternType: 'column' | 'interlocking' | 'pinwheel' | 'block' | 'brick' | 'split_row' | 'architectural' | 'architectural_brick' | 'auto';
  boxPositions: Position3D[]; // coordinates of boxes on the pallet (relative to pallet surface)
}

export interface PalletPackedInContainer {
  palletId: string;
  palletName: string;
  position: Position3D;
  boxesCount: number;
  weight: number;
}

export interface ContainerPalletPackingResult {
  packedPallets: PalletPackedInContainer[];
  unpackedPalletsCount: number;
  totalVolume: number;
  packedVolume: number;
  volumeEfficiency: number;
  totalWeight: number;
  weightEfficiency: number;
  cog: CoGResult;
  loadingSteps: LoadingStep[];
}
