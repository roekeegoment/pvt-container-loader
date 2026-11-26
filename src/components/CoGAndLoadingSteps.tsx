import React, { useState } from 'react';
import { CoGResult, LoadingStep } from '../types';
import { Scale, ListOrdered, CheckCircle, AlertTriangle, Activity, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface CoGAndLoadingStepsProps {
  cog: CoGResult;
  loadingSteps: LoadingStep[];
  title?: string;
  activeStepIdx?: number;
  onStepChange?: (idx: number) => void;
}

export const CoGAndLoadingSteps: React.FC<CoGAndLoadingStepsProps> = ({
  cog,
  loadingSteps,
  title = "การวิเคราะห์การจัดวางและขั้นตอนการโหลด",
  activeStepIdx,
  onStepChange
}) => {
  const [localStepIdx, setLocalStepIdx] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const isControlled = activeStepIdx !== undefined && onStepChange !== undefined;
  const currentStepIdx = isControlled ? activeStepIdx : localStepIdx;

  const setCurrentStepIdx = (val: number | ((prev: number) => number)) => {
    if (isControlled) {
      if (typeof val === 'function') {
        onStepChange(val(activeStepIdx));
      } else {
        onStepChange(val);
      }
    } else {
      setLocalStepIdx(val);
    }
  };

  const totalSteps = loadingSteps.length;
  const currentStep = loadingSteps[currentStepIdx];

  const toggleStepCompleted = (stepNumber: number) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepNumber]: !prev[stepNumber]
    }));
  };

  // Status styling helpers
  const getStatusColor = (status: 'balanced' | 'warning' | 'danger') => {
    switch (status) {
      case 'balanced':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'danger':
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  const getStatusBadge = (status: 'balanced' | 'warning' | 'danger') => {
    switch (status) {
      case 'balanced':
        return 'bg-emerald-500 text-white';
      case 'warning':
        return 'bg-amber-500 text-white';
      case 'danger':
        return 'bg-rose-500 text-white';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
            <Scale className="w-5 h-5 text-teal-600" />
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            คำนวณตำแหน่งจุดศูนย์ถ่วงแบบเรียลไทม์ (CoG) และแสดงลำดับขั้นตอนการจัดเรียงพัสดุเข้าตู้
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">
            จุดศูนย์ถ่วง: {cog.xPercent}% (L) | {cog.yPercent}% (W)
          </span>
        </div>
      </div>

      {/* Grid: Left CoG Map, Right Steps Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: CoG Visual representation */}
        <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
              <Activity className="w-4 h-4 text-teal-600" />
              แผนผังวิเคราะห์จุดศูนย์ถ่วง (CoG Map)
            </span>
            
            {/* Visual 2D Plot of Container Floor */}
            <div className="relative w-full aspect-[2.5/1] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
              {/* Reference Grid lines */}
              <div className="absolute inset-0 grid grid-cols-10 grid-rows-4 opacity-[0.15] pointer-events-none">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className="border-r border-b border-slate-900"></div>
                ))}
              </div>

              {/* Safe Zone Boundary Indicator Box */}
              {/* Balanced: 45% to 55%. Warning: 40% to 60%. Rest is Danger */}
              <div 
                className="absolute border border-dashed border-emerald-500/30 bg-emerald-500/5 rounded pointer-events-none"
                style={{
                  left: '40%',
                  right: '40%',
                  top: '40%',
                  bottom: '40%',
                }}
              ></div>
              <span className="absolute left-[40.5%] top-[40.5%] text-[8px] text-emerald-500/60 font-mono pointer-events-none">
                Safe Zone (สมดุล)
              </span>

              {/* Front / Door Labels */}
              <div className="absolute left-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest rotate-90 sm:rotate-0">
                ท้ายตู้ (Door)
              </div>
              <div className="absolute right-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest rotate-90 sm:rotate-0">
                หน้าตู้ (Front)
              </div>

              {/* CoG Pulsing Point */}
              <div 
                className="absolute transition-all duration-500 ease-out flex items-center justify-center pointer-events-none"
                style={{
                  left: `${cog.xPercent}%`,
                  bottom: `${cog.yPercent}%`,
                  transform: 'translate(-50%, 50%)',
                }}
              >
                {/* Outer Ring */}
                <span className={`animate-ping absolute inline-flex h-8 w-8 rounded-full opacity-60 ${
                  cog.statusX === 'danger' || cog.statusY === 'danger' 
                    ? 'bg-rose-400' 
                    : cog.statusX === 'warning' || cog.statusY === 'warning' 
                    ? 'bg-amber-400' 
                    : 'bg-emerald-400'
                }`}></span>
                {/* Center Solid Point */}
                <div className={`h-4.5 w-4.5 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[7px] font-bold text-white ${
                  cog.statusX === 'danger' || cog.statusY === 'danger' 
                    ? 'bg-rose-500' 
                    : cog.statusX === 'warning' || cog.statusY === 'warning' 
                    ? 'bg-amber-500' 
                    : 'bg-emerald-500'
                }`}>
                  +
                </div>
              </div>
            </div>
          </div>

          {/* Status Warnings Cards */}
          <div className="space-y-2.5">
            {/* Length (Front-to-Back) */}
            <div className={`p-3 rounded-xl border text-xs flex gap-2.5 items-start ${getStatusColor(cog.statusX)}`}>
              {cog.statusX !== 'balanced' ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">สมดุลหน้า-หลัง (Front-to-Back):</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getStatusBadge(cog.statusX)}`}>
                    {cog.statusX === 'balanced' ? 'สมดุล' : cog.statusX === 'warning' ? 'ควรระวัง' : 'อันตราย'}
                  </span>
                </div>
                <p className="mt-1 opacity-90 leading-relaxed text-slate-600">{cog.messageX}</p>
              </div>
            </div>

            {/* Width (Left-to-Right) */}
            <div className={`p-3 rounded-xl border text-xs flex gap-2.5 items-start ${getStatusColor(cog.statusY)}`}>
              {cog.statusY !== 'balanced' ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">สมดุลซ้าย-ขวา (Left-to-Right):</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getStatusBadge(cog.statusY)}`}>
                    {cog.statusY === 'balanced' ? 'สมดุล' : cog.statusY === 'warning' ? 'ควรระวัง' : 'อันตราย'}
                  </span>
                </div>
                <p className="mt-1 opacity-90 leading-relaxed text-slate-600">{cog.messageY}</p>
              </div>
            </div>

            {/* Height (Vertical CoG) */}
            <div className={`p-3 rounded-xl border text-xs flex gap-2.5 items-start ${getStatusColor(cog.statusZ)}`}>
              {cog.statusZ !== 'balanced' ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">สมดุลแนวสูง (Vertical CoG):</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getStatusBadge(cog.statusZ)}`}>
                    {cog.statusZ === 'balanced' ? 'ปกติ' : 'ศูนย์ถ่วงสูง'}
                  </span>
                </div>
                <p className="mt-1 opacity-90 leading-relaxed text-slate-600">{cog.messageZ}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Steps panel */}
        <div className="lg:col-span-7 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-4 lg:pt-0">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
              <ListOrdered className="w-4 h-4 text-teal-600" />
              ขั้นตอนลากจูงและจัดวางตู้ (Loading Steps)
            </span>
            <div className="text-[11px] text-slate-400">
              ความคืบหน้า: {Object.values(completedSteps).filter(Boolean).length}/{totalSteps} ขั้นตอน
            </div>
          </div>

          {totalSteps === 0 ? (
            <div className="bg-slate-50 rounded-xl p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
              <ListOrdered className="w-8 h-8 text-slate-300" />
              กรุณากำหนดการโหลดเพื่อรับคู่มือจัดลำดับตู้จัดเรียงสินค้า
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              
              {/* Big Interactive Step Display */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 relative overflow-hidden flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div>
                      <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ขั้นตอนที่ {currentStep.stepNumber} จาก {totalSteps}
                      </span>
                      <h4 className="font-bold text-slate-800 text-sm mt-1.5">
                        {currentStep.itemName}
                      </h4>
                    </div>
                    
                    {/* Checkbox button */}
                    <button
                      onClick={() => toggleStepCompleted(currentStep.stepNumber)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center border transition ${
                        completedSteps[currentStep.stepNumber]
                          ? 'bg-teal-500 border-teal-500 text-white'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-teal-500 hover:text-teal-600'
                      }`}
                    >
                      {completedSteps[currentStep.stepNumber] ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-sm bg-slate-100"></div>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                    {currentStep.description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5 text-[10px]">
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-400 block">ปริมาณบรรจุ:</span>
                      <span className="font-bold text-slate-700">{currentStep.quantity} {currentStep.quantity === 1 ? 'พาเลท' : 'กล่อง'}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-400 block">ขนาดวัตถุ (L x W x H):</span>
                      <span className="font-bold text-slate-700">{currentStep.dimensions.l}x{currentStep.dimensions.w}x{currentStep.dimensions.h} ซม.</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-400 block">จุดเริ่มต้น (x, y, z):</span>
                      <span className="font-bold text-slate-700">{currentStep.startCoords.x}, {currentStep.startCoords.y}, {currentStep.startCoords.z}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-400 block">สิ้นสุดบรรจุ (x, y, z):</span>
                      <span className="font-bold text-slate-700">{currentStep.endCoords.x}, {currentStep.endCoords.y}, {currentStep.endCoords.z}</span>
                    </div>
                  </div>
                </div>

                {/* Step controls */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
                  <button
                    disabled={currentStepIdx === 0}
                    onClick={() => setCurrentStepIdx(p => p - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <span className="text-[10px] text-slate-400 font-mono">
                    {currentStepIdx + 1} / {totalSteps}
                  </span>

                  <button
                    disabled={currentStepIdx === totalSteps - 1}
                    onClick={() => setCurrentStepIdx(p => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Mini List Checklist */}
              <div className="max-h-[140px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 bg-slate-50/20 pr-1 text-[11px]">
                {loadingSteps.map((step, idx) => (
                  <div 
                    key={step.stepNumber}
                    onClick={() => setCurrentStepIdx(idx)}
                    className={`flex items-center justify-between p-2 cursor-pointer transition ${
                      idx === currentStepIdx 
                        ? 'bg-teal-50/50 border-l-2 border-teal-500 pl-1.5 font-medium' 
                        : 'hover:bg-slate-100/50 pl-2'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-mono shrink-0 ${
                        completedSteps[step.stepNumber]
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {step.stepNumber}
                      </span>
                      <span className="truncate text-slate-700 font-medium">{step.itemName} ({step.quantity} ชิ้น)</span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono max-sm:hidden">
                      X: {step.startCoords.x}-{step.endCoords.x} ซม.
                    </span>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
