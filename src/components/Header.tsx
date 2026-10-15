import React from 'react';
import { Download, ArrowRight, Eye } from 'lucide-react';
import { AppStep, LithophaneShape } from '../types/lithophane';

interface HeaderProps {
  currentStep: AppStep;
  onStepChange: (step: AppStep) => void;
  shape: LithophaneShape;
  hasOwnPhoto: boolean;
  onExportClick: () => void;
  onUploadClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepChange,
  shape,
  hasOwnPhoto,
  onExportClick,
  onUploadClick,
}) => {
  const shapeLabel =
    shape === 'cylinder'
      ? 'Cylinder'
      : shape === 'cube'
      ? 'Hollow Cube'
      : shape === 'curved'
      ? 'Curved Arc'
      : 'Flat Panel';

  return (
    <header className="nav-bar select-none">
      {/* Zone 1: Small Icon SVG Logo + Brand Title + Form Label */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onStepChange('mode');
          }}
          className="flex items-center gap-2.5 group"
          title="Home"
        >
          {/* Small Icon-like SVG Logo with Warm Golden Backlight */}
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#1a1710] to-[#121620] border border-amber-400/40 p-1 flex items-center justify-center shadow-md shadow-amber-500/10 group-hover:border-amber-400 transition-colors shrink-0">
            <svg
              viewBox="0 0 28 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full"
            >
              <defs>
                <radialGradient id="lumiGoldGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.2" />
                </radialGradient>
              </defs>
              {/* Outer Lithophane Frame */}
              <rect
                x="3"
                y="3"
                width="22"
                height="22"
                rx="4"
                stroke="#f59e0b"
                strokeWidth="1.5"
                className="opacity-90"
              />
              {/* Internal Radiant Light Aperture */}
              <circle cx="14" cy="14" r="5" fill="url(#lumiGoldGlow)" />
              {/* Stepped Lithophane Relief Layers */}
              <path
                d="M7 19C9 17 11 18 14 16C17 14 19 15 21 13"
                stroke="#fbbf24"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
              <path
                d="M7 14C9.5 12.5 11.5 13.5 14 11.5C16.5 9.5 18.5 10.5 21 9"
                stroke="#fef08a"
                strokeWidth="1.25"
                strokeLinecap="round"
                className="opacity-80"
              />
            </svg>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight text-white group-hover:text-amber-300 transition-colors whitespace-nowrap">
              Lumiphane 3D
            </span>
            <span className="hidden sm:inline text-xs text-amber-400 font-bold font-mono">
              / {shapeLabel}
            </span>
          </div>
        </a>
      </div>

      {/* Zone 2: Step Indicator */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
        <span className="text-slate-300 font-medium">
          {currentStep === 'mode' && '1. Choose Shape'}
          {currentStep === 'upload' && '2. Add Photos'}
          {currentStep === 'preview' && '3. Preview & Export'}
        </span>
      </div>

      {/* Zone 3: 1 Primary Action */}
      <div className="flex items-center gap-2.5 shrink-0">
        {currentStep === 'preview' ? (
          <button
            type="button"
            onClick={onExportClick}
            className="btn-primary text-xs py-1.5 px-3.5 min-h-[32px] font-bold"
          >
            <Download className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
            <span className="whitespace-nowrap font-bold">Export</span>
          </button>
        ) : currentStep === 'upload' ? (
          <button
            type="button"
            onClick={() => onStepChange('preview')}
            className="btn-primary text-xs py-1.5 px-3.5 min-h-[32px] font-bold"
          >
            <Eye className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
            <span className="whitespace-nowrap font-bold">Preview</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStepChange('upload')}
            className="btn-primary text-xs py-1.5 px-3.5 min-h-[32px] font-bold"
          >
            <span className="whitespace-nowrap font-bold">Next: Photos</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
          </button>
        )}
      </div>
    </header>
  );
};
