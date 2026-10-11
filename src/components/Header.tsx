import React from 'react';
import { Download, Upload } from 'lucide-react';

interface HeaderProps {
  onExportClick: () => void;
  onUploadClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onExportClick,
  onUploadClick,
}) => {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[#07080c]/90 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#f6d48a] to-[#d3923a] shadow-[0_0_24px_rgba(240,195,106,0.25)]">
          <div className="h-2.5 w-2.5 rotate-45 rounded-[3px] bg-[#07080c]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight text-white">
            Lumiphane
          </div>
          <div className="hidden text-[11px] text-zinc-500 sm:block">
            Lithophane studio
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/8 px-3 text-sm font-medium text-zinc-100 transition active:scale-[0.98] hover:bg-white/12"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden min-[380px]:inline">Photo</span>
        </button>
        <button
          type="button"
          onClick={onExportClick}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f0c36a] px-3.5 text-sm font-semibold text-zinc-950 transition active:scale-[0.98] hover:bg-[#f6d48a]"
        >
          <Download className="h-4 w-4" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
