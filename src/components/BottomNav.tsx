import React from 'react';
import { AppStep, LithophaneShape } from '../types/lithophane';
import { Shapes, Image as ImageIcon, Box } from 'lucide-react';

interface BottomNavProps {
  currentStep: AppStep;
  onStepChange: (step: AppStep) => void;
  shape: LithophaneShape;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentStep,
  onStepChange,
}) => {
  const steps: { id: AppStep; num: string; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'mode', num: '1', label: 'Shape', icon: Shapes },
    { id: 'upload', num: '2', label: 'Photos', icon: ImageIcon },
    { id: 'preview', num: '3', label: '3D Preview', icon: Box },
  ];

  return (
    <footer
      role="navigation"
      aria-label="Workflow Navigation"
      className="fixed bottom-0 inset-x-0 z-30 w-full max-w-full bg-[#0c0f16]/95 backdrop-blur-md border-t border-white/10 px-3 sm:px-4 py-2 select-none shadow-2xl box-border overflow-hidden"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-md mx-auto">
        {/* 3 Full-Width Responsive Step Tabs: Never overflows on mobile */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#121622] border border-white/10 rounded-lg">
          {steps.map((st) => {
            const isActive = currentStep === st.id;
            const Icon = st.icon;

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onStepChange(st.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all min-w-0 ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium'
                }`}
                title={`Go to step ${st.num}: ${st.label}`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                    isActive
                      ? 'bg-slate-950/25 text-slate-950'
                      : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {st.num}
                </span>
                <span className={`truncate text-center ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
};
