import React, { useRef } from 'react';
import { LithophaneShape } from '../types/lithophane';
import { Check, ArrowRight } from 'lucide-react';

interface ModeSelectorProps {
  selectedShape: LithophaneShape;
  onSelectShape: (shape: LithophaneShape) => void;
  onContinue: () => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedShape,
  onSelectShape,
  onContinue,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const modes = [
    {
      id: 'cylinder' as LithophaneShape,
      title: 'Round Cylinder',
      badge: '360° Lampshade',
      description: 'Wraps 1 to 4 photos into a continuous circular lantern, perfect for nightlights and lamps.',
      specs: [
        { label: 'Photos', value: '1–4 photos' },
        { label: 'Lighting', value: 'Fits LED pucks or bulbs' },
        { label: 'Default Size', value: '90mm wide × 95mm tall' },
        { label: 'Base', value: 'Built-in print brim' },
      ],
      diagram: (
        <svg
          viewBox="0 0 180 115"
          className="w-full h-36 sm:h-40 text-slate-400 stroke-current fill-none select-none"
        >
          {/* Top Ellipse Rim */}
          <ellipse cx="90" cy="22" rx="46" ry="13" strokeWidth="1.25" className="stroke-slate-300" />
          {/* Inner Hollow Hole */}
          <ellipse cx="90" cy="22" rx="34" ry="10" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/80" />

          {/* Cylinder Side Walls */}
          <line x1="44" y1="22" x2="44" y2="84" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="136" y1="22" x2="136" y2="84" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Bottom Ellipse Rim */}
          <path d="M 44 84 A 46 13 0 0 0 136 84" strokeWidth="1.25" className="stroke-slate-300" />
          <path d="M 44 84 A 46 13 0 0 1 136 84" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Quadrant Meridian Center Line */}
          <line x1="90" y1="35" x2="90" y2="97" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/70" />

          {/* Adhesion Brim Flange */}
          <ellipse cx="90" cy="94" rx="52" ry="9" strokeWidth="1" className="stroke-amber-400 fill-amber-400/10" />

          {/* Diagram Label */}
          <text x="90" y="60" textAnchor="middle" fontSize="9" fill="#fef08a" className="font-mono font-normal">
            Cylinder
          </text>
        </svg>
      ),
    },
    {
      id: 'cube' as LithophaneShape,
      title: 'Hollow Cube',
      badge: '4-Sided Lantern',
      description: 'A 4-sided square lantern with open top and bottom, displaying 1 to 4 photos around the perimeter.',
      specs: [
        { label: 'Photos', value: '1–4 photos' },
        { label: 'Lighting', value: 'Fits LED pucks or bulbs' },
        { label: 'Default Size', value: '90mm × 90mm × 90mm' },
        { label: 'Base', value: 'Built-in print brim' },
      ],
      diagram: (
        <svg
          viewBox="0 0 180 115"
          className="w-full h-36 sm:h-40 text-slate-400 stroke-current fill-none select-none"
        >
          {/* Top Square Rim in Isometric View */}
          <polygon points="90,12 136,27 90,42 44,27" strokeWidth="1.25" className="stroke-slate-300" />
          {/* Inner Hollow Square Opening */}
          <polygon points="90,20 122,30 90,40 58,30" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/80" />

          {/* Cube Vertical Corner Edges */}
          <line x1="44" y1="27" x2="44" y2="82" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="90" y1="42" x2="90" y2="96" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="136" y1="27" x2="136" y2="82" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Bottom Outer Faces */}
          <line x1="44" y1="82" x2="90" y2="96" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="90" y1="96" x2="136" y2="82" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Hidden Back Bottom Edges (dashed) */}
          <line x1="44" y1="82" x2="90" y2="68" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />
          <line x1="90" y1="68" x2="136" y2="82" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Base Adhesion Brim Flange */}
          <polygon points="90,86 144,76 90,102 36,76" strokeWidth="1" className="stroke-amber-400 fill-amber-400/10" />

          {/* Subtle Relief Contours on visible Front-Right face */}
          <path d="M 98 56 Q 112 52 128 58" strokeWidth="0.8" className="stroke-amber-400/70" />
          <path d="M 98 70 Q 112 66 128 72" strokeWidth="0.8" className="stroke-amber-400/70" />

          {/* Subtle Relief Contours on visible Front-Left face */}
          <path d="M 52 58 Q 68 52 82 56" strokeWidth="0.8" className="stroke-amber-400/70" />
          <path d="M 52 72 Q 68 66 82 70" strokeWidth="0.8" className="stroke-amber-400/70" />

          {/* Diagram Label */}
          <text x="90" y="58" textAnchor="middle" fontSize="9" fill="#fef08a" className="font-mono font-normal">
            Hollow Cube
          </text>
        </svg>
      ),
    },
    {
      id: 'flat' as LithophaneShape,
      title: 'Flat Panel',
      badge: 'Classic Frame',
      description: 'A clean rectangular panel made for picture frames, lightboxes, or window displays.',
      specs: [
        { label: 'Photos', value: '1 photo' },
        { label: 'Proportions', value: 'Matches your photo size' },
        { label: 'Default Size', value: '120mm × 90mm' },
        { label: 'Base', value: 'Built-in stable stand' },
      ],
      diagram: (
        <svg
          viewBox="0 0 180 115"
          className="w-full h-36 sm:h-40 text-slate-400 stroke-current fill-none select-none"
        >
          {/* Planar Plate Outline */}
          <rect x="42" y="16" width="96" height="68" rx="1.5" strokeWidth="1.25" className="stroke-slate-300" />
          <rect x="47" y="21" width="86" height="58" rx="1" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Subtle Relief Contour Lines */}
          <path d="M 52 38 Q 74 32 94 40 T 128 36" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 52 52 Q 76 46 96 54 T 128 50" strokeWidth="1" className="stroke-amber-400/70" />

          {/* Base Footing / Flange */}
          <rect
            x="34"
            y="84"
            width="112"
            height="12"
            rx="1.5"
            strokeWidth="1.25"
            className="stroke-amber-400 fill-amber-400/15"
          />
          <line x1="30" y1="96" x2="150" y2="96" strokeWidth="1" className="stroke-slate-600" />

          {/* Diagram Label */}
          <text x="90" y="68" textAnchor="middle" fontSize="9" fill="#fef08a" className="font-mono font-normal">
            Flat Panel
          </text>
        </svg>
      ),
    },
    {
      id: 'curved' as LithophaneShape,
      title: 'Curved Arc',
      badge: 'Self-Standing',
      description: 'A gentle curve that stands upright on desks and tables without any stand needed.',
      specs: [
        { label: 'Photos', value: '1 photo' },
        { label: 'Curve', value: '75° panoramic arc' },
        { label: 'Default Size', value: '120mm wide' },
        { label: 'Base', value: 'Self-balancing base' },
      ],
      diagram: (
        <svg
          viewBox="0 0 180 115"
          className="w-full h-36 sm:h-40 text-slate-400 stroke-current fill-none select-none"
        >
          {/* Top Arc */}
          <path d="M 44 24 Q 90 12 136 24" strokeWidth="1.25" className="stroke-slate-300" />
          <path d="M 48 28 Q 90 17 132 28" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Side Edges */}
          <line x1="44" y1="24" x2="44" y2="82" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="136" y1="24" x2="136" y2="82" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Subtle Relief Contour along Arc */}
          <path d="M 48 46 Q 90 34 132 46" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 48 60 Q 90 48 132 60" strokeWidth="1" className="stroke-amber-400/70" />

          {/* Bottom Arc */}
          <path d="M 44 82 Q 90 70 136 82" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Self-Standing Base Arc Footprint */}
          <path
            d="M 38 88 Q 90 74 142 88 L 138 94 Q 90 80 42 94 Z"
            strokeWidth="1.25"
            className="stroke-amber-400 fill-amber-400/15"
          />

          {/* Diagram Label */}
          <text x="90" y="74" textAnchor="middle" fontSize="9" fill="#fef08a" className="font-mono font-normal">
            Curved Arc
          </text>
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-10 flex flex-col items-center justify-start pb-28">
      {/* Header */}
      <div className="text-center max-w-2xl mb-6">
        <div className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono mb-2">
          Step 1 · Choose Shape
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Choose a Shape
        </h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          Pick how you want your lithophane shaped. All models are optimized for 3D printing with sturdy bases.
        </p>
      </div>

      {/* Mode Cards: Horizontally scrollable on mobile, 4-column responsive grid on desktop */}
      <div
        ref={scrollContainerRef}
        className="flex flex-row overflow-x-auto snap-x snap-mandatory gap-3.5 pb-3 pt-1 w-full -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible scrollbar-none overscroll-x-contain"
      >
        {modes.map((mode) => {
          const isSelected = selectedShape === mode.id;
          return (
            <div
              key={mode.id}
              onClick={() => onSelectShape(mode.id)}
              className={`w-[76vw] max-w-[310px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink relative flex flex-col justify-between p-4 sm:p-5 rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#151a26] border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400'
                  : 'bg-[#10141d] hover:bg-[#141924] border-white/10 hover:border-white/20'
              }`}
            >
              {/* Header & Radio */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {mode.title}
                    </h3>
                    <div className="text-xs text-amber-400 font-bold font-mono mt-0.5">
                      {mode.badge}
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-sm flex items-center justify-center shrink-0 border transition-colors ${
                      isSelected
                        ? 'bg-amber-400 border-amber-400 text-slate-950 font-bold'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mt-1 mb-3">
                  {mode.description}
                </p>

                {/* Clean, Streamlined Wireframe Diagram */}
                <div className="py-2 px-2 bg-[#090b10] border border-white/10 rounded-md mb-4 flex items-center justify-center overflow-hidden">
                  {mode.diagram}
                </div>
              </div>

              {/* Technical Specifications with Bold Subtitles and Values */}
              <div className="border-t border-white/10 pt-3 space-y-1.5">
                {mode.specs.map((s, idx) => (
                  <div key={idx} className="flex items-baseline justify-between text-[11px] gap-2">
                    <span className="text-slate-400 font-medium shrink-0">{s.label}</span>
                    <span className="text-slate-200 text-right font-mono font-bold truncate">
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Mobile Pagination Indicator Dots */}
      <div className="sm:hidden flex items-center justify-center gap-1.5 mt-2 mb-4">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelectShape(mode.id)}
            className={`h-1.5 rounded-full transition-all ${
              selectedShape === mode.id
                ? 'w-5 bg-amber-400'
                : 'w-1.5 bg-white/20'
            }`}
            aria-label={`Select ${mode.title}`}
          />
        ))}
      </div>

      {/* Bottom Action Strip */}
      <div className="flex items-center justify-end w-full p-3 sm:p-4 bg-[#10141d] border border-white/10 rounded-lg mt-4 box-border">
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary w-full sm:w-auto font-bold"
        >
          <span className="font-bold">Continue to Photos</span>
          <ArrowRight className="w-4 h-4 shrink-0 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
