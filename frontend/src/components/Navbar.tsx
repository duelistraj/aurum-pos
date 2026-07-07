import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  TrendingUp,
  PieChart,
  Home,
  Clock,
  Scan,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const leftItems = [
    { label: 'Home', href: '/', icon: <Home className="w-6 h-6" /> },
    { label: 'POS', href: '/pos', icon: <ShoppingCart className="w-6 h-6" /> },
    { label: 'Items', href: '/items', icon: <Package className="w-6 h-6" /> },
  ];

  const rightItems = [
    { label: 'Metal Rates', href: '/rates', icon: <TrendingUp className="w-6 h-6" /> },
    { label: 'History', href: '/history', icon: <Clock className="w-6 h-6" /> },
    { label: 'Analytics', href: '/analytics', icon: <PieChart className="w-6 h-6" /> },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-20 select-none">
      {/* Background with Notch */}
      <div className="absolute inset-0 flex">
        {/* Left Side Backdrop */}
        <div className="flex-1 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.03)] rounded-tl-3xl" />
        
        {/* Center Notch Backdrop */}
        <div className="relative w-32 h-20 flex-shrink-0 bg-transparent overflow-visible">
          <svg
            className="absolute top-0 left-0 w-full h-full text-white dark:text-slate-900 fill-current filter drop-shadow-[0_-8px_30px_rgba(0,0,0,0.03)]"
            viewBox="0 0 120 80"
            preserveAspectRatio="none"
          >
            {/* The white filled shape of the notch */}
            <path d="M 0 0 C 20 0, 35 45, 60 45 C 85 45, 100 0, 120 0 L 120 80 L 0 80 Z" />
            {/* The top border line of the notch */}
            <path
              d="M 0 0 C 20 0, 35 45, 60 45 C 85 45, 100 0, 120 0"
              fill="none"
              className="stroke-slate-100 dark:stroke-slate-800"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Right Side Backdrop */}
        <div className="flex-1 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.03)] rounded-tr-3xl" />
      </div>

      {/* Interactive Content */}
      <div className="absolute inset-0 flex justify-between items-center px-8 lg:px-16 z-10">
        
        {/* Left Navigation Buttons */}
        <div className="flex items-center justify-around w-[calc(50%-64px)]">
          {leftItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex flex-col items-center justify-center space-y-1 transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'text-amber-500 font-semibold scale-105'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <div className="transform transition-transform active:scale-90">{item.icon}</div>
                <span className="text-[10px] tracking-wide font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Center Floating Action Button (FAB) and Label */}
        <div className="relative flex flex-col items-center justify-center w-32 -mt-8">
          <Link
            to="/pos?scan=true"
            className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-900 text-white hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer mb-1"
            title="Scan Barcode"
          >
            <Scan className="w-7 h-7" />
          </Link>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-2 tracking-wide uppercase">Scan</span>
        </div>

        {/* Right Navigation Buttons */}
        <div className="flex items-center justify-around w-[calc(50%-64px)]">
          {rightItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex flex-col items-center justify-center space-y-1 transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'text-amber-500 font-semibold scale-105'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <div className="transform transition-transform active:scale-90">{item.icon}</div>
                <span className="text-[10px] tracking-wide font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
};
