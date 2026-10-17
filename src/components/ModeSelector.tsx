import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LithophaneShape } from '../types/lithophane';
import { Check } from 'lucide-react';

const SHAPES: LithophaneShape[] = ['cylinder', 'cube', 'flat', 'curved'];

interface ModeSelectorProps {
  selectedShape: LithophaneShape | null;
  onSelectShape: (shape: LithophaneShape) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedShape,
  onSelectShape,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [visibleIndex, setVisibleIndex] = useState(() => {
    if (!selectedShape) return 0;
    const index = SHAPES.indexOf(selectedShape);
    return index >= 0 ? index : 0;
  });

  const scrollToCard = (index: number, behavior: ScrollBehavior) => {
    const root = scrollContainerRef.current;
    const card = root?.children[index] as HTMLElement | undefined;
    const first = root?.children[0] as HTMLElement | undefined;
    if (!root || !card || !first) return;
    const overflowX = getComputedStyle(root).overflowX;
    if (overflowX !== 'auto' && overflowX !== 'scroll') return;
    root.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior });
  };

  useLayoutEffect(() => {
    if (!selectedShape) return;
    const index = SHAPES.indexOf(selectedShape);
    if (index < 0) return;
    scrollToCard(index, 'auto');
    const frame = requestAnimationFrame(() => scrollToCard(index, 'auto'));
    return () => cancelAnimationFrame(frame);
  }, [selectedShape]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;
    const update = () => {
      const cards = [...root.children] as HTMLElement[];
      const rootLeft = root.getBoundingClientRect().left;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((card, index) => {
        const dist = Math.abs(card.getBoundingClientRect().left - rootLeft);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      });
      setVisibleIndex(best);
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      root.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const modes = [
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
            strokeWidth="1.25"
            className="stroke-amber-400"
          />

          {/* Top Ellipse Rim */}
          <ellipse cx="100" cy="28" rx="68" ry="16" strokeWidth="1.25" className="stroke-slate-300" />
          {/* Inner Hollow Hole */}
          <ellipse cx="100" cy="28" rx="50" ry="11.8" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/80" />

          {/* Cylinder Side Walls */}
          <line x1="32" y1="28" x2="32" y2="124" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="168" y1="28" x2="168" y2="124" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Bottom Ellipse Rim — concentric with the brim */}
          <path d="M 32 124 A 68 16 0 0 0 168 124" strokeWidth="1.25" className="stroke-slate-300" />
          <path d="M 32 124 A 68 16 0 0 1 168 124" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Quadrant Meridian Center Line */}
          <line x1="100" y1="52" x2="100" y2="116" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/70" />
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
          {/*
            Square footprint in the same projection as the cube.
            Bottom corners: left (40,122), front (100,140), right (160,122), back (100,104).
            Brim is that rhombus scaled 1.25× from the same center, so the flange
            follows the square instead of a mismatched diamond.
          */}
          <path
            d="M 40 122 L 25 122 L 100 144.5 L 175 122 L 160 122 L 100 140 Z"
            stroke="none"
            className="fill-amber-400/15"
          />
          <path
            d="M 40 122 L 25 122 L 100 144.5 L 175 122 L 160 122"
            strokeWidth="1.25"
            className="stroke-amber-400"
          />

          {/* Top Square Rim in Isometric View */}
          <polygon points="100,16 160,34 100,52 40,34" strokeWidth="1.25" className="stroke-slate-300" />
          {/* Inner Hollow Square Opening */}
          <polygon points="100,23.2 136,34 100,44.8 64,34" strokeWidth="1" strokeDasharray="3 3" className="stroke-amber-400/80" />

          {/* Cube Vertical Corner Edges */}
          <line x1="40" y1="34" x2="40" y2="122" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="100" y1="52" x2="100" y2="140" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="160" y1="34" x2="160" y2="122" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Bottom face — same rhombus as the top, dropped on the verticals */}
          <line x1="40" y1="122" x2="100" y2="140" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="100" y1="140" x2="160" y2="122" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Hidden Back Bottom Edges (dashed) */}
          <line x1="40" y1="122" x2="100" y2="104" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />
          <line x1="100" y1="104" x2="160" y2="122" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Subtle Relief Contours on visible Front-Right face */}
          <path d="M 124 72 Q 138 68 152 74" strokeWidth="0.8" className="stroke-amber-400/70" />
          <path d="M 124 100 Q 138 96 152 102" strokeWidth="0.8" className="stroke-amber-400/70" />

          {/* Subtle Relief Contours on visible Front-Left face */}
          <path d="M 48 70 Q 62 66 76 72" strokeWidth="0.8" className="stroke-amber-400/70" />
          <path d="M 48 98 Q 62 94 76 100" strokeWidth="0.8" className="stroke-amber-400/70" />
        </svg>
      ),
    },
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
          {/* Planar Plate Outline */}
          <rect x="28" y="16" width="144" height="108" rx="1.5" strokeWidth="1.25" className="stroke-slate-300" />
          <rect x="34" y="22" width="132" height="96" rx="1" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Subtle Relief Contour Lines */}
          <path d="M 42 48 Q 72 40 100 50 T 158 46" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 42 74 Q 74 66 102 76 T 158 72" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 42 100 Q 74 92 102 102 T 158 98" strokeWidth="1" className="stroke-amber-400/70" />

          {/* Base Footing / Flange — top edge sits on the panel bottom */}
          <rect
            x="14"
            y="124"
            width="172"
            height="14"
            rx="1.5"
            strokeWidth="1.25"
            className="stroke-amber-400 fill-amber-400/15"
          />
          <line x1="8" y1="142" x2="192" y2="142" strokeWidth="1" className="stroke-slate-600" />
        </svg>
      ),
    },
    {
      id: 'curved' as LithophaneShape,
      title: 'Curved Arc',
      badge: 'Self-Standing',
      description: 'Tiles 1 to 4 photos along a curve that stands upright on its own.',
      diagram: (
        <svg
          viewBox="0 0 200 156"
          className="block w-full h-auto text-slate-400 stroke-current fill-none select-none"
        >
          {/* Top Arc */}
          <path d="M 22 28 Q 100 12 178 28" strokeWidth="1.25" className="stroke-slate-300" />
          <path d="M 28 34 Q 100 18 172 34" strokeWidth="0.75" strokeDasharray="3 3" className="stroke-slate-600" />

          {/* Side Edges */}
          <line x1="22" y1="28" x2="22" y2="126" strokeWidth="1.25" className="stroke-slate-300" />
          <line x1="178" y1="28" x2="178" y2="126" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Subtle Relief Contour along Arc */}
          <path d="M 28 52 Q 100 36 172 52" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 28 80 Q 100 64 172 80" strokeWidth="1" className="stroke-amber-400/70" />
          <path d="M 28 108 Q 100 92 172 108" strokeWidth="1" className="stroke-amber-400/70" />

          {/* Bottom Arc */}
          <path d="M 22 126 Q 100 110 178 126" strokeWidth="1.25" className="stroke-slate-300" />

          {/* Self-Standing Base Arc Footprint */}
          <path
            d="M 12 132 Q 100 114 188 132 L 182 140 Q 100 122 18 140 Z"
            strokeWidth="1.25"
            className="stroke-amber-400 fill-amber-400/15"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:py-10 flex flex-col items-center justify-start">
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
              className={`w-[76vw] max-w-[310px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink relative flex flex-col overflow-hidden rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#151a26] border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400'
                  : 'bg-[#10141d] hover:bg-[#141924] border-white/10 hover:border-white/20'
              }`}
            >
              {/* Header & Radio */}
              <div className="relative p-4 sm:p-5 pb-3 text-center">
                <div
                  className={`absolute top-4 right-4 w-5 h-5 rounded-sm flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-amber-400 border-amber-400 text-slate-950 font-bold'
                      : 'border-white/20 bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                <h2 className="text-base font-bold text-white tracking-tight px-6">
                  {mode.title}
                </h2>
                <div className="text-xs text-amber-400 font-bold font-mono mt-0.5">
                  {mode.badge}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  {mode.description}
                </p>
              </div>

              {/* Wireframe bleeds to the card edges */}
              <div className="mt-auto bg-[#090b10] border-t border-white/10" aria-hidden="true">
                {mode.diagram}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Mobile Pagination Indicator Dots */}
      <div className="sm:hidden flex items-center justify-center mt-1 mb-2" role="tablist" aria-label="Shapes">
        {modes.map((mode, index) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => scrollToCard(index, 'smooth')}
            className="inline-flex h-11 w-11 items-center justify-center"
            aria-label={`Show ${mode.title}`}
            aria-current={visibleIndex === index ? 'true' : undefined}
          >
            <span
              className={`h-1.5 rounded-full transition-all ${
                visibleIndex === index ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/20'
              }`}
            />
          </button>
        ))}
      </div>

      <section className="w-full max-w-2xl mt-6 mb-2 text-center" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-sm font-semibold tracking-tight text-white">
          How it works
        </h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Turn your photos into 3D-printable lithophanes right in your browser. Pick a shape, add 1 to 4 photos,
          preview it backlit in 3D, then export an STL or 3MF file, send it to your email, or order a finished print.
        </p>
        <ol className="mt-3 mx-auto max-w-md space-y-1 text-left text-xs text-slate-400 leading-relaxed list-decimal pl-5">
          <li>Choose a shape.</li>
          <li>Upload and crop your photos.</li>
          <li>Preview the lithophane with simulated backlight.</li>
          <li>Download STL or 3MF for your slicer, email it to yourself, or order a print through Treatstock.</li>
        </ol>
      </section>
    </div>
  );
};
