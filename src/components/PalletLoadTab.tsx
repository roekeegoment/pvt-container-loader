import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { solvePalletPattern, solvePalletsInContainer } from '../utils/packingSolver';
import { Pallet, Container, Position3D } from '../types';
import { ContainerVisualizer } from './ContainerVisualizer';
import { CoGAndLoadingSteps } from './CoGAndLoadingSteps';
import { listenToSKUs, SKUItem } from '../utils/firebaseDb';
import { HelpCircle, Layers, Package, ShoppingBag, Plus, RefreshCw, ChevronRight, Printer } from 'lucide-react';
import { exportResultToPDF } from '../utils/pdfExporter';
import { LayerEditorComponent } from './LayerEditorComponent';

const PALLET_PRESETS: Pallet[] = [
  { id: 'industrial', name: 'Industrial Pallet (พาเลทอุตสาหกรรม)', length: 120, width: 100, height: 15, maxHeight: 160, maxWeight: 1500 },
  { id: 'euro', name: 'Euro Pallet (พาเลทยูโร EUR 1)', length: 120, width: 80, height: 15, maxHeight: 160, maxWeight: 1500 },
  { id: 'square', name: 'US/Asia Square Pallet (พาเลทสี่เหลี่ยมจัตุรัส 110x110)', length: 110, width: 110, height: 15, maxHeight: 160, maxWeight: 1500 },
];

const CONTAINER_PRESETS: Container[] = [
  { id: '20ft', name: "20' Dry Container (20' DC)", length: 589, width: 235, height: 239, maxWeight: 21700 },
  { id: '40ft', name: "40' Dry Container (40' DC)", length: 1203, width: 235, height: 239, maxWeight: 26500 },
  { id: '40fthq', name: "40' High Cube (40' HQ)", length: 1203, width: 235, height: 269, maxWeight: 26200 },
  { id: 'truck4w_float', name: 'รถ 4 ล้อ (เพลาลอย) - ตู้ทึบ/คอกสูง', length: 310, width: 175, height: 210, maxWeight: 5000 },
  { id: 'truck4w_std', name: 'รถ 4 ล้อ (กระบะคอกทั่วไป)', length: 300, width: 170, height: 180, maxWeight: 4500 },
  { id: 'truck6w_med', name: 'รถ 6 ล้อ (ขนาดกลาง) - ตู้ทึบ/คอก', length: 550, width: 210, height: 210, maxWeight: 12000 },
  { id: 'truck6w_lrg', name: 'รถ 6 ล้อ (ขนาดใหญ่) - ตู้ทึบ/คอก', length: 720, width: 235, height: 230, maxWeight: 15000 },
  { id: 'truck8w', name: 'รถ 8 ล้อ (2 เพลาหน้า) - ตู้ทึบ/คอก', length: 750, width: 235, height: 235, maxWeight: 21000 },
  { id: 'truck10w', name: 'รถ 10 ล้อ (2 เพลาท้าย) - ตู้ทึบ/คอก/พื้นเรียบ', length: 760, width: 235, height: 235, maxWeight: 25000 },
];

export const PalletLoadTab: React.FC = () => {
  // Pallet Selection State
  const [selectedPalletId, setSelectedPalletId] = useState<string>('industrial');

  // SKUs state
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('manual');

  useEffect(() => {
    const unsubscribe = listenToSKUs((updatedSkus) => {
      setSkus(updatedSkus);
    });
    return () => unsubscribe();
  }, []);
  const [customPallet, setCustomPallet] = useState<Omit<Pallet, 'id'>>({
    name: 'พาเลทแบบกำหนดเอง (Custom)',
    length: 110,
    width: 110,
    height: 14,
    maxHeight: 150,
    maxWeight: 1200,
  });

  // Box Dimensions on Pallet
  const [boxName, setBoxName] = useState('สินค้าประเภทเครื่องดื่มแพ็คลัง');
  const [boxLength, setBoxLength] = useState(40);
  const [boxWidth, setBoxWidth] = useState(30);
  const [boxHeight, setBoxHeight] = useState(25);
  const [boxWeight, setBoxWeight] = useState(12);

  const handleSelectSku = (id: string) => {
    setSelectedSkuId(id);
    if (id === 'manual') return;
    const selected = skus.find(s => s.id === id);
    if (selected) {
      setBoxName(selected.name);
      setBoxLength(selected.length);
      setBoxWidth(selected.width);
      setBoxHeight(selected.height);
      setBoxWeight(selected.weight);
    }
  };

  // Pallet quantity state
  const [palletsRequested, setPalletsRequested] = useState<number>(10);

  // Pallet pattern selection state
  const [patternTypePreference, setPatternTypePreference] = useState<'auto' | 'block' | 'brick' | 'pinwheel' | 'split_row' | 'architectural'>('auto');

  // Container Selection State
  const [selectedContainerId, setSelectedContainerId] = useState<string>('20ft');

  // Custom Layer States
  const [customPalletPositions, setCustomPalletPositions] = useState<Position3D[] | null>(null);
  const [customPalletStats, setCustomPalletStats] = useState<{ totalBoxes: number; boxesPerLayer: number; customLayersCount?: number } | null>(null);

  // Reset custom design when box dimensions or pattern preferences change
  useEffect(() => {
    setCustomPalletPositions(null);
    setCustomPalletStats(null);
  }, [boxLength, boxWidth, boxHeight, boxWeight, selectedPalletId, patternTypePreference]);

  const activePallet: Pallet = selectedPalletId === 'custom'
    ? { id: 'custom', ...customPallet }
    : PALLET_PRESETS.find(p => p.id === selectedPalletId)!;

  const activeContainer: Container = CONTAINER_PRESETS.find(c => c.id === selectedContainerId)!;

  // 1. Calculate how box fits on a single pallet
  const rawPalletResult = solvePalletPattern(
    { name: boxName, length: boxLength, width: boxWidth, height: boxHeight, weight: boxWeight },
    activePallet,
    patternTypePreference
  );

  const palletResult = {
    ...rawPalletResult,
    boxPositions: customPalletPositions || rawPalletResult.boxPositions,
    totalBoxes: customPalletStats ? customPalletStats.totalBoxes : rawPalletResult.totalBoxes,
    boxesPerLayer: customPalletStats ? customPalletStats.boxesPerLayer : rawPalletResult.boxesPerLayer,
    layersCount: (customPalletStats && customPalletStats.customLayersCount !== undefined) ? customPalletStats.customLayersCount : rawPalletResult.layersCount,
    totalWeight: (customPalletStats ? customPalletStats.totalBoxes : rawPalletResult.totalBoxes) * boxWeight,
    totalHeight: activePallet.height + (((customPalletStats && customPalletStats.customLayersCount !== undefined) ? customPalletStats.customLayersCount : rawPalletResult.layersCount) * boxHeight),
    efficiency: (((customPalletStats ? customPalletStats.boxesPerLayer : rawPalletResult.boxesPerLayer) * boxLength * boxWidth) / (activePallet.length * activePallet.width)) * 100
  };

  // 2. Calculate how loaded pallets fit inside container
  const containerResult = solvePalletsInContainer(
    palletsRequested,
    palletResult,
    activePallet,
    activeContainer
  );

  // Loading Step Sequence state
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

  // Auto-reset or clamp activeStepIdx when loading steps change
  useEffect(() => {
    const totalSteps = containerResult.loadingSteps.length;
    if (totalSteps > 0) {
      setActiveStepIdx(totalSteps - 1); // default to full load
    } else {
      setActiveStepIdx(0);
    }
  }, [containerResult.loadingSteps.length]);

  // Map packed pallets to visual representation blocks
  const visualPallets = containerResult.packedPallets.map((p, idx) => ({
    id: p.palletId,
    name: `${p.palletName} (${p.boxesCount} กล่อง)`,
    color: '#0f766e', // Teal tone for packed pallets
    position: p.position
  }));

  const loadDemoBeverages = () => {
    setBoxName('แพ็คขวดน้ำดื่มบรรจุกล่อง');
    setBoxLength(35);
    setBoxWidth(25);
    setBoxHeight(22);
    setBoxWeight(14);
    setPalletsRequested(14);
  };

  const triggerPrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    exportResultToPDF(
      'pallet',
      '',
      activeContainer,
      activePallet,
      {
        boxName: boxName,
        boxLength: boxLength,
        boxWidth: boxWidth,
        boxHeight: boxHeight,
        boxWeight: boxWeight,
      },
      {
        palletTotalBoxes: palletResult.totalBoxes,
        palletBoxesPerLayer: palletResult.boxesPerLayer,
        palletLayersCount: palletResult.layersCount,
        containerPackedPallets: containerResult.packedPallets.length,
        palletsRequested: palletsRequested,
        containerTotalBoxes: containerResult.packedPallets.reduce((sum, p) => sum + p.boxesCount, 0),
        containerVolumeEfficiency: containerResult.volumeEfficiency,
        containerPackedVolume: containerResult.packedVolume,
      }
    );
  };

  // Simulated carton integration
  const [simulatedCarton, setSimulatedCarton] = useState<any>(null);

  const checkSimulatedCarton = () => {
    const stored = localStorage.getItem('sfg_simulated_carton');
    if (stored) {
      try {
        setSimulatedCarton(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse simulated carton', e);
      }
    } else {
      setSimulatedCarton(null);
    }
  };

  useEffect(() => {
    checkSimulatedCarton();
    window.addEventListener('simulatedCartonUpdated', checkSimulatedCarton);
    return () => {
      window.removeEventListener('simulatedCartonUpdated', checkSimulatedCarton);
    };
  }, []);

  const handleImportSimulatedCarton = () => {
    if (!simulatedCarton) return;
    setBoxName(simulatedCarton.name);
    setBoxLength(simulatedCarton.length);
    setBoxWidth(simulatedCarton.width);
    setBoxHeight(simulatedCarton.height);
    setBoxWeight(simulatedCarton.weight);
    
    // Clear after import so banner disappears
    localStorage.removeItem('sfg_simulated_carton');
    setSimulatedCarton(null);
  };

  return (
    <div className="space-y-6 w-full">
      {/* Simulated Carton Banner */}
      <AnimatePresence>
        {simulatedCarton && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-teal-50 border border-teal-200 rounded-2xl p-4.5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 text-teal-700 rounded-xl shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">พบผลขนาดกล่องที่ผ่านการจัดเรียงสินค้าลงลัง (Simulated Carton Specs Found)</h4>
                <p className="text-[10px] text-slate-500 mt-1">
                  กล่อง: <span className="font-semibold text-slate-700">{simulatedCarton.name}</span> ({simulatedCarton.length} x {simulatedCarton.width} x {simulatedCarton.height} cm, น้ำหนัก Gross Weight: <span className="text-teal-600 font-bold">{simulatedCarton.weight} kg</span>)
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleImportSimulatedCarton}
                className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-xl text-[10px] shadow transition cursor-pointer"
              >
                นำเข้าจัดวางซ้อนบนพาเลท (Import to Pallet)
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('sfg_simulated_carton');
                  setSimulatedCarton(null);
                }}
                className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition text-[10px] font-semibold cursor-pointer"
              >
                ละทิ้ง
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      {/* Configure column (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        
        {/* Step 1: Pallet Loading Definition */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
              <Layers className="w-5 h-5 text-teal-600" />
              ขั้นตอนที่ 1: คำนวณจัดวางกล่องสินค้าลงบนพาเลท
            </h3>
            <button 
              onClick={loadDemoBeverages}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 bg-teal-50 px-2 py-1 rounded transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              สูตรแพ็คลังเครื่องดื่ม
            </button>
          </div>

          {/* Pallet Select */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PALLET_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPalletId(p.id)}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  selectedPalletId === p.id
                    ? 'border-teal-500 bg-teal-50/20 text-teal-900 font-semibold'
                    : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{p.name}</span>
                <span className="block text-[10px] text-slate-400 mt-1 font-normal">
                  {p.length}x{p.width} ซม. | สูงสุด {p.maxHeight} ซม.
                </span>
              </button>
            ))}
          </div>

          {/* Box inputs */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-teal-700 mb-1">เลือกจาก SKU Catalog (Select SKU)</label>
              <select
                value={selectedSkuId}
                onChange={(e) => handleSelectSku(e.target.value)}
                className="w-full text-xs p-2 border border-teal-200 bg-teal-50/30 text-teal-900 rounded-lg focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
              >
                <option value="manual">กรอกข้อมูลเอง (Manual Entry)</option>
                {skus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.name} ({sku.length}x{sku.width}x{sku.height} ซม.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อกล่องสินค้า</label>
              <input
                type="text"
                value={boxName}
                onChange={(e) => {
                  setBoxName(e.target.value);
                  setSelectedSkuId('manual');
                }}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">ยาว (ซม.)</label>
                <input
                  type="number"
                  value={boxLength}
                  onChange={(e) => {
                    setBoxLength(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">กว้าง (ซม.)</label>
                <input
                  type="number"
                  value={boxWidth}
                  onChange={(e) => {
                    setBoxWidth(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">สูง (ซม.)</label>
                <input
                  type="number"
                  value={boxHeight}
                  onChange={(e) => {
                    setBoxHeight(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">น้ำหนักต่อกล่อง (กก.)</label>
              <input
                type="number"
                value={boxWeight}
                onChange={(e) => {
                  setBoxWeight(Number(e.target.value));
                  setSelectedSkuId('manual');
                }}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none"
              />
            </div>
          </div>

          {/* Pattern selection */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold text-teal-700 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              เลือกลายจัดวางกล่องบนพาเลท (Pallet Pattern Style)
            </label>
            <select
              value={patternTypePreference}
              onChange={(e) => setPatternTypePreference(e.target.value as any)}
              className="w-full text-xs p-2 border border-slate-200 bg-white text-slate-800 rounded-lg focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
            >
              <option value="auto">คำนวณอัตโนมัติ (Auto / Optimized)</option>
              <option value="block">Block Pattern (วางกล่องตรงทับกันแนวเดียว)</option>
              <option value="brick">Brick Pattern (วางกล่องสลับสับหว่างลายอิฐ)</option>
              <option value="pinwheel">Pinwheel Pattern (วางกล่องหมุนวนรูปกังหัน)</option>
              <option value="split_row">Split Row Pattern (วางสลับหมุนแบบเว้นแกนกลาง)</option>
              <option value="architectural">Architectural Pattern (วางตรงแล้วสลับชั้น 90°)</option>
            </select>
          </div>

          {/* Pallet Stacking Result Summary Card */}
          <div className="mt-4 p-3 bg-teal-50/30 rounded-xl border border-teal-100/50">
            <span className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider block mb-1.5">ผลการจัดวางบนพาเลทเดี่ยว:</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">จัดวางต่อชั้น:</span>
                <span className="font-semibold text-slate-700">{palletResult.boxesPerLayer} กล่อง</span>
              </div>
              <div>
                <span className="text-slate-400 block">จำนวนชั้นที่ซ้อนได้:</span>
                <span className="font-semibold text-slate-700">{palletResult.layersCount} ชั้น</span>
              </div>
              <div>
                <span className="text-slate-400 block">รวมกล่องต่อพาเลท:</span>
                <span className="font-bold text-teal-700 font-mono text-sm">{palletResult.totalBoxes} กล่อง</span>
              </div>
              <div>
                <span className="text-slate-400 block">น้ำหนักสุทธิ:</span>
                <span className="font-semibold text-slate-700">{palletResult.totalWeight.toFixed(1)} กก.</span>
              </div>
              <div>
                <span className="text-slate-400 block">ความสูงรวม:</span>
                <span className="font-semibold text-slate-700">{palletResult.totalHeight} ซม.</span>
              </div>
              <div>
                <span className="text-slate-400 block">ประสิทธิภาพระนาบ:</span>
                <span className="font-semibold text-slate-700">{palletResult.efficiency.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Layer-by-layer alignment & customized box editing widget */}
        <LayerEditorComponent
          palletLength={activePallet.length}
          palletWidth={activePallet.width}
          boxLength={boxLength}
          boxWidth={boxWidth}
          boxHeight={boxHeight}
          boxWeight={boxWeight}
          boxColor="#0f766e"
          layersCount={palletResult.layersCount}
          initialFullPositions={rawPalletResult.boxPositions}
          onUpdate={(updatedPositions, total, perLayer, customLayersCount) => {
            setCustomPalletPositions(updatedPositions);
            setCustomPalletStats({ totalBoxes: total, boxesPerLayer: perLayer, customLayersCount });
          }}
        />

        {/* Step 2: Container Loading Definition */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2 text-sm">
            <Package className="w-5 h-5 text-teal-600" />
            ขั้นตอนที่ 2: จัดเรียงพาเลทลงตู้คอนเทนเนอร์
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">เลือกขนาดตู้คอนเทนเนอร์</label>
              <select
                value={selectedContainerId}
                onChange={(e) => setSelectedContainerId(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
              >
                {CONTAINER_PRESETS.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (ย{c.length} x ก{c.width} x ส{c.height} ซม.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนพาเลททั้งหมดที่ต้องการบรรจุ (พาเลท)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={palletsRequested}
                  onChange={(e) => setPalletsRequested(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                />
                <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setPalletsRequested(p => Math.max(1, p - 1))}
                    className="px-3 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => setPalletsRequested(p => Math.min(50, p + 1))}
                    className="px-3 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold border-l border-slate-200"
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                *เทียบเท่ากล่องสินค้าทั้งหมดที่ต้องการส่งออก: {palletsRequested * palletResult.totalBoxes} กล่อง
              </span>
            </div>
          </div>
        </div>

        {/* Output Summary Sheet Trigger for Pallets */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
          <button
            type="button"
            onClick={handleExportPDF}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-xl font-semibold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4.5 h-4.5 text-teal-200" />
            ดาวน์โหลดรายงาน PDF สรุปผล (Download PDF Report)
          </button>
          <button
            type="button"
            onClick={triggerPrint}
            className="w-full bg-slate-900 hover:bg-black text-white py-2.5 px-4 rounded-xl font-medium text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            พิมพ์ใบสั่งบรรจุพาเลท (Print Loading Specification)
          </button>
          <span className="block text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
            *ระบบจัดส่งเอกสารใบสั่งงานจัดเรียง สำหรับแนบแผนงานส่งออกตู้คอนเทนเนอร์แบบบรรจุพาเลท
          </span>
        </div>

      </div>

      {/* Visualizer & Metrics columns (7 cols) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        
        {/* KPI Dashboard Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">บรรจุพาเลทได้</span>
            <span className="block text-xl font-bold text-teal-600 mt-1">
              {containerResult.packedPallets.length} <span className="text-xs font-normal text-slate-500">พาเลท</span>
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              จากทั้งหมด {palletsRequested} พาเลท
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">รวมกล่องที่โหลดได้</span>
            <span className="block text-xl font-bold text-teal-600 mt-1 font-mono">
              {containerResult.packedPallets.reduce((sum, p) => sum + p.boxesCount, 0)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              กล่องสินค้าสำเร็จรูป
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">ปริม. ตู้ที่ใช้ (%)</span>
            <span className="block text-xl font-bold text-teal-600 mt-1">
              {containerResult.volumeEfficiency.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {containerResult.packedVolume.toFixed(2)} / {containerResult.totalVolume.toFixed(2)} m³
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">นร. ตู้ที่ใช้ (%)</span>
            <span className="block text-xl font-bold text-amber-600 mt-1">
              {containerResult.weightEfficiency.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {(containerResult.totalWeight / 1000).toFixed(2)} / {(activeContainer.maxWeight / 1000).toFixed(0)} ตัน
            </span>
          </div>
        </div>

        {/* 3D Pallet Container Visualization */}
        <ContainerVisualizer
          containerLength={activeContainer.length}
          containerWidth={activeContainer.width}
          containerHeight={activeContainer.height}
          items={visualPallets}
          title="แผนภาพแสดงการจัดเรียง พาเลทสินค้า ในตู้คอนเทนเนอร์ (Pallet Load)"
          isPalletMode={true}
          activeStepIdx={activeStepIdx}
          loadingSteps={containerResult.loadingSteps}
          onStepChange={setActiveStepIdx}
          patternTypePreference={patternTypePreference}
          setPatternTypePreference={setPatternTypePreference}
        />

        {/* Real-time CoG Dashboard & Loading Steps */}
        <CoGAndLoadingSteps
          cog={containerResult.cog}
          loadingSteps={containerResult.loadingSteps}
          title="การวิเคราะห์จุดศูนย์ถ่วงตู้และขั้นตอนโหลดพาเลท"
          activeStepIdx={activeStepIdx}
          onStepChange={setActiveStepIdx}
        />

        {/* Unpacked pallets warning */}
        {containerResult.unpackedPalletsCount > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-700">
            <p className="font-semibold">⚠️ บรรจุได้ไม่ครบทั้งหมด! มีพาเลทที่ไม่ได้บรรจุ {containerResult.unpackedPalletsCount} พาเลท</p>
            <p className="mt-1 opacity-90">
              เนื่องจากขนาดความกว้างหรือสูงของพาเลทเดี่ยวเมื่อโหลดสินค้าจนเสร็จแล้ว มีขนาดเกินข้อจำกัดของตู้ หรือน้ำหนักตู้เกินค่าพิกัดสูงสุดที่ปลอดภัย
            </p>
          </div>
        )}

        {/* Safety Note */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-3 text-xs text-slate-600">
          <HelpCircle className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <span className="font-semibold text-slate-800 block">💡 ข้อแนะนำสำหรับงานจัดเรียงแบบ Pallet Load:</span>
            <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-500">
              <li>**Double Stacking (ซ้อนสองชั้น)**: หากความสูงรวมพาเลทคูณสอง ไม่เกินความสูงตู้ และน้ำหนักไม่เกินพิกัด ระบบจะพยายามวางพาเลทซ้อนกันเพื่อเพิ่มประสิทธิภาพ</li>
              <li>การเลือกใช้พาเลทอุตสาหกรรม (120x100 ซม.) เป็นขนาดมาตรฐานสำหรับการกระจายสินค้าในทวีปเอเชีย สามารถเรียงในตู้ 20 ฟุตแถวคู่ได้พอดี</li>
              <li>ก่อนทำการโหลดเข้าตู้จริง แนะนำให้รัดฟิล์มยืด (Stretch Wrap) หรือรัดสายรัดหนา เพื่อยึดโครงสร้างลังกับพาเลทไม้ ป้องกันไม่ให้สินค้าล้มพังทลาย</li>
            </ul>
          </div>
        </div>

      </div>

    </div>
  </div>
  );
};
