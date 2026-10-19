import React, { useRef } from 'react';
import { LithophaneShape } from '../types/lithophane';

interface ModeSelectorProps {
  selectedShape: LithophaneShape | null;
  onSelectShape: (shape: LithophaneShape) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedShape,
  onSelectShape,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const modes = [
    {
      id: 'flat' as LithophaneShape,
      title: 'Flat Panel',
      badge: 'Classic Frame',
      description: 'Tiles 1 to 4 photos across a flat panel for frames, lightboxes, or windows.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Brim / Bottom Layer in Perspective around the Flat Panel Footprint */}
          <path
            d="M 28 115 L 20 115 L 12 135 L 188 135 L 180 115 L 172 115 L 172 124 L 28 124 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          {/* Hidden Back Brim Edge behind Panel */}
          <line
            x1="28"
            y1="115"
            x2="172"
            y2="115"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="stroke-amber-400/45"
          />
          {/* Visible Front & Angled Side Brim Edges */}
          <path
            d="M 28 115 L 20 115 L 12 135 L 188 135 L 180 115 L 172 115"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-amber-400"
          />

          {/* Planar Plate Outline */}
          <rect
            x="28"
            y="20"
            width="144"
            height="104"
            rx="2"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />

          {/* Dotted Inner Face Frame */}
          <rect
            x="38"
            y="30"
            width="124"
            height="84"
            rx="1"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/80"
          />
        </svg>
      ),
    },
    {
      id: 'curved' as LithophaneShape,
      title: 'Curved Panel',
      badge: 'Self-Standing',
      description: 'Tiles 1 to 4 photos along a curve that stands upright on its own.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Curved Brim / Bottom Layer with Angled Ends around the Curved Panel Footprint */}
          <path
            d="M 24 117 L 18 118 L 12 136 Q 100 120 188 136 L 182 118 L 176 117 L 176 126 Q 100 110 24 126 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          {/* Hidden Back Brim Arc behind Panel */}
          <path
            d="M 24 117 Q 100 101 176 117"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="stroke-amber-400/45"
          />
          {/* Visible Front Arc & Angled Side Brim Edges */}
          <path
            d="M 24 117 L 18 118 L 12 136 Q 100 120 188 136 L 182 118 L 176 117"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-amber-400"
          />

          {/* Outer Curved Panel */}
          <path
            d="M 24 26 Q 100 10 176 26 L 176 126 Q 100 110 24 126 Z"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />

          {/* Dotted Inner Curved Face Frame */}
          <path
            d="M 34 36 Q 100 21 166 36 L 166 116 Q 100 101 34 116 Z"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/80"
          />
        </svg>
      ),
    },
    {
      id: 'cube' as LithophaneShape,
      title: 'Hollow Cube',
      badge: '4-Sided Lantern',
      description: 'A 4-sided square lantern with open top and bottom, displaying 1 to 4 photos around the perimeter.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Full Diamond Brim Ring on the Bottom Layer (outer diamond minus cube base diamond) */}
          <path
            fillRule="evenodd"
            d="M 100 97.5 L 182 122 L 100 146.5 L 18 122 Z M 100 104 L 160 122 L 100 140 L 40 122 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          {/* Hidden Back Diamond Brim Edges behind Cube Walls */}
          <polyline
            points="40,115.4 100,97.5 160,115.4"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/45"
          />
          {/* Visible Front & Side Diamond Brim Outline */}
          <path
            d="M 40 115.4 L 18 122 L 100 146.5 L 182 122 L 160 115.4"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-amber-400"
          />

          {/* Hidden Back Bottom Edges of Cube (dashed) */}
          <polyline
            points="40,122 100,104 160,122"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-slate-500"
          />

          {/* Top Square Rim in Isometric View */}
          <polygon
            points="100,16 160,34 100,52 40,34"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />
          {/* Inner Hollow Square Opening */}
          <polygon
            points="100,23.2 136,34 100,44.8 64,34"
            strokeWidth="1.75"
            strokeLinejoin="round"
            className="stroke-amber-400/90"
          />

          {/* Dotted Photo Frames on Visible Front-Left and Front-Right Faces */}
          <polygon
            points="48,46 92,59.2 92,127.6 48,114.4"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/75"
          />
          <polygon
            points="108,59.2 152,46 152,114.4 108,127.6"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/75"
          />

          {/* Cube Vertical Corner Edges */}
          <line x1="40" y1="34" x2="40" y2="122" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="100" y1="52" x2="100" y2="140" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="160" y1="34" x2="160" y2="122" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />

          {/* Visible Bottom Edges */}
          <polyline
            points="40,122 100,140 160,122"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />
        </svg>
      ),
    },
    {
      id: 'hexagon' as LithophaneShape,
      title: 'Hexagon',
      badge: '6-Sided Lamp',
      description: 'A 6-sided faceted lantern with open top and bottom, wrapping 1 to 6 photos around 6 flat walls.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Full Hexagonal Brim Ring on the Bottom Layer (outer hexagon minus base hexagon) */}
          <path
            fillRule="evenodd"
            d="M 58 101.5 L 142 101.5 L 184 122 L 142 142.5 L 58 142.5 L 16 122 Z M 67 106 L 133 106 L 166 122 L 133 138 L 67 138 L 34 122 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          {/* Hidden Back Hexagonal Brim Edges behind Lantern Walls */}
          <polyline
            points="34,113.2 58,101.5 142,101.5 166,113.2"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/45"
          />
          {/* Visible Front & Side Hexagonal Brim Outline */}
          <path
            d="M 34 113.2 L 16 122 L 58 142.5 L 142 142.5 L 184 122 L 166 113.2"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-amber-400"
          />

          {/* Hidden Back Bottom Edges of Hexagon (dashed) */}
          <polyline
            points="34,122 67,106 133,106 166,122"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-slate-500"
          />

          {/* Top Regular Hexagon Rim in Isometric View */}
          <polygon
            points="67,50 133,50 166,34 133,18 67,18 34,34"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />
          {/* Inner Hollow Hexagon Opening */}
          <polygon
            points="76.2,45.5 123.8,45.5 147.5,34 123.8,22.5 76.2,22.5 52.5,34"
            strokeWidth="1.75"
            strokeLinejoin="round"
            className="stroke-amber-400/90"
          />

          {/* Dotted Photo Frames on Visible Front-Left, Front, and Front-Right Faces */}
          <polygon
            points="40,46.4 61,56.6 61,125.6 40,115.4"
            strokeWidth="1.35"
            strokeDasharray="3.5 3.5"
            strokeLinejoin="round"
            className="stroke-amber-400/75"
          />
          <rect
            x="74"
            y="59"
            width="52"
            height="70"
            rx="0.5"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-amber-400/75"
          />
          <polygon
            points="139,56.6 160,46.4 160,115.4 139,125.6"
            strokeWidth="1.35"
            strokeDasharray="3.5 3.5"
            strokeLinejoin="round"
            className="stroke-amber-400/75"
          />

          {/* Hexagon Vertical Corner Edges */}
          <line x1="34" y1="34" x2="34" y2="122" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="67" y1="50" x2="67" y2="138" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="133" y1="50" x2="133" y2="138" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="166" y1="34" x2="166" y2="122" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />

          {/* Visible Bottom Hexagon Edges */}
          <polyline
            points="34,122 67,138 133,138 166,122"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="stroke-slate-200"
          />
        </svg>
      ),
    },
    {
      id: 'cylinder' as LithophaneShape,
      title: 'Round Cylinder',
      badge: '360° Lampshade',
      description: 'Wraps 1 to 4 photos into a continuous circular lantern, perfect for nightlights and lamps.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Brim shares the base ellipse: same center (100, 124) and the same rx/ry ratio, scaled out. */}
          <path
            d="M 32 112 A 85 20 0 0 0 15 124 A 85 20 0 0 0 185 124 A 85 20 0 0 0 168 112 L 168 124 A 68 16 0 0 1 32 124 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          <path
            d="M 32 112 A 85 20 0 0 0 15 124 A 85 20 0 0 0 185 124 A 85 20 0 0 0 168 112"
            strokeWidth="2.25"
            strokeLinecap="round"
            className="stroke-amber-400"
          />

          {/* Hidden Back Bottom Arc (dashed) */}
          <path
            d="M 32 124 A 68 16 0 0 1 168 124"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="stroke-slate-500"
          />

          {/* Top Ellipse Rim */}
          <ellipse cx="100" cy="28" rx="68" ry="16" strokeWidth="2.5" className="stroke-slate-200" />
          {/* Inner Hollow Hole */}
          <ellipse
            cx="100"
            cy="28"
            rx="50"
            ry="11.8"
            strokeWidth="1.75"
            className="stroke-amber-400/90"
          />

          {/* Dotted Quadrant Meridian Center Line */}
          <line
            x1="100"
            y1="52"
            x2="100"
            y2="128"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
            className="stroke-amber-400/75"
          />

          {/* Cylinder Side Walls */}
          <line x1="32" y1="28" x2="32" y2="124" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />
          <line x1="168" y1="28" x2="168" y2="124" strokeWidth="2.5" strokeLinecap="round" className="stroke-slate-200" />

          {/* Visible Bottom Ellipse Rim */}
          <path
            d="M 32 124 A 68 16 0 0 0 168 124"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="stroke-slate-200"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 md:py-10 flex flex-col items-center justify-start">
      {/* Header */}
      <div className="text-center max-w-2xl mb-6">
        <div className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono mb-2">
          Step 1 · Choose Shape
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Choose a Shape
        </h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          Pick how you want your lithophane shaped. Every shape holds 1 to 4 photos, tiled to fit, and prints with a sturdy base.
        </p>
      </div>

      {/* Mode Cards: Horizontally scrollable on mobile, 5-column responsive grid on desktop */}
      <div
        ref={scrollContainerRef}
        className="flex flex-row overflow-x-auto snap-x snap-mandatory gap-4 pb-3 pt-3.5 w-full -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:overflow-visible scrollbar-none overscroll-x-contain"
      >
        {modes.map((mode) => {
          const isSelected = selectedShape === mode.id;
          return (
            <div
              key={mode.id}
              onClick={() => onSelectShape(mode.id)}
              className={`group w-[76vw] max-w-[310px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink relative flex flex-col rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#151a26] border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400'
                  : 'bg-[#10141d] hover:bg-[#141924] border-white/10 hover:border-white/20'
              }`}
            >
              {/* Round Checkmark Badge (top-right, slightly outside card when selected) */}
              {isSelected && (
                <div
                  aria-hidden="true"
                  className="mode-check-badge"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    className="w-3.5 h-3.5"
                  >
                    <path
                      d="M4.5 10.5L8.2 14.2L15.5 6.2"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mode-check-path"
                    />
                  </svg>
                </div>
              )}

              {/* Header */}
              <div className="relative p-4 sm:p-5 pb-3 text-center">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {mode.title}
                </h3>
                <div className="text-xs text-amber-400 font-bold font-mono mt-0.5">
                  {mode.badge}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  {mode.description}
                </p>
              </div>

              {/* Wireframe bleeds to the card edges */}
              <div className="mt-auto bg-[#090b10] border-t border-white/10 rounded-b-[7px] overflow-hidden">
                {mode.diagram}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Mobile Pagination Indicator Dots */}
      <div className="sm:hidden flex items-center justify-center mt-1 mb-2">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelectShape(mode.id)}
            className="inline-flex h-11 w-8 items-center justify-center"
            aria-label={`Select ${mode.title}`}
            aria-pressed={selectedShape === mode.id}
          >
            <span
              className={`h-1.5 rounded-full transition-all ${
                selectedShape === mode.id ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/20'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
