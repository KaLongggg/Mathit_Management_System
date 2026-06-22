import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const show = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col gap-2 pb-safe">
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            className={`animate-slide-up rounded-xl px-4 py-3 text-sm font-medium text-white shadow-soft ${
              i.type === 'error' ? 'bg-coral-600' : i.type === 'success' ? 'bg-emerald-600' : 'bg-slate-900'
            }`}
          >
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
