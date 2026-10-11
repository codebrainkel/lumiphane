import React from 'react';
import { Download, Upload } from 'lucide-react';

interface HeaderProps {
  onExportClick: () => void;
  onUploadClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onExportClick, onUploadClick }) => {
  return (
    <header className="nav-bar select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-[8px] bg-[#0A84FF] flex items-center justify-center shadow-[0_4px_12px_rgba(10,132,255,0.45)] shrink-0">
          <div className="w-2.5 h-2.5 bg-black rounded-[2px] rotate-45" />
        </div>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-white truncate">
          Lumiphane
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onUploadClick} className="btn-nav" aria-label="Upload photo">
          <Upload className="w-[18px] h-[18px]" />
          <span className="hidden sm:inline">Upload</span>
        </button>
        <button type="button" onClick={onExportClick} className="btn-nav btn-nav-fill">
          <Download className="w-[18px] h-[18px]" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
