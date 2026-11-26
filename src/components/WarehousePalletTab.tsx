import React, { useState, useEffect } from 'react';
import { solvePalletPattern } from '../utils/packingSolver';
import { Pallet, Position3D } from '../types';
import { ContainerVisualizer } from './ContainerVisualizer';
import { listenToSKUs, SKUItem } from '../utils/firebaseDb';
import { HelpCircle, Layers, CheckCircle, Info, RefreshCw, AlertTriangle, Printer } from 'lucide-react';
import { exportResultToPDF } from '../utils/pdfExporter';
import { LayerEditorComponent } from './LayerEditorComponent';

const WAREHOUSE_PALLETS: Pallet[] = [
  { id: 'wh_standard', name: 'Asia Standard (120 x 100 ซม.)', length: 120, width: 100, height: 15, maxHeight: 180, maxWeight: 2000 },
  { id: 'wh_euro', name: 'Euro Standard (120 x 80 ซม.)', length: 120, width: 80, height: 15, maxHeight: 160, maxWeight: 1500 },
  { id: 'wh_square', name: 'Square Material Pallet (110 x 110 ซม.)', length: 110, width: 110, height: 15, maxHeight: 150, maxWeight: 1800 },
];

const SFG_PRESETS = [
  { name: 'ชิ้นงานกึ่งสำเร็จรูปกล่องหนัก (SFG-Heavy)', length: 45, width: 35, height: 25, weight: 24, color: '#0369a1' },
  { name: 'ม้วนพลาสติก/ฟิล์มสวมกล่อง (SFG-Roll)', length: 30, width: 30, height: 40, weight: 12, color: '#4d7c0f' },
  { name: 'ถาดแผงวงจรประกอบเสร็จ (SFG-PCBA)', length: 50, width: 33, height: 20, weight: 8, color: '#7c3aed' },
];

export const WarehousePalletTab: React.FC = () => {
  // Pallet Selection State
  const [selectedPalletId, setSelectedPalletId] = useState<string>('wh_standard');

  // SKUs state
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('manual');

  useEffect(() => {
    const unsubscribe = listenToSKUs((updatedSkus) => {
      setSkus(updatedSkus);
    });
    return () => unsubscribe();
  }, []);

  const handleSelectSku = (id: string) => {
    setSelectedSkuId(id);
    if (id === 'manual') return;
    const selected = skus.find(s => s.id === id);
    if (selected) {
      setSfgName(selected.name);
      setSfgLength(selected.length);
      setSfgWidth(selected.width);
      setSfgHeight(selected.height);
      setSfgWeight(selected.weight);
    }
  };
  const [customPallet, setCustomPallet] = useState<Omit<Pallet, 'id'>>({
    name: 'พาเลทโกดังแบบกำหนดเอง (Custom)',
    length: 120,
    width: 120,
    height: 15,
    maxHeight: 170,
    maxWeight: 1500,
  });

  // Semi-Finished Goods Inputs
  const [sfgName, setSfgName] = useState('ชิ้นส่วนโลหะกึ่งสำเร็จรูป');
  const [sfgLength, setSfgLength] = useState(45);
  const [sfgWidth, setSfgWidth] = useState(35);
  const [sfgHeight, setSfgHeight] = useState(30);
  const [sfgWeight, setSfgWeight] = useState(15);
  const [boxColor, setBoxColor] = useState('#ca8a04');

  // Warehousing Safe Stacking rules
  const [patternTypePreference, setPatternTypePreference] = useState<'block' | 'brick' | 'architectural' | 'architectural_brick'>('architectural');
  const [bottomBoxLoadLimit, setBottomBoxLoadLimit] = useState<number>(200); // maximum load bottom box can handle in kg

  // Custom Layer States
  const [customPalletPositions, setCustomPalletPositions] = useState<Position3D[] | null>(null);
  const [customPalletStats, setCustomPalletStats] = useState<{ totalBoxes: number; boxesPerLayer: number; customLayersCount?: number } | null>(null);

  // Reset custom design when box dimensions or pattern preferences change
  useEffect(() => {
    setCustomPalletPositions(null);
    setCustomPalletStats(null);
  }, [sfgLength, sfgWidth, sfgHeight, sfgWeight, selectedPalletId, patternTypePreference]);

  const activePallet: Pallet = selectedPalletId === 'custom'
    ? { id: 'custom', ...customPallet }
    : WAREHOUSE_PALLETS.find(p => p.id === selectedPalletId)!;

  // Run Solver
  const solvedResult = solvePalletPattern(
    { name: sfgName, length: sfgLength, width: sfgWidth, height: sfgHeight, weight: sfgWeight },
    activePallet,
    patternTypePreference
  );

  const rawResult = {
    ...solvedResult,
    boxPositions: customPalletPositions || solvedResult.boxPositions,
    totalBoxes: customPalletStats ? customPalletStats.totalBoxes : solvedResult.totalBoxes,
    boxesPerLayer: customPalletStats ? customPalletStats.boxesPerLayer : solvedResult.boxesPerLayer,
    layersCount: (customPalletStats && customPalletStats.customLayersCount !== undefined) ? customPalletStats.customLayersCount : solvedResult.layersCount,
    totalWeight: (customPalletStats ? customPalletStats.totalBoxes : solvedResult.totalBoxes) * sfgWeight,
    totalHeight: activePallet.height + (((customPalletStats && customPalletStats.customLayersCount !== undefined) ? customPalletStats.customLayersCount : solvedResult.layersCount) * sfgHeight),
    efficiency: (((customPalletStats ? customPalletStats.boxesPerLayer : solvedResult.boxesPerLayer) * sfgLength * sfgWidth) / (activePallet.length * activePallet.width)) * 100
  };

  // Stacking safety check calculations
  const weightOnBottomLayer = (rawResult.layersCount - 1) * rawResult.boxesPerLayer * sfgWeight;
  const weightPerBottomBox = rawResult.layersCount > 1 ? weightOnBottomLayer / rawResult.boxesPerLayer : 0;
  const isCrushRisk = weightPerBottomBox > bottomBoxLoadLimit;

  // Determine packing stability rating
  let stabilityRating: 'excellent' | 'good' | 'moderate' | 'unstable' = 'excellent';
  if (rawResult.layersCount >= 5) stabilityRating = 'moderate';
  else if (rawResult.patternType === 'block' && rawResult.layersCount >= 3) stabilityRating = 'good';
  else if (rawResult.patternType === 'brick' || rawResult.patternType === 'architectural' || rawResult.patternType === 'architectural_brick') stabilityRating = 'excellent';

  const applyPreset = (preset: typeof SFG_PRESETS[0]) => {
    setSfgName(preset.name);
    setSfgLength(preset.length);
    setSfgWidth(preset.width);
    setSfgHeight(preset.height);
    setSfgWeight(preset.weight);
    setBoxColor(preset.color);
  };

  // Build list of packed boxes relative to the pallet boundary
  const visualBoxes = rawResult.boxPositions.map((p, idx) => ({
    id: `sfg-${idx}`,
    name: `${sfgName} (กล่องที่ ${idx + 1})`,
    color: boxColor,
    position: p
  }));

  const triggerPrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    exportResultToPDF(
      'warehouse',
      '',
      null,
      activePallet,
      {
        sfgName: sfgName,
        sfgLength: sfgLength,
        sfgWidth: sfgWidth,
        sfgHeight: sfgHeight,
        sfgWeight: sfgWeight,
        bottomBoxLoadLimit: bottomBoxLoadLimit,
        patternTypePreference: patternTypePreference,
      },
      {
        totalBoxes: rawResult.totalBoxes,
        layersCount: rawResult.layersCount,
        totalWeight: rawResult.totalWeight,
        weightPerBottomBox: weightPerBottomBox,
        isCrushRisk: isCrushRisk,
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      {/* Configure column (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        
        {/* Pallet config */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" />
              1. เลือกพาเลทในคลังสินค้า
            </h3>
          </div>

          <div className="flex flex-col gap-2.5">
            {WAREHOUSE_PALLETS.map((p) => (
              <label
                key={p.id}
                className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition ${
                  selectedPalletId === p.id
                    ? 'border-teal-500 bg-teal-50/20 text-teal-900'
                    : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="wh_pallet_select"
                    checked={selectedPalletId === p.id}
                    onChange={() => setSelectedPalletId(p.id)}
                    className="w-4 h-4 text-teal-600 accent-teal-600"
                  />
                  <div>
                    <span className="font-medium text-xs block">{p.name}</span>
                    <span className="text-[10px] text-slate-400">
                      กว้าง {p.width} x ยาว {p.length} ซม. | ซ้อนสูงไม่เกิน {p.maxHeight} ซม.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold bg-slate-200/50 text-slate-600 px-2 py-1 rounded">
                  Max: {p.maxWeight} กก.
                </span>
              </label>
            ))}

            {/* Custom Option */}
            <label
              className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                selectedPalletId === 'custom'
                  ? 'border-teal-500 bg-teal-50/20 text-teal-900'
                  : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  name="wh_pallet_select"
                  checked={selectedPalletId === 'custom'}
                  onChange={() => setSelectedPalletId('custom')}
                  className="w-4 h-4 text-teal-600 accent-teal-600"
                />
                <span className="font-medium text-xs">ระบุขนาดพาเลทคลังสินค้าเอง</span>
              </div>

              {selectedPalletId === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-white rounded border border-teal-100">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">ยาว (ซม.)</label>
                    <input
                      type="number"
                      value={customPallet.length}
                      onChange={(e) => setCustomPallet(prev => ({ ...prev, length: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">กว้าง (ซม.)</label>
                    <input
                      type="number"
                      value={customPallet.width}
                      onChange={(e) => setCustomPallet(prev => ({ ...prev, width: Number(e.target.value) }))}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded"
                    />
                  </div>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* SFG inputs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-600" />
            2. ข้อมูลสินค้ากึ่งสำเร็จรูป (Semi-Finished Goods)
          </h3>

          <div className="flex gap-2 overflow-x-auto pb-3">
            {SFG_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p)}
                className="shrink-0 text-left p-2 border border-slate-100 bg-slate-50/50 hover:bg-slate-50 rounded-lg text-xs transition"
              >
                <span className="font-semibold block text-slate-700">{p.name.split(' ')[0]}</span>
                <span className="text-[10px] text-slate-400">{p.length}x{p.width}x{p.height} ซม.</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-teal-700 mb-1">เลือกจาก SKU Catalog (Select SKU)</label>
              <select
                value={selectedSkuId}
                onChange={(e) => handleSelectSku(e.target.value)}
                className="w-full text-xs p-2.5 border border-teal-200 bg-teal-50/30 text-teal-900 rounded-lg focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
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
              <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อสินค้ากึ่งสำเร็จรูป</label>
              <input
                type="text"
                value={sfgName}
                onChange={(e) => {
                  setSfgName(e.target.value);
                  setSelectedSkuId('manual');
                }}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ยาว (ซม.)</label>
                <input
                  type="number"
                  value={sfgLength}
                  onChange={(e) => {
                    setSfgLength(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">กว้าง (ซม.)</label>
                <input
                  type="number"
                  value={sfgWidth}
                  onChange={(e) => {
                    setSfgWidth(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">สูง (ซม.)</label>
                <input
                  type="number"
                  value={sfgHeight}
                  onChange={(e) => {
                    setSfgHeight(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">น้ำหนักต่อกล่อง (กก.)</label>
                <input
                  type="number"
                  value={sfgWeight}
                  onChange={(e) => {
                    setSfgWeight(Number(e.target.value));
                    setSelectedSkuId('manual');
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ความทนแรงกดของฐาน (กก.)</label>
                <input
                  type="number"
                  value={bottomBoxLoadLimit}
                  onChange={(e) => setBottomBoxLoadLimit(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                  title="น้ำหนักสูงสุดที่กล่องล่างสุดจะรับได้ก่อนจะบี้พัง"
                />
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500">เลือกสีกล่องสินค้าเพื่อการจำลอง:</span>
              <input
                type="color"
                value={boxColor}
                onChange={(e) => setBoxColor(e.target.value)}
                className="w-7 h-7 border-0 p-0 rounded-full cursor-pointer overflow-hidden shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Pattern Selection */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-xs">
            <Layers className="w-4 h-4 text-teal-600" />
            3. เลือกรูปแบบลายการจัดวางพาเลท (Pallet Stacking Pattern)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'architectural', name: 'Architectural (Block) [แนะนำ / Default]', desc: 'หมุนสลับยกชั้น 90 องศา - ลายบล็อกตรง' },
              { id: 'architectural_brick', name: 'Architectural (Brick)', desc: 'หมุนสลับยกชั้น 90 องศา - ลายอิฐประสาน' },
              { id: 'block', name: 'Standard Block', desc: 'แนวตรงแบบบล็อกขนานกันทุกชั้น' },
              { id: 'brick', name: 'Standard Brick', desc: 'สลับลายอิฐประสานทิศเดียวกันทุกชั้น' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPatternTypePreference(p.id as any)}
                className={`p-2 rounded-xl border text-left text-xs transition ${
                  patternTypePreference === p.id
                    ? 'border-teal-500 bg-teal-50/20 text-teal-900 font-semibold shadow-sm'
                    : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs">{p.name}</span>
                <span className="block text-[9px] text-slate-400 mt-0.5 leading-tight font-normal">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Output Summary Sheet Trigger for Warehouse Stacking */}
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
            พิมพ์ใบจัดวางคลังสินค้า (Print Stacking Specification)
          </button>
          <span className="block text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
            *ระบบจัดส่งเอกสารใบจัดเรียงพาเลทคลังสินค้า สำหรับควบคุมความสูง ความตึง และความปลอดภัยทางวิศวกรรม
          </span>
        </div>

      </div>

      {/* Visualizer & Metrics columns (7 cols) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        
        {/* KPI metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">จำนวนที่วางได้รวม</span>
            <span className="block text-xl font-bold text-teal-600 mt-1 font-mono">
              {rawResult.totalBoxes} <span className="text-xs font-normal text-slate-500">กล่อง</span>
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              ({rawResult.boxesPerLayer} กล่อง x {rawResult.layersCount} ชั้น)
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">น้ำหนักรวมพาเลท</span>
            <span className="block text-xl font-bold text-teal-600 mt-1">
              {(rawResult.totalWeight + 25).toFixed(0)} <span className="text-xs font-normal text-slate-500">กก.</span>
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              รวมโครงสร้างไม้พาเลท 25 กก.
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">ความสูงรวมกอง</span>
            <span className="block text-xl font-bold text-teal-600 mt-1">
              {rawResult.totalHeight} <span className="text-xs font-normal text-slate-500">ซม.</span>
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              ลิมิตความสูงโกดัง {activePallet.maxHeight} ซม.
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">ลายการจัดเรียง</span>
            <span className={`block text-[11px] font-bold mt-2 px-2 py-1 rounded-full inline-block ${
              rawResult.patternType === 'brick' || rawResult.patternType === 'interlocking' || rawResult.patternType === 'architectural' || rawResult.patternType === 'architectural_brick'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {rawResult.patternType === 'brick' || rawResult.patternType === 'interlocking' ? 'สลับลายอิฐ (Standard Brick)' :
               rawResult.patternType === 'architectural' ? 'สลับยกชั้น (Architectural Block)' :
               rawResult.patternType === 'architectural_brick' ? 'สลับยกชั้นลายอิฐ (Architectural Brick)' : 'บล็อกตรง (Standard Block)'}
            </span>
          </div>
        </div>

        {/* Rendering Pallet visualizer */}
        <ContainerVisualizer
          containerLength={activePallet.length}
          containerWidth={activePallet.width}
          containerHeight={rawResult.totalHeight}
          items={visualBoxes}
          title="แผนภาพวิเคราะห์การจัดวางสินค้าบนพาเลทคลังสินค้า (Semi-Finished Goods)"
          isPalletMode={true}
          patternTypePreference={patternTypePreference}
          setPatternTypePreference={setPatternTypePreference}
        />

        {/* Layer-by-layer alignment & customized box editing widget */}
        <LayerEditorComponent
          palletLength={activePallet.length}
          palletWidth={activePallet.width}
          boxLength={sfgLength}
          boxWidth={sfgWidth}
          boxHeight={sfgHeight}
          boxWeight={sfgWeight}
          boxColor={boxColor}
          layersCount={rawResult.layersCount}
          initialFullPositions={solvedResult.boxPositions}
          onUpdate={(updatedPositions, total, perLayer, customLayersCount) => {
            setCustomPalletPositions(updatedPositions);
            setCustomPalletStats({ totalBoxes: total, boxesPerLayer: perLayer, customLayersCount });
          }}
        />

        {/* Safety Risk Alert box */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h4 className="font-semibold text-slate-800 text-sm mb-3">การประเมินความปลอดภัยและการรับแรงกด (Safety Audit)</h4>
          <div className="space-y-3">
            
            {/* 1. Crush weight check */}
            <div className={`p-3 rounded-xl border flex gap-3 text-xs ${
              isCrushRisk 
                ? 'bg-red-50 border-red-100 text-red-800' 
                : 'bg-green-50 border-green-100 text-green-800'
            }`}>
              {isCrushRisk ? (
                <>
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
                  <div>
                    <span className="font-bold block">⚠️ แจ้งเตือน: กล่องฐานเสี่ยงต่อการบุบพัง!</span>
                    <p className="mt-1 opacity-90">
                      กล่องแถวล่างสุดแต่ละกล่องต้องรับน้ำหนักเฉลี่ยถึง <strong className="font-mono text-sm">{weightPerBottomBox.toFixed(1)} กก.</strong> ซึ่งสูงกว่าขีดจำกัดความแข็งแรงแรงกดกล่องที่ระบุไว้ ({bottomBoxLoadLimit} กก.) แนะนำให้ลดจำนวนชั้นความสูง หรือเลือกสลับใช้กล่องบรรจุภัณฑ์ลอนหนาแบบพิเศษ
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 shrink-0 text-green-600" />
                  <div>
                    <span className="font-bold block">✓ โครงสร้างความแข็งแรงปลอดภัย</span>
                    <p className="mt-1 opacity-90">
                      กล่องฐานแถวล่างสุดรับน้ำหนักเฉลี่ยเพียง <strong className="font-mono">{weightPerBottomBox.toFixed(1)} กก.</strong> ซึ่งน้อยกว่าขีดจำกัดสูงสุด ({bottomBoxLoadLimit} กก.) กล่องด้านล่างจะไม่เกิดการบุบบิดเบี้ยว
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* 2. Stability check */}
            <div className="p-3 bg-blue-50/40 border border-blue-100/50 rounded-xl flex gap-3 text-xs text-blue-800">
              <Info className="w-5 h-5 shrink-0 text-blue-600" />
              <div>
                <span className="font-bold block">ระดับเสถียรภาพการจัดเรียงคลังสินค้า: {
                  stabilityRating === 'excellent' ? 'ระดับดีเยี่ยม (Excellent)' :
                  stabilityRating === 'good' ? 'ระดับดี (Good)' : 'ระดับปานกลาง (Moderate)'
                }</span>
                <p className="mt-1 opacity-90">
                  {rawResult.patternType === 'interlocking' 
                    ? 'ลายซ้อนสลับแบบอิฐบล็อกสลับซ้ายขวาในแต่ละชั้น จะช่วยยึดเกาะโครงสร้างกล่องไม่ให้สั่นคลอน ป้องกันปัญหากล่องเลื่อนไถลล้มลงขณะที่รถโฟล์คลิฟท์ขับเคลื่อนเคลื่อนย้าย'
                    : 'เนื่องจากใช้ลายแบบคอลัมน์ตรงเสากอง แนะนำให้พันด้วยสายรัดหรือฟิล์มหดพลาสติกให้รอบโครงสร้างก่อนยกวางบนชั้นเก็บของสูง (Racking)'}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Warehousing Tips */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-3 text-xs text-slate-600">
          <HelpCircle className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <span className="font-semibold text-slate-800 block">💡 แนวทางการปฏิบัติตามมาตรฐาน 5ส และความปลอดภัยโกดัง:</span>
            <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-500">
              <li>**จัดทำบาร์โค้ดกำกับ**: สำหรับของกึ่งสำเร็จรูป (Semi-Finished Goods) ควรพ่นสเปรย์หรือติดป้ายสถานะ (เช่น QA Pass, Wait, Hold) ไว้ที่มุมข้างพาเลทให้มองเห็นชัดเจน</li>
              <li>**หลีกเลี่ยงการซ้อนขวาง**: ไม่ควรวางสินค้ากึ่งสำเร็จรูปยื่นเลยพิกัดขอบพาเลท (Overhang) เพราะจะทำให้มุมกล่องรับน้ำหนักโดยตรงไม่มีฐานไม้หนุน นำไปสู่ปัญหาโครงสร้างกองพังถล่ม</li>
              <li>**เก็บในที่แห้ง**: กล่องกระดาษบรรจุ SFG มีพฤติกรรมดูดความชื้นในอากาศในคลังสินค้า ทำให้ขีดจำกัดการรับแรงกดลดลง 30-50% หากจัดเก็บเป็นเวลานาน</li>
            </ul>
          </div>
        </div>

      </div>

    </div>
  );
};
