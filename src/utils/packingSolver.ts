import { CargoItem, Container, Pallet, PackedItem, PackingResult, PalletPatternResult, Position3D, ContainerPalletPackingResult, PalletPackedInContainer, CoGResult, LoadingStep } from '../types';

/**
 * Calculates Center of Gravity for a loaded container
 */
export function calculateCoG(items: { position: Position3D; weight: number }[], container: Container): CoGResult {
  const cL = container.length;
  const cW = container.width;
  const cH = container.height;

  let sumWX = 0;
  let sumWY = 0;
  let sumWZ = 0;
  let totalWeight = 0;

  for (const item of items) {
    const itemWeight = item.weight || 0;
    const cx = item.position.x + item.position.l / 2;
    const cy = item.position.y + item.position.w / 2;
    const cz = item.position.z + item.position.h / 2;

    sumWX += itemWeight * cx;
    sumWY += itemWeight * cy;
    sumWZ += itemWeight * cz;
    totalWeight += itemWeight;
  }

  const x = totalWeight > 0 ? sumWX / totalWeight : cL / 2;
  const y = totalWeight > 0 ? sumWY / totalWeight : cW / 2;
  const z = totalWeight > 0 ? sumWZ / totalWeight : cH / 2;

  const xPercent = cL > 0 ? (x / cL) * 100 : 50;
  const yPercent = cW > 0 ? (y / cW) * 100 : 50;
  const zPercent = cH > 0 ? (z / cH) * 100 : 50;

  let statusX: 'balanced' | 'warning' | 'danger' = 'balanced';
  let messageX = 'สมดุลหน้า-หลังดีเยี่ยม (Balanced Front-to-Back)';
  const diffX = Math.abs(50 - xPercent);
  if (diffX > 10) {
    statusX = 'danger';
    messageX = xPercent < 50 
      ? 'จุดศูนย์ถ่วงเอียงไปด้านท้ายตู้มากเกินไป (Heavy Rear / Dangerous Tilt)' 
      : 'จุดศูนย์ถ่วงเอียงไปด้านหน้าตู้มากเกินไป (Heavy Front / Dangerous Tilt)';
  } else if (diffX > 5) {
    statusX = 'warning';
    messageX = xPercent < 50 
      ? 'น้ำหนักเอนไปทางท้ายตู้เล็กน้อย (Slightly Heavy Rear)' 
      : 'น้ำหนักเอนไปทางหน้าตู้เล็กน้อย (Slightly Heavy Front)';
  }

  let statusY: 'balanced' | 'warning' | 'danger' = 'balanced';
  let messageY = 'สมดุลซ้าย-ขวาดีเยี่ยม (Balanced Left-to-Right)';
  const diffY = Math.abs(50 - yPercent);
  if (diffY > 10) {
    statusY = 'danger';
    messageY = yPercent < 50 
      ? 'จุดศูนย์ถ่วงเอียงซ้ายมากเกินไป (Heavy Left / Roll Risk)' 
      : 'จุดศูนย์ถ่วงเอียงขวามากเกินไป (Heavy Right / Roll Risk)';
  } else if (diffY > 5) {
    statusY = 'warning';
    messageY = yPercent < 50 
      ? 'น้ำหนักเอียงไปทางซ้ายเล็กน้อย (Slightly Heavy Left)' 
      : 'น้ำหนักเอียงไปทางขวาเล็กน้อย (Slightly Heavy Right)';
  }

  let statusZ: 'balanced' | 'warning' = 'balanced';
  let messageZ = 'จุดศูนย์ถ่วงแนวตั้งเหมาะสม (Safe Vertical CoG)';
  if (zPercent >= 45) {
    statusZ = 'warning';
    messageZ = 'จุดศูนย์ถ่วงแนวตั้งสูงเกินไป ควรจัดวางของหนักด้านล่าง (High Vertical CoG)';
  }

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    z: Math.round(z * 10) / 10,
    xPercent: Math.round(xPercent * 10) / 10,
    yPercent: Math.round(yPercent * 10) / 10,
    zPercent: Math.round(zPercent * 10) / 10,
    statusX,
    statusY,
    statusZ,
    messageX,
    messageY,
    messageZ
  };
}

/**
 * Helper to group individual packed boxes into step-by-step loading segments
 */
export function generateLoadingSteps(packedItems: PackedItem[]): LoadingStep[] {
  if (packedItems.length === 0) return [];

  const steps: LoadingStep[] = [];
  let stepNum = 1;
  let currentGroup: PackedItem[] = [];

  for (let i = 0; i < packedItems.length; i++) {
    const item = packedItems[i];
    if (currentGroup.length === 0) {
      currentGroup.push(item);
    } else {
      const first = currentGroup[0];
      if (item.itemId === first.itemId && item.position.z === first.position.z && currentGroup.length < 24) {
        currentGroup.push(item);
      } else {
        steps.push(createStepFromGroup(currentGroup, stepNum++));
        currentGroup = [item];
      }
    }
  }

  if (currentGroup.length > 0) {
    steps.push(createStepFromGroup(currentGroup, stepNum++));
  }

  return steps;
}

function createStepFromGroup(group: PackedItem[], stepNumber: number): LoadingStep {
  const first = group[0];
  const count = group.length;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const item of group) {
    if (item.position.x < minX) minX = item.position.x;
    if (item.position.x + item.position.l > maxX) maxX = item.position.x + item.position.l;
    
    if (item.position.y < minY) minY = item.position.y;
    if (item.position.y + item.position.w > maxY) maxY = item.position.y + item.position.w;

    if (item.position.z < minZ) minZ = item.position.z;
    if (item.position.z + item.position.h > maxZ) maxZ = item.position.z + item.position.h;
  }

  const layerNum = Math.floor(minZ / first.position.h) + 1;
  const locationDesc = minZ === 0 ? 'บนพื้นตู้คอนเทนเนอร์ (Container Floor)' : `บนชั้นที่ ${layerNum} (Z = ${minZ} ซม.)`;

  const description = `จัดวาง "${first.name}" จำนวน ${count} กล่อง ${locationDesc} (ช่วงพื้นที่ ลึก x: ${minX}-${maxX} ซม., กว้าง y: ${minY}-${maxY} ซม.)`;

  return {
    stepNumber,
    itemName: first.name,
    quantity: count,
    color: first.color,
    dimensions: { l: first.position.l, w: first.position.w, h: first.position.h },
    startCoords: { x: minX, y: minY, z: minZ },
    endCoords: { x: maxX, y: maxY, z: maxZ },
    description
  };
}

/**
 * Helper to generate loading steps for palletized goods
 */
export function generatePalletLoadingSteps(packedPallets: PalletPackedInContainer[]): LoadingStep[] {
  return packedPallets.map((p, idx) => {
    const layerNum = Math.floor(p.position.z / p.position.h) + 1;
    const locationDesc = p.position.z === 0 
      ? `แถวที่ ${Math.floor(p.position.x / p.position.l) + 1} ฝั่ง${p.position.y === 0 ? 'ซ้าย' : 'ขวา'} (ติดพื้นตู้)` 
      : `ซ้อนบนชั้นที่ ${layerNum}`;

    const description = `นำเข้า "${p.palletName}" (${p.boxesCount} กล่อง) เข้าวางตำแหน่ง ${locationDesc} (พิกัด x: ${p.position.x} ซม., y: ${p.position.y} ซม.)`;

    return {
      stepNumber: idx + 1,
      itemName: p.palletName,
      quantity: 1,
      color: '#0f766e',
      dimensions: { l: p.position.l, w: p.position.w, h: p.position.h },
      startCoords: { x: p.position.x, y: p.position.y, z: p.position.z },
      endCoords: { x: p.position.x + p.position.l, y: p.position.y + p.position.w, z: p.position.z + p.position.h },
      description
    };
  });
}

/**
 * 3D Bin Packing Solver for Floor Loading
 * Uses a heuristic layer-by-layer and row-by-row shelf packing approach
 */
export function solveFloorPacking(cargoItems: CargoItem[], container: Container): PackingResult {
  // Create a deep copy of items to track remaining quantities to pack
  const templates = cargoItems.map(item => ({
    ...item,
    remainingQuantity: item.quantity
  }));
  
  const packedItems: PackedItem[] = [];
  const containerW = container.width;
  const containerL = container.length;
  const containerH = container.height;
  const maxWeight = container.maxWeight;

  let currentWeight = 0;
  let currentSumWX = 0;
  let currentSumWY = 0;

  // Track the height-map of the container floor or packed structures
  // Since full 3D bin packing is NP-hard, we use an enhanced shelf/row/layer heuristic
  // that dynamically selects cargo box templates to optimize the Center of Gravity (CoG).
  // X: Length axis (0 to L) - Front-to-Back
  // Y: Width axis (0 to W) - Left-to-Right
  // Z: Height axis (0 to H) - Bottom-to-Top

  let xCoord = 0; // current position along length
  let yCoord = 0; // current position along width
  let zCoord = 0; // current position along height

  let layerMaxHeight = 0; // maximum height in the current horizontal slice
  let rowMaxLength = 0;   // maximum length in the current row

  while (true) {
    // Find the best item template and orientation to place at the current coordinate
    let bestCandidate: {
      template: typeof templates[0];
      orient: { l: number; w: number; h: number };
      score: number;
    } | null = null;

    let maxWeightOfRemaining = 1;
    let remainingTotalQty = 0;
    for (const t of templates) {
      if (t.remainingQuantity > 0) {
        remainingTotalQty += t.remainingQuantity;
        if (t.weight > maxWeightOfRemaining) {
          maxWeightOfRemaining = t.weight;
        }
      }
    }

    if (remainingTotalQty === 0) {
      break; // All items packed!
    }

    for (const t of templates) {
      if (t.remainingQuantity <= 0) continue;
      if (currentWeight + t.weight > maxWeight) continue;

      const orientations = [
        { l: t.length, w: t.width, h: t.height },
        ...(t.allowRotation ? [
          { l: t.width, w: t.length, h: t.height },
          { l: t.length, w: t.height, h: t.width },
          { l: t.width, w: t.height, h: t.length },
          { l: t.height, w: t.length, h: t.width },
          { l: t.height, w: t.width, h: t.length }
        ] : [])
      ];

      for (const orient of orientations) {
        if (
          xCoord + orient.l <= containerL &&
          yCoord + orient.w <= containerW &&
          zCoord + orient.h <= containerH
        ) {
          const cx_cand = xCoord + orient.l / 2;
          const cy_cand = yCoord + orient.w / 2;

          const nextSumWX = currentSumWX + t.weight * cx_cand;
          const nextSumWY = currentSumWY + t.weight * cy_cand;
          const nextWeight = currentWeight + t.weight;

          const nextX = nextWeight > 0 ? nextSumWX / nextWeight : containerL / 2;
          const nextY = nextWeight > 0 ? nextSumWY / nextWeight : containerW / 2;

          const nextXPercent = containerL > 0 ? (nextX / containerL) * 100 : 50;
          const nextYPercent = containerW > 0 ? (nextY / containerW) * 100 : 50;

          const devX = Math.abs(50 - nextXPercent);
          const devY = Math.abs(50 - nextYPercent);
          const balanceDeviation = devX + devY;

          // Vertical Weight Balance: Keep Center of Gravity low and heavier cargo on bottom layers
          const heightRatio = zCoord / containerH; // 0 to 1
          const weightRatio = t.weight / maxWeightOfRemaining; // 0 to 1

          const verticalStrength = 100 * (1 - heightRatio) * weightRatio;
          const score = verticalStrength - 2.5 * balanceDeviation;

          if (bestCandidate === null || score > bestCandidate.score) {
            bestCandidate = {
              template: t,
              orient,
              score
            };
          }
        }
      }
    }

    if (bestCandidate) {
      // Fit found! Place the item and advance yCoord
      packedItems.push({
        itemId: bestCandidate.template.id,
        name: bestCandidate.template.name,
        color: bestCandidate.template.color,
        weight: bestCandidate.template.weight,
        position: {
          x: xCoord,
          y: yCoord,
          z: zCoord,
          l: bestCandidate.orient.l,
          w: bestCandidate.orient.w,
          h: bestCandidate.orient.h
        }
      });

      const cx = xCoord + bestCandidate.orient.l / 2;
      const cy = yCoord + bestCandidate.orient.w / 2;

      currentSumWX += bestCandidate.template.weight * cx;
      currentSumWY += bestCandidate.template.weight * cy;
      currentWeight += bestCandidate.template.weight;

      bestCandidate.template.remainingQuantity--;

      // Advance cursor along Y (width) for the next item in this column
      yCoord += bestCandidate.orient.w;
      if (bestCandidate.orient.h > layerMaxHeight) layerMaxHeight = bestCandidate.orient.h;
      if (bestCandidate.orient.l > rowMaxLength) rowMaxLength = bestCandidate.orient.l;

    } else {
      // No template fits at the current spot. We need to move the cursor.
      if (yCoord > 0) {
        // Move to next row in current layer
        xCoord += rowMaxLength;
        yCoord = 0;
        rowMaxLength = 0;
      } else if (xCoord > 0) {
        // Move to next layer
        zCoord += layerMaxHeight;
        xCoord = 0;
        yCoord = 0;
        layerMaxHeight = 0;
        rowMaxLength = 0;
      } else {
        // Start of layer and start of row, yet nothing fits - we are fully done or blocked
        break;
      }

      // Break if height limit is exceeded
      if (zCoord >= containerH) {
        break;
      }
    }
  }

  // Calculate packed volume vs container volume
  const totalVolume = (containerL * containerW * containerH) / 1000000; // in m3
  let packedVolume = 0;
  for (const pi of packedItems) {
    packedVolume += (pi.position.l * pi.position.w * pi.position.h) / 1000000;
  }

  const volumeEfficiency = totalVolume > 0 ? (packedVolume / totalVolume) * 100 : 0;
  const weightEfficiency = maxWeight > 0 ? (currentWeight / maxWeight) * 100 : 0;

  // Collect unpacked items
  const unpackedItems: { item: CargoItem; count: number }[] = [];
  for (const originalItem of cargoItems) {
    const packedCount = packedItems.filter(pi => pi.itemId === originalItem.id).length;
    const remaining = originalItem.quantity - packedCount;
    if (remaining > 0) {
      unpackedItems.push({
        item: originalItem,
        count: remaining
      });
    }
  }

  const cog = calculateCoG(packedItems, container);
  const loadingSteps = generateLoadingSteps(packedItems);

  return {
    packedItems,
    unpackedItems,
    totalVolume,
    packedVolume,
    volumeEfficiency,
    totalWeight: currentWeight,
    weightEfficiency,
    cog,
    loadingSteps
  };
}

/**
 * Pallet Pattern Solver
 * Calculates optimal boxes on a single pallet. Supports Column, Interlocking, Pinwheel, Split Row, and Architectural.
 */
export function solvePalletPattern(
  cargo: { name: string; length: number; width: number; height: number; weight: number },
  pallet: Pallet,
  preferredPattern: 'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick' = 'architectural'
): PalletPatternResult {
  const pL = pallet.length;
  const pW = pallet.width;
  const maxStackH = pallet.maxHeight - pallet.height; // subtract pallet base board height
  const maxW = pallet.maxWeight;

  const boxL = cargo.length;
  const boxW = cargo.width;
  const boxH = cargo.height;

  // Let's analyze different pattern layouts for a single layer
  interface LayerLayout {
    type: 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick' | 'column' | 'interlocking' | 'auto';
    boxPositions: { x: number; y: number; w: number; l: number; h: number }[];
  }

  // Layout 1: Block standard layout (all standard direction)
  const nx1 = Math.floor(pL / boxL);
  const ny1 = Math.floor(pW / boxW);
  const blockStdPos: LayerLayout['boxPositions'] = [];
  if (nx1 > 0 && ny1 > 0) {
    for (let x = 0; x < nx1; x++) {
      for (let y = 0; y < ny1; y++) {
        blockStdPos.push({ x: x * boxL, y: y * boxW, l: boxL, w: boxW, h: boxH });
      }
    }
  }

  // Layout 1b: Block rotated layout (all rotated direction)
  const nx2 = Math.floor(pL / boxW);
  const ny2 = Math.floor(pW / boxL);
  const blockRotPos: LayerLayout['boxPositions'] = [];
  if (nx2 > 0 && ny2 > 0) {
    for (let x = 0; x < nx2; x++) {
      for (let y = 0; y < ny2; y++) {
        blockRotPos.push({ x: x * boxW, y: y * boxL, l: boxW, w: boxL, h: boxH });
      }
    }
  }

  const blockLayout: LayerLayout = {
    type: 'block',
    boxPositions: blockStdPos.length >= blockRotPos.length ? blockStdPos : blockRotPos
  };

  // Helper function to generate clean Brick/Interlocking positions on pallet
  const getBrickLayout = (bL: number, bW: number) => {
    let brickSplitL: { x: number; y: number; w: number; l: number; h: number }[] = [];
    for (let splitX = bL; splitX <= pL - bW; splitX += bL) {
      const leftNx = Math.floor(splitX / bL);
      const rightNx = Math.floor((pL - splitX) / bW);

      if (leftNx > 0 && rightNx > 0) {
        let bestLeftNy = 0;
        let bestRightNy = 0;
        let maxEqualW = 0;

        const maxLeftNy = Math.floor(pW / bW);
        const maxRightNy = Math.floor(pW / bL);

        for (let ly = 1; ly <= maxLeftNy; ly++) {
          for (let ry = 1; ry <= maxRightNy; ry++) {
            if (ly * bW === ry * bL) {
              const w = ly * bW;
              if (w <= pW && w > maxEqualW) {
                maxEqualW = w;
                bestLeftNy = ly;
                bestRightNy = ry;
              }
            }
          }
        }

        if (maxEqualW > 0) {
          const currentPos: { x: number; y: number; w: number; l: number; h: number }[] = [];
          for (let x = 0; x < leftNx; x++) {
            for (let y = 0; y < bestLeftNy; y++) {
              currentPos.push({ x: x * bL, y: y * bW, l: bL, w: bW, h: boxH });
            }
          }
          for (let x = 0; x < rightNx; x++) {
            for (let y = 0; y < bestRightNy; y++) {
              currentPos.push({ x: splitX + x * bW, y: y * bL, l: bW, w: bL, h: boxH });
            }
          }
          if (currentPos.length > brickSplitL.length) {
            brickSplitL = currentPos;
          }
        } else {
          const leftNy = Math.floor(pW / bW);
          const rightNy = Math.floor(pW / bL);
          const targetW = Math.min(leftNy * bW, rightNy * bL);
          const actLeftNy = Math.floor(targetW / bW);
          const actRightNy = Math.floor(targetW / bL);

          if (leftNx > 0 && actLeftNy > 0 && rightNx > 0 && actRightNy > 0) {
            const currentPos: { x: number; y: number; w: number; l: number; h: number }[] = [];
            for (let x = 0; x < leftNx; x++) {
              for (let y = 0; y < actLeftNy; y++) {
                currentPos.push({ x: x * bL, y: y * bW, l: bL, w: bW, h: boxH });
              }
            }
            for (let x = 0; x < rightNx; x++) {
              for (let y = 0; y < actRightNy; y++) {
                currentPos.push({ x: splitX + x * bW, y: y * bL, l: bW, w: bL, h: boxH });
              }
            }
            if (currentPos.length > brickSplitL.length) {
              brickSplitL = currentPos;
            }
          }
        }
      }
    }

    let brickSplitW: { x: number; y: number; w: number; l: number; h: number }[] = [];
    for (let splitY = bW; splitY <= pW - bL; splitY += bW) {
      const bottomNy = Math.floor(splitY / bW);
      const topNy = Math.floor((pW - splitY) / bL);

      if (bottomNy > 0 && topNy > 0) {
        let bestBottomNx = 0;
        let bestTopNx = 0;
        let maxEqualL = 0;

        const maxBottomNx = Math.floor(pL / bL);
        const maxTopNx = Math.floor(pL / bW);

        for (let bx = 1; bx <= maxBottomNx; bx++) {
          for (let tx = 1; tx <= maxTopNx; tx++) {
            if (bx * bL === tx * bW) {
              const len = bx * bL;
              if (len <= pL && len > maxEqualL) {
                maxEqualL = len;
                bestBottomNx = bx;
                bestTopNx = tx;
              }
            }
          }
        }

        if (maxEqualL > 0) {
          const currentPos: { x: number; y: number; w: number; l: number; h: number }[] = [];
          for (let x = 0; x < bestBottomNx; x++) {
            for (let y = 0; y < bottomNy; y++) {
              currentPos.push({ x: x * bL, y: y * bW, l: bL, w: bW, h: boxH });
            }
          }
          for (let x = 0; x < bestTopNx; x++) {
            for (let y = 0; y < topNy; y++) {
              currentPos.push({ x: x * bW, y: splitY + y * bL, l: bW, w: bL, h: boxH });
            }
          }
          if (currentPos.length > brickSplitW.length) {
            brickSplitW = currentPos;
          }
        } else {
          const bottomNx = Math.floor(pL / bL);
          const topNx = Math.floor(pL / bW);
          const targetL = Math.min(bottomNx * bL, topNx * bW);
          const actBottomNx = Math.floor(targetL / bL);
          const actTopNx = Math.floor(targetL / bW);

          if (actBottomNx > 0 && bottomNy > 0 && actTopNx > 0 && topNy > 0) {
            const currentPos: { x: number; y: number; w: number; l: number; h: number }[] = [];
            for (let x = 0; x < actBottomNx; x++) {
              for (let y = 0; y < bottomNy; y++) {
                currentPos.push({ x: x * bL, y: y * bW, l: bL, w: bW, h: boxH });
              }
            }
            for (let x = 0; x < actTopNx; x++) {
              for (let y = 0; y < topNy; y++) {
                currentPos.push({ x: x * bW, y: splitY + y * bL, l: bW, w: bL, h: boxH });
              }
            }
            if (currentPos.length > brickSplitW.length) {
              brickSplitW = currentPos;
            }
          }
        }
      }
    }

    let brickPositions = brickSplitL.length >= brickSplitW.length ? brickSplitL : brickSplitW;
    if (brickPositions.length === 0) {
      const nx = Math.floor(pL / bL);
      const ny = Math.floor(pW / bW);
      const fallback: { x: number; y: number; w: number; l: number; h: number }[] = [];
      if (nx > 0 && ny > 0) {
        for (let x = 0; x < nx; x++) {
          for (let y = 0; y < ny; y++) {
            fallback.push({ x: x * bL, y: y * bW, l: bL, w: bW, h: boxH });
          }
        }
      }
      return fallback;
    }
    return brickPositions;
  };

  const brickPositions = getBrickLayout(boxL, boxW);
  const brickLayout: LayerLayout = { type: 'brick', boxPositions: brickPositions };

  const brickPositionsRot = getBrickLayout(boxW, boxL);

  // Select preferred pattern
  let selectedLayout: LayerLayout = blockLayout;
  let finalPatternType: PalletPatternResult['patternType'] = 'architectural';

  if (preferredPattern === 'block') {
    selectedLayout = blockLayout;
    finalPatternType = 'block';
  } else if (preferredPattern === 'brick') {
    selectedLayout = brickLayout;
    finalPatternType = 'brick';
  } else if (preferredPattern === 'architectural_brick') {
    selectedLayout = brickLayout;
    finalPatternType = 'architectural_brick' as any;
  } else if (preferredPattern === 'architectural') {
    selectedLayout = blockLayout;
    finalPatternType = 'architectural';
  } else {
    // 'auto' mode: default to architectural_block or architectural_brick based on efficiency
    const archBlockCount = blockLayout.boxPositions.length;
    const archBrickCount = brickLayout.boxPositions.length;
    if (archBrickCount > archBlockCount) {
      selectedLayout = brickLayout;
      finalPatternType = 'architectural_brick' as any;
      preferredPattern = 'architectural_brick';
    } else {
      selectedLayout = blockLayout;
      finalPatternType = 'architectural';
      preferredPattern = 'architectural';
    }
  }

  // Center selectedLayout on the pallet to ensure all layers align perfectly centered
  if (selectedLayout.boxPositions.length > 0) {
    let layoutMinX = Infinity;
    let layoutMaxX = -Infinity;
    let layoutMinY = Infinity;
    let layoutMaxY = -Infinity;

    for (const b of selectedLayout.boxPositions) {
      if (b.x < layoutMinX) layoutMinX = b.x;
      if (b.x + b.l > layoutMaxX) layoutMaxX = b.x + b.l;
      if (b.y < layoutMinY) layoutMinY = b.y;
      if (b.y + b.w > layoutMaxY) layoutMaxY = b.y + b.w;
    }

    const blockLength = layoutMaxX - layoutMinX;
    const blockWidth = layoutMaxY - layoutMinY;

    const offsetX = (pL - blockLength) / 2 - layoutMinX;
    const offsetY = (pW - blockWidth) / 2 - layoutMinY;

    selectedLayout = {
      ...selectedLayout,
      boxPositions: selectedLayout.boxPositions.map(b => ({
        ...b,
        x: b.x + offsetX,
        y: b.y + offsetY
      }))
    };
  }

  const boxesPerLayer = selectedLayout.boxPositions.length;
  if (boxesPerLayer === 0) {
    return {
      boxesPerLayer: 0,
      layersCount: 0,
      totalBoxes: 0,
      totalWeight: 0,
      totalHeight: pallet.height,
      efficiency: 0,
      patternType: 'block',
      boxPositions: []
    };
  }

  // Compute maximum layers restricted by height and weight limits
  const maxLayersByHeight = Math.floor(maxStackH / boxH);
  const maxLayersByWeight = Math.floor(maxW / (boxesPerLayer * cargo.weight));
  
  const layersCount = Math.min(maxLayersByHeight, maxLayersByWeight > 0 ? maxLayersByWeight : 999);
  
  const totalBoxes = boxesPerLayer * layersCount;
  const totalWeight = totalBoxes * cargo.weight;
  const totalHeight = pallet.height + (layersCount * boxH);

  // Generate 3D box positions for all layers
  const fullPositions: Position3D[] = [];
  for (let layer = 0; layer < layersCount; layer++) {
    const zOffset = layer * boxH; // relative to pallet top surface
    const isOddLayer = layer % 2 === 1;

    // Architectural patterns rotate the whole layer 90 degrees on odd layers
    if ((preferredPattern === 'architectural' || preferredPattern === 'architectural_brick') && isOddLayer) {
      const rotBase = (preferredPattern === 'architectural_brick') ? brickPositionsRot : (blockRotPos.length > 0 ? blockRotPos : blockStdPos);
      
      // Compute centering for rotBase too
      let rotMinX = Infinity;
      let rotMaxX = -Infinity;
      let rotMinY = Infinity;
      let rotMaxY = -Infinity;

      for (const b of rotBase) {
        if (b.x < rotMinX) rotMinX = b.x;
        if (b.x + b.l > rotMaxX) rotMaxX = b.x + b.l;
        if (b.y < rotMinY) rotMinY = b.y;
        if (b.y + b.w > rotMaxY) rotMaxY = b.y + b.w;
      }

      const rotL = rotMaxX - rotMinX;
      const rotW = rotMaxY - rotMinY;
      const rotOffsetX = (pL - rotL) / 2 - rotMinX;
      const rotOffsetY = (pW - rotW) / 2 - rotMinY;

      for (const bPos of rotBase) {
        fullPositions.push({
          x: bPos.x + rotOffsetX,
          y: bPos.y + rotOffsetY,
          z: zOffset,
          l: bPos.l,
          w: bPos.w,
          h: bPos.h
        });
      }
    } else {
      // Normal layout, but we mirror brick on odd layers
      for (const bPos of selectedLayout.boxPositions) {
        let finalX = bPos.x;
        let finalY = bPos.y;
        let finalL = bPos.l;
        let finalW = bPos.w;

        // Simple interlocking mirroring for brick odd layers to simulate real-world stable stacking
        if (selectedLayout.type === 'brick' && isOddLayer) {
          finalX = pL - bPos.x - bPos.l;
          finalY = pW - bPos.y - bPos.w;
        }

        fullPositions.push({
          x: finalX,
          y: finalY,
          z: zOffset,
          l: finalL,
          w: finalW,
          h: bPos.h
        });
      }
    }
  }

  const palletArea = pL * pW;
  const boxArea = boxL * boxW;
  const efficiency = (boxesPerLayer * boxArea / palletArea) * 100;

  return {
    boxesPerLayer,
    layersCount,
    totalBoxes,
    totalWeight,
    totalHeight,
    efficiency,
    patternType: finalPatternType,
    boxPositions: fullPositions
  };
}

/**
 * Container Pallet Packing Solver
 * Packs fully-loaded pallets into a shipping container
 */
export function solvePalletsInContainer(
  palletCount: number,
  palletResult: PalletPatternResult,
  palletDef: Pallet,
  container: Container
): ContainerPalletPackingResult {
  const packedPallets: PalletPackedInContainer[] = [];
  const cL = container.length;
  const cW = container.width;
  const cH = container.height;
  const maxWeight = container.maxWeight;

  // Single Pallet dimensions (fully packed)
  const palL = palletDef.length;
  const palW = palletDef.width;
  const palH = palletResult.totalHeight; // full height of loaded pallet
  const palWt = palletResult.totalWeight + 25; // 25kg standard empty wood pallet weight

  let currentWeight = 0;

  // Standard Pallet Logistics rules override
  const isIndustrial = (palL === 120 && palW === 100) || (palL === 100 && palW === 120);
  const isEuro = (palL === 120 && palW === 80) || (palL === 80 && palW === 120);
  const isSquare = (palL === 110 && palW === 110);
  const is20ft = cL < 800;

  let customLayoutUsed = false;

  if (is20ft) {
    if (isIndustrial) {
      // 10 pallets max, 2 parallel rows of 5
      let palIdx = 0;
      const stackH = Math.floor(cH / palH) || 1;

      for (let z = 0; z < stackH; z++) {
        for (let xNum = 0; xNum < 5; xNum++) {
          for (let yNum = 0; yNum < 2; yNum++) {
            if (palIdx >= palletCount) break;
            if (currentWeight + palWt > maxWeight) break;
            const x = xNum * 100;
            const y = yNum * 115; // fits perfectly in 235 cm total width
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Industrial 100x120)`,
              weight: palWt,
              position: {
                x,
                y,
                z: z * palH,
                l: 100,
                w: 115,
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }
      }
      customLayoutUsed = true;
    } else if (isEuro) {
      // Euro Pallet 11 pallets max. Interlocking/Pinwheel
      let palIdx = 0;
      const stackH = Math.floor(cH / palH) || 1;

      for (let z = 0; z < stackH; z++) {
        // Place the 7 longitudinal pallets (80 x 120) along the left wall (y = 0)
        for (let xNum = 0; xNum < 7; xNum++) {
          if (palIdx >= palletCount) break;
          if (currentWeight + palWt > maxWeight) break;
          const x = xNum * 80; // 7 * 80 = 560 cm
          if (x + 80 <= cL) {
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Euro 80x120 L)`,
              weight: palWt,
              position: {
                x,
                y: 0,
                z: z * palH,
                l: 80,
                w: 115, // slightly scaled from 120 to fit perfectly
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }

        // Place the 4 transverse pallets (120 x 80) along the right wall (y = 115)
        for (let xNum = 0; xNum < 4; xNum++) {
          if (palIdx >= palletCount) break;
          if (currentWeight + palWt > maxWeight) break;
          const x = xNum * 120; // 4 * 120 = 480 cm
          if (x + 120 <= cL) {
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Euro 120x80 R)`,
              weight: palWt,
              position: {
                x,
                y: 115,
                z: z * palH,
                l: 120,
                w: 80,
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }
      }
      customLayoutUsed = true;
    } else if (isSquare) {
      // Square Pallet (110x110) - 10 pallets max, 2 parallel rows of 5
      let palIdx = 0;
      const stackH = Math.floor(cH / palH) || 1;

      for (let z = 0; z < stackH; z++) {
        for (let xNum = 0; xNum < 5; xNum++) {
          for (let yNum = 0; yNum < 2; yNum++) {
            if (palIdx >= palletCount) break;
            if (currentWeight + palWt > maxWeight) break;
            const x = xNum * 110; // 5 * 110 = 550 cm
            const y = yNum * 115; // 2 * 115 = 230 cm (leaving 5 cm center gap)
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Square 110x110)`,
              weight: palWt,
              position: {
                x,
                y,
                z: z * palH,
                l: 110,
                w: 110,
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }
      }
      customLayoutUsed = true;
    }
  } else {
    // 40ft container
    if (isIndustrial) {
      // 17 pallets max with rotation
      // 14 pallets as 7 rows of 2 (oriented 120x100)
      // 3 pallets at the end (oriented 100x120)
      let palIdx = 0;
      const stackH = Math.floor(cH / palH) || 1;

      for (let z = 0; z < stackH; z++) {
        // Place 14 parallel pallets (oriented 120 cm along length, 100 cm along width)
        for (let xNum = 0; xNum < 7; xNum++) {
          for (let yNum = 0; yNum < 2; yNum++) {
            if (palIdx >= palletCount) break;
            if (currentWeight + palWt > maxWeight) break;
            const x = xNum * 120; // 7 * 120 = 840 cm
            const y = yNum * 115;
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Industrial 120x100)`,
              weight: palWt,
              position: {
                x,
                y,
                z: z * palH,
                l: 120,
                w: 100,
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }

        // Place 3 rotated pallets at the end (oriented 100 cm along length, 120 cm along width)
        for (let xNum = 0; xNum < 3; xNum++) {
          if (palIdx >= palletCount) break;
          if (currentWeight + palWt > maxWeight) break;
          const x = 840 + xNum * 100; // 840 + 3 * 100 = 1140 cm
          if (x + 100 <= cL) {
            packedPallets.push({
              palletId: `pal-${palIdx + 1}`,
              palletName: `Pallet ${palIdx + 1} (Industrial 100x120)`,
              weight: palWt,
              position: {
                x,
                y: 57, // centered along the width (since 120 cm wide)
                z: z * palH,
                l: 100,
                w: 120,
                h: palH
              },
              boxesCount: palletResult.totalBoxes
            });
            currentWeight += palWt;
            palIdx++;
          }
        }
      }
      customLayoutUsed = true;
    } else if (isEuro) {
      // 21 pallets max (10 rows of 2 (oriented 120x80) + rotated at the end)
      let palIdx = 0;
      const stackH = Math.floor(cH / palH) || 1;

      for (let z = 0; z < stackH; z++) {
        for (let xNum = 0; xNum < 10; xNum++) {
          for (let yNum = 0; yNum < 2; yNum++) {
            if (palIdx >= palletCount) break;
            if (currentWeight + palWt > maxWeight) break;
            const x = xNum * 120; // 10 * 120 = 1200 cm
            const y = yNum * 115;
            if (x + 120 <= cL) {
              packedPallets.push({
                palletId: `pal-${palIdx + 1}`,
                palletName: `Pallet ${palIdx + 1} (Euro 120x80)`,
                weight: palWt,
                position: {
                  x,
                  y,
                  z: z * palH,
                  l: 120,
                  w: 80,
                  h: palH
                },
                boxesCount: palletResult.totalBoxes
              });
              currentWeight += palWt;
              palIdx++;
            }
          }
        }
      }
      customLayoutUsed = true;
    }
  }

  // Fallback to standard grid packing if not matching custom configurations or palletCount remains
  if (!customLayoutUsed || packedPallets.length === 0) {
    packedPallets.length = 0; // reset
    currentWeight = 0;

    // Try Option A: Align pallet Length with Container Length
    const rowsL_A = Math.floor(cL / palL);
    const rowsW_A = Math.floor(cW / palW);
    const stack_A = Math.floor(cH / palH) || 1;

    // Try Option B: Align pallet Length with Container Width (Rotated 90 deg)
    const rowsL_B = Math.floor(cL / palW);
    const rowsW_B = Math.floor(cW / palL);
    const stack_B = Math.floor(cH / palH) || 1;

    const totalA = rowsL_A * rowsW_A * stack_A;
    const totalB = rowsL_B * rowsW_B * stack_B;

    const useRotated = totalB > totalA;
    const rowsL = useRotated ? rowsL_B : rowsL_A;
    const rowsW = useRotated ? rowsW_B : rowsW_A;
    const stackH = useRotated ? stack_B : stack_A;

    const actualL = useRotated ? palW : palL;
    const actualW = useRotated ? palL : palW;

    let palletIndex = 0;
    for (let z = 0; z < stackH; z++) {
      for (let x = 0; x < rowsL; x++) {
        for (let y = 0; y < rowsW; y++) {
          if (palletIndex >= palletCount) break;
          if (currentWeight + palWt > maxWeight) break;

          packedPallets.push({
            palletId: `pal-${palletIndex + 1}`,
            palletName: `Pallet ${palletIndex + 1}`,
            weight: palWt,
            position: {
              x: x * actualL,
              y: y * actualW,
              z: z * palH,
              l: actualL,
              w: actualW,
              h: palH
            },
            boxesCount: palletResult.totalBoxes
          });

          currentWeight += palWt;
          palletIndex++;
        }
        if (palletIndex >= palletCount || currentWeight + palWt > maxWeight) break;
      }
      if (palletIndex >= palletCount || currentWeight + palWt > maxWeight) break;
    }
  }

  const containerVol = (cL * cW * cH) / 1000000;
  const packedVol = packedPallets.reduce((sum, p) => sum + (p.position.l * p.position.w * p.position.h) / 1000000, 0);

  // Center of Gravity
  const cog = calculateCoG(packedPallets, container);

  // Loading Steps
  const loadingSteps = generatePalletLoadingSteps(packedPallets);

  return {
    packedPallets,
    unpackedPalletsCount: Math.max(0, palletCount - packedPallets.length),
    totalVolume: containerVol,
    packedVolume: packedVol,
    volumeEfficiency: containerVol > 0 ? (packedVol / containerVol) * 100 : 0,
    totalWeight: currentWeight,
    weightEfficiency: maxWeight > 0 ? (currentWeight / maxWeight) * 100 : 0,
    cog,
    loadingSteps
  };
}

/**
 * Packs a single cargo box type into a container using one of 6 specialized patterns.
 * Designed to handle large quantities (up to 25k+ boxes) instantly.
 */
export function solvePatternPacking(
  container: Container,
  boxLength: number,
  boxWidth: number,
  boxHeight: number,
  boxWeight: number,
  patternId: string
): {
  packedItems: PackedItem[];
  boxesPerLayer: number;
  layersCount: number;
  totalBoxes: number;
  totalVolume: number;
  packedVolume: number;
  volumeEfficiency: number;
  totalWeight: number;
  weightEfficiency: number;
  widthUsedPercent: number;
} {
  const cL = container.length;
  const cW = container.width;
  const cH = container.height;
  const maxWeight = container.maxWeight;

  const packedItems: PackedItem[] = [];

  let boxesPerLayer = 0;
  let layersCount = 0;

  // Let's generate positions layer by layer
  if (patternId === 'pattern-standard') {
    // Standard Grid
    const nx = Math.floor(cL / boxLength);
    const ny = Math.floor(cW / boxWidth);
    const nz = Math.floor(cH / boxHeight);
    
    boxesPerLayer = nx * ny;
    layersCount = nz;

    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          packedItems.push({
            itemId: 'pattern-box',
            name: 'กล่อง Standard',
            color: '#10b981', // green default
            weight: boxWeight,
            position: {
              x: x * boxLength,
              y: y * boxWidth,
              z: z * boxHeight,
              l: boxLength,
              w: boxWidth,
              h: boxHeight
            }
          });
        }
      }
    }
  } else if (patternId === 'pattern-332-alt') {
    // 3+3+2 Alternating (The best logistics pattern)
    // We group rows along the length: Row 1 & 2 are standard (3 boxes across width), Row 3 is rotated (2 boxes across width)
    // To fit, we calculate if width fits 3 * boxWidth and 2 * boxLength.
    // If not, we fall back to standard/rotated lane alternation.
    const canDo332 = (3 * boxWidth <= cW) && (2 * boxLength <= cW);
    
    if (canDo332) {
      // General 3+3+2 sequence along length:
      // A full block along length is [boxLength, boxLength, boxWidth]
      const seqL = boxLength + boxLength + boxWidth;
      const numSeqs = Math.floor(cL / seqL);
      const leftoverL = cL - numSeqs * seqL;
      
      // Let's count how many rows we can fit
      // We can fit rows manually.
      const nz = Math.floor(cH / boxHeight);
      layersCount = nz;

      // Compute boxes per single layer
      let singleLayerBoxes = 0;

      for (let z = 0; z < nz; z++) {
        const isOdd = z % 2 === 1;
        let currX = 0;

        // Pack the repeating sequences
        for (let s = 0; s < numSeqs; s++) {
          // Three rows in sequence: Row 1 (std), Row 2 (std), Row 3 (rot)
          // For alternating, we swap the sequence order on odd layers!
          const rowTypes = isOdd ? ['rot', 'std', 'std'] : ['std', 'std', 'rot'];

          for (const type of rowTypes) {
            if (type === 'std') {
              // 3 boxes across the width
              for (let y = 0; y < 3; y++) {
                packedItems.push({
                  itemId: 'pattern-box',
                  name: 'กล่อง std (3)',
                  color: '#22c55e',
                  weight: boxWeight,
                  position: {
                    x: currX,
                    y: y * boxWidth,
                    z: z * boxHeight,
                    l: boxLength,
                    w: boxWidth,
                    h: boxHeight
                  }
                });
                if (z === 0) singleLayerBoxes++;
              }
              currX += boxLength;
            } else {
              // 2 rotated boxes across the width
              for (let y = 0; y < 2; y++) {
                packedItems.push({
                  itemId: 'pattern-box',
                  name: 'กล่อง rot (2)',
                  color: '#15803d',
                  weight: boxWeight,
                  position: {
                    x: currX,
                    y: y * boxLength,
                    z: z * boxHeight,
                    l: boxWidth,
                    w: boxLength,
                    h: boxHeight
                  }
                });
                if (z === 0) singleLayerBoxes++;
              }
              currX += boxWidth;
            }
          }
        }

        // Leftover length can be packed with standard rows
        const remainingNx = Math.floor((cL - currX) / boxLength);
        const ny = Math.floor(cW / boxWidth);
        for (let x = 0; x < remainingNx; x++) {
          for (let y = 0; y < ny; y++) {
            packedItems.push({
              itemId: 'pattern-box',
              name: 'กล่อง std (L)',
              color: '#16a34a',
              weight: boxWeight,
              position: {
                x: currX + x * boxLength,
                y: y * boxWidth,
                z: z * boxHeight,
                l: boxLength,
                w: boxWidth,
                h: boxHeight
              }
            });
            if (z === 0) singleLayerBoxes++;
          }
        }
      }
      boxesPerLayer = singleLayerBoxes;
    } else {
      // Fallback: alternating standard/rotated lanes along the width
      const nyStd = Math.floor(cW / boxWidth);
      const nyRot = Math.floor(cW / boxLength);
      const nxStd = Math.floor(cL / boxLength);
      const nxRot = Math.floor(cL / boxWidth);
      const nz = Math.floor(cH / boxHeight);
      layersCount = nz;

      for (let z = 0; z < nz; z++) {
        const isOdd = z % 2 === 1;
        const useRot = isOdd && nyRot > 0 && nxRot > 0;
        const nx = useRot ? nxRot : nxStd;
        const ny = useRot ? nyRot : nyStd;
        const l = useRot ? boxWidth : boxLength;
        const w = useRot ? boxLength : boxWidth;

        for (let x = 0; x < nx; x++) {
          for (let y = 0; y < ny; y++) {
            packedItems.push({
              itemId: 'pattern-box',
              name: 'กล่อง Alternating',
              color: '#22c55e',
              weight: boxWeight,
              position: {
                x: x * l,
                y: y * w,
                z: z * boxHeight,
                l: l,
                w: w,
                h: boxHeight
              }
            });
          }
        }
      }
      boxesPerLayer = (nyStd * nxStd);
    }
  } else if (patternId === 'pattern-uniform-ab') {
    // Uniform A/B (Laying flat on largest side)
    // Sort dimensions: d1 >= d2 >= d3. L = d1, W = d2, H = d3.
    const dims = [boxLength, boxWidth, boxHeight].sort((a, b) => b - a);
    const flatL = dims[0];
    const flatW = dims[1];
    const flatH = dims[2];

    const nz = Math.floor(cH / flatH);
    layersCount = nz;

    const nxA = Math.floor(cL / flatL);
    const nyA = Math.floor(cW / flatW);
    const nxB = Math.floor(cL / flatW);
    const nyB = Math.floor(cW / flatL);

    boxesPerLayer = Math.max(nxA * nyA, nxB * nyB);

    for (let z = 0; z < nz; z++) {
      const isOdd = z % 2 === 1;
      // Alternate Layer A / Layer B
      const nx = isOdd ? nxB : nxA;
      const ny = isOdd ? nyB : nyA;
      const l = isOdd ? flatW : flatL;
      const w = isOdd ? flatL : flatW;

      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          packedItems.push({
            itemId: 'pattern-box',
            name: 'กล่อง Flat A/B',
            color: '#16a34a',
            weight: boxWeight,
            position: {
              x: x * l,
              y: y * w,
              z: z * flatH,
              l: l,
              w: w,
              h: flatH
            }
          });
        }
      }
    }
  } else if (patternId === 'pattern-upright-ab') {
    // Upright A/B (Standing upright on smallest face)
    // Sort dimensions: d1 >= d2 >= d3. H = d1 (largest), L = d2, W = d3.
    const dims = [boxLength, boxWidth, boxHeight].sort((a, b) => b - a);
    const upH = dims[0];
    const upL = dims[1];
    const upW = dims[2];

    const nz = Math.floor(cH / upH);
    layersCount = nz;

    const nxA = Math.floor(cL / upL);
    const nyA = Math.floor(cW / upW);
    const nxB = Math.floor(cL / upW);
    const nyB = Math.floor(cW / upL);

    boxesPerLayer = Math.max(nxA * nyA, nxB * nyB);

    for (let z = 0; z < nz; z++) {
      const isOdd = z % 2 === 1;
      const nx = isOdd ? nxB : nxA;
      const ny = isOdd ? nyB : nyA;
      const l = isOdd ? upW : upL;
      const w = isOdd ? upL : upW;

      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          packedItems.push({
            itemId: 'pattern-box',
            name: 'กล่อง Upright A/B',
            color: '#15803d',
            weight: boxWeight,
            position: {
              x: x * l,
              y: y * w,
              z: z * upH,
              l: l,
              w: w,
              h: upH
            }
          });
        }
      }
    }
  } else if (patternId === 'pattern-pinwheel') {
    // Pinwheel / Windmill Pattern
    // Repeatable pinwheel block of size (boxLength + boxWidth) x (boxLength + boxWidth)
    const clusterDim = boxLength + boxWidth;
    const nxClusters = Math.floor(cL / clusterDim);
    const nyClusters = Math.floor(cW / clusterDim);
    const nz = Math.floor(cH / boxHeight);
    
    layersCount = nz;
    
    // Each cluster has 4 boxes
    boxesPerLayer = nxClusters * nyClusters * 4;

    for (let z = 0; z < nz; z++) {
      const isOdd = z % 2 === 1;

      for (let cx = 0; cx < nxClusters; cx++) {
        for (let cy = 0; cy < nyClusters; cy++) {
          const xOffset = cx * clusterDim;
          const yOffset = cy * clusterDim;

          // 4 boxes in pinwheel
          const pinwheels = isOdd ? [
            { dx: 0, dy: 0, l: boxWidth, w: boxLength },
            { dx: boxWidth, dy: 0, l: boxLength, w: boxWidth },
            { dx: 0, dy: boxLength, l: boxLength, w: boxWidth },
            { dx: boxLength, dy: boxWidth, l: boxWidth, w: boxLength }
          ] : [
            { dx: 0, dy: 0, l: boxLength, w: boxWidth },
            { dx: boxLength, dy: 0, l: boxWidth, w: boxLength },
            { dx: 0, dy: boxWidth, l: boxWidth, w: boxLength },
            { dx: boxWidth, dy: boxLength, l: boxLength, w: boxWidth }
          ];

          for (const box of pinwheels) {
            packedItems.push({
              itemId: 'pattern-box',
              name: 'กล่อง Pinwheel',
              color: '#22c55e',
              weight: boxWeight,
              position: {
                x: xOffset + box.dx,
                y: yOffset + box.dy,
                z: z * boxHeight,
                l: box.l,
                w: box.w,
                h: boxHeight
              }
            });
          }
        }
      }
    }
  } else {
    // Interlocking Cross (Layer A std, Layer B rotated 90 deg)
    const nxStd = Math.floor(cL / boxLength);
    const nyStd = Math.floor(cW / boxWidth);
    const nxRot = Math.floor(cL / boxWidth);
    const nyRot = Math.floor(cW / boxLength);
    const nz = Math.floor(cH / boxHeight);

    layersCount = nz;
    boxesPerLayer = Math.floor((nxStd * nyStd + nxRot * nyRot) / 2);

    for (let z = 0; z < nz; z++) {
      const isOdd = z % 2 === 1;
      const nx = isOdd ? nxRot : nxStd;
      const ny = isOdd ? nyRot : nyStd;
      const l = isOdd ? boxWidth : boxLength;
      const w = isOdd ? boxLength : boxWidth;

      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          packedItems.push({
            itemId: 'pattern-box',
            name: 'กล่อง Cross',
            color: '#16a34a',
            weight: boxWeight,
            position: {
              x: x * l,
              y: y * w,
              z: z * boxHeight,
              l: l,
              w: w,
              h: boxHeight
            }
          });
        }
      }
    }
  }

  // Double check weight limit constraints
  // If weight exceeds maxWeight, we slice the packedItems list
  let totalWeight = 0;
  let finalPackedItems: PackedItem[] = [];
  
  for (const pi of packedItems) {
    if (totalWeight + pi.weight > maxWeight) {
      break; // stop packing when max container payload is reached
    }
    finalPackedItems.push(pi);
    totalWeight += pi.weight;
  }

  const totalBoxes = finalPackedItems.length;
  const containerVol = (cL * cW * cH) / 1000000;
  const packedVolume = finalPackedItems.reduce((sum, pi) => sum + (pi.position.l * pi.position.w * pi.position.h) / 1000000, 0);
  const volumeEfficiency = (packedVolume / containerVol) * 100;
  const weightEfficiency = (totalWeight / maxWeight) * 100;

  // Width used calculation: maxY / container width
  let maxOccupiedY = 0;
  for (const pi of finalPackedItems) {
    const endY = pi.position.y + pi.position.w;
    if (endY > maxOccupiedY) {
      maxOccupiedY = endY;
    }
  }
  const widthUsedPercent = cW > 0 ? (maxOccupiedY / cW) * 100 : 0;

  return {
    packedItems: finalPackedItems,
    boxesPerLayer: boxesPerLayer || Math.ceil(totalBoxes / (layersCount || 1)),
    layersCount: layersCount,
    totalBoxes,
    totalVolume: containerVol,
    packedVolume,
    volumeEfficiency,
    totalWeight,
    weightEfficiency,
    widthUsedPercent
  };
}

export interface CartonPackingResult {
  packedItems: PackedItem[];
  totalItems: number;
  packedVolume: number; // m3
  volumeEfficiency: number; // %
  netCargoWeight: number; // kg
  grossWeight: number; // kg (net + empty carton weight)
  layersCount: number;
  itemsPerLayer: number;
}

/**
 * Simulates packing individual units of a single SKU type inside a shipping Carton box
 */
export function solveCartonPacking(
  skuLength: number,
  skuWidth: number,
  skuHeight: number,
  skuWeight: number,
  cartonLength: number,
  cartonWidth: number,
  cartonHeight: number,
  cartonEmptyWeight: number,
  allowRotation: boolean = true
): CartonPackingResult {
  // Simple grid or layer packing heuristic for a single SKU inside a carton box
  // We can evaluate multiple orientations to find the one that yields the maximum number of items
  const orientations = [
    { l: skuLength, w: skuWidth, h: skuHeight },
    ...(allowRotation ? [
      { l: skuWidth, w: skuLength, h: skuHeight },
      { l: skuLength, w: skuHeight, h: skuWidth },
      { l: skuWidth, w: skuHeight, h: skuLength },
      { l: skuHeight, w: skuLength, h: skuWidth },
      { l: skuHeight, w: skuWidth, h: skuLength }
    ] : [])
  ];

  let bestResult: CartonPackingResult = {
    packedItems: [],
    totalItems: 0,
    packedVolume: 0,
    volumeEfficiency: 0,
    netCargoWeight: 0,
    grossWeight: cartonEmptyWeight,
    layersCount: 0,
    itemsPerLayer: 0
  };

  const cartonVol = (cartonLength * cartonWidth * cartonHeight) / 1000000;

  for (const orient of orientations) {
    const l = orient.l;
    const w = orient.w;
    const h = orient.h;

    if (l > cartonLength || w > cartonWidth || h > cartonHeight) continue;

    const colsX = Math.floor(cartonLength / l);
    const rowsY = Math.floor(cartonWidth / w);
    const layersZ = Math.floor(cartonHeight / h);

    if (colsX <= 0 || rowsY <= 0 || layersZ <= 0) continue;

    const currentPackedItems: PackedItem[] = [];
    let count = 0;

    for (let z = 0; z < layersZ; z++) {
      for (let y = 0; y < rowsY; y++) {
        for (let x = 0; x < colsX; x++) {
          currentPackedItems.push({
            itemId: `item-${count}`,
            name: `Unit ${count + 1}`,
            color: '#14b8a6', // Teal
            weight: skuWeight,
            position: {
              x: x * l,
              y: y * w,
              z: z * h,
              l: l,
              w: w,
              h: h
            }
          });
          count++;
        }
      }
    }

    const netWeight = count * skuWeight;
    const grossWeight = netWeight + cartonEmptyWeight;
    const itemsVol = (count * skuLength * skuWidth * skuHeight) / 1000000;
    const volEff = cartonVol > 0 ? (itemsVol / cartonVol) * 100 : 0;

    if (count > bestResult.totalItems) {
      bestResult = {
        packedItems: currentPackedItems,
        totalItems: count,
        packedVolume: itemsVol,
        volumeEfficiency: volEff,
        netCargoWeight: netWeight,
        grossWeight: grossWeight,
        layersCount: layersZ,
        itemsPerLayer: colsX * rowsY
      };
    }
  }

  return bestResult;
}


