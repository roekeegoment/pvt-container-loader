import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getSKUs, 
  saveSKU, 
  deleteSKU, 
  listenToSKUs, 
  fetchGoogleSheetSKUs, 
  SKUItem 
} from '../utils/firebaseDb';
import { solveCartonPacking, CartonPackingResult } from '../utils/packingSolver';
import { ContainerVisualizer } from './ContainerVisualizer';
import { 
  Database, 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  Search, 
  Box, 
  Package, 
  Layers, 
  Weight, 
  TrendingUp, 
  Sparkles, 
  Info, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  BookmarkCheck
} from 'lucide-react';

const CARTON_PRESETS = [
  { id: 'carton-s', name: 'Small Carton (กล่องขนาดเล็ก)', length: 30, width: 20, height: 20, emptyWeight: 0.3 },
  { id: 'carton-m', name: 'Medium Box (กล่องขนาดกลาง)', length: 40, width: 30, height: 30, emptyWeight: 0.5 },
  { id: 'carton-l', name: 'Large Crate (ลังไม้ขนาดใหญ่)', length: 60, width: 40, height: 40, emptyWeight: 1.5 },
  { id: 'custom-carton', name: 'Custom Box Dimensions (กล่องกำหนดเอง)', length: 50, width: 35, height: 30, emptyWeight: 0.8 }
];

export const SKUTab: React.FC = () => {
  // Navigation states
  const [activeSubSection, setActiveSubSection] = useState<'database' | 'simulation'>('database');
  
  // SKU List State
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRealtime, setIsRealtime] = useState<boolean>(true);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [skuCode, setSkuCode] = useState<string>('');
  const [skuName, setSkuName] = useState<string>('');
  const [skuLength, setSkuLength] = useState<number>(15);
  const [skuWidth, setSkuWidth] = useState<number>(10);
  const [skuHeight, setSkuHeight] = useState<number>(8);
  const [skuWeight, setSkuWeight] = useState<number>(0.4);
  const [skuCategory, setSkuCategory] = useState<string>('General');
  const [skuDescription, setSkuDescription] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Google Sheet Sync State
  const [sheetUrl, setSheetUrl] = useState<string>('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncCount, setSyncCount] = useState<number>(0);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');

  // Carton Simulation State
  const [selectedCartonId, setSelectedCartonId] = useState<string>('carton-m');
  const [cartonLength, setCartonLength] = useState<number>(40);
  const [cartonWidth, setCartonWidth] = useState<number>(30);
  const [cartonHeight, setCartonHeight] = useState<number>(30);
  const [cartonEmptyWeight, setCartonEmptyWeight] = useState<number>(0.5);
  
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [simResult, setSimResult] = useState<CartonPackingResult | null>(null);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  // Load SKUs
  useEffect(() => {
    let unsubscribe: () => void = () => {};

    if (isRealtime) {
      setLoading(true);
      unsubscribe = listenToSKUs((updatedSkus) => {
        setSkus(updatedSkus);
        setLoading(false);
      });
    } else {
      setLoading(true);
      getSKUs().then((loadedSkus) => {
        setSkus(loadedSkus);
        setLoading(false);
      }).catch(err => {
        console.error(err);
        setLoading(false);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [isRealtime]);

  // Handle Preset Carton Selection
  useEffect(() => {
    const preset = CARTON_PRESETS.find(c => c.id === selectedCartonId);
    if (preset && selectedCartonId !== 'custom-carton') {
      setCartonLength(preset.length);
      setCartonWidth(preset.width);
      setCartonHeight(preset.height);
      setCartonEmptyWeight(preset.emptyWeight);
    }
  }, [selectedCartonId]);

  // Set default SKU for simulation when SKU list loads
  useEffect(() => {
    if (skus.length > 0 && !selectedSkuId) {
      setSelectedSkuId(skus[0].id);
    }
  }, [skus]);

  // Run carton packing simulation
  const runSimulation = () => {
    let l = skuLength, w = skuWidth, h = skuHeight, wt = skuWeight;

    // If a SKU is selected, load its values
    if (selectedSkuId) {
      const activeSku = skus.find(s => s.id === selectedSkuId);
      if (activeSku) {
        l = activeSku.length;
        w = activeSku.width;
        h = activeSku.height;
        wt = activeSku.weight;
      }
    }

    const result = solveCartonPacking(
      l, w, h, wt,
      cartonLength, cartonWidth, cartonHeight,
      cartonEmptyWeight,
      true
    );

    setSimResult(result);
  };

  // Run simulation automatically when inputs change
  useEffect(() => {
    if (skus.length > 0 || selectedSkuId) {
      runSimulation();
    }
  }, [selectedCartonId, cartonLength, cartonWidth, cartonHeight, cartonEmptyWeight, selectedSkuId, skus]);

  // Save SKU form handler
  const handleSaveSKU = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuCode || !skuName) {
      alert('กรุณากรอกรหัสสินค้า SKU และชื่อสินค้า');
      return;
    }

    try {
      setLoading(true);
      await saveSKU({
        skuCode: skuCode.trim(),
        name: skuName.trim(),
        length: skuLength,
        width: skuWidth,
        height: skuHeight,
        weight: skuWeight,
        category: skuCategory,
        description: skuDescription,
      });

      // Reset form
      setSkuCode('');
      setSkuName('');
      setSkuDescription('');
      setEditingId(null);
      setFormSuccess(editingId ? 'อัปเดต SKU สำเร็จ!' : 'เพิ่ม SKU ลงในฐานข้อมูลสำเร็จ!');
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  // Edit SKU filler
  const handleEditSKU = (sku: SKUItem) => {
    setEditingId(sku.id);
    setSkuCode(sku.skuCode);
    setSkuName(sku.name);
    setSkuLength(sku.length);
    setSkuWidth(sku.width);
    setSkuHeight(sku.height);
    setSkuWeight(sku.weight);
    setSkuCategory(sku.category || 'General');
    setSkuDescription(sku.description || '');
  };

  // Delete SKU handler
  const handleDeleteSKU = async (id: string) => {
    if (window.confirm('คุณต้องการลบ SKU นี้ออกจากฐานข้อมูลใช่หรือไม่?')) {
      try {
        setLoading(true);
        await deleteSKU(id);
      } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการลบ');
      } finally {
        setLoading(false);
      }
    }
  };

  // Google Sheet CSV Syncer
  const handleSyncGoogleSheet = async () => {
    if (!sheetUrl) {
      alert('กรุณากรอก Google Sheet Link');
      return;
    }

    setSyncStatus('syncing');
    setSyncErrorMsg('');
    try {
      const items = await fetchGoogleSheetSKUs(sheetUrl);
      if (items.length === 0) {
        throw new Error('ไม่พบข้อมูล SKU ใน Sheet กรุณาตรวจสอบหัวตาราง (SKU, Name, Length, Width, Height, Weight)');
      }

      // Save each item to Firestore
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
      setSyncErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ หรือ รูปแบบไฟล์ไม่ถูกต้อง');
    }
  };

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

  // Categories list
  const categories = ['all', ...Array.from(new Set(skus.map(s => s.category || 'General')))];

  // Filtered SKUs
  const filteredSkus = skus.filter(sku => {
    const matchesSearch = 
      sku.skuCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sku.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sku.description && sku.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = 
      categoryFilter === 'all' || 
      (sku.category || 'General') === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      
      {/* Interactive Sub-Tabs switcher */}
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm max-w-md">
        <button
          onClick={() => setActiveSubSection('database')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 ${
            activeSubSection === 'database'
              ? 'bg-teal-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" />
          ฐานข้อมูล SKU (Cloud Database)
        </button>
        <button
          onClick={() => setActiveSubSection('simulation')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 ${
            activeSubSection === 'simulation'
              ? 'bg-teal-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Box className="w-4 h-4" />
          จัดของลงลัง (Carton Packing)
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubSection === 'database' ? (
          <motion.div
            key="database-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* LEFT COLUMN: Google Sheet Linker & SKU Editor */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Google Sheets Sync Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                    <FileSpreadsheet className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs">นำเข้าข้อมูลจาก Google Sheets</h3>
                    <p className="text-[10px] text-slate-400">อัปเดต SKU แบบเรียลไทม์ผ่านลิงก์แชร์ CSV</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Google Sheet Share Link (แชร์แบบทุกคนมีสิทธิ์อ่าน)</label>
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
                    className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                      syncStatus === 'syncing'
                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin text-slate-400' : 'text-emerald-200'}`} />
                    {syncStatus === 'syncing' ? 'กำลังเชื่อมต่อและนำเข้า...' : 'ดึงข้อมูลจาก Google Sheet'}
                  </button>

                  {/* Guide and status alerts */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[10px] text-slate-500 space-y-1.5 leading-relaxed">
                    <span className="font-bold block text-slate-700">คำแนะนำรูปแบบคอลัมน์ของ Google Sheets:</span>
                    <p>
                      แถวแรกต้องเป็นชื่อคอลัมน์ภาษาอังกฤษ: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">SKU</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Name</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Length</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Width</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Height</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Weight</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Category</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Description</code>
                    </p>
                  </div>

                  <AnimatePresence>
                    {syncStatus === 'success' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-emerald-800 text-[11px]"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">เชื่อมโยงเสร็จสมบูรณ์!</span>
                          <p className="mt-0.5">ดึงข้อมูลและอัปเดต SKU สำเร็จทั้งหมด {syncCount} รายการเข้าสู่ระบบคลาวด์</p>
                        </div>
                      </motion.div>
                    )}

                    {syncStatus === 'error' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 text-red-800 text-[11px]"
                      >
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">การซิงค์ล้มเหลว</span>
                          <p className="mt-0.5">{syncErrorMsg}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              </div>

              {/* SKU Editor / Form Creator */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="p-1.5 bg-teal-50 rounded-lg text-teal-600">
                    <Plus className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs">
                      {editingId ? 'แก้ไขข้อมูล SKU (Edit SKU Details)' : 'เพิ่ม SKU ใหม่แบบกรอกเอง (Create SKU)'}
                    </h3>
                    <p className="text-[10px] text-slate-400">บันทึกข้อมูลเข้าระบบฐานข้อมูล Cloud Firestore</p>
                  </div>
                </div>

                <form onSubmit={handleSaveSKU} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">รหัสสินค้า / SKU Code *</label>
                      <input
                        type="text"
                        required
                        disabled={editingId !== null}
                        value={skuCode}
                        onChange={(e) => setSkuCode(e.target.value)}
                        placeholder="e.g. MOTOR-A24"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">หมวดหมู่ / Category</label>
                      <input
                        type="text"
                        value={skuCategory}
                        onChange={(e) => setSkuCategory(e.target.value)}
                        placeholder="e.g. Spare Parts"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">ชื่อเรียกสินค้า / SKU Name *</label>
                    <input
                      type="text"
                      required
                      value={skuName}
                      onChange={(e) => setSkuName(e.target.value)}
                      placeholder="e.g. มอเตอร์ไฟฟ้ากระแสตรง 24V"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  {/* Dimensions Box */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2.5">
                    <span className="block text-[10px] font-bold text-slate-600 border-b border-slate-200 pb-1">
                      ขนาดของผลิตภัณฑ์และน้ำหนักต่อชิ้น (Product Dimensions)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">ยาว Length (cm)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.1"
                          value={skuLength}
                          onChange={(e) => setSkuLength(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">กว้าง Width (cm)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.1"
                          value={skuWidth}
                          onChange={(e) => setSkuWidth(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">สูง Height (cm)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.1"
                          value={skuHeight}
                          onChange={(e) => setSkuHeight(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-1.5">
                      <label className="block text-[9px] text-slate-400 mb-0.5">น้ำหนักตัวสินค้า Weight (kg)</label>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={skuWeight}
                        onChange={(e) => setSkuWeight(Math.max(0.01, parseFloat(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">คำอธิบายเพิ่มเติม / Description</label>
                    <textarea
                      value={skuDescription}
                      onChange={(e) => setSkuDescription(e.target.value)}
                      placeholder="e.g. รายละเอียดบรรจุภัณฑ์ ข้อมูลพิกัด หรือข้อมูลเฉพาะวิศวกรรม"
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition"
                    >
                      {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้าลงระบบ'}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setSkuCode('');
                          setSkuName('');
                          setSkuDescription('');
                        }}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs transition"
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>
                </form>

                <AnimatePresence>
                  {formSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="bg-teal-50 border border-teal-200 text-teal-800 rounded-xl p-3 text-[11px] font-medium flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>{formSuccess}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>

            </div>

            {/* RIGHT COLUMN: Interactive SKU List & DB Grid */}
            <div className="lg:col-span-8 space-y-4">
              
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                
                {/* Search and Database Mode controls */}
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-slate-800 text-sm">รายการ SKU ในฐานข้อมูลคลาวด์ ({filteredSkus.length} ชิ้น)</h2>
                    
                    {/* Firestore Real-time status */}
                    <button
                      onClick={() => setIsRealtime(!isRealtime)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                        isRealtime 
                          ? 'bg-teal-50 border-teal-200 text-teal-600'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isRealtime ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`}></span>
                      {isRealtime ? 'เรียลไทม์ (Firestore Live)' : 'ออฟไลน์ (Local State)'}
                    </button>
                  </div>

                  {/* Filter elements */}
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหารหัส หรือ ชื่อสินค้า..."
                        className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-teal-500 w-44 md:w-56"
                      />
                    </div>

                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs outline-none text-slate-600"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat === 'all' ? 'ทุกหมวดหมู่' : cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SKU Records Grid */}
                {loading ? (
                  <div className="py-24 text-center space-y-2">
                    <RefreshCw className="w-8 h-8 text-teal-500 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400">กำลังดึงข้อมูล SKU ปลอดภัยจาก Firebase Firestore...</p>
                  </div>
                ) : filteredSkus.length === 0 ? (
                  <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                    <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-medium">ไม่พบสินค้าในระบบคลาวด์</p>
                    <p className="text-[10px] text-slate-400 mt-1">กรุณาซิงค์ข้อมูลจาก Google Sheets หรือกดสร้าง SKU ใหม่ด้านซ้าย</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-2">SKU Code / หมวด</th>
                          <th className="py-3 px-2">ชื่อสินค้า (SKU Name)</th>
                          <th className="py-3 px-2">ขนาด (Dimension)</th>
                          <th className="py-3 px-2 text-right">น้ำหนักชิ้น</th>
                          <th className="py-3 px-2 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredSkus.map((sku) => (
                          <tr key={sku.id} className="hover:bg-slate-50/50 transition text-xs">
                            <td className="py-3.5 px-2">
                              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{sku.skuCode}</span>
                              <span className="block text-[9px] text-slate-400 mt-1 font-medium">{sku.category || 'General'}</span>
                            </td>
                            <td className="py-3.5 px-2 font-medium text-slate-700 max-w-[200px]">
                              <span className="block truncate">{sku.name}</span>
                              {sku.description && (
                                <span className="block text-[9px] text-slate-400 truncate max-w-[180px] mt-0.5">{sku.description}</span>
                              )}
                            </td>
                            <td className="py-3.5 px-2 font-mono text-[11px] text-slate-600">
                              {sku.length} x {sku.width} x {sku.height} <span className="text-[10px] text-slate-400">cm</span>
                              <span className="block text-[9px] text-slate-400 mt-1">
                                ปริมาตร: {((sku.length * sku.width * sku.height) / 1000).toFixed(1)} ลิตร (L)
                              </span>
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono font-bold text-teal-700">
                              {sku.weight.toFixed(2)} kg
                            </td>
                            <td className="py-3.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditSKU(sku)}
                                  className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition"
                                  title="แก้ไขสินค้า"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSKU(sku.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                                  title="ลบออกจากฐานข้อมูล"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>

            </div>
          </motion.div>
        ) : (
          <motion.div
            key="simulation-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* LEFT COLUMN: Carton preset selection & Item Selection */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="p-1.5 bg-teal-50 rounded-lg text-teal-600">
                    <Box className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs">เลือกประเภทลัง & บรรจุภัณฑ์</h3>
                    <p className="text-[10px] text-slate-400">กำหนดพารามิเตอร์ขอบเขตของ Carton Box</p>
                  </div>
                </div>

                {/* Packaging Carton selector */}
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">ลังสินค้า (Package Carton Sizes)</label>
                    <select
                      value={selectedCartonId}
                      onChange={(e) => setSelectedCartonId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none text-slate-600 font-medium"
                    >
                      {CARTON_PRESETS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <span className="block text-[10px] font-bold text-slate-600 border-b border-slate-100 pb-1">
                      มิติภายในของกล่องบรรจุ (Carton Inner Specs)
                    </span>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">ยาว (cm)</label>
                        <input
                          type="number"
                          disabled={selectedCartonId !== 'custom-carton'}
                          value={cartonLength}
                          onChange={(e) => setCartonLength(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">กว้าง (cm)</label>
                        <input
                          type="number"
                          disabled={selectedCartonId !== 'custom-carton'}
                          value={cartonWidth}
                          onChange={(e) => setCartonWidth(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 mb-0.5">สูง (cm)</label>
                        <input
                          type="number"
                          disabled={selectedCartonId !== 'custom-carton'}
                          value={cartonHeight}
                          onChange={(e) => setCartonHeight(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-400 mb-0.5">น้ำหนักตัวกล่องเปล่า Empty Carton (kg)</label>
                      <input
                        type="number"
                        step="0.05"
                        disabled={selectedCartonId !== 'custom-carton'}
                        value={cartonEmptyWeight}
                        onChange={(e) => setCartonEmptyWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-white disabled:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none font-mono"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Product SKU Selector */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="p-1.5 bg-teal-50 rounded-lg text-teal-600">
                    <Package className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs">เลือกสินค้าบรรจุ (Select SKU)</h3>
                    <p className="text-[10px] text-slate-400">ดึงมิติขนาดโดยตรงจากฐานข้อมูล</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">สินค้าที่จะแพ็คลงกล่อง (SKU Item)</label>
                    {skus.length === 0 ? (
                      <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-start gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">ไม่พบสินค้าใน SKU DB</span>
                          <p className="mt-0.5">กรุณากลับไปเพิ่ม SKU ในระบบก่อนทำจัดของลงลัง</p>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedSkuId}
                        onChange={(e) => setSelectedSkuId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none text-slate-600 font-medium"
                      >
                        {skus.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.skuCode} - {s.name} ({s.length}x{s.width}x{s.height} cm)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Selected SKU parameters display */}
                  {selectedSkuId && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[11px] text-slate-600 space-y-1.5 font-medium">
                      <span className="block text-[10px] font-bold text-slate-700">พารามิเตอร์จำลองตัวสินค้า:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px]">มิติสินค้า:</span>
                          <span>
                            {skus.find(s => s.id === selectedSkuId)?.length}x
                            {skus.find(s => s.id === selectedSkuId)?.width}x
                            {skus.find(s => s.id === selectedSkuId)?.height} cm
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">น้ำหนักสุทธิ:</span>
                          <span className="text-teal-700 font-bold">{skus.find(s => s.id === selectedSkuId)?.weight.toFixed(2)} kg</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={runSimulation}
                    disabled={skus.length === 0}
                    className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl text-xs shadow-md shadow-teal-600/10 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-teal-200" />
                    ประมวลการคำนวณและจัดเรียงสินค้า
                  </button>

                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: 3D Visualizer and Calculated Gross Weight metrics */}
            <div className="lg:col-span-8 space-y-6">
              
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* 3D Preview (Left side inside box, 7 cols) */}
                <div className="md:col-span-7 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-teal-600 animate-pulse" />
                      <span className="font-bold text-slate-800 text-xs">พรีวิวการจัดเรียงภายในลังแบบ 3 มิติ (3D Stacking Preview)</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner h-[280px] md:h-[350px] relative">
                    {simResult && simResult.packedItems.length > 0 ? (
                      <ContainerVisualizer
                        containerLength={cartonLength}
                        containerWidth={cartonWidth}
                        containerHeight={cartonHeight}
                        items={simResult.packedItems.map((pi, idx) => ({
                          id: pi.itemId,
                          name: pi.name,
                          color: '#0d9488', // Teal-600
                          position: pi.position
                        }))}
                        title="Inner Box Load Layout"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <Box className="w-12 h-12 text-slate-700 animate-bounce mb-2" />
                        <span className="text-slate-500 font-bold text-xs">ยังไม่มีภาพการจัดเรียงสินค้า</span>
                        <p className="text-[10px] text-slate-600 max-w-xs mt-1">
                          กรุณาเลือก SKU และลังสินค้าด้านซ้ายแล้วกดปุ่มจัดเรียงเพื่อจำลองแบบ 3D ความแม่นยำสูง
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics / Gross Weight Analysis (Right side inside box, 5 cols) */}
                <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <span className="block font-bold text-slate-800 text-xs border-b border-slate-100 pb-2">
                      สรุปน้ำหนัก Gross Weight และประสิทธิภาพ
                    </span>

                    {simResult ? (
                      <div className="space-y-3.5">
                        {/* KPI 1: Gross Weight Box (CRITICAL VALUE) */}
                        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center">
                          <span className="text-[9px] font-bold text-teal-700 uppercase tracking-wider block">น้ำหนักรวมทั้งลัง (Gross Weight)</span>
                          <span className="font-mono text-3xl font-extrabold text-teal-600 block mt-1">
                            {simResult.grossWeight.toFixed(2)} <span className="text-sm font-bold">kg</span>
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            กล่องเปล่า {cartonEmptyWeight.toFixed(2)} kg + สินค้า {simResult.netCargoWeight.toFixed(2)} kg
                          </span>
                        </div>

                        {/* Breakdown List */}
                        <div className="space-y-2 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-xl">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">จำนวนที่แพ็คได้:</span>
                            <span className="font-bold text-slate-800 font-mono">{simResult.totalItems} ชิ้น</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">แถวต่อชั้น (Items/Layer):</span>
                            <span className="font-mono text-slate-700">{simResult.itemsPerLayer} ชิ้น/ชั้น</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">จำนวนชั้น (Layers):</span>
                            <span className="font-mono text-slate-700">{simResult.layersCount} ชั้น</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-slate-200 pt-1.5 mt-1.5">
                            <span className="text-slate-400">ประสิทธิภาพพื้นที่ (Vol.):</span>
                            <span className="font-bold text-teal-600 font-mono">{simResult.volumeEfficiency.toFixed(1)}%</span>
                          </div>
                        </div>

                        <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-[10px] text-slate-400 flex items-start gap-1">
                          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">
                            คำนวณมิติภายนอกสำหรับการส่งออกตู้คอนเทนเนอร์ เพื่อไม่ให้กล่องบุบหรือฉีกขาดเมื่อซ้อนทับกัน
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-400 text-xs font-medium">
                        รอดำเนินการประมวลผล...
                      </div>
                    )}
                  </div>

                  {/* Actions to Export Specifications */}
                  {simResult && simResult.totalItems > 0 && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleExportCartonSpec}
                        className="w-full bg-slate-900 hover:bg-black text-white font-semibold py-3 px-4 rounded-xl text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <BookmarkCheck className="w-4.5 h-4.5 text-teal-400" />
                        ใช้เป็นกล่องสำหรับโหลดตู้คอนเทนเนอร์
                      </button>
                      
                      <AnimatePresence>
                        {exportSuccess && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-2.5 text-[10px] text-center font-bold"
                          >
                            ✓ ส่งข้อมูลขนาดกล่องและน้ำหนักรวม {simResult.grossWeight.toFixed(2)} kg ไปยังโปรแกรมจำลองหลักเรียบร้อย!
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                </div>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
