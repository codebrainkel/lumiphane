import React from 'react';
import { Download, Upload } from 'lucide-react';

interface HeaderProps {
  hasOwnPhoto: boolean;
  onExportClick: () => void;
  onUploadClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ hasOwnPhoto, onExportClick, onUploadClick }) => {
  return (
    <header className="nav-bar select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-[12px] bg-[#0A84FF] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_rgba(10,132,255,0.45)] shrink-0">
          <div className="w-2.5 h-2.5 bg-black rounded-[3px] rotate-45" />
        </div>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-white truncate">
          Lumiphane
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {hasOwnPhoto ? (
          <>
            <button type="button" onClick={onUploadClick} className="btn-nav" aria-label="Change photo">
              <Upload className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">Change</span>
            </button>
            <button type="button" onClick={onExportClick} className="btn-nav btn-nav-fill">
              <Download className="w-[18px] h-[18px]" />
              <span>Export</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={onUploadClick} className="btn-nav btn-nav-fill">
            <Upload className="w-[18px] h-[18px]" />
            <span>Upload photo</span>
          </button>
        )}
      </div>
    </header>
  );
};
