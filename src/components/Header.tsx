import React from 'react';
import { AppStep, LithophaneShape } from '../types/lithophane';

interface HeaderProps {
  currentStep: AppStep;
  onStepChange: (step: AppStep) => void;
  shape: LithophaneShape | null;
}

export const Header: React.FC<HeaderProps> = ({ currentStep, onStepChange, shape }) => {
  const shapeLabel =
    shape === 'cylinder'
      ? 'Round Cylinder'
      : shape === 'cube'
      ? 'Hollow Cube'
      : shape === 'hexagon'
      ? 'Hexagon'
      : shape === 'curved'
      ? 'Curved Panel'
      : 'Flat Panel';

  const stepLabel =
    currentStep === 'mode' ? 'Shape' : currentStep === 'upload' ? 'Photos' : 'Preview';

  return (
    <header className="nav-bar select-none">
      <div className="flex items-center gap-3 shrink-0 min-w-0">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onStepChange('mode');
          }}
          className="flex items-center gap-2.5 group min-w-0"
          title="Home"
        >
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
                  <stop offset="60%" stopColor="#ffc21a" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#e8aa00" stopOpacity="0.2" />
                </radialGradient>
              </defs>
              <rect
                x="3"
                y="3"
                width="22"
                height="22"
                rx="4"
                stroke="#ffc21a"
                strokeWidth="1.5"
                className="opacity-90"
              />
              <circle cx="14" cy="14" r="5" fill="url(#lumiGoldGlow)" />
              <path
                d="M7 19C9 17 11 18 14 16C17 14 19 15 21 13"
                stroke="#ffc833"
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

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[15px] font-bold tracking-tight text-white group-hover:text-amber-300 transition-colors whitespace-nowrap">
              Lumiphane 3D
            </span>
            {shape && (
              <span className="hidden sm:inline text-xs text-amber-400 font-bold font-mono truncate">
                / {shapeLabel}
              </span>
            )}
          </div>
        </a>
      </div>

      <div className="text-xs font-medium text-slate-400 shrink-0">{stepLabel}</div>
    </header>
  );
};
