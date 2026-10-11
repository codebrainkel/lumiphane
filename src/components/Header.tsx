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
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.08] bg-[#090b10] z-30 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
          <div className="w-2.5 h-2.5 bg-[#090b10] rounded-sm transform rotate-45" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">
          Lumiphane
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onUploadClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Image</span>
        </button>

        <button
          onClick={onExportClick}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-all whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export .3MF</span>
        </button>
      </div>
    </header>
  );
};
