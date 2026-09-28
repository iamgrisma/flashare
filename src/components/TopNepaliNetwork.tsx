import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Wrench, Keyboard, Type, Zap, Landmark, Scale } from 'lucide-react';

interface Props {
  currentApp?: 'blog' | 'tools' | 'typing' | 'fonts' | 'share' | 'election' | 'constitution';
}

const networkApps = [
  { id: 'blog', name: 'TopNepali Hub', url: 'https://topnepali.com', icon: BookOpen },
  { id: 'tools', name: 'TopTools', url: 'https://topnepali.com/tools', icon: Wrench },
  { id: 'typing', name: 'Nepali Typing', url: 'https://typing.topnepali.com', icon: Keyboard },
  { id: 'fonts', name: 'FontsDir', url: 'https://fonts.topnepali.com', icon: Type },
  { id: 'share', name: 'Flashare', url: 'https://share.topnepali.com', icon: Zap },
  { id: 'election', name: 'Election Nepal', url: 'https://election.topnepali.com', icon: Landmark },
  { id: 'constitution', name: 'Constitution', url: 'https://constitution.topnepali.com', icon: Scale }
];

export const TopNepaliNetwork: React.FC<Props> = ({ currentApp = 'share' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleScroll = () => {
      setIsOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="relative inline-flex items-center" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-700/60 bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 transition active:scale-95 cursor-pointer shadow-sm"
        aria-label="TopNepali Network Apps"
        aria-expanded={isOpen}
        title="TopNepali Network"
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <circle cx="5" cy="5" r="2.2" />
          <circle cx="12" cy="5" r="2.2" />
          <circle cx="19" cy="5" r="2.2" />
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
          <circle cx="5" cy="19" r="2.2" />
          <circle cx="12" cy="19" r="2.2" />
          <circle cx="19" cy="19" r="2.2" />
        </svg>
      </button>

      {isOpen && (
        <nav
          className="absolute right-0 top-full mt-2 w-[220px] max-w-[calc(100vw-16px)] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
          aria-label="TopNepali Ecosystem"
        >
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-slate-800">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              TopNepali Network
            </span>
            <a
              href="https://topnepali.com"
              className="text-[10.5px] font-semibold text-blue-400 hover:underline"
            >
              Hub &rarr;
            </a>
          </div>

          <ul className="space-y-0.5 list-none m-0 p-0">
            {networkApps.map((app) => {
              const isCurrent = app.id === currentApp;
              const IconComponent = app.icon;
              return (
                <li key={app.id}>
                  <a
                    href={app.url}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isCurrent
                        ? 'bg-slate-800 text-emerald-400 pointer-events-none'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="flex-1 truncate">{app.name}</span>
                    {isCurrent && (
                      <span className="text-[8px] font-black px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0">
                        ACTIVE
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
};
