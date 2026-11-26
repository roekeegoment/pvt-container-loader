import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { solveFloorPacking, solvePatternPacking, calculateCoG, generateLoadingSteps } from '../utils/packingSolver';
import { CargoItem, Container, PackingResult } from '../types';
import { ContainerVisualizer } from './ContainerVisualizer';
import { listenToSKUs, SKUItem } from '../utils/firebaseDb';
import { Plus, Trash2, HelpCircle, Package, Layers, Info, RefreshCw, Printer, CheckCircle2, AlertTriangle, X, FileText, Eye } from 'lucide-react';
import { exportResultToPDF } from '../utils/pdfExporter';

const CONTAINER_PRESETS: Container[] = [
  { id: '20ft', name: '20ft Standard Container (ตู้ 20 ฟุต)', length: 590, width: 235, height: 239, maxWeight: 21700 },
  { id: '40ft', name: '40ft Standard Container (ตู้ 40 ฟุต)', length: 1203, width: 235, height: 239, maxWeight: 26500 },
  { id: '40fthq', name: '40ft High Cube Container (ตู้ 40 ฟุต HQ)', length: 1203, width: 235, height: 269, maxWeight: 26500 },
];

const CARGO_PRESETS = [
  { name: 'กล่องสินค้า Size A', length: 40, width: 30, height: 30, weight: 8, color: '#0d9488' },
  { name: 'กล่องเครื่องใช้ไฟฟ้า Size B', length: 60, width: 40, height: 40, weight: 15, color: '#0284c7' },
  { name: 'ลังไม้ชิ้นส่วนอะไหล่ Size C', length: 80, width: 60, height: 50, weight: 45, color: '#ca8a04' },
];

export const FloorLoadTab: React.FC = () => {
  // Mode selection: Pattern Simulator (User requested) vs Custom Cargo Mix
  const [activeSubTab, setActiveSubTab] = useState<'pattern' | 'mix'>('pattern');

  // SKUs state
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('manual');

  // Load SKUs on mount
  useEffect(() => {
    const unsubscribe = listenToSKUs((updatedSkus) => {
      setSkus(updatedSkus);
    });
    return () => unsubscribe();
  }, []);

  // Container Selection state
  const [selectedContainerId, setSelectedContainerId] = useState<string>('20ft');
  const [customContainer, setCustomContainer] = useState<Omit<Container, 'id'>>({
    name: 'ตู้แบบกำหนดเอง (Custom)',
    length: 500,
    width: 230,
    height: 230,
    maxWeight: 20000,
  });

  // --- Pattern Simulator State ---
  const [simBoxLength, setSimBoxLength] = useState<number>(40);
  const [simBoxWidth, setSimBoxWidth] = useState<number>(30);
  const [simBoxHeight, setSimBoxHeight] = useState<number>(30);
  const [simBoxWeight, setSimBoxWeight] = useState<number>(10);
  const [simBoxName, setSimBoxName] = useState<string>('Boxes 1');
  const [simPatternId, setSimPatternId] = useState<string>('pattern-332-alt');

  // --- Multi-Cargo List State ---
  const [cargoList, setCargoList] = useState<CargoItem[]>([
    { id: 'c1', name: 'สินค้ากล่องเหลือง A', length: 50, width: 40, height: 30, weight: 12, quantity: 120, color: '#f59e0b', allowRotation: true },
    { id: 'c2', name: 'สินค้ากล่องฟ้า B', length: 60, width: 40, height: 45, weight: 18, quantity: 45, color: '#3b82f6', allowRotation: true },
  ]);

  // Form Inputs for Adding Multi-Cargo
  const [newCargoName, setNewCargoName] = useState('');
  const [newCargoLength, setNewCargoLength] = useState(40);
  const [newCargoWidth, setNewCargoWidth] = useState(30);
  const [newCargoHeight, setNewCargoHeight] = useState(30);
  const [newCargoWeight, setNewCargoWeight] = useState(10);
  const [newCargoQty, setNewCargoQty] = useState(20);
  const [newCargoColor, setNewCargoColor] = useState('#10b981');
  const [newCargoRotate, setNewCargoRotate] = useState(true);

  // SKU selection handler for single pattern tab
  const handleSelectSku = (id: string) => {
    setSelectedSkuId(id);
    if (id === 'manual') return;
    const selected = skus.find(s => s.id === id);
    if (selected) {
      setSimBoxName(selected.name);
      setSimBoxLength(selected.length);
      setSimBoxWidth(selected.width);
      setSimBoxHeight(selected.height);
      setSimBoxWeight(selected.weight);
    }
  };

  // State for mix tab select box
  const [mixSelectedSkuId, setMixSelectedSkuId] = useState<string>('manual');

  // SKU selection handler for mix cargo adding
  const handleSelectMixSku = (id: string) => {
    setMixSelectedSkuId(id);
    if (id === 'manual') return;
    const selected = skus.find(s => s.id === id);
    if (selected) {
      setNewCargoName(selected.name);
      setNewCargoLength(selected.length);
      setNewCargoWidth(selected.width);
      setNewCargoHeight(selected.height);
      setNewCargoWeight(selected.weight);
    }
  };

  // Active Container Details
  const activeContainer: Container = selectedContainerId === 'custom'
    ? { id: 'custom', ...customContainer }
    : CONTAINER_PRESETS.find(c => c.id === selectedContainerId)!;

  // Run pattern solver or multi-cargo solver based on sub-tab
  const patternResult = solvePatternPacking(
    activeContainer,
    simBoxLength,
    simBoxWidth,
    simBoxHeight,
    simBoxWeight,
    simPatternId
  );

  const mixResult: PackingResult = solveFloorPacking(cargoList, activeContainer);

  const handleAddCargo = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `cargo-${Date.now()}`;
    const name = newCargoName.trim() || `สินค้าใหม่ #${cargoList.length + 1}`;
    setCargoList(prev => [
      ...prev,
      {
        id,
        name,
        length: Number(newCargoLength),
        width: Number(newCargoWidth),
        height: Number(newCargoHeight),
        weight: Number(newCargoWeight),
        quantity: Number(newCargoQty),
        color: newCargoColor,
        allowRotation: newCargoRotate,
      }
    ]);
    setNewCargoName('');
  };

  const handleApplyPreset = (preset: typeof CARGO_PRESETS[0]) => {
    setNewCargoName(preset.name);
    setNewCargoLength(preset.length);
    setNewCargoWidth(preset.width);
    setNewCargoHeight(preset.height);
    setNewCargoWeight(preset.weight);
    setNewCargoColor(preset.color);
  };

  const handleRemoveCargo = (id: string) => {
    setCargoList(prev => prev.filter(c => c.id !== id));
  };

  const loadDemoScenario = () => {
    setCargoList([
      { id: 'd1', name: 'กล่องมอเตอร์ไฟฟ้า', length: 50, width: 45, height: 40, weight: 35, quantity: 40, color: '#ea580c', allowRotation: true },
      { id: 'd2', name: 'ชิ้นส่วนอะไหล่แพ็คลัง', length: 80, width: 50, height: 45, weight: 50, quantity: 15, color: '#16a34a', allowRotation: true },
      { id: 'd3', name: 'กล่องคอนโทรลเลอร์', length: 30, width: 30, height: 25, weight: 5, quantity: 110, color: '#8b5cf6', allowRotation: true },
    ]);
  };

  // Convert packed cargo items to visual representation format for rendering
  const visualItems = activeSubTab === 'pattern'
    ? patternResult.packedItems.map((pi, idx) => ({
        id: `${pi.itemId}-${idx}`,
        name: pi.name,
        color: pi.color,
        position: pi.position,
      }))
    : mixResult.packedItems.map((pi, idx) => ({
        id: `${pi.itemId}-${idx}`,
        name: pi.name,
        color: pi.color,
        position: pi.position,
      }));

  // Grouped Loading Steps for sequence tracking
  const loadingSteps = activeSubTab === 'pattern'
    ? generateLoadingSteps(patternResult.packedItems)
    : mixResult.loadingSteps;

  // Loading Step Sequence state
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);

  // Auto-reset or clamp activeStepIdx when loading steps change (e.g. when pattern changes)
  React.useEffect(() => {
    const totalSteps = loadingSteps.length;
    if (totalSteps > 0) {
      setActiveStepIdx(totalSteps - 1); // default to full load
    } else {
      setActiveStepIdx(0);
    }
  }, [loadingSteps.length, activeSubTab]);

  // Trigger browser print dialog for high-fidelity A4 document
  const triggerPrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    if (activeSubTab === 'pattern') {
      exportResultToPDF(
        'floor',
        'pattern',
        activeContainer,
        null,
        {
          boxName: simBoxName,
          boxLength: simBoxLength,
          boxWidth: simBoxWidth,
          boxHeight: simBoxHeight,
          boxWeight: simBoxWeight,
          patternId: simPatternId,
        },
        {
          totalBoxes: patternResult.totalBoxes,
          boxesPerLayer: patternResult.boxesPerLayer,
          layersCount: patternResult.layersCount,
          volumeEfficiency: patternResult.volumeEfficiency,
          packedVolume: patternResult.packedVolume,
          totalWeight: patternResult.totalWeight,
        }
      );
    } else {
      exportResultToPDF(
        'floor',
        'mix',
        activeContainer,
        null,
        {
          cargoTypesCount: cargoList.length,
        },
        {
          packedCount: mixResult.packedItems.length,
          totalRequestedCount: cargoList.reduce((sum, c) => sum + c.quantity, 0),
          unpackedCount: mixResult.unpackedItems.reduce((sum, item) => sum + item.count, 0),
          weightEfficiency: mixResult.weightEfficiency,
          totalWeight: mixResult.totalWeight,
          volumeEfficiency: mixResult.volumeEfficiency,
          packedVolume: mixResult.packedVolume,
          cargoItemsList: cargoList,
        }
      );
    }
  };

  // Calculate dynamic Front View and Side View details for rendering
  const frontCols = Math.floor(activeContainer.width / simBoxWidth);
  const frontRows = Math.floor(activeContainer.height / simBoxHeight);
  const sideCols = Math.floor(activeContainer.length / simBoxLength);

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

  React.useEffect(() => {
    checkSimulatedCarton();
    window.addEventListener('simulatedCartonUpdated', checkSimulatedCarton);
    return () => {
      window.removeEventListener('simulatedCartonUpdated', checkSimulatedCarton);
    };
  }, []);

  const handleImportSimulatedCarton = (toMode: 'pattern' | 'mix') => {
    if (!simulatedCarton) return;
    
    if (toMode === 'pattern') {
      setSimBoxName(simulatedCarton.name);
      setSimBoxLength(simulatedCarton.length);
      setSimBoxWidth(simulatedCarton.width);
      setSimBoxHeight(simulatedCarton.height);
      setSimBoxWeight(simulatedCarton.weight);
      setActiveSubTab('pattern');
    } else {
      const id = `cargo-sim-${Date.now()}`;
      setCargoList(prev => [
        ...prev,
        {
          id,
          name: simulatedCarton.name,
          length: simulatedCarton.length,
          width: simulatedCarton.width,
          height: simulatedCarton.height,
          weight: simulatedCarton.weight,
          quantity: 50, // default quantity
          color: '#14b8a6', // Teal
          allowRotation: true
        }
      ]);
      setActiveSubTab('mix');
    }
    
    // Clear after import so banner disappears
    localStorage.removeItem('sfg_simulated_carton');
    setSimulatedCarton(null);
  };

  const renderCargoLoadingReport = () => {
    const isPattern = activeSubTab === 'pattern';
    
    // Values based on subtab
    const containerName = activeContainer.name;
    const containerDims = `ย ${activeContainer.length} x ก ${activeContainer.width} x ส ${activeContainer.height} ซม.`;
    const maxWeightStr = `${(activeContainer.maxWeight / 1000).toFixed(1)} ตัน (${activeContainer.maxWeight.toLocaleString()} กก.)`;
    
    // Stats
    const totalBoxes = isPattern ? patternResult.totalBoxes : mixResult.packedItems.length;
    const packedVolume = isPattern ? patternResult.packedVolume : mixResult.packedVolume;
    const volumeEfficiency = isPattern ? patternResult.volumeEfficiency : mixResult.volumeEfficiency;
    const totalWeight = isPattern ? patternResult.totalWeight : mixResult.totalWeight;
    const weightEfficiency = isPattern ? patternResult.weightEfficiency : mixResult.weightEfficiency;

    return (
      <div className="border border-slate-300 p-6 rounded-lg bg-white text-black" style={{ fontFamily: 'Sarabun, sans-serif' }}>
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">บริษัท พี.วี.ที. ฟู้ดส์ อินดัสตรีส์ จำกัด</h2>
            <h3 className="text-sm font-semibold text-slate-600 mt-1">มาตรฐาน/ข้อกำหนดการบรรจุสินค้าเข้าตู้คอนเทนเนอร์ (Container Loading Specification)</h3>
          </div>
          <div className="text-right text-xs text-slate-400 font-mono">
            <p>ID: SP-WH-005 Rev.00.05.06.18</p>
            <p className="mt-1">วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')}</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Column: Visual schematic */}
          <div className="col-span-12 md:col-span-8 flex flex-col gap-6">
            {isPattern ? (
              <>
                {/* Front View */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">FRONT VIEW (มุมมองด้านหน้าตู้)</h4>
                  <div className="border border-slate-300 p-4 bg-slate-50 flex flex-col items-center justify-center rounded-lg">
                    <div className="relative">
                      <svg width="400" height="150" className="border border-slate-400 bg-white max-w-full">
                        {Array.from({ length: Math.min(15, frontRows) }).map((_, rIdx) => {
                          const y = 150 - ((rIdx + 1) * (150 / Math.min(15, frontRows)));
                          const h = 150 / Math.min(15, frontRows);
                          return Array.from({ length: Math.min(25, frontCols) }).map((_, cIdx) => {
                            const x = cIdx * (400 / Math.min(25, frontCols));
                            const w = 400 / Math.min(25, frontCols);
                            return (
                              <rect
                                key={`${rIdx}-${cIdx}`}
                                x={x}
                                y={y}
                                width={w - 1}
                                height={h - 1}
                                fill="#22c55e"
                                stroke="#16a34a"
                                strokeWidth="0.5"
                              />
                            );
                          });
                        })}
                      </svg>
                      <div className="flex justify-between text-[9px] font-mono mt-1 text-slate-500 w-[400px] max-w-full">
                        <span>1</span>
                        <span>{Math.floor(frontCols / 2)}</span>
                        <span>{frontCols} (หน้ากว้าง)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side View */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">SIDE VIEW (มุมมองด้านข้างตู้)</h4>
                  <div className="border border-slate-300 p-4 bg-slate-50 flex flex-col items-center justify-center rounded-lg">
                    <div className="relative">
                      <svg width="400" height="150" className="border border-slate-400 bg-white max-w-full">
                        {Array.from({ length: Math.min(15, frontRows) }).map((_, rIdx) => {
                          const y = 150 - ((rIdx + 1) * (150 / Math.min(15, frontRows)));
                          const h = 150 / Math.min(15, frontRows);
                          return Array.from({ length: Math.min(30, sideCols) }).map((_, cIdx) => {
                            const x = cIdx * (400 / Math.min(30, sideCols));
                            const w = 400 / Math.min(30, sideCols);
                            return (
                              <rect
                                key={`${rIdx}-${cIdx}`}
                                x={x}
                                y={y}
                                width={w - 1}
                                height={h - 1}
                                fill="#16a34a"
                                stroke="#14532d"
                                strokeWidth="0.5"
                              />
                            );
                          });
                        })}
                      </svg>
                      <div className="flex justify-between text-[9px] font-mono mt-1 text-slate-500 w-[400px] max-w-full">
                        <span>1</span>
                        <span>{Math.floor(sideCols / 2)}</span>
                        <span>{sideCols} (ความลึก)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Mixed cargo items layout */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">CARGO DISTRIBUTION (สัดส่วนสีกลุ่มสินค้าจัดวางคละ)</h4>
                  <div className="border border-slate-300 p-5 bg-slate-50 rounded-lg space-y-4">
                    <div className="flex flex-wrap gap-3">
                      {cargoList.map((cargo) => {
                        const countPacked = mixResult.packedItems.filter(item => item.name === cargo.name).length;
                        return (
                          <div key={cargo.id} className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium">
                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cargo.color }} />
                            <span>{cargo.name}</span>
                            <span className="font-bold text-teal-600 font-mono ml-1">({countPacked}/{cargo.quantity} กล่อง)</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Stacking illustration box */}
                    <div className="bg-slate-900 text-slate-300 p-6 rounded-xl flex flex-col items-center justify-center border border-slate-800 text-center relative overflow-hidden">
                      <div className="absolute top-2 right-2 bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded text-[9px] font-bold">
                        3D SIMULATOR
                      </div>
                      <Package className="w-12 h-12 text-teal-500 mb-2" />
                      <span className="font-bold text-sm text-white font-sans">เครื่องจำลองจัดเรียงสินค้าคละชนิดเรียบร้อยแล้ว</span>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-sm">
                        สัดส่วนการกระจายน้ำหนักเฉลี่ย ปริมาตรที่มีประโยชน์ {mixResult.packedVolume.toFixed(2)} m³ คิดเป็น {mixResult.volumeEfficiency.toFixed(1)}% ของตู้
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Safety & Compliance Guidelines */}
            <div className="mt-2 border border-amber-200 bg-amber-50/50 p-4 rounded-lg">
              <h5 className="text-xs font-bold text-amber-800 mb-1.5">⚠️ ข้อกำหนดเพื่อความปลอดภัยในการบรรจุตู้คอนเทนเนอร์ (Safety Regulations)</h5>
              <ul className="list-decimal pl-4 text-[10px] text-slate-600 space-y-1">
                <li>โปรดจัดวางสินค้าตามขั้นตอนลำดับในเครื่องจำลอง (Step-by-Step Sequence) เพื่อรักษาสมดุลน้ำหนัก</li>
                <li>สินค้าที่มีน้ำหนักมากหรือฐานแน่น ต้องถูกจัดวางอยู่ด้านล่างเสมอ (Heavy items on bottom)</li>
                <li>ตรวจสอบให้แน่ใจว่าจุดศูนย์ถ่วง (CoG) อยู่ใกล้กับจุดกึ่งกลางของตู้ เพื่อความปลอดภัยในการเคลื่อนย้ายคลัง</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Key Statistics & Detailed Inventory */}
          <div className="col-span-12 md:col-span-4 border-t md:border-t-0 md:border-l border-slate-200 pt-6 md:pt-0 md:pl-6 flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2 mb-4 font-sans">ข้อมูลสรุปการบรรจุตู้คอนเทนเนอร์</h4>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">ประเภทตู้ที่ใช้:</span>
                  <span className="font-bold text-slate-800">{containerName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">ขนาดตู้ (ซม.):</span>
                  <span className="font-bold text-slate-800">{containerDims}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">พิกัดโหลดสูงสุด:</span>
                  <span className="font-bold text-slate-800">{maxWeightStr}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">รูปแบบการจัดเรียง:</span>
                  <span className="font-bold text-slate-800 font-sans">
                    {isPattern ? (
                      <>
                        {simPatternId === 'pattern-332-alt' && '3+3+2 Alternating'}
                        {simPatternId === 'pattern-standard' && 'Standard Pattern'}
                        {simPatternId === 'pattern-uniform-ab' && 'Uniform A/B'}
                        {simPatternId === 'pattern-upright-ab' && 'Upright A/B'}
                        {simPatternId === 'pattern-pinwheel' && 'Pinwheel Pattern'}
                        {simPatternId === 'pattern-cross' && 'Interlocking Cross'}
                      </>
                    ) : (
                      'Custom Cargo Mix'
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">จำนวนสินค้าในตู้:</span>
                  <span className="font-bold text-slate-800">{totalBoxes} กล่อง</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">ปริมาตรที่ใช้:</span>
                  <span className="font-bold text-slate-800">{packedVolume.toFixed(2)} m³ ({volumeEfficiency.toFixed(1)}%)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">น้ำหนักรวมสินค้า:</span>
                  <span className="font-bold text-slate-800">{totalWeight.toLocaleString()} กก. ({weightEfficiency.toFixed(1)}%)</span>
                </div>
              </div>

              {/* Inventory details */}
              <div className="mt-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">รายละเอียดและประเภทสินค้า</span>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="pb-1 font-bold">ชื่อสินค้า</th>
                      <th className="pb-1 text-right font-bold">จำนวน</th>
                      <th className="pb-1 text-right font-bold">ขนาด (ซม.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPattern ? (
                      <tr>
                        <td className="py-1 font-medium">{simBoxName}</td>
                        <td className="py-1 text-right">{totalBoxes}</td>
                        <td className="py-1 text-right text-slate-500">{simBoxLength}x{simBoxWidth}x{simBoxHeight}</td>
                      </tr>
                    ) : (
                      cargoList.map((cargo) => {
                        const packedCount = mixResult.packedItems.filter(pi => pi.name === cargo.name).length;
                        return (
                          <tr key={cargo.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-1 font-medium flex items-center gap-1 max-w-[100px] truncate">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cargo.color }} />
                              {cargo.name}
                            </td>
                            <td className="py-1 text-right">{packedCount}/{cargo.quantity}</td>
                            <td className="py-1 text-right text-slate-400 font-mono">{cargo.length}x{cargo.width}x{cargo.height}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature fields */}
            <div className="mt-8 border-t border-slate-200 pt-4 grid grid-cols-2 gap-4 text-center text-[10px] text-slate-500">
              <div>
                <div className="h-10 border-b border-dashed border-slate-300"></div>
                <span className="block mt-1 font-sans">ผู้จัดเตรียมการบรรจุ</span>
              </div>
              <div>
                <div className="h-10 border-b border-dashed border-slate-300"></div>
                <span className="block mt-1 font-sans">ผู้อนุมัติการจัดส่ง</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
                onClick={() => handleImportSimulatedCarton('pattern')}
                className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-3.5 rounded-xl text-[10px] shadow transition cursor-pointer"
              >
                จัดตู้กล่องเดี่ยว (Pattern)
              </button>
              <button
                type="button"
                onClick={() => handleImportSimulatedCarton('mix')}
                className="flex-1 sm:flex-none bg-slate-900 hover:bg-black text-white font-semibold py-2 px-3.5 rounded-xl text-[10px] shadow transition cursor-pointer"
              >
                จัดตู้ผสมคละ (Mix)
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
      {/* Printable high-fidelity report hidden on screen, formatted nicely for print */}
      <div className="hidden print:block print-report-container w-full bg-white p-8 text-black">
        {renderCargoLoadingReport()}
      </div>

      {/* Main Screen Layout (Only visible on web screen, hidden during print) */}
      {/* Sub-tab navigation selection */}
      <div className="lg:col-span-12 flex bg-white border border-slate-200 p-1.5 rounded-xl mb-2 gap-1.5 print:hidden">
        <button
          onClick={() => setActiveSubTab('pattern')}
          className={`flex-1 py-2 rounded-lg font-semibold text-xs transition flex justify-center items-center gap-2 ${
            activeSubTab === 'pattern'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          ระบบจำลองแพทเทิร์นจัดเรียง 6 แบบ (Single Box Simulator)
        </button>
        <button
          onClick={() => setActiveSubTab('mix')}
          className={`flex-1 py-2 rounded-lg font-semibold text-xs transition flex justify-center items-center gap-2 ${
            activeSubTab === 'mix'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          จัดเรียงสินค้าหลายชนิดคละกัน (Custom Cargo Mix)
        </button>
      </div>

      {/* Configuration column (5 cols) - Web ONLY */}
      <div className="lg:col-span-5 flex flex-col gap-6 print:hidden">
        
        {/* Container Selection (Shared) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              1. เลือกตู้คอนเทนเนอร์
            </h3>
            {activeSubTab === 'mix' && (
              <button 
                onClick={loadDemoScenario}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 bg-teal-50 px-2 py-1 rounded transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                โหลดข้อมูลตัวอย่าง
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {CONTAINER_PRESETS.map((container) => (
              <label
                key={container.id}
                className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition ${
                  selectedContainerId === container.id
                    ? 'border-teal-500 bg-teal-50/20 text-teal-900'
                    : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="container_select"
                    checked={selectedContainerId === container.id}
                    onChange={() => setSelectedContainerId(container.id)}
                    className="w-4 h-4 text-teal-600 accent-teal-600"
                  />
                  <div>
                    <span className="font-medium text-sm block">{container.name}</span>
                    <span className="text-xs text-slate-400">
                      ย{container.length} x ก{container.width} x ส{container.height} ซม.
                    </span>
                  </div>
                </div>
                <span className="text-xs font-semibold bg-slate-200/60 text-slate-700 px-2 py-1 rounded">
                  Max: {(container.maxWeight / 1000).toFixed(1)} ตัน
                </span>
              </label>
            ))}

            {/* Custom Container Option */}
            <label
              className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                selectedContainerId === 'custom'
                  ? 'border-teal-500 bg-teal-50/20 text-teal-900'
                  : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="container_select"
                  checked={selectedContainerId === 'custom'}
                  onChange={() => setSelectedContainerId('custom')}
                  className="w-4 h-4 text-teal-600 accent-teal-600"
                />
                <span className="font-medium text-sm">กำหนดขนาดตู้เอง (Custom Container)</span>
              </div>

              {selectedContainerId === 'custom' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2 p-2 bg-white rounded-lg border border-teal-100">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">ยาว (ซม.)</label>
                    <input
                      type="number"
                      value={customContainer.length}
                      onChange={(e) => setCustomContainer(prev => ({ ...prev, length: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">กว้าง (ซม.)</label>
                    <input
                      type="number"
                      value={customContainer.width}
                      onChange={(e) => setCustomContainer(prev => ({ ...prev, width: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">สูง (ซม.)</label>
                    <input
                      type="number"
                      value={customContainer.height}
                      onChange={(e) => setCustomContainer(prev => ({ ...prev, height: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">นร.สูงสุด (กก.)</label>
                    <input
                      type="number"
                      value={customContainer.maxWeight}
                      onChange={(e) => setCustomContainer(prev => ({ ...prev, maxWeight: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* --- Sub-Tab 1: Pattern Simulator Panel --- */}
        {activeSubTab === 'pattern' && (
          <>
            {/* Real-time Dimensions Form */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-600" />
                2. ขนาดกล่องสินค้า (ปรับแบบ Real-time)
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-teal-700 mb-1">เลือกจาก SKU Catalog (Select SKU)</label>
                  <select
                    value={selectedSkuId}
                    onChange={(e) => handleSelectSku(e.target.value)}
                    className="w-full text-sm p-2 border border-teal-200 bg-teal-50/30 text-teal-900 rounded-lg focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
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
                    value={simBoxName}
                    onChange={(e) => {
                      setSimBoxName(e.target.value);
                      setSelectedSkuId('manual'); // set to manual if user changes name directly
                    }}
                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Length slider + input */}
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>ความยาว (ซม.)</span>
                    <span className="font-mono text-teal-600">{simBoxLength} ซม.</span>
                  </div>
                  <div className="flex gap-3 items-center">
                    <input
                      type="range"
                      min="15"
                      max="120"
                      value={simBoxLength}
                      onChange={(e) => {
                        setSimBoxLength(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-teal-600"
                    />
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={simBoxLength}
                      onChange={(e) => {
                        setSimBoxLength(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="w-16 text-center text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>

                {/* Width slider + input */}
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>ความกว้าง (ซม.)</span>
                    <span className="font-mono text-teal-600">{simBoxWidth} ซม.</span>
                  </div>
                  <div className="flex gap-3 items-center">
                    <input
                      type="range"
                      min="15"
                      max="100"
                      value={simBoxWidth}
                      onChange={(e) => {
                        setSimBoxWidth(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-teal-600"
                    />
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={simBoxWidth}
                      onChange={(e) => {
                        setSimBoxWidth(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="w-16 text-center text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>

                {/* Height slider + input */}
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>ความสูง (ซม.)</span>
                    <span className="font-mono text-teal-600">{simBoxHeight} ซม.</span>
                  </div>
                  <div className="flex gap-3 items-center">
                    <input
                      type="range"
                      min="15"
                      max="100"
                      value={simBoxHeight}
                      onChange={(e) => {
                        setSimBoxHeight(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-teal-600"
                    />
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={simBoxHeight}
                      onChange={(e) => {
                        setSimBoxHeight(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="w-16 text-center text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>

                {/* Weight slider + input */}
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>น้ำหนักต่อกล่อง (กก.)</span>
                    <span className="font-mono text-teal-600">{simBoxWeight} กก.</span>
                  </div>
                  <div className="flex gap-3 items-center">
                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={simBoxWeight}
                      onChange={(e) => {
                        setSimBoxWeight(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-teal-600"
                    />
                    <input
                      type="number"
                      min="0.1"
                      max="1000"
                      step="0.1"
                      value={simBoxWeight}
                      onChange={(e) => {
                        setSimBoxWeight(Number(e.target.value));
                        setSelectedSkuId('manual');
                      }}
                      className="w-16 text-center text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pattern Selection 6-Grid */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-600" />
                3. เลือกแพทเทิร์นการจัดเรียง (6 แบบ)
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'pattern-332-alt', label: '3+3+2 Alternating', desc: 'ดีที่สุด - สลับรอยต่อหนาแน่น' },
                  { id: 'pattern-standard', label: 'Standard Pattern', desc: 'วางตามแนวตรงระเบียบ' },
                  { id: 'pattern-uniform-ab', label: 'Uniform A/B', desc: 'วางนอนสม่ำเสมอสลับเลเยอร์' },
                  { id: 'pattern-upright-ab', label: 'Upright A/B', desc: 'วางตะแคงแนวตั้งสลับด้าน' },
                  { id: 'pattern-pinwheel', label: 'Pinwheel Pattern', desc: 'วางแบบกังหันหมุนล็อกมุม' },
                  { id: 'pattern-cross', label: 'Interlocking Cross', desc: 'วางขวาง 90 องศาสลับชั้น' },
                ].map((pattern) => (
                  <button
                    key={pattern.id}
                    onClick={() => setSimPatternId(pattern.id)}
                    className={`p-3 text-left border rounded-xl transition ${
                      simPatternId === pattern.id
                        ? 'border-teal-500 bg-teal-50/20 text-teal-900 shadow-sm'
                        : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-bold text-xs block">{pattern.label}</span>
                    <span className="text-[10px] text-slate-400 block mt-1 leading-snug">{pattern.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Output Summary Sheet Trigger */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
              <button
                onClick={handleExportPDF}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-xl font-semibold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileText className="w-4.5 h-4.5 text-teal-200" />
                ดาวน์โหลดรายงาน PDF สรุปผล (Download PDF Report)
              </button>
              <button
                onClick={() => setShowPrintPreview(true)}
                className="w-full bg-slate-900 hover:bg-black text-white py-2.5 px-4 rounded-xl font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Eye className="w-4.5 h-4.5 text-teal-400" />
                ขอดูตัวอย่างใบจัดวางสินค้า (Preview Specification)
              </button>
              <span className="block text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
                *ระบบจัดส่งเอกสารหน้ากว้างขนาดมาตรฐาน สำหรับส่งออก PDF หรือแนบใบสั่งบรรจุสินค้าตู้คอนเทนเนอร์
              </span>
            </div>
          </>
        )}

        {/* --- Sub-Tab 2: Multi-Cargo Mix Panel --- */}
        {activeSubTab === 'mix' && (
          <>
            {/* Cargo inputs */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-600" />
                2. ข้อมูลขนาดสินค้ากล่อง (จัดผสม)
              </h3>

              <div className="flex gap-1.5 overflow-x-auto pb-3">
                {CARGO_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="shrink-0 text-left p-2 border border-slate-100 bg-slate-50/50 hover:bg-slate-50 rounded-lg text-xs transition"
                  >
                    <span className="font-medium block text-slate-700">{preset.name}</span>
                    <span className="text-[10px] text-slate-400">{preset.length}x{preset.width}x{preset.height} ซม.</span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddCargo} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-teal-700 mb-1">เลือกจาก SKU Catalog (Select SKU)</label>
                  <select
                    value={mixSelectedSkuId}
                    onChange={(e) => handleSelectMixSku(e.target.value)}
                    className="w-full text-sm p-2 border border-teal-200 bg-teal-50/30 text-teal-900 rounded-lg focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อสินค้า/กล่อง</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุชื่อหรือรหัสสินค้า เช่น Box A"
                    value={newCargoName}
                    onChange={(e) => {
                      setNewCargoName(e.target.value);
                      setMixSelectedSkuId('manual');
                    }}
                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ยาว (ซม.)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newCargoLength}
                      onChange={(e) => {
                        setNewCargoLength(Number(e.target.value));
                        setMixSelectedSkuId('manual');
                      }}
                      className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">กว้าง (ซม.)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newCargoWidth}
                      onChange={(e) => {
                        setNewCargoWidth(Number(e.target.value));
                        setMixSelectedSkuId('manual');
                      }}
                      className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">สูง (ซม.)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newCargoHeight}
                      onChange={(e) => {
                        setNewCargoHeight(Number(e.target.value));
                        setMixSelectedSkuId('manual');
                      }}
                      className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">น้ำหนัก/กล่อง (กก.)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      required
                      value={newCargoWeight}
                      onChange={(e) => {
                        setNewCargoWeight(Number(e.target.value));
                        setMixSelectedSkuId('manual');
                      }}
                      className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนกล่อง</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newCargoQty}
                      onChange={(e) => setNewCargoQty(Number(e.target.value))}
                      className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCargoRotate}
                      onChange={(e) => setNewCargoRotate(e.target.checked)}
                      className="w-4 h-4 text-teal-600 accent-teal-600 rounded"
                    />
                    <span className="text-xs text-slate-600 font-medium">อนุญาตให้หมุนกล่อง</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">สี:</span>
                    <input
                      type="color"
                      value={newCargoColor}
                      onChange={(e) => setNewCargoColor(e.target.value)}
                      className="w-6 h-6 border-0 p-0 rounded-full cursor-pointer overflow-hidden"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-lg font-medium text-sm shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มรายการสินค้ากล่องคละ
                </button>
              </form>
            </div>

            {/* Cargo List Summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h4 className="font-semibold text-slate-800 mb-3 text-sm">รายการสินค้าที่ต้องจัดเรียง ({cargoList.length})</h4>
              {cargoList.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  ยังไม่มีสินค้าในตู้ กรุณากรอกขนาดสินค้าเพื่อคำนวณ
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {cargoList.map((cargo) => (
                    <div key={cargo.id} className="flex justify-between items-center p-2.5 bg-slate-50/70 border border-slate-100 rounded-lg">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cargo.color }} />
                        <div>
                          <span className="text-xs font-semibold text-slate-700 block">{cargo.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {cargo.length}x{cargo.width}x{cargo.height} ซม. | {cargo.weight} กก.
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-teal-700 font-mono">x{cargo.quantity}</span>
                        <button
                          onClick={() => handleRemoveCargo(cargo.id)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Output Summary Sheet Trigger for Mix */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={cargoList.length === 0}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                  cargoList.length === 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                <FileText className="w-4.5 h-4.5 text-teal-200" />
                ดาวน์โหลดรายงาน PDF จัดผสม (Download Mixed PDF Report)
              </button>
              <button
                type="button"
                onClick={() => setShowPrintPreview(true)}
                disabled={cargoList.length === 0}
                className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                  cargoList.length === 0
                    ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-black text-white'
                }`}
              >
                <Eye className="w-4.5 h-4.5 text-teal-400" />
                ขอดูตัวอย่างใบจัดวางสินค้า (Preview Mixed Specification)
              </button>
              <span className="block text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
                *ดาวน์โหลดใบแสดงรายละเอียดประเภทสินค้า พิกัดโหลด และรายการสรุปน้ำหนักคละ
              </span>
            </div>
          </>
        )}

      </div>

      {/* Visualizer & Metrics columns (7 cols) - Web ONLY */}
      <div className="lg:col-span-7 flex flex-col gap-6 print:hidden">
        
        {/* KPI Scorecard Grid */}
        {activeSubTab === 'pattern' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">จำนวนกล่องทั้งหมด</span>
              <span className="block text-xl font-bold text-teal-600 mt-1">
                {patternResult.totalBoxes} <span className="text-xs font-normal text-slate-500">กล่อง</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                เรียงครบถ้วน
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-sans">กล่อง / ชั้น</span>
              <span className="block text-xl font-bold text-teal-600 mt-1">
                {patternResult.boxesPerLayer} <span className="text-xs font-normal text-slate-500">กล่อง</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                เฉลี่ยต่อเลเยอร์
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">จำนวนชั้น</span>
              <span className="block text-xl font-bold text-teal-600 mt-1">
                {patternResult.layersCount} <span className="text-xs font-normal text-slate-500">ชั้น</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                ความสูงเต็มพิกัด
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">น้ำหนักรวมสินค้า</span>
                <span className="block text-base font-bold text-slate-800 mt-0.5">
                  {patternResult.totalWeight.toLocaleString()} <span className="text-xs font-normal text-slate-500">กก.</span>
                </span>
              </div>
              <div className="mt-1">
                {patternResult.weightEfficiency > 100 ? (
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[9px] font-bold border border-red-200">
                    <AlertTriangle className="w-2.5 h-2.5" /> Overload
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[9px] font-bold border border-green-200">
                    <CheckCircle2 className="w-2.5 h-2.5" /> ปลอดภัย
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-sans">จำนวนที่จัดวางได้</span>
              <span className="block text-xl font-bold text-teal-600 mt-1">
                {mixResult.packedItems.length} <span className="text-xs font-normal text-slate-500">กล่อง</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                จากทั้งหมด {cargoList.reduce((sum, c) => sum + c.quantity, 0)} กล่อง
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">ปริมาตรที่ใช้ (%)</span>
              <span className="block text-xl font-bold text-teal-600 mt-1">
                {mixResult.volumeEfficiency.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {mixResult.packedVolume.toFixed(2)} / {mixResult.totalVolume.toFixed(2)} m³
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">น้ำหนักที่ใช้ (%)</span>
              <span className="block text-xl font-bold text-amber-600 mt-1">
                {mixResult.weightEfficiency.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {(mixResult.totalWeight / 1000).toFixed(2)} / {(activeContainer.maxWeight / 1000).toFixed(0)} ตัน
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">สถานะบรรทุก</span>
              <span className={`block text-[10px] font-bold mt-2.5 px-2 py-0.5 rounded-full inline-block ${
                mixResult.unpackedItems.length === 0 && cargoList.length > 0
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : cargoList.length === 0
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {cargoList.length === 0 
                  ? 'ไม่มีข้อมูล' 
                  : mixResult.unpackedItems.length === 0 
                  ? 'โหลดครบถ้วน' 
                  : `เหลืออีก ${mixResult.unpackedItems.reduce((sum, i) => sum + i.count, 0)} กล่อง`}
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Space Utilization Panel (Progress Bars) */}
        {activeSubTab === 'pattern' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5 text-xs">
                <span className="font-semibold text-slate-700">% Volume Utilization (พื้นที่ความจุตู้สินค้า)</span>
                <span className="font-bold text-teal-600 font-mono">{patternResult.volumeEfficiency.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200/50">
                <div
                  className="bg-gradient-to-r from-teal-500 to-teal-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, patternResult.volumeEfficiency)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>ความจุกระดาษรวม: {patternResult.totalVolume.toFixed(2)} m³</span>
                <span>ใช้ไปแล้ว: {patternResult.packedVolume.toFixed(2)} m³</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5 text-xs">
                <span className="font-semibold text-slate-700">Width Used Bar (การใช้ประโยชน์หน้ากว้างหน้าตู้)</span>
                <span className="font-bold text-indigo-600 font-mono">{patternResult.widthUsedPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200/50">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, patternResult.widthUsedPercent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>หน้ากว้างตู้เต็มพิกัด: {activeContainer.width} ซม.</span>
                <span>ใช้จริง: {Math.round(activeContainer.width * (patternResult.widthUsedPercent / 100))} ซม.</span>
              </div>
            </div>
          </div>
        )}

        {/* 3D Visualizer Canvas Section */}
        <ContainerVisualizer
          containerLength={activeContainer.length}
          containerWidth={activeContainer.width}
          containerHeight={activeContainer.height}
          items={visualItems}
          title={activeSubTab === 'pattern' ? "3D Simulator: มุมมองแพทเทิร์นการจัดเรียงกล่องสินค้า" : "3D Simulator: มุมมองการจัดเรียงตู้สินค้าแบบผสมคละ"}
          isPalletMode={false}
          activeStepIdx={activeStepIdx}
          loadingSteps={loadingSteps}
          onStepChange={setActiveStepIdx}
        />



        {/* Payload Safety / Warning Details */}
        {activeSubTab === 'pattern' && patternResult.weightEfficiency > 100 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-800">
            <Info className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-sm font-semibold">⚠️ เช็ค Payload Overload: น้ำหนักบรรทุกรวมเกินอัตราสูงสุด!</h5>
              <p className="text-xs text-red-700/90 mt-1">
                ตู้คอนเทนเนอร์นี้จำกัดน้ำหนักบรรทุกสูงสุดที่ <span className="font-bold">{(activeContainer.maxWeight / 1000).toFixed(1)} ตัน</span>.
                แต่น้ำหนักรวมของแพทเทิร์นที่ใส่คือ <span className="font-bold">{(patternResult.totalWeight / 1000).toFixed(2)} ตัน</span>.
                โปรดลดความหนาแน่นหรือเลือกตู้สินค้าประเภทอื่นเพื่อรักษาความปลอดภัยทางวิศวกรรมการขนส่ง
              </p>
            </div>
          </div>
        )}

        {/* Safe loading guide / instruction cards */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-3 text-xs text-slate-600">
          <HelpCircle className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <span className="font-semibold text-slate-800 block">💡 แนะนำกลยุทธ์การจัดวางตู้สินค้าเพื่อความสมดุล (Floor Load):</span>
            <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-500">
              <li><strong className="text-slate-700">3+3+2 Alternating:</strong> จัดเป็นลายไขว้เพื่อยึดโครงสร้างสับหลีกไม่ให้สไลด์ล้ม เหมาะสมและปลอดภัยที่สุดในการขนถ่ายข้ามทวีป</li>
              <li>การตะแคงกล่องสินค้าหรือเปลี่ยนมิติ (Upright Stacking) ช่วยให้ยอดโหลดตู้สูงขึ้นแต่อาจส่งผลต่อการกดทับของลังด้านล่าง ควรตรวจค่าประจุแรงกดกล่อง (Crush Resistance)</li>
              <li>กระจายน้ำหนักของตู้ให้สม่ำเสมอซ้าย-ขวา เพื่อป้องกันรถเทรลเลอร์คว่ำขณะเข้าโค้งด้วยความเร็ว</li>
            </ul>
          </div>
        </div>

        {/* Print Preview Modal */}
        <AnimatePresence>
          {showPrintPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 text-left"
              >
                {/* Modal Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-teal-500/10 text-teal-600 rounded-lg">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm md:text-base font-sans">ใบจัดวางสินค้า / Container Loading Specification Sheet</h3>
                      <p className="text-xs text-slate-500 font-sans">ตรวจสอบรายละเอียดรูปแบบและลำดับจัดวางจริงก่อนจัดพิมพ์หรือบันทึกไฟล์</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPrintPreview(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body / Scrollable Spec sheet */}
                <div className="p-6 overflow-y-auto bg-slate-100/50 flex-1 flex justify-center">
                  <div className="w-full max-w-4xl shadow-md rounded-xl bg-white overflow-hidden">
                    {renderCargoLoadingReport()}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-500 font-sans">
                    * รูปเล่มมีขนาดพอดีกับสัดส่วนมาตรฐาน A4 ทั้งในรูปแบบไฟล์ PDF และเครื่องพิมพ์สำนักงาน
                  </span>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setShowPrintPreview(false)}
                      className="flex-1 sm:flex-none px-4 py-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold transition font-sans"
                    >
                      ปิดหน้าต่าง
                    </button>
                    <button
                      onClick={() => {
                        setShowPrintPreview(false);
                        setTimeout(() => {
                          window.print();
                        }, 300);
                      }}
                      className="flex-1 sm:flex-none px-5 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm font-sans"
                    >
                      <Printer className="w-4 h-4" />
                      สั่งพิมพ์ด่วน (Print)
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  </div>
  );
};
