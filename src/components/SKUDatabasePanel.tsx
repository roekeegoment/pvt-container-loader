import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { saveSKU, deleteSKU, listenToSKUs, fetchGoogleSheetSKUs, SKUItem, inferPackagingSpecs, PackagingLoadClass } from '../utils/firebaseDb';
import { solveCartonPacking, CartonPackingResult } from '../utils/packingSolver';
import { Database, FileSpreadsheet, Plus, Trash2, Edit3, RefreshCw, Search, Box, CheckCircle, AlertCircle, Shield, Scale, Clock, Thermometer, Info, HelpCircle, ArrowUpRight } from 'lucide-react';

export interface CardboardGradeInfo {
  id: string;
  name: string;
  nameEn: string;
  ply: number;
  thicknessMm: number;
  ect: number; // kN/m
  typicalPaper: string;
  description: string;
}

export const CARDBOARD_GRADES: CardboardGradeInfo[] = [
  {
    id: 'single-light',
    name: '3 ชั้น - น้ำหนักเบา (3-Ply Light B-Flute)',
    nameEn: '3-Ply Light B-Flute',
    ply: 3,
    thicknessMm: 3.0,
    ect: 4.0,
    typicalPaper: 'KS125/CA105/KS125',
    description: 'เหมาะสำหรับกล่องขนาดเล็ก สินค้าอุปโภคบริโภคน้ำหนักเบา'
  },
  {
    id: 'single-std',
    name: '3 ชั้น - หนาทั่วไป (3-Ply Standard C-Flute)',
    nameEn: '3-Ply Standard C-Flute',
    ply: 3,
    thicknessMm: 4.0,
    ect: 5.5,
    typicalPaper: 'KS170/CA125/KS170',
    description: 'เหมาะสำหรับกล่องของกินของใช้ กล่องพัสดุไปรษณีย์ทั่วไป'
  },
  {
    id: 'double-std',
    name: '5 ชั้น - หนาพิเศษมาตรฐาน (5-Ply Standard BC-Flute)',
    nameEn: '5-Ply Standard BC-Flute',
    ply: 5,
    thicknessMm: 7.0,
    ect: 8.5,
    typicalPaper: 'KA150/CA125/CA125/CA125/KA150',
    description: 'เกรดลอนลูกฟูกยอดนิยม รับน้ำหนักปานกลาง-สูง ซ้อนได้ดี'
  },
  {
    id: 'double-heavy',
    name: '5 ชั้น - แข็งแรงสูงพิเศษ (5-Ply Premium BC-Flute)',
    nameEn: '5-Ply Premium BC-Flute',
    ply: 5,
    thicknessMm: 7.0,
    ect: 11.0,
    typicalPaper: 'KS170/CA125/CA125/CA125/KS170',
    description: 'สำหรับงานอุตสาหกรรมหนัก ผลไม้ส่งออก เครื่องมือแพทย์ และอะไหล่'
  },
  {
    id: 'triple-heavy',
    name: '7 ชั้น - หนาสูงสุดพิเศษ (7-Ply Heavy AAC-Flute)',
    nameEn: '7-Ply Heavy AAC-Flute',
    ply: 7,
    thicknessMm: 11.0,
    ect: 16.5,
    typicalPaper: 'KA230/CA125/CA125/CA125/CA125/CA125/KA230',
    description: 'สำหรับเครื่องจักร อะไหล่ยานยนต์ ถังเคมี หรือน้ำหนักเกิน 100 กก.'
  }
];

interface SKUDatabasePanelProps {
  onSelectedSkuChange?: (skuId: string) => void;
}

export const SKUDatabasePanel: React.FC<SKUDatabasePanelProps> = ({ onSelectedSkuChange }) => {
  const [activeSubSection, setActiveSubSection] = useState<'database' | 'simulation'>('database');
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [skuCode, setSkuCode] = useState<string>('');
  const [skuName, setSkuName] = useState<string>('');
  const [skuLength, setSkuLength] = useState<number>(34.8);
  const [skuWidth, setSkuWidth] = useState<number>(26.2);
  const [skuHeight, setSkuHeight] = useState<number>(9.5);
  const [skuWeight, setSkuWeight] = useState<number>(6.26);
  const [skuCategory, setSkuCategory] = useState<string>('SQ');
  const [skuDescription, setSkuDescription] = useState<string>('');
  const [skuPackagingType, setSkuPackagingType] = useState<string>('Standard Export Carton (ลังมาตรฐานส่งออก 100%)');
  const [skuLoadBearingPct, setSkuLoadBearingPct] = useState<number>(100);
  const [skuStackClass, setSkuStackClass] = useState<PackagingLoadClass>('heavy_100');
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Google Sheet Sync State
  const [sheetUrl, setSheetUrl] = useState<string>('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncCount, setSyncCount] = useState<number>(0);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');

  // Carton Simulation State
  const [cartonLength, setCartonLength] = useState<number>(110);
  const [cartonWidth, setCartonWidth] = useState<number>(110);
  const [cartonHeight, setCartonHeight] = useState<number>(150);
  const [cartonEmptyWeight, setCartonEmptyWeight] = useState<number>(15);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('s12');
  const [simResult, setSimResult] = useState<CartonPackingResult | null>(null);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  // Cardboard Strength States
  const [cardboardGrade, setCardboardGrade] = useState<string>('double-std');
  const [storageTime, setStorageTime] = useState<string>('4w');
  const [humidity, setHumidity] = useState<string>('high');
  const [stackPattern, setStackPattern] = useState<string>('interlock');

  // Listen to SKUs from Firestore real-time
  useEffect(() => {
    setLoading(true);
    const unsubscribe = listenToSKUs((updatedSkus) => {
      setSkus(updatedSkus);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Update simulation when values change
  useEffect(() => {
    if (skus.length === 0) return;
    const activeSku = skus.find((s) => s.id === selectedSkuId) || skus[0];
    if (activeSku) {
      const res = solveCartonPacking(
        activeSku.length,
        activeSku.width,
        activeSku.height,
        activeSku.weight,
        cartonLength,
        cartonWidth,
        cartonHeight,
        cartonEmptyWeight,
        true
      );
      setSimResult(res);
    }
  }, [selectedSkuId, cartonLength, cartonWidth, cartonHeight, cartonEmptyWeight, skus]);

  // Export Simulated Carton to main loader
  const handleExportCartonSpec = () => {
    if (!simResult) return;

    const exportData = {
      name: `Box [SIM] ${selectedSkuId ? skus.find(s => s.id === selectedSkuId)?.name : 'Cargo'} Packed`,
      length: cartonLength,
      width: cartonWidth,
      height: cartonHeight,
      weight: parseFloat(simResult.grossWeight.toFixed(2)),
      itemsPacked: simResult.totalItems,
      skuCode: selectedSkuId ? skus.find(s => s.id === selectedSkuId)?.skuCode : ''
    };

    // Store in localStorage so floor/pallet tabs can read it
    localStorage.setItem('sfg_simulated_carton', JSON.stringify(exportData));
    
    // Dispatch event to notify other tabs
    window.dispatchEvent(new Event('simulatedCartonUpdated'));

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 4000);
  };

  // Handle Save SKU (Insert or Update)
  const handleSaveSKU = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuCode || !skuName) {
      alert('กรุณากรอกรหัส SKU และชื่อสินค้า');
      return;
    }

    try {
      setLoading(true);
      await saveSKU({
        id: editingId || undefined,
        skuCode: skuCode.trim(),
        name: skuName.trim(),
        length: skuLength,
        width: skuWidth,
        height: skuHeight,
        weight: skuWeight,
        category: skuCategory,
        description: skuDescription,
        packagingType: skuPackagingType,
        loadBearingPct: skuLoadBearingPct,
        stackClass: skuStackClass,
      });

      // Clear Form
      setSkuCode('');
      setSkuName('');
      setSkuDescription('');
      setEditingId(null);
      setFormSuccess(editingId ? 'อัปเดต SKU เรียบร้อย!' : 'เพิ่ม SKU ลงระบบคลาวด์สำเร็จ!');
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  // Handle Edit filling
  const handleEditSKU = (sku: SKUItem) => {
    const inferred = inferPackagingSpecs(sku);
    setEditingId(sku.id);
    setSkuCode(sku.skuCode);
    setSkuName(sku.name);
    setSkuLength(sku.length);
    setSkuWidth(sku.width);
    setSkuHeight(sku.height);
    setSkuWeight(sku.weight);
    setSkuCategory(sku.category || 'General');
    setSkuDescription(sku.description || '');
    setSkuPackagingType(inferred.packagingType);
    setSkuLoadBearingPct(inferred.loadBearingPct);
    setSkuStackClass(inferred.stackClass);
  };

  // Handle Delete SKU
  const handleDeleteSKU = async (id: string) => {
    if (window.confirm('คุณแน่ใจว่าต้องการลบ SKU นี้ออกจากคลาวด์ใช่หรือไม่?')) {
      try {
        setLoading(true);
        await deleteSKU(id);
      } catch (err) {
        console.error(err);
        alert('ลบล้มเหลว');
      } finally {
        setLoading(false);
      }
    }
  };

  // Google Sheets Import
  const handleSyncGoogleSheet = async () => {
    if (!sheetUrl) {
      alert('กรุณากรอกลิงก์ Google Sheets');
      return;
    }

    setSyncStatus('syncing');
    setSyncErrorMsg('');
    try {
      const items = await fetchGoogleSheetSKUs(sheetUrl);
      if (items.length === 0) {
        throw new Error('ไม่พบข้อมูล SKU ในตาราง กรุณาตรวจสอบหัวคอลัมน์');
      }

      let count = 0;
      for (const item of items) {
        await saveSKU(item);
        count++;
      }

      setSyncCount(count);
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 5000);
    } catch (err: any) {
      console.error(err);
      setSyncStatus('error');
      setSyncErrorMsg(err.message || 'เกิดข้อผิดพลาดในการนำเข้าไฟล์');
    }
  };

  const categories = ['all', ...Array.from(new Set(skus.map((s) => s.category || 'General')))];

  const filteredSkus = skus.filter((sku) => {
    const matchesSearch =
      sku.skuCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sku.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sku.description && sku.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || (sku.category || 'General') === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // --- Cardboard Stacking Strength calculations (McKee's Formula) ---
  const perimeterMm = 2 * (cartonLength + cartonWidth) * 10;
  const activeGrade = CARDBOARD_GRADES.find(g => g.id === cardboardGrade) || CARDBOARD_GRADES[2];
  
  // McKee's Formula: BCT (Newtons) = 5.87 * activeGrade.ect * sqrt(perimeterMm * activeGrade.thicknessMm)
  const bctNewtons = 5.87 * activeGrade.ect * Math.sqrt(perimeterMm * activeGrade.thicknessMm);
  const bctKg = bctNewtons / 9.80665; // N to kgf
  
  // Safety factor calculation
  let calculatedSf = 3.0; // Base safety factor
  
  if (storageTime === '1w') calculatedSf += 0.0;
  else if (storageTime === '4w') calculatedSf += 0.5;
  else if (storageTime === '6m') calculatedSf += 1.0;
  else if (storageTime === 'long') calculatedSf += 1.5;
  
  if (humidity === 'dry') calculatedSf += 0.0;
  else if (humidity === 'std') calculatedSf += 0.5;
  else if (humidity === 'high') calculatedSf += 1.2;
  else if (humidity === 'wet') calculatedSf += 2.2;
  
  if (stackPattern === 'column') calculatedSf += 0.0;
  else if (stackPattern === 'interlock') calculatedSf += 1.0;
  else if (stackPattern === 'overhang') calculatedSf += 1.8;
  
  // Safe load limit
  const safeLoadKg = bctKg / calculatedSf;
  
  // Max stacking layers
  const grossWeightVal = simResult ? simResult.grossWeight : 0;
  let maxSafeLayers = 1;
  if (grossWeightVal > 0) {
    maxSafeLayers = 1 + Math.floor(safeLoadKg / grossWeightVal);
  }
  const maxSafeHeightCm = maxSafeLayers * cartonHeight;

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Navigation sub-tabs */}
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm max-w-md">
        <button
          onClick={() => setActiveSubSection('database')}
          className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubSection === 'database' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" />
          ฐานข้อมูล SKU (Cloud Database)
        </button>
        <button
          onClick={() => setActiveSubSection('simulation')}
          className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubSection === 'simulation' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Box className="w-4 h-4" />
          คำนวณลงลังบรรจุ (Carton Packing)
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubSection === 'database' ? (
          <motion.div
            key="db"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Sheet Sync & Creator Form */}
            <div className="lg:col-span-4 space-y-6">
              {/* Sheet Sync */}
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs">ซิงค์กับ Google Sheets</h3>
                    <p className="text-[10px] text-slate-400">นำเข้าคลังสินค้าขนาดใหญ่ในคลิกเดียว</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Google Sheet Share Link</label>
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncGoogleSheet}
                    disabled={syncStatus === 'syncing'}
                    className={`w-full py-2 px-4 rounded-xl font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                      syncStatus === 'syncing' ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    {syncStatus === 'syncing' ? 'กำลังอัปเดตระบบ...' : 'ดึงข้อมูล Google Sheet'}
                  </button>

                  <AnimatePresence>
                    {syncStatus === 'success' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex gap-2 text-emerald-800 text-[11px]"
                      >
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">ซิงค์สำเร็จ!</span>
                          <p className="mt-0.5">นำเข้า SKU ใหม่สำเร็จจำนวน {syncCount} รายการ</p>
                        </div>
                      </motion.div>
                    )}

                    {syncStatus === 'error' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-red-800 text-[11px]"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">อัปเดตล้มเหลว</span>
                          <p className="mt-0.5">{syncErrorMsg}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Add / Edit Form */}
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Plus className="w-5 h-5 text-teal-600" />
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs">
                      {editingId ? 'แก้ไขข้อมูลสินค้า SKU' : 'เพิ่มสินค้า SKU ใหม่'}
                    </h3>
                    <p className="text-[10px] text-slate-400">จัดเก็บถาวรและดึงมาเรียงตู้อัตโนมัติ</p>
                  </div>
                </div>

                <form onSubmit={handleSaveSKU} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">รหัสสินค้า / SKU *</label>
                      <input
                        type="text"
                        required
                        disabled={editingId !== null}
                        value={skuCode}
                        onChange={(e) => setSkuCode(e.target.value)}
                        placeholder="e.g. 12/425 SQ"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">หมวดหมู่ / Category</label>
                      <input
                        type="text"
                        value={skuCategory}
                        onChange={(e) => setSkuCategory(e.target.value)}
                        placeholder="e.g. SQ"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">ชื่อสินค้าภาษาไทย / SKU Name *</label>
                    <input
                      type="text"
                      required
                      value={skuName}
                      onChange={(e) => setSkuName(e.target.value)}
                      placeholder="e.g. 12/15oz. SQ เตี้ย"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ['ยาว (ซม.)', 'skuLength', skuLength, setSkuLength],
                      ['กว้าง (ซม.)', 'skuWidth', skuWidth, setSkuWidth],
                      ['สูง (ซม.)', 'skuHeight', skuHeight, setSkuHeight],
                      ['น.น. (กก.)', 'skuWeight', skuWeight, setSkuWeight],
                    ].map(([lbl, key, val, setVal]) => (
                      <div key={key}>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1 text-center">{lbl}</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={val as number}
                          onChange={(e) => (setVal as any)(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-1 py-1.5 text-xs text-center outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">ประเภทบรรจุภัณฑ์ (Packaging Design)</label>
                      <select
                        value={skuStackClass}
                        onChange={(e) => {
                          const cls = e.target.value as PackagingLoadClass;
                          setSkuStackClass(cls);
                          if (cls === 'heavy_100') {
                            setSkuLoadBearingPct(100);
                            setSkuPackagingType('5-Ply Heavy Carton (ลังลูกฟูก 5 ชั้น แข็งแรง 100%)');
                          } else if (cls === 'medium_70') {
                            setSkuLoadBearingPct(75);
                            setSkuPackagingType('3-Ply Standard Carton (ลังลูกฟูก 3 ชั้น มาตรฐาน)');
                          } else if (cls === 'light_40') {
                            setSkuLoadBearingPct(50);
                            setSkuPackagingType('Shrink Film Pack (แพ็คฟิล์มหด)');
                          } else {
                            setSkuLoadBearingPct(30);
                            setSkuPackagingType('Tray / Open Pack (ถาดโชว์/ห้ามทับหนัก)');
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="heavy_100">🛡️ ลังแข็งแรงพิเศษ 5 ชั้น (รับน้ำหนักฐาน 100%)</option>
                        <option value="medium_70">📦 ลังมาตรฐาน 3 ชั้น (รับน้ำหนักปานกลาง 75%)</option>
                        <option value="light_40">🎞️ แพ็คฟิล์มหด Shrink Film (รับแรงกด 50%)</option>
                        <option value="fragile_top">⚠️ ถาด Tray / เปราะบาง (วางชั้นบนสุด 30%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">พิกัดรับน้ำหนักกดทับ (% Load Bearing)</label>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={skuLoadBearingPct}
                          onChange={(e) => setSkuLoadBearingPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                          className="w-full bg-transparent text-xs font-extrabold text-teal-700 text-center outline-none"
                        />
                        <span className="text-xs font-bold text-slate-400">%</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">คำอธิบายเพิ่มเติม</label>
                    <textarea
                      value={skuDescription}
                      onChange={(e) => setSkuDescription(e.target.value)}
                      placeholder="ข้อมูลบันทึกความจำสเปคสินค้าทั่วไป..."
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    />
                  </div>

                  {formSuccess && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 text-teal-800 text-[11px] font-bold text-center">
                      {formSuccess}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setSkuCode('');
                          setSkuName('');
                          setSkuDescription('');
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                    )}
                    <button
                      type="submit"
                      className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      {editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม SKU ลงระบบ'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* SKU Table list */}
            <div className="lg:col-span-8 bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">สารบบสินค้าคลาวด์ทั้งหมด</h3>
                  <p className="text-xs text-slate-400">คลิกที่สินค้าเพื่อเลือกใช้งานสำหรับการบรรจุลงลังหรือตู้</p>
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหารหัส หรือชื่อ SKU..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none w-44 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'all' ? 'หมวดหมู่ทั้งหมด' : cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <th className="p-3">รหัสสินค้า / SKU</th>
                      <th className="p-3">ชื่อสินค้าภาษาไทย</th>
                      <th className="p-3 text-center">ขนาด (L×W×H)</th>
                      <th className="p-3 text-center">น.น. (กก.)</th>
                      <th className="p-3 text-center">การออกแบบบรรจุภัณฑ์ / รับน้ำหนัก</th>
                      <th className="p-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-slate-400 font-medium">
                          กำลังดึงคลังสินค้าเรียลไทม์...
                        </td>
                      </tr>
                    ) : filteredSkus.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-slate-400 font-medium">
                          ไม่พบข้อมูลสินค้าที่ต้องการค้นหา
                        </td>
                      </tr>
                    ) : (
                      filteredSkus.map((sku) => (
                        <tr
                          key={sku.id}
                          onClick={() => {
                            setSelectedSkuId(sku.id);
                            if (onSelectedSkuChange) onSelectedSkuChange(sku.id);
                          }}
                          className={`hover:bg-teal-50/10 border-b border-slate-100 transition-colors cursor-pointer ${
                            selectedSkuId === sku.id ? 'bg-teal-50/20' : ''
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-slate-800">{sku.skuCode}</td>
                          <td className="p-3 font-semibold text-slate-700">{sku.name}</td>
                          <td className="p-3 text-center text-slate-500 font-medium font-mono">
                            {sku.length} × {sku.width} × {sku.height} ซม.
                          </td>
                          <td className="p-3 text-center text-slate-800 font-bold font-mono">{sku.weight}</td>
                          <td className="p-3 text-center">
                            {(() => {
                              const inf = inferPackagingSpecs(sku);
                              const badgeColor =
                                inf.loadBearingPct >= 100
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : inf.loadBearingPct >= 70
                                  ? 'bg-sky-100 text-sky-800 border-sky-200'
                                  : inf.loadBearingPct >= 50
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-200';
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`border font-extrabold px-2 py-0.5 rounded-full text-[10px] ${badgeColor}`}>
                                    รับแรงกด {inf.loadBearingPct}% ({sku.category || 'Std'})
                                  </span>
                                  <span className="text-[9px] text-slate-400 truncate max-w-[140px]">
                                    {inf.packagingType}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEditSKU(sku)}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-teal-600 rounded transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSKU(sku.id)}
                              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sim"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6"
          >
            {/* Left Column: Settings wrapper */}
            <div className="md:col-span-4 space-y-4">
              {/* Carton settings input panel */}
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Box className="w-5 h-5 text-teal-600" />
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs">ขนาดและสินค้าที่บรรจุ</h3>
                    <p className="text-[10px] text-slate-400">ขนาดลังกระดาษและสินค้าที่นำมาจำลองใส่</p>
                  </div>
                </div>

                <div className="space-y-4 font-medium">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">เลือกสินค้าที่ต้องการจำลอง</label>
                    <select
                      value={selectedSkuId}
                      onChange={(e) => setSelectedSkuId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.length}×{s.width}×{s.height} ซม.)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['ความยาวลัง (ซม.)', cartonLength, setCartonLength],
                      ['ความกว้างลัง (ซม.)', cartonWidth, setCartonWidth],
                      ['ความสูงลัง (ซม.)', cartonHeight, setCartonHeight],
                      ['น.น. ลังเปล่า (กก.)', cartonEmptyWeight, setCartonEmptyWeight],
                    ].map(([lbl, val, setVal]) => (
                      <div key={lbl as string}>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">{lbl as string}</label>
                        <input
                          type="number"
                          value={val as number}
                          onChange={(e) => (setVal as React.Dispatch<React.SetStateAction<number>>)(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cardboard Specs & Material Settings */}
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Shield className="w-5 h-5 text-teal-600" />
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs">เกรดและปัจจัยการรับแรง</h3>
                    <p className="text-[10px] text-slate-400">สเปกกระดาษลอนและสภาวะจัดเก็บ</p>
                  </div>
                </div>

                <div className="space-y-3.5 font-medium text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">เกรดลังกระดาษลูกฟูก (Corrugated Grade)</label>
                    <select
                      value={cardboardGrade}
                      onChange={(e) => setCardboardGrade(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {CARDBOARD_GRADES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[9px] text-slate-500 leading-normal">
                      <p className="font-bold text-teal-600">กระดาษ: {activeGrade.typicalPaper}</p>
                      <p className="mt-0.5">ความหนาลอน: {activeGrade.thicknessMm} มม. | ECT: {activeGrade.ect} kN/m</p>
                      <p className="mt-0.5 text-slate-400 italic">★ {activeGrade.description}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">ระยะเวลาในการซ้อนทับ (Storage Time)</label>
                    <select
                      value={storageTime}
                      onChange={(e) => setStorageTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      <option value="1w">น้อยกว่า 1 สัปดาห์ (หมุนเวียนเร็ว)</option>
                      <option value="4w">1 ถึง 4 สัปดาห์ (ระยะสั้นทั่วไป)</option>
                      <option value="6m">1 ถึง 6 เดือน (ระยะปานกลาง-นาน)</option>
                      <option value="long">มากกว่า 6 เดือน (ระยะยาวพิเศษ)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">ความชื้นสัมพัทธ์โดยเฉลี่ย (Relative Humidity)</label>
                    <select
                      value={humidity}
                      onChange={(e) => setHumidity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      <option value="dry">ต่ำกว่า 50% RH (ห้องปรับอากาศ / แห้ง)</option>
                      <option value="std">50% - 70% RH (คลังสินค้าถ่ายเทดีมาตรฐาน)</option>
                      <option value="high">70% - 90% RH (คลังสินค้าปิดทึบ สภาพเขตร้อน)</option>
                      <option value="wet">มากกว่า 90% RH (ห้องเย็น / ขนส่งทางเรือชื้นสูง)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">วิธีการจัดเรียงซ้อน (Stacking Pattern)</label>
                    <select
                      value={stackPattern}
                      onChange={(e) => setStackPattern(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      <option value="column">วางตรงแนวคอลัมน์ 100% (Column Stack)</option>
                      <option value="interlock">สลับสลักลายประสานไขว้ (Interlocking)</option>
                      <option value="overhang">มีขอบยื่นนอกพาเลท (Pallet Overhang)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Packing simulation results & Cardboard Strength results */}
            <div className="md:col-span-8 space-y-4">
              {/* Packing results */}
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">บทวิเคราะห์ประสิทธิภาพการจัดเรียงลงลัง</h3>
                  <p className="text-xs text-slate-400">สรุปความหนาแน่นและข้อมูลจำลองการซ้อนกล่อง</p>
                </div>

                {simResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        ['จำนวนจุรวม', `${simResult.totalItems} ชิ้น`, 'text-teal-600'],
                        ['ปริมาตรบรรจุรวม', `${simResult.packedVolume.toFixed(2)} ลบ.ม.`, 'text-slate-800'],
                        ['ประสิทธิภาพพื้นที่', `${(simResult.volumeEfficiency * 100).toFixed(1)}%`, 'text-emerald-600'],
                        ['น้ำหนักรวมกล่อง', `${simResult.grossWeight.toFixed(2)} กก.`, 'text-amber-600'],
                      ].map(([k, v, colorClass]) => (
                        <div key={k} className="bg-slate-50 border border-slate-100 rounded-xl p-4 shadow-sm/20 text-center">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">{k}</div>
                          <div className={`text-base font-extrabold ${colorClass}`}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="text-xs text-slate-600 leading-relaxed font-medium bg-teal-50/20 border border-teal-500/10 rounded-xl p-4">
                      📌 <strong>คำแนะนำการแพ็คลงลัง:</strong>
                      <br />
                      จัดเรียงกล่องสินค้าได้สูงสุดจำนวน <strong>{simResult.totalItems} ชิ้น</strong> โดยจัดซ้อนตามยาวจำนวน{' '}
                      <strong>{simResult.itemsPerLayer} ชิ้นต่อชั้น</strong> เป็นจำนวนทั้งหมด{' '}
                      <strong>{simResult.layersCount} ชั้น</strong> แนะนำวางทิศทางทางราบเพื่อลดการโคลงและยุบตัวของลังไม้
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleExportCartonSpec}
                        className="flex-1 cursor-pointer bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        ใช้ขนาดและน้ำหนักลังนี้ ในโปรแกรมเรียงตู้/พาเลท
                      </button>
                    </div>

                    <AnimatePresence>
                      {exportSuccess && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] p-2.5 rounded-xl flex items-center gap-1.5 font-semibold"
                        >
                          <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                          ส่งออกสเปกกล่องสำเร็จ! สลับไปที่แท็บ 'คำนวณการโหลดสินค้า' หรือ 'คำนวณเรียงพื้นรถ' เพื่อนำเข้าใช้งาน
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">กำลังวิเคราะห์ข้อมูลจำลอง...</div>
                )}
              </div>

              {/* Cardboard Load Strength & Box Compression Test Analysis */}
              {simResult && (
                <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Scale className="w-5 h-5 text-teal-600" />
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-sm">การประเมินการรับแรงกดทับและความแข็งแรงกล่อง (McKee Model)</h3>
                        <p className="text-xs text-slate-400">คำนวณกำลังต้านทานการยุบตัวของกล่องกระดาษสำหรับการเรียงซ้อนเก็บในคลัง</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-slate-100 font-bold px-2.5 py-1 rounded-full text-slate-600">
                      เส้นรอบรูป: {perimeterMm} มม.
                    </span>
                  </div>

                  {/* Stacking Safety Warning / Safe Status Badge */}
                  {maxSafeLayers >= simResult.layersCount ? (
                    <div className="bg-emerald-50 border border-emerald-500/10 rounded-2xl p-4 flex items-start gap-3">
                      <div className="p-1 bg-emerald-500 text-white rounded-full mt-0.5 shrink-0">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                      <div className="text-xs text-emerald-800 leading-relaxed font-medium">
                        <p className="font-bold text-emerald-900 text-sm">✓ โครงสร้างความแข็งแรงปลอดภัยสูง (SAFE STACKING)</p>
                        <p className="mt-1">
                          ลังลูกฟูกที่เลือกมีความสามารถในการซ้อนทับได้อย่างปลอดภัยสูงสุดถึง{' '}
                          <strong className="text-base text-emerald-700">{maxSafeLayers} ชั้น</strong> ({ (maxSafeHeightCm / 100).toFixed(2) } ม.)
                          ซึ่งสูงกว่าจำนวนชั้นที่บรรจุจริงจำนวน <strong>{simResult.layersCount} ชั้น</strong> แนะนำสำหรับการจัดวางซ้อนได้อย่างมั่นใจ
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-500/10 rounded-2xl p-4 flex items-start gap-3">
                      <div className="p-1 bg-amber-500 text-white rounded-full mt-0.5 shrink-0 animate-bounce">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <div className="text-xs text-amber-800 leading-relaxed font-medium">
                        <p className="font-bold text-amber-900 text-sm">⚠️ มีความเสี่ยงต่อการเสียรูปหรือกล่องบุบยุบตัว (OVERLOAD RISK)</p>
                        <p className="mt-1">
                          กล่องชั้นล่างสุดจะรับภาระซ้อนสูงเกินพิกัดปลอดภัย! ขีดจำกัดความปลอดภัยอยู่ที่{' '}
                          <strong className="text-base text-amber-600">{maxSafeLayers} ชั้น</strong> เท่านั้น 
                          แต่มีการจัดเรียงจริงถึง <strong>{simResult.layersCount} ชั้น</strong> 
                          ส่งผลให้น้ำหนักกดทับจริงที่กล่องล่างอยู่ที่{' '}
                          <strong className="text-amber-700">{((simResult.layersCount - 1) * simResult.grossWeight).toFixed(1)} กก.</strong>{' '}
                          ซึ่งเกินกว่าระดับน้ำหนักปลอดภัยที่รับได้สูงสุด (<strong className="text-teal-700">{safeLoadKg.toFixed(1)} กก.</strong>)
                        </p>
                        <p className="mt-1.5 font-bold text-slate-700">
                          💡 คำแนะนำทางเทคนิค: เปลี่ยนเกรดกล่องเป็น 5 ชั้นแข็งแรงสูง หรือใช้กล่องที่มีค่า ECT ตั้งแต่{' '}
                          {((simResult.grossWeight * (simResult.layersCount - 1) * calculatedSf * 9.80665) / (5.87 * Math.sqrt(perimeterMm * activeGrade.thicknessMm))).toFixed(1)} kN/m ขึ้นไป
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      [
                        'แรงต้านกดสูงสุด (BCT)', 
                        `${bctKg.toFixed(1)} กก.`, 
                        'text-teal-600', 
                        'Lab BCT Value',
                        'ค่าต้านทานการกดสูงสุดของกล่องใบเดียวในอุดมคติจากการทดสอบกดตรง'
                      ],
                      [
                        'ตัวคูณเพื่อความปลอดภัย', 
                        `${calculatedSf.toFixed(1)}x`, 
                        'text-indigo-600', 
                        'Safety Factor (SF)',
                        'คำนวณตามสภาวะความชื้น ระยะเวลาที่วาง และรูปแบบมัดซ้อนรวมกัน'
                      ],
                      [
                        'น้ำหนักรับทับปลอดภัย', 
                        `${safeLoadKg.toFixed(1)} กก.`, 
                        'text-emerald-600', 
                        'Safe Stacking Load',
                        'พิกัดรับน้ำหนักกดทับรวมของกล่องใบล่างสุดที่รับได้ในสภาพจริง'
                      ],
                      [
                        'จำนวนชั้นปลอดภัย', 
                        `${maxSafeLayers} ชั้น`, 
                        'text-amber-600', 
                        'Max Safe Layers',
                        'จำนวนชั้นสูงสุดของการซ้อนกล่องประเภทนี้โดยไม่เสี่ยงต่อการพังทลาย'
                      ]
                    ].map(([label, val, colorClass, sub, tooltip]) => (
                      <div key={label as string} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center flex flex-col justify-between relative group hover:bg-slate-100/50 transition-colors">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{label as string}</span>
                          <span className="text-[8px] text-slate-400 block font-semibold">{sub as string}</span>
                        </div>
                        <span className={`text-sm lg:text-base font-black mt-2 ${colorClass as string}`}>{val as string}</span>
                        <div className="hidden group-hover:block absolute z-20 bottom-full left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] rounded-lg p-2 w-44 shadow-lg text-left leading-normal mb-1">
                          {tooltip as string}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-1">
                    <div className="flex gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        <strong>เกี่ยวกับการคำนวณ:</strong> ค่ากำลังกดทับ (Box Compression Test - BCT) คำนวณโดยใช้ทฤษฎี McKee's Equation ของสมาคมกระดาษบรรจุภัณฑ์สากล 
                        ซึ่งเป็นค่ามาตรฐานที่บริษัทโลจิสติกส์และผู้ผลิตกล่องกระดาษทั่วโลกใช้ออกแบบและวิเคราะห์เพื่อความปลอดภัยของสินค้าในห่วงโซ่อุปทาน
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
