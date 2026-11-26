import React, { useState, useEffect, useMemo } from 'react';
import { listenToSKUs, SKUItem } from './utils/firebaseDb';
import { ThreeVisualizer, VisualBox, CoGData } from './components/ThreeVisualizer';
import { WarehousePanel } from './components/WarehousePanel';
import { ReportPanel } from './components/ReportPanel';
import { SKUDatabasePanel } from './components/SKUDatabasePanel';
import { solvePalletPattern } from './utils/packingSolver';
import {
  Layers,
  CheckCircle,
  AlertTriangle,
  Package,
  Warehouse,
  ClipboardList,
  Database,
  Menu,
  X,
  Plus,
  Trash2,
  Scale,
  Box,
  RotateCw,
  Sliders,
  Sparkles,
  Truck,
} from 'lucide-react';

/* ── PRESETS ─────────────────────────────────────────────────────────────── */
const CONT: Record<string, { l: number; w: number; h: number; maxPay: number; cbm: number }> = {
  "20ft Standard": {
    l: 5898,
    w: 2352,
    h: 2393,
    maxPay: 22000,
    cbm: 33.2,
  },
  "40ft Standard": {
    l: 12032,
    w: 2352,
    h: 2393,
    maxPay: 26700,
    cbm: 67.7,
  },
  "40ft High Cube": {
    l: 12032,
    w: 2352,
    h: 2698,
    maxPay: 26460,
    cbm: 76.3,
  },
  "45ft High Cube": {
    l: 13556,
    w: 2352,
    h: 2698,
    maxPay: 27600,
    cbm: 86.0,
  },
};

const PALLETS = {
  "EUR/EPAL (1200×800)": {
    l: 1200,
    w: 800,
    h: 145,
    tare: 23,
    staticKg: 4000,
    dynKg: 1500,
    rackKg: 1000,
  },
  "US/GMA (1219×1016)": {
    l: 1219,
    w: 1016,
    h: 145,
    tare: 27,
    staticKg: 3628,
    dynKg: 1360,
    rackKg: 900,
  },
  "Thai Std (1100×1100)": {
    l: 1100,
    w: 1100,
    h: 150,
    tare: 20,
    staticKg: 2000,
    dynKg: 1000,
    rackKg: 600,
  },
  "Custom": {
    l: 1200,
    w: 1000,
    h: 145,
    tare: 25,
    staticKg: 2000,
    dynKg: 1000,
    rackKg: 600,
  },
};

const PAL_SPECS = { ...PALLETS };

const HANDLE_FACTORS: Record<string, number> = {
  "1-2 ครั้ง": 1.0,
  "3-4 ครั้ง": 0.8,
  "5+ ครั้ง": 0.65,
};

const ICOLS = [0x14b8a6, 0x3b82f6, 0xf59e0b, 0xa855f7, 0xec4899, 0x10b981];
const ICSS = ["#14b8a6", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899", "#10b981"];

/* ── SEARATES-STYLE PACKING & CONSTRAINTS UTILITIES ───────────────────────── */
interface PackingConstraints {
  maxPayKg?: number;
  targetQty?: number; // 0 or undefined = Fill to max capacity
  maxLayers?: number; // 0 or undefined = Full height
  autoStopOnWeight?: boolean;
}

function applyPackingLimits(
  rawPos: VisualBox[],
  boxWt: number,
  constraints?: PackingConstraints
): {
  pos: VisualBox[];
  maxGeoTotal: number;
  limitedBy: 'volume' | 'weight' | 'qty' | 'layers';
  unpackedQty: number;
} {
  const maxGeoTotal = rawPos.length;
  if (!constraints || maxGeoTotal === 0) {
    return { pos: rawPos, maxGeoTotal, limitedBy: 'volume', unpackedQty: 0 };
  }

  // Sort in loading order: X (front to back), then Y (bottom to top), then Z (left to right)
  const sorted = [...rawPos].sort((a, b) => {
    if (Math.abs(a.x - b.x) > 4) return a.x - b.x;
    if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
    return a.z - b.z;
  });

  const maxAllowedByWeight =
    constraints.autoStopOnWeight && constraints.maxPayKg && boxWt > 0
      ? Math.floor(constraints.maxPayKg / boxWt)
      : Infinity;

  const targetQty = constraints.targetQty && constraints.targetQty > 0 ? constraints.targetQty : Infinity;

  const limitCount = Math.min(maxGeoTotal, maxAllowedByWeight, targetQty);
  const sliced = sorted.slice(0, limitCount);

  let limitedBy: 'volume' | 'weight' | 'qty' | 'layers' = 'volume';
  if (limitCount === targetQty && targetQty < maxGeoTotal && targetQty <= maxAllowedByWeight) {
    limitedBy = 'qty';
  } else if (limitCount === maxAllowedByWeight && maxAllowedByWeight < maxGeoTotal) {
    limitedBy = 'weight';
  }

  const unpackedQty =
    constraints.targetQty && constraints.targetQty > sliced.length
      ? constraints.targetQty - sliced.length
      : 0;

  return {
    pos: sliced,
    maxGeoTotal,
    limitedBy,
    unpackedQty,
  };
}

function calcUniform(
  C: { l: number; w: number; h: number },
  bl: number,
  bw: number,
  bh: number,
  maxLayers?: number
) {
  if (bl <= 0 || bw <= 0 || bh <= 0) {
    return { pos: [] as VisualBox[], total: 0, perLayer: 0, layers: 0, wUsed: 0 };
  }
  const nl = Math.max(0, Math.floor(C.l / bl));
  const nw = Math.max(0, Math.floor(C.w / bw));
  let nh = Math.max(0, Math.floor(C.h / bh));
  if (maxLayers && maxLayers > 0) {
    nh = Math.min(nh, maxLayers);
  }
  const pos: VisualBox[] = [];
  for (let li = 0; li < nl; li++) {
    for (let hi = 0; hi < nh; hi++) {
      for (let wi = 0; wi < nw; wi++) {
        pos.push({
          x: li * bl,
          y: hi * bh,
          z: wi * bw,
          sx: bl,
          sy: bh,
          sz: bw,
        });
      }
    }
  }
  return {
    pos,
    total: nl * nw * nh,
    perLayer: nl * nw,
    layers: nh,
    wUsed: nw * bw,
  };
}

function calcMixed(
  C: { l: number; w: number; h: number },
  groups: { n: number; bw: number; bl: number }[],
  bh: number,
  maxLayers?: number
) {
  if (bh <= 0) {
    return { pos: [] as VisualBox[], total: 0, perLayer: 0, layers: 0, wUsed: 0 };
  }
  let nh = Math.max(0, Math.floor(C.h / bh));
  if (maxLayers && maxLayers > 0) {
    nh = Math.min(nh, maxLayers);
  }
  const pos: VisualBox[] = [];
  let z = 0;
  let perLayer = 0;
  for (const { n, bw, bl } of groups) {
    if (bl <= 0 || bw <= 0) continue;
    const nl = Math.max(0, Math.floor(C.l / bl));
    for (let r = 0; r < n && z + bw <= C.w + 8; r++) {
      perLayer += nl;
      for (let li = 0; li < nl; li++) {
        for (let hi = 0; hi < nh; hi++) {
          pos.push({
            x: li * bl,
            y: hi * bh,
            z,
            sx: bl,
            sy: bh,
            sz: bw,
          });
        }
      }
      z += bw;
    }
  }
  return {
    pos,
    total: pos.length,
    perLayer,
    layers: nh,
    wUsed: z,
  };
}

function getPatterns(
  C: { l: number; w: number; h: number; maxPay?: number },
  L: number,
  W: number,
  H: number,
  wt: number = 1,
  constraints?: PackingConstraints & { allowTilt?: boolean }
) {
  const maxL = constraints?.maxLayers;
  const basePatterns = [
    {
      id: "p3_3_2",
      name: "3+3+2 Alternating",
      tag: "แนะนำ",
      flat: true,
      calc: () => calcMixed(C, [{ n: 3, bw: W, bl: L }, { n: 3, bw: L, bl: W }, { n: 2, bw: W, bl: L }], H, maxL),
    },
    {
      id: "p6_2",
      name: "6+2 Interlock",
      tag: "",
      flat: true,
      calc: () => calcMixed(C, [{ n: 6, bw: W, bl: L }, { n: 2, bw: L, bl: W }], H, maxL),
    },
    {
      id: "uA",
      name: "Uniform Lengthwise (A)",
      tag: "",
      flat: true,
      calc: () => calcUniform(C, L, W, H, maxL),
    },
    {
      id: "uB",
      name: "Uniform Crosswise (B)",
      tag: "",
      flat: true,
      calc: () => calcUniform(C, W, L, H, maxL),
    },
  ];

  if (constraints?.allowTilt) {
    basePatterns.push(
      {
        id: "tilt_side",
        name: "On-Side Upright (ตะแคงข้าง)",
        tag: "Tilt",
        flat: false,
        calc: () => calcUniform(C, L, H, W, maxL),
      },
      {
        id: "tilt_end",
        name: "On-End Upright (ตั้งขึ้น)",
        tag: "Tilt",
        flat: false,
        calc: () => calcUniform(C, W, H, L, maxL),
      }
    );
  }

  return basePatterns.map((p) => {
    const raw = p.calc();
    const limited = applyPackingLimits(raw.pos, wt, constraints);
    return {
      ...p,
      r: {
        ...raw,
        pos: limited.pos.map((b) => ({ ...b, wt })),
        total: limited.pos.length,
        maxGeoTotal: limited.maxGeoTotal,
        limitedBy: limited.limitedBy,
        unpackedQty: limited.unpackedQty,
      },
    };
  });
}

function calcPalletLoad(
  C: { l: number; w: number; h: number; maxPay?: number },
  box: { L: number; W: number; H: number; wt: number },
  pal: { l: number; w: number; h: number; tare?: number },
  patternType: 'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick' = 'architectural',
  targetPallets?: number,
  autoStopOnWeight: boolean = true
) {
  const { L: bl, W: bw, H: bh, wt: bwt } = box;
  const { l: pl, w: pw, h: ph } = pal;
  const availH = C.h - ph - 50;
  let best: any = null;

  for (const [pL, pW] of [
    [pl, pw],
    [pw, pl],
  ]) {
    if (pL <= 0 || pW <= 0) continue;
    const pCL = Math.floor(C.l / pL);
    const pCW = Math.floor(C.w / pW);
    const maxGeoPallets = pCL * pCW;

    if (maxGeoPallets === 0) continue;

    const palletObj = {
      id: "pal",
      name: "Pallet",
      length: pL / 10,
      width: pW / 10,
      height: ph / 10,
      maxHeight: (ph + availH) / 10,
      maxWeight: 999999,
    };

    const cargoObj = {
      name: "Box",
      length: bl / 10,
      width: bw / 10,
      height: bh / 10,
      weight: bwt,
    };

    const palPatternResult = solvePalletPattern(cargoObj, palletObj, patternType);
    const bPerPal = palPatternResult.totalBoxes;
    const singlePalletGrossWt = bPerPal * bwt + (pal.tare || 23);

    const maxPalletsByWeight =
      autoStopOnWeight && C.maxPay && singlePalletGrossWt > 0
        ? Math.floor(C.maxPay / singlePalletGrossWt)
        : Infinity;

    const reqPallets = targetPallets && targetPallets > 0 ? targetPallets : Infinity;
    const actualPallets = Math.min(maxGeoPallets, maxPalletsByWeight, reqPallets);
    const totBox = actualPallets * bPerPal;

    if (!best || totBox > best.totalBoxes) {
      const pos: VisualBox[] = [];
      const palPos: VisualBox[] = [];

      let placedPal = 0;
      for (let pi = 0; pi < pCL; pi++) {
        for (let pj = 0; pj < pCW; pj++) {
          if (placedPal >= actualPallets) break;
          const px = pi * pL;
          const pz = pj * pW;

          palPos.push({
            x: px,
            y: 0,
            z: pz,
            sx: pL,
            sy: ph,
            sz: pW,
            wt: pal.tare || 23,
          });

          for (const bPos of palPatternResult.boxPositions) {
            pos.push({
              x: px + Math.round(bPos.x * 10),
              y: ph + Math.round(bPos.z * 10),
              z: pz + Math.round(bPos.y * 10),
              sx: Math.round(bPos.l * 10),
              sy: Math.round(bPos.h * 10),
              sz: Math.round(bPos.w * 10),
              wt: bwt,
            });
          }
          placedPal++;
        }
      }

      best = {
        totalBoxes: totBox,
        totalPallets: actualPallets,
        maxGeoPallets,
        unpackedPallets: targetPallets && targetPallets > actualPallets ? targetPallets - actualPallets : 0,
        boxesPerPallet: bPerPal,
        boxesPerLayer: palPatternResult.boxesPerLayer,
        boxLayersH: palPatternResult.layersCount,
        pos,
        palPos,
        usedL: pCL * pL,
        usedW: pCW * pW,
        palletsL: pCL,
        palletsW: pCW,
      };
    }
  }

  return (
    best || {
      totalBoxes: 0,
      totalPallets: 0,
      maxGeoPallets: 0,
      unpackedPallets: 0,
      boxesPerPallet: 0,
      boxesPerLayer: 0,
      boxLayersH: 0,
      pos: [],
      palPos: [],
      usedL: 0,
      usedW: 0,
      palletsL: 0,
      palletsW: 0,
    }
  );
}

function calcMixLoad(
  C: { l: number; w: number; h: number; maxPay?: number },
  items: {
    skuId: string;
    box: { L: number; W: number; H: number; wt: number };
    allocLen: number;
    targetQty?: number;
    pid?: string;
  }[],
  autoStopOnWeight: boolean = true
) {
  const results = [];
  let curX = 0;
  let remainingPay = C.maxPay || 999999;

  for (const item of items) {
    const { L, W, H, wt } = item.box;
    const subLen = item.allocLen || 0;
    if (subLen <= 0) {
      results.push({
        total: 0,
        maxGeoTotal: 0,
        unpackedQty: item.targetQty || 0,
        pos: [] as VisualBox[],
        perLayer: 0,
        layers: 0,
        wt,
        allocLen: 0,
        pid: item.pid || 'p3_3_2',
      });
      continue;
    }

    const subC = { l: subLen, w: C.w, h: C.h, maxPay: remainingPay };
    const itemPats = getPatterns(subC, L, W, H, wt, {
      maxPayKg: remainingPay,
      targetQty: item.targetQty,
      autoStopOnWeight,
    });
    const selectedPid = item.pid || 'p3_3_2';
    const actPat = itemPats.find((p) => p.id === selectedPid) || itemPats[0];
    const r = actPat.r;

    // Offset positions by curX and advance curX by actual occupied length
    let maxSubX = 0;
    const offsetPos = r.pos.map((p: VisualBox) => {
      if (p.x + p.sx > maxSubX) maxSubX = p.x + p.sx;
      return {
        ...p,
        x: p.x + curX,
        wt,
      };
    });

    const groupWeight = r.total * wt;
    remainingPay = Math.max(0, remainingPay - groupWeight);

    results.push({
      total: r.total,
      maxGeoTotal: r.maxGeoTotal,
      unpackedQty: r.unpackedQty,
      pos: offsetPos,
      perLayer: r.perLayer,
      layers: r.layers,
      bl: L,
      bw: W,
      bh: H,
      wt,
      allocLen: subLen,
      pid: selectedPid,
    });

    // If targetQty was used and didn't fill the whole subLen, advance curX tightly so next cargo packs flush!
    curX += item.targetQty && item.targetQty > 0 && maxSubX > 0 ? maxSubX : subLen;
  }
  return results;
}

function computeContainerCoG(
  layers: { pos: VisualBox[] }[],
  C: { l: number; w: number; h: number }
): CoGData {
  let sumWX = 0;
  let sumWY = 0;
  let sumWZ = 0;
  let totalWt = 0;

  for (const layer of layers) {
    if (!layer.pos) continue;
    for (let i = 0; i < layer.pos.length; i++) {
      const b = layer.pos[i];
      const w = b.wt ?? 1;
      const cx = b.x + b.sx / 2;
      const cy = b.y + b.sy / 2;
      const cz = b.z + b.sz / 2;
      sumWX += w * cx;
      sumWY += w * cy;
      sumWZ += w * cz;
      totalWt += w;
    }
  }

  const xMm = totalWt > 0 ? sumWX / totalWt : C.l / 2;
  const yMm = totalWt > 0 ? sumWY / totalWt : C.h / 2;
  const zMm = totalWt > 0 ? sumWZ / totalWt : C.w / 2;

  const xPct = C.l > 0 ? (xMm / C.l) * 100 : 50;
  const yPct = C.h > 0 ? (yMm / C.h) * 100 : 50;
  const zPct = C.w > 0 ? (zMm / C.w) * 100 : 50;

  const devX = Math.abs(50 - xPct);
  const devZ = Math.abs(50 - zPct);
  const isBalanced = devX <= 12 && devZ <= 10 && yPct <= 55;

  let statusText = 'สมดุลดี (Balanced)';
  if (!isBalanced) {
    if (devX > 12) statusText = xPct < 50 ? 'หนักหัวตู้ (Front Heavy)' : 'หนักท้ายตู้ (Rear Heavy)';
    else if (devZ > 10) statusText = 'เอียงซ้าย/ขวา (Side Tilt)';
    else statusText = 'จุดศูนย์ถ่วงสูง (High CoG)';
  }

  return { xMm, yMm, zMm, xPct, yPct, zPct, isBalanced, statusText };
}

function calcWhPallet(
  box: { L: number; W: number; H: number; wt: number },
  pal: { l: number; w: number; h: number; tare: number; staticKg: number; dynKg: number; rackKg: number },
  s: { maxHeight: number; floorLoad: number; handleFreq: string; bct: string; compSF: number; manualLayers: string },
  patternType: 'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick' = 'architectural'
) {
  const { L: bl, W: bw, H: bh, wt } = box;
  const { l: pl, w: pw, h: ph, tare, dynKg } = pal;

  const palletObj = {
    id: "pal",
    name: "Pallet",
    length: pl / 10,
    width: pw / 10,
    height: ph / 10,
    maxHeight: s.maxHeight / 10,
    maxWeight: dynKg,
  };

  const cargoObj = {
    name: "Box",
    length: bl / 10,
    width: bw / 10,
    height: bh / 10,
    weight: wt,
  };

  const palPatternResult = solvePalletPattern(cargoObj, palletObj, patternType);
  const bpl = palPatternResult.boxesPerLayer;
  const layerPositions = palPatternResult.boxPositions.filter((p) => Math.abs(p.z) < 0.1);

  let maxOccupiedX = 0;
  let maxOccupiedY = 0;
  for (const pos of layerPositions) {
    const endX = pos.x + pos.l;
    const endY = pos.y + pos.w;
    if (endX > maxOccupiedX) maxOccupiedX = endX;
    if (endY > maxOccupiedY) maxOccupiedY = endY;
  }
  const ovL = Math.max(0, pl - Math.round(maxOccupiedX * 10));
  const ovW = Math.max(0, pw - Math.round(maxOccupiedY * 10));

  const ori = {
    bL: bl,
    bW: bw,
    nL: Math.floor(pl / bl),
    nW: Math.floor(pw / bw),
  };

  const hf = HANDLE_FACTORS[s.handleFreq] || 0.8;
  const effDyn = dynKg * hf;
  const cap = effDyn - tare;

  const mW = bpl > 0 && wt > 0 ? Math.max(0, Math.floor(cap / (bpl * wt))) : 0;
  const mH = bh > 0 ? Math.max(0, Math.floor((s.maxHeight - ph - 200) / bh)) : 0;

  let mC = 9999;
  let cNote = "";
  if (s.bct && +s.bct > 0) {
    const es = +s.bct / s.compSF;
    mC = Math.max(1, Math.floor(es / wt) + 1);
    cNote = `BCT ${s.bct} กก. ÷ SF ${s.compSF} = ${es.toFixed(0)} กก.`;
  }

  const manLim = s.manualLayers && +s.manualLayers > 0 ? +s.manualLayers : 9999;
  const rec = Math.min(mW, mH, mC, manLim);
  const lim = rec === mW ? "⚖ Weight" : rec === mH ? "📏 Height" : rec === mC ? "📦 Compression" : "✏ Manual";

  const stkH = ph + rec * bh;
  const totWt = tare + bpl * rec * wt;
  const fp = (pl / 1000) * (pw / 1000);
  const fkgm2 = totWt / fp;

  return {
    ori,
    bpl,
    ovL,
    ovW,
    hf,
    effDyn,
    cap,
    mW,
    mH,
    mC,
    manLim,
    rec,
    lim,
    stkH,
    totWt,
    fkgm2,
    wtUtil: totWt / effDyn,
    cNote,
    floorOK: fkgm2 <= s.floorLoad,
    htOK: stkH <= s.maxHeight - 200,
    wtOK: totWt <= effDyn,
    boxPositions: layerPositions,
  };
}

/* ── MAIN APPLICATION ────────────────────────────────────────────────────── */
export default function App() {
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [sideOpen, setSideOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToSKUs((updatedSkus) => {
      setSkus(updatedSkus);
    });
    return () => unsubscribe();
  }, []);

  // Navigation Mode
  const [mode, setModeRaw] = useState<string>('single');
  const [prevMode, setPrevMode] = useState<string>('single');
  const setMode = (m: string) => {
    if (m !== 'report' && m !== 'warehouse' && m !== 'sku') setPrevMode(m);
    setModeRaw(m);
  };

  // Equipment / Container Selection
  const [cKey, setCKey] = useState<string>("20ft Standard");
  const [customCont, setCustomCont] = useState({ l: 5898, w: 2352, h: 2393, maxPay: 22000 });
  const C = useMemo(() => {
    if (cKey === "Custom Container") {
      return {
        ...customCont,
        cbm: (customCont.l * customCont.w * customCont.h) / 1e9,
      };
    }
    return CONT[cKey] || CONT["20ft Standard"];
  }, [cKey, customCont]);

  // Global SeaRates Stuffing Rules
  const [autoStopOnWeight, setAutoStopOnWeight] = useState<boolean>(true);

  // 1. Single SKU Mode States
  const [skuId, setSkuId] = useState<string>('s12');
  const [box, setBox] = useState({ L: 348, W: 262, H: 95, wt: 6.26 });
  const [singleTargetQty, setSingleTargetQty] = useState<number>(0); // 0 = Max Fill
  const [singleMaxLayers, setSingleMaxLayers] = useState<number>(0); // 0 = Unlimited
  const [allowTilt, setAllowTilt] = useState<boolean>(false);
  const [pid, setPid] = useState<string>('p3_3_2');

  // 2. Pallet Stuffing Mode States
  const [palSkuId, setPalSkuId] = useState<string>('s12');
  const [palBox, setPalBox] = useState({ L: 348, W: 262, H: 95, wt: 6.26 });
  const [palKey, setPalKey] = useState<keyof typeof PALLETS>("EUR/EPAL (1200×800)");
  const [palDims, setPalDims] = useState(PALLETS["EUR/EPAL (1200×800)"]);
  const [palPattern, setPalPattern] = useState<'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick'>('architectural');
  const [targetPalletCount, setTargetPalletCount] = useState<number>(0); // 0 = Max Fill

  // 3. Multi-SKU Mix Mode States
  const [mixItems, setMixItems] = useState<any[]>(() => {
    const C0 = CONT["20ft Standard"];
    return [
      {
        skuId: "s12",
        box: { L: 348, W: 262, H: 95, wt: 6.26 },
        allocLen: Math.floor(C0.l / 2),
        targetQty: 0,
        pid: "p3_3_2",
      },
      {
        skuId: "s2",
        box: { L: 410, W: 306, H: 243, wt: 23.6 },
        allocLen: Math.floor(C0.l / 2),
        targetQty: 0,
        pid: "p3_3_2",
      },
    ];
  });

  // 4. Warehouse Pallet Mode States
  const [whSkuId, setWhSkuId] = useState<string>('s12');
  const [whBox, setWhBox] = useState({ L: 348, W: 262, H: 95, wt: 6.26 });
  const [whPalKey, setWhPalKey] = useState<keyof typeof PAL_SPECS>("EUR/EPAL (1200×800)");
  const [whPal, setWhPal] = useState(PAL_SPECS["EUR/EPAL (1200×800)"]);
  const [whPattern, setWhPattern] = useState<'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural' | 'architectural_brick'>('architectural');
  const [whSettings, setWhSettings] = useState({
    maxHeight: 4000,
    floorLoad: 3000,
    handleFreq: "3-4 ครั้ง",
    bct: "",
    compSF: 4.5,
    manualLayers: "",
  });

  // Keep mixItems allocLen proportional when switching container sizes
  useEffect(() => {
    const totalAlloc = mixItems.reduce((s, i) => s + i.allocLen, 0);
    if (totalAlloc > 0 && Math.abs(totalAlloc - C.l) > 10) {
      setMixItems((its) =>
        its.map((it) => ({
          ...it,
          allocLen: Math.round((it.allocLen / totalAlloc) * C.l),
        }))
      );
    }
  }, [C.l]);

  // Handlers
  const handleSku = (id: string) => {
    setSkuId(id);
    if (id === 'manual') return;
    const s = skus.find((x) => x.id === id);
    if (s) {
      setBox({
        L: Math.round(s.length * 10),
        W: Math.round(s.width * 10),
        H: Math.round(s.height * 10),
        wt: s.weight,
      });
    }
  };

  const handlePalSku = (id: string) => {
    setPalSkuId(id);
    if (id === 'manual') return;
    const s = skus.find((x) => x.id === id);
    if (s) {
      setPalBox({
        L: Math.round(s.length * 10),
        W: Math.round(s.width * 10),
        H: Math.round(s.height * 10),
        wt: s.weight,
      });
    }
  };

  const handleWhSku = (id: string) => {
    setWhSkuId(id);
    if (id === 'manual') return;
    const s = skus.find((x) => x.id === id);
    if (s) {
      setWhBox({
        L: Math.round(s.length * 10),
        W: Math.round(s.width * 10),
        H: Math.round(s.height * 10),
        wt: s.weight,
      });
    }
  };

  const handlePalType = (key: keyof typeof PALLETS) => {
    setPalKey(key);
    if (key !== "Custom") {
      setPalDims({ ...PALLETS[key] });
    }
  };

  const handleWhPalType = (key: keyof typeof PAL_SPECS) => {
    setWhPalKey(key);
    const p = PAL_SPECS[key];
    if (p) setWhPal({ ...p });
  };

  const setWhS = (k: string) => (v: any) => {
    setWhSettings((s) => ({ ...s, [k]: v }));
  };

  const setMixSku = (idx: number, sid: string) => {
    const s = skus.find((x) => x.id === sid);
    setMixItems((its) =>
      its.map((it, i) =>
        i === idx
          ? {
              ...it,
              skuId: sid,
              box: s
                ? {
                    L: Math.round(s.length * 10),
                    W: Math.round(s.width * 10),
                    H: Math.round(s.height * 10),
                    wt: s.weight,
                  }
                : it.box,
            }
          : it
      )
    );
  };

  const setMixAlloc = (idx: number, val: number) => {
    setMixItems((its) =>
      its.map((it, i) => (i === idx ? { ...it, allocLen: val || 0 } : it))
    );
  };

  const setMixTargetQty = (idx: number, qty: number) => {
    setMixItems((its) =>
      its.map((it, i) => (i === idx ? { ...it, targetQty: Math.max(0, qty) } : it))
    );
  };

  // Auto-allocate container length based on target quantities or equal split
  const autoAllocateMixByQty = () => {
    const hasQty = mixItems.some((it) => it.targetQty && it.targetQty > 0);
    if (!hasQty) {
      const n = mixItems.length;
      const each = Math.floor(C.l / n);
      setMixItems((its) =>
        its.map((it, i) => ({
          ...it,
          allocLen: i < n - 1 ? each : C.l - each * (n - 1),
        }))
      );
      return;
    }

    // Weight allocation by requested volume of each group
    const vols = mixItems.map((it) => {
      const q = it.targetQty && it.targetQty > 0 ? it.targetQty : 200;
      return q * ((it.box.L * it.box.W * it.box.H) / 1e9);
    });
    const totVol = vols.reduce((a, b) => a + b, 0) || 1;
    let usedL = 0;
    setMixItems((its) =>
      its.map((it, i) => {
        if (i === its.length - 1) {
          return { ...it, allocLen: Math.max(0, C.l - usedL) };
        }
        const len = Math.round((vols[i] / totVol) * C.l);
        usedL += len;
        return { ...it, allocLen: len };
      })
    );
  };

  const addMix = () => {
    if (mixItems.length >= 6) return;
    const n = mixItems.length + 1;
    const each = Math.floor(C.l / n);
    setMixItems((its) => {
      const next = [
        ...its,
        {
          skuId: "s12",
          box: { L: 348, W: 262, H: 95, wt: 6.26 },
          allocLen: each,
          targetQty: 0,
          pid: "p3_3_2",
        },
      ];
      return next.map((it, i) => ({
        ...it,
        allocLen: i < n - 1 ? each : C.l - each * (n - 1),
      }));
    });
  };

  const delMix = (idx: number) => {
    if (mixItems.length <= 1) return;
    setMixItems((its) => its.filter((_, i) => i !== idx));
  };

  /* ── MEMOIZED SOLVER CALCULATIONS ──────────────────────────────────────── */
  const patterns = useMemo(
    () =>
      getPatterns(C, box.L, box.W, box.H, box.wt, {
        maxPayKg: C.maxPay,
        targetQty: singleTargetQty,
        maxLayers: singleMaxLayers,
        autoStopOnWeight,
        allowTilt,
      }),
    [C, box.L, box.W, box.H, box.wt, singleTargetQty, singleMaxLayers, autoStopOnWeight, allowTilt]
  );

  const actPat = useMemo(() => patterns.find((p) => p.id === pid) || patterns[0], [patterns, pid]);
  const singRes = useMemo(() => actPat.r, [actPat]);

  const palRes = useMemo(
    () => calcPalletLoad(C, palBox, palDims, palPattern, targetPalletCount, autoStopOnWeight),
    [C, palBox, palDims, palPattern, targetPalletCount, autoStopOnWeight]
  );

  const mixRes = useMemo(
    () => calcMixLoad(C, mixItems, autoStopOnWeight),
    [C, mixItems, autoStopOnWeight]
  );

  const whRes = useMemo(
    () => calcWhPallet(whBox, whPal, whSettings, whPattern),
    [whBox, whPal, whSettings, whPattern]
  );

  const palletCargoWeight = useMemo(() => palRes.boxesPerPallet * palBox.wt, [palRes.boxesPerPallet, palBox.wt]);
  const isPalletWeightExceeded = useMemo(() => {
    return palletCargoWeight > (palDims.dynKg ?? 999999) || palletCargoWeight > (palDims.rackKg ?? 999999);
  }, [palletCargoWeight, palDims.dynKg, palDims.rackKg]);

  // 3D Layers & CoG
  const layers3D = useMemo(() => {
    if (mode === 'single') {
      return [{ pos: singRes.pos, color: 0x14b8a6, name: 'Single Cargo' }];
    }
    if (mode === 'pallet') {
      return [
        { pos: palRes.palPos, color: 0xd97706, gap: 0.8, name: 'Pallets' },
        { pos: palRes.pos, color: 0x14b8a6, name: 'Palletized Boxes' },
      ];
    }
    if (mode === 'mix') {
      return mixRes.map((r, i) => ({
        pos: r.pos,
        color: ICOLS[i % ICOLS.length],
        gap: 2,
        name: `Group ${i + 1}`,
      }));
    }
    return [];
  }, [mode, singRes, palRes, mixRes]);

  const cogData = useMemo(() => computeContainerCoG(layers3D, C), [layers3D, C]);

  // Overall KPI Summary
  const summ = useMemo(() => {
    const contVolM3 = (C.l * C.w * C.h) / 1e9;
    if (mode === 'single') {
      const packedVolM3 = (singRes.total * box.L * box.W * box.H) / 1e9;
      return {
        boxes: singRes.total,
        unpacked: singRes.unpackedQty || 0,
        limitedBy: singRes.limitedBy,
        wt: singRes.total * box.wt,
        volM3: packedVolM3,
        volPct: contVolM3 > 0 ? (packedVolM3 / contVolM3) * 100 : 0,
      };
    }
    if (mode === 'pallet') {
      const boxVolM3 = (palRes.totalBoxes * palBox.L * palBox.W * palBox.H) / 1e9;
      const palVolM3 = (palRes.totalPallets * palDims.l * palDims.w * palDims.h) / 1e9;
      const packedVolM3 = boxVolM3 + palVolM3;
      return {
        boxes: palRes.totalBoxes,
        unpacked: palRes.unpackedPallets ? palRes.unpackedPallets * palRes.boxesPerPallet : 0,
        limitedBy: 'volume' as const,
        wt: palRes.totalBoxes * palBox.wt + palRes.totalPallets * (palDims.tare || 23),
        volM3: packedVolM3,
        volPct: contVolM3 > 0 ? (packedVolM3 / contVolM3) * 100 : 0,
      };
    }
    if (mode === 'mix') {
      return mixRes.reduce(
        (a, r) => {
          const v = (r.total * (r.bl || 0) * (r.bw || 0) * (r.bh || 0)) / 1e9;
          const nextVol = a.volM3 + v;
          return {
            boxes: a.boxes + r.total,
            unpacked: a.unpacked + (r.unpackedQty || 0),
            limitedBy: 'volume' as const,
            wt: a.wt + r.total * r.wt,
            volM3: nextVol,
            volPct: contVolM3 > 0 ? (nextVol / contVolM3) * 100 : 0,
          };
        },
        { boxes: 0, unpacked: 0, limitedBy: 'volume' as const, wt: 0, volM3: 0, volPct: 0 }
      );
    }
    return { boxes: 0, unpacked: 0, limitedBy: 'volume' as const, wt: 0, volM3: 0, volPct: 0 };
  }, [mode, singRes, palRes, mixRes, box, palBox, palDims, C]);

  const wtPct = C.maxPay > 0 ? (summ.wt / C.maxPay) * 100 : 0;
  const wtOk = summ.wt <= C.maxPay + 0.5;
  const mixUsed = mixItems.reduce((s, i) => s + i.allocLen, 0);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-slate-100 text-slate-800 overflow-hidden font-sans select-none">
      {/* 1. CLEAN SEARATES-STYLE LEFT SIDEBAR */}
      <div
        className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 z-30 ${
          sideOpen ? 'w-full md:w-[360px] h-full' : 'w-0 h-0 overflow-hidden'
        }`}
      >
        {/* App Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] tracking-widest text-teal-400 font-extrabold uppercase block">
                P.V.T. FOODS INDUSTRIES
              </span>
              <h1 className="text-sm font-black text-white tracking-tight">
                3D Container & Pallet Stuffing
              </h1>
            </div>
          </div>
          <button
            onClick={() => setSideOpen(false)}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean 2-Row Segmented Navigation */}
        <div className="p-2 bg-slate-50 border-b border-slate-200 space-y-1.5">
          <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl">
            {[
              ['single', <Package className="w-3.5 h-3.5" />, '1. สินค้าเดี่ยว'],
              ['mix', <Plus className="w-3.5 h-3.5" />, '2. คละหลาย SKU'],
              ['pallet', <Layers className="w-3.5 h-3.5" />, '3. จัดลงพาเลท'],
            ].map(([m, icon, lbl]) => (
              <button
                key={m as string}
                onClick={() => setMode(m as string)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-extrabold cursor-pointer transition ${
                  mode === m
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {icon}
                <span>{lbl as string}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1">
            {[
              ['warehouse', <Warehouse className="w-3.5 h-3.5" />, 'คลังพาเลท (WH)'],
              ['report', <ClipboardList className="w-3.5 h-3.5" />, 'ใบสเปค (PDF)'],
              ['sku', <Database className="w-3.5 h-3.5" />, 'ฐานข้อมูล SKU'],
            ].map(([m, icon, lbl]) => (
              <button
                key={m as string}
                onClick={() => setMode(m as string)}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[10px] font-bold cursor-pointer transition border ${
                  mode === m
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {icon}
                <span>{lbl as string}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Configuration Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* STEP 1: CONTAINER / EQUIPMENT SELECTION */}
          {mode !== 'warehouse' && mode !== 'sku' && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-teal-600" />
                  เลือกตู้คอนเทนเนอร์ (Equipment)
                </label>
                <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                  {C.cbm.toFixed(1)} m³
                </span>
              </div>

              <select
                value={cKey}
                onChange={(e) => setCKey(e.target.value)}
                className="w-full text-xs p-2.5 bg-white border border-slate-200 text-slate-800 rounded-xl font-bold outline-none cursor-pointer hover:border-teal-400 focus:ring-2 focus:ring-teal-500"
              >
                {Object.keys(CONT).map((k) => (
                  <option key={k} value={k}>
                    {k} (Max {(CONT[k].maxPay / 1000).toFixed(1)} ตัน)
                  </option>
                ))}
                <option value="Custom Container">กำหนดขนาดตู้เอง (Custom Dimensions)</option>
              </select>

              {cKey === "Custom Container" ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    ['ยาว L (มม.)', 'l', customCont.l],
                    ['กว้าง W (มม.)', 'w', customCont.w],
                    ['สูง H (มม.)', 'h', customCont.h],
                    ['พิกัดน้ำหนัก (กก.)', 'maxPay', customCont.maxPay],
                  ].map(([lbl, k, v]) => (
                    <div key={k as string}>
                      <span className="text-[9px] text-slate-400 font-bold block mb-0.5">{lbl}</span>
                      <input
                        type="number"
                        value={v as number}
                        onChange={(e) =>
                          setCustomCont((prev) => ({ ...prev, [k as string]: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between text-[10px] text-slate-500 font-medium px-0.5">
                  <span>มิติภายใน: {(C.l / 10).toFixed(0)} × {(C.w / 10).toFixed(0)} × {(C.h / 10).toFixed(0)} ซม.</span>
                  <span>พิกัด: {C.maxPay.toLocaleString()} กก.</span>
                </div>
              )}

              {/* SeaRates Weight Limit Auto-Cutoff Toggle */}
              <label className="flex items-center justify-between pt-2 border-t border-slate-200/70 cursor-pointer">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-teal-600" />
                  หยุดโหลดอัตโนมัติเมื่อเต็มพิกัดน้ำหนักตู้
                </span>
                <input
                  type="checkbox"
                  checked={autoStopOnWeight}
                  onChange={(e) => setAutoStopOnWeight(e.target.checked)}
                  className="accent-teal-600 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          )}

          {/* MODE 1: SINGLE SKU STUFFING */}
          {mode === 'single' && (
            <div className="space-y-4">
              {/* Product Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  ข้อมูลสินค้า (Cargo Dimensions & Weight)
                </label>

                <select
                  value={skuId}
                  onChange={(e) => handleSku(e.target.value)}
                  className="w-full text-xs p-2.5 bg-teal-50/50 border border-teal-200 text-teal-800 font-bold rounded-xl outline-none cursor-pointer"
                >
                  <option value="manual">✏️ กรอกขนาดกล่องเอง (Manual Input)</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['ยาว L (มม.)', 'L', box.L],
                    ['กว้าง W (มม.)', 'W', box.W],
                    ['สูง H (มม.)', 'H', box.H],
                    ['น้ำหนัก (กก./กล่อง)', 'wt', box.wt],
                  ].map(([lbl, k, v]) => (
                    <div key={k as string}>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">{lbl}</span>
                      <input
                        type="number"
                        value={v as number}
                        onChange={(e) => {
                          setSkuId('manual');
                          setBox((b) => ({ ...b, [k as string]: parseFloat(e.target.value) || 0 }));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-bold text-center focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  ))}
                </div>

                {/* SeaRates Cargo Constraints (Target Qty, Max Stack Layers, Tilt/Flip) */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    เงื่อนไขการวางซ้อนและจำนวน (Stuffing Rules)
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold block mb-1">
                        จำนวนออเดอร์ (0 = เต็มตู้)
                      </span>
                      <input
                        type="number"
                        min={0}
                        placeholder="เต็มความจุตู้"
                        value={singleTargetQty || ''}
                        onChange={(e) => setSingleTargetQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-teal-700 font-bold text-center placeholder:text-slate-400 outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold block mb-1">
                        จำกัดชั้นซ้อนสูงสุด (0 = ไม่จำกัด)
                      </span>
                      <input
                        type="number"
                        min={0}
                        placeholder="ไม่จำกัดชั้น"
                        value={singleMaxLayers || ''}
                        onChange={(e) => setSingleMaxLayers(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold text-center placeholder:text-slate-400 outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between pt-1 cursor-pointer">
                    <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5 text-teal-600" />
                      อนุญาตวางตะแคง/ตั้งกล่อง (Allow Tilt 6-Axis)
                    </span>
                    <input
                      type="checkbox"
                      checked={allowTilt}
                      onChange={(e) => setAllowTilt(e.target.checked)}
                      className="accent-teal-600 w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Pattern Selection List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    รูปแบบการจัดเรียง (Loading Patterns)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const best = patterns.reduce((prev, curr) => (curr.r.total > prev.r.total ? curr : prev), patterns[0]);
                      if (best) setPid(best.id);
                    }}
                    className="text-[10px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    เลือกแบบจุสูงสุด
                  </button>
                </div>

                <div className="space-y-1.5">
                  {patterns.map((p) => {
                    const maxTotal = Math.max(...patterns.map((x) => x.r.total));
                    const isBest = p.r.total === maxTotal && maxTotal > 0;
                    const sel = pid === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setPid(p.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex justify-between items-center ${
                          sel
                            ? 'bg-teal-50/70 border-teal-500 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className={`text-xs font-bold ${sel ? 'text-teal-700' : 'text-slate-700'} flex items-center gap-1.5`}>
                            {p.name}
                            {isBest && (
                              <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-extrabold">
                                Best Fit
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                            {p.r.perLayer} กล่อง/ชั้น × {p.r.layers} ชั้น
                            {p.r.limitedBy === 'weight' && (
                              <span className="text-amber-600 font-bold ml-1.5">· จำกัดที่พิกัดน้ำหนักตู้</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-black tabular-nums ${sel ? 'text-teal-700' : 'text-slate-600'}`}>
                            {p.r.total.toLocaleString()}
                          </div>
                          {p.r.maxGeoTotal > p.r.total && (
                            <div className="text-[9px] text-slate-400">
                              จากเต็มตู้ {p.r.maxGeoTotal.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: PALLETIZED CONTAINER STUFFING */}
          {mode === 'pallet' && (
            <div className="space-y-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  1. เลือกสินค้าที่จะจัดลงพาเลท
                </label>
                <select
                  value={palSkuId}
                  onChange={(e) => handlePalSku(e.target.value)}
                  className="w-full text-xs p-2.5 bg-teal-50/50 border border-teal-200 text-teal-800 font-bold rounded-xl outline-none cursor-pointer"
                >
                  <option value="manual">✏️ กรอกขนาดเอง (Manual Entry)</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['ยาว L (มม.)', 'L', palBox.L],
                    ['กว้าง W (มม.)', 'W', palBox.W],
                    ['สูง H (มม.)', 'H', palBox.H],
                    ['น้ำหนัก wt (กก.)', 'wt', palBox.wt],
                  ].map(([lbl, k, v]) => (
                    <div key={k as string}>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">{lbl}</span>
                      <input
                        type="number"
                        value={v as number}
                        onChange={(e) => {
                          setPalSkuId('manual');
                          setPalBox((b) => ({ ...b, [k as string]: parseFloat(e.target.value) || 0 }));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-bold text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  2. มาตรฐานพาเลท & ลายการเรียง
                </label>
                <select
                  value={palKey}
                  onChange={(e) => handlePalType(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl outline-none cursor-pointer"
                >
                  {Object.keys(PALLETS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['ยาว (มม.)', 'l', palDims.l],
                    ['กว้าง (มม.)', 'w', palDims.w],
                    ['สูง (มม.)', 'h', palDims.h],
                  ].map(([lbl, k, v]) => (
                    <div key={k as string}>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">{lbl}</span>
                      <input
                        type="number"
                        value={v as number}
                        onChange={(e) => {
                          setPalKey('Custom');
                          setPalDims((d) => ({ ...d, [k as string]: parseFloat(e.target.value) || 0 }));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-[11px] font-bold text-center"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <span className="text-[9px] text-slate-400 font-bold block mb-1">
                    ลายเรียงกล่องบนพาเลท (Pallet Stacking Pattern)
                  </span>
                  <select
                    value={palPattern}
                    onChange={(e) => setPalPattern(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-bold outline-none cursor-pointer"
                  >
                    <option value="architectural">Architectural Block (สลับชั้น 90° แนะนำ)</option>
                    <option value="architectural_brick">Architectural Brick (ลายอิฐสลับชั้น 90°)</option>
                    <option value="block">Block Pattern (วางเรียงตรงทุกชั้น)</option>
                    <option value="brick">Brick Pattern (ลายอิฐประสาน)</option>
                  </select>
                </div>

                <div>
                  <span className="text-[9px] text-slate-500 font-bold block mb-1">
                    จำนวนพาเลทที่ต้องการโหลด (0 = โหลดเต็มตู้)
                  </span>
                  <input
                    type="number"
                    min={0}
                    placeholder="โหลดเต็มความจุตู้"
                    value={targetPalletCount || ''}
                    onChange={(e) => setTargetPalletCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-teal-700 font-bold text-center"
                  />
                </div>
              </div>

              {/* Pallet Summary Card */}
              <div
                className={`border rounded-2xl p-3.5 space-y-2 ${
                  isPalletWeightExceeded ? 'bg-red-50 border-red-200' : 'bg-emerald-50/40 border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    {isPalletWeightExceeded ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    )}
                    สรุปข้อมูลต่อ 1 พาเลท
                  </span>
                  <span className="text-xs font-black text-teal-700">
                    {palRes.boxesPerPallet} กล่อง/พาเลท
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                  <div>จำนวนพาเลทในตู้: <strong className="text-slate-900">{palRes.totalPallets} พาเลท</strong></div>
                  <div>เรียงแถว: <strong className="text-slate-900">{palRes.palletsL} × {palRes.palletsW}</strong></div>
                  <div>กล่องต่อชั้น: <strong className="text-slate-900">{palRes.boxesPerLayer} กล่อง</strong></div>
                  <div>จำนวนชั้นบนพาเลท: <strong className="text-slate-900">{palRes.boxLayersH} ชั้น</strong></div>
                </div>
                {isPalletWeightExceeded && (
                  <p className="text-[10px] text-red-600 font-bold pt-1 border-t border-red-200">
                    ⚠️ น้ำหนักสินค้าต่อพาเลท ({Math.round(palletCargoWeight).toLocaleString()} กก.) เกินพิกัด Dynamic ({palDims.dynKg} กก.)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* MODE 3: MULTI-SKU MIX STUFFING */}
          {mode === 'mix' && (
            <div className="space-y-3.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  รายการสินค้าคละตู้ ({mixItems.length}/6 กลุ่ม)
                </label>
                <div className="flex gap-1.5">
                  <button
                    onClick={autoAllocateMixByQty}
                    className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer shadow-2xs flex items-center gap-1"
                    title="คำนวณสัดส่วนความยาวตู้อัตโนมัติตามจำนวนกล่องหรือแบ่งเท่ากัน"
                  >
                    <Sparkles className="w-3 h-3 text-teal-600" />
                    จัดสัดส่วนอัตโนมัติ
                  </button>
                  <button
                    onClick={addMix}
                    disabled={mixItems.length >= 6}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs cursor-pointer disabled:opacity-40"
                  >
                    + เพิ่มสินค้า
                  </button>
                </div>
              </div>

              {/* Zone allocation visual bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                <div className="bg-slate-100 rounded-full overflow-hidden flex h-2.5">
                  {mixItems.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        width: `${Math.min(100, (it.allocLen / C.l) * 100)}%`,
                        backgroundColor: ICSS[i % ICSS.length],
                      }}
                      className="h-full transition-all"
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-500">พื้นที่ความยาวตู้ที่จัดสรร: {Math.round((mixUsed / C.l) * 100)}%</span>
                  <span className={mixUsed > C.l ? 'text-red-500' : 'text-teal-600'}>
                    ว่าง: {Math.max(0, Math.round(((C.l - mixUsed) / C.l) * 100))}%
                  </span>
                </div>
              </div>

              {/* Cargo Item Cards */}
              <div className="space-y-2.5">
                {mixItems.map((item, idx) => {
                  const res = mixRes[idx];
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-2xl p-3 bg-white shadow-2xs space-y-2.5"
                      style={{ borderLeft: `5px solid ${ICSS[idx % ICSS.length]}` }}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: ICSS[idx % ICSS.length] }}
                          />
                          <span className="text-xs font-black text-slate-800">
                            ลำดับโหลดที่ {idx + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100"
                            style={{ color: ICSS[idx % ICSS.length] }}
                          >
                            {(res ? res.total : 0).toLocaleString()} กล่อง
                          </span>
                          {mixItems.length > 1 && (
                            <button
                              onClick={() => delMix(idx)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded-lg cursor-pointer transition"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <select
                        value={item.skuId}
                        onChange={(e) => setMixSku(idx, e.target.value)}
                        className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none cursor-pointer font-bold text-slate-800"
                      >
                        {skus
                          .filter((s) => s.id !== 'manual')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.length}×{s.width}×{s.height} ซม. · {s.weight} กก.)
                            </option>
                          ))}
                      </select>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block mb-1">
                            สัดส่วนความยาวตู้ (%)
                          </span>
                          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={Math.round((item.allocLen / C.l) * 100)}
                              onChange={(e) => {
                                const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                setMixAlloc(idx, Math.round((pct / 100) * C.l));
                              }}
                              className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none text-center"
                            />
                            <span className="text-[10px] font-bold text-slate-400">%</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block mb-1">
                            จำกัดจำนวนกล่อง (0 = เต็มโซน)
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="เต็มโซน"
                            value={item.targetQty || ''}
                            onChange={(e) => setMixTargetQty(idx, parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-teal-700 text-center outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block mb-1">รูปแบบการเรียง (Pattern)</span>
                        <select
                          value={item.pid || 'p3_3_2'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMixItems((its) => its.map((it, i) => (i === idx ? { ...it, pid: val } : it)));
                          }}
                          className="w-full text-[11px] p-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none cursor-pointer font-semibold text-slate-700"
                        >
                          {getPatterns({ l: item.allocLen, w: C.w, h: C.h }, item.box.L, item.box.W, item.box.H, item.box.wt).map(
                            (p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (สูงสุด {(p.r ? p.r.total : 0).toLocaleString()} กล่อง)
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODE 4: WAREHOUSE PALLET DESIGN */}
          {mode === 'warehouse' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  เลือกสินค้า (Product SKU)
                </label>
                <select
                  value={whSkuId}
                  onChange={(e) => handleWhSku(e.target.value)}
                  className="w-full text-xs p-2.5 bg-teal-50/50 border border-teal-200 text-teal-800 font-bold rounded-xl outline-none cursor-pointer"
                >
                  <option value="manual">กรอกขนาดเอง (Manual Entry)</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['ยาว L (มม.)', 'L', whBox.L],
                    ['กว้าง W (มม.)', 'W', whBox.W],
                    ['สูง H (มม.)', 'H', whBox.H],
                    ['น้ำหนัก wt (กก.)', 'wt', whBox.wt],
                  ].map(([lbl, k, v]) => (
                    <div key={k as string}>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">{lbl}</span>
                      <input
                        type="number"
                        value={v as number}
                        onChange={(e) => {
                          setWhSkuId('manual');
                          setWhBox((b) => ({ ...b, [k as string]: parseFloat(e.target.value) || 0 }));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-bold text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  สเปคพาเลทและลายจัดเรียง
                </label>
                <select
                  value={whPalKey}
                  onChange={(e) => handleWhPalType(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl outline-none cursor-pointer"
                >
                  {Object.keys(PAL_SPECS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>

                <select
                  value={whPattern}
                  onChange={(e) => setWhPattern(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 text-teal-700 rounded-xl outline-none cursor-pointer font-bold"
                >
                  <option value="architectural">Architectural (Block) สลับชั้น 90°</option>
                  <option value="architectural_brick">Architectural (Brick) ลายอิฐสลับชั้น 90°</option>
                  <option value="block">Block Pattern (วางตรงทุกชั้น)</option>
                  <option value="brick">Brick Pattern (ลายอิฐทุกชั้น)</option>
                </select>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block mb-1">ความสูงรวมสูงสุด (มม.)</span>
                    <input
                      type="number"
                      value={whSettings.maxHeight}
                      onChange={(e) => setWhS('maxHeight')(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block mb-1">Floor Load (กก./ตร.ม.)</span>
                    <input
                      type="number"
                      value={whSettings.floorLoad}
                      onChange={(e) => setWhS('floorLoad')(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block mb-1">ค่า BCT กล่อง (กก.)</span>
                    <input
                      type="text"
                      value={whSettings.bct}
                      onChange={(e) => setWhS('bct')(e.target.value)}
                      placeholder="เช่น 500"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block mb-1">จำกัดชั้นเอง (Manual)</span>
                    <input
                      type="text"
                      value={whSettings.manualLayers}
                      onChange={(e) => setWhS('manualLayers')(e.target.value)}
                      placeholder="อัตโนมัติ"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODE 5: REPORT VIEW */}
          {mode === 'report' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed space-y-3 font-medium">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-teal-600" />
                เอกสารมาตรฐานการบรรจุเข้าตู้ (Loading Spec)
              </span>
              <p>
                สรุปแผนผังการจัดเรียง 3 มิติ และภาพฉายด้านบน/ด้านหน้า/ด้านข้าง ตามมาตรฐาน <strong>SP-WH-005</strong> พร้อมสั่งพิมพ์หรือบันทึกเป็น PDF
              </p>
              <button
                onClick={() => window.print()}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-3 rounded-xl shadow-sm cursor-pointer text-xs"
              >
                🖨️ สั่งพิมพ์ใบสเปค / บันทึก PDF
              </button>
            </div>
          )}

          {/* MODE 6: SKU DB */}
          {mode === 'sku' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed space-y-2.5 font-medium">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-600" />
                จัดการฐานข้อมูลสินค้า (SKU Catalog)
              </span>
              <p>
                เพิ่ม แก้ไข หรือซิงค์ข้อมูลขนาดกล่องสินค้าจาก Google Sheets เพื่อนำไปใช้คำนวณในทุกโหมดโดยอัตโนมัติ
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN WORKSPACE & SEARATES-STYLE TOP KPI RIBBON */}
      <div className="flex-1 h-full flex flex-col relative bg-slate-950 overflow-hidden">
        {/* Top KPI Summary Ribbon (Shown in 3D Stuffing Modes) */}
        {mode !== 'warehouse' && mode !== 'report' && mode !== 'sku' && (
          <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSideOpen((s) => !s)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2 text-teal-400 rounded-xl cursor-pointer transition"
                title="เปิด/ปิดแถบตั้งค่า"
              >
                {sideOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white">{cKey}</span>
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold">
                    {mode === 'single' ? actPat.name : mode === 'pallet' ? `Palletized (${palRes.totalPallets} พาเลท)` : 'Multi-SKU Mix'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  มิติตู้: {(C.l / 10).toFixed(0)} × {(C.w / 10).toFixed(0)} × {(C.h / 10).toFixed(0)} ซม. · พิกัดสูงสุด {(C.maxPay / 1000).toFixed(1)} ตัน
                </div>
              </div>
            </div>

            {/* 4 Key SeaRates Metrics */}
            <div className="flex flex-wrap items-center gap-3 md:gap-5">
              {/* 1. Total Loaded Packages */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5">
                <Box className="w-4 h-4 text-teal-400 shrink-0" />
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">จำนวนบรรจุได้จริง</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-black text-white tabular-nums">
                      {summ.boxes.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">กล่อง</span>
                    {summ.unpacked > 0 && (
                      <span className="text-[10px] text-amber-400 font-bold ml-1">
                        (ล้นตู้ {summ.unpacked.toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Volume Utilization */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-1.5">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">ปริมาตรสุทธิ (Volume)</span>
                  <span className="text-xs font-black text-sky-400 tabular-nums">{summ.volPct.toFixed(1)}%</span>
                </div>
                <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-sky-500 transition-all"
                    style={{ width: `${Math.min(100, summ.volPct)}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                  {summ.volM3.toFixed(2)} / {C.cbm.toFixed(1)} m³
                </span>
              </div>

              {/* 3. Weight Payload Utilization */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-1.5">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">น้ำหนักรวม (Payload)</span>
                  <span className={`text-xs font-black tabular-nums ${wtOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {wtPct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all ${wtOk ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, wtPct)}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                  {(summ.wt / 1000).toFixed(2)} / {(C.maxPay / 1000).toFixed(1)} ตัน
                </span>
              </div>

              {/* Quick Export Spec Button */}
              <button
                type="button"
                onClick={() => setMode('report')}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold px-3 py-2 rounded-xl shadow transition cursor-pointer hidden lg:flex items-center gap-1.5"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>ดูใบสเปค</span>
              </button>
            </div>
          </div>
        )}

        {/* Sidebar toggle button for non-3D modes */}
        {(mode === 'warehouse' || mode === 'report' || mode === 'sku') && (
          <button
            onClick={() => setSideOpen((s) => !s)}
            className="absolute top-3 left-3 z-40 bg-slate-900 hover:bg-slate-800 text-white p-2 rounded-xl shadow-md cursor-pointer"
            title="เปิด/ปิดเมนูด้านซ้าย"
          >
            {sideOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        )}

        {/* MAIN VIEWPORT CONTENT */}
        <div className="flex-1 w-full h-full overflow-hidden flex flex-col">
          {mode === 'warehouse' ? (
            <WarehousePanel wr={whRes} box={whBox} pal={whPal} settings={whSettings} />
          ) : mode === 'report' ? (
            <ReportPanel
              mode0={prevMode}
              singRes={singRes}
              actPat={actPat}
              curSku={skus.find((s) => s.id === skuId) || null}
              box={box}
              palRes={palRes}
              palBox={palBox}
              curPalSku={skus.find((s) => s.id === palSkuId) || null}
              mixItems={mixItems}
              mixRes={mixRes}
              cKey={cKey}
              C={C}
              skusList={skus.map((s) => ({ id: s.id, name: s.name }))}
            />
          ) : mode === 'sku' ? (
            <SKUDatabasePanel onSelectedSkuChange={setSkuId} />
          ) : (
            <ThreeVisualizer container={C} layers={layers3D} cog={cogData} />
          )}
        </div>
      </div>
    </div>
  );
}
