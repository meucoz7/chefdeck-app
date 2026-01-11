import React, { useState, useEffect } from 'react';

const Tools: React.FC = () => {
  // --- CONVERTER STATE ---
  const [amount, setAmount] = useState('');
  const [fromUnit, setFromUnit] = useState('г');
  const [toUnit, setToUnit] = useState('кг');
  const [result, setResult] = useState<string | null>(null);

  const convert = () => {
    const val = parseFloat(amount);
    if (isNaN(val)) { setResult(null); return; }

    let inGrams = 0;
    // Normalize to grams/ml
    switch (fromUnit) {
      case 'г': inGrams = val; break;
      case 'кг': inGrams = val * 1000; break;
      case 'мл': inGrams = val; break; // Assume density 1
      case 'л': inGrams = val * 1000; break;
      case 'унция': inGrams = val * 28.35; break;
      case 'фунт': inGrams = val * 453.59; break;
    }

    let outVal = 0;
    switch (toUnit) {
      case 'г': outVal = inGrams; break;
      case 'кг': outVal = inGrams / 1000; break;
      case 'мл': outVal = inGrams; break;
      case 'л': outVal = inGrams / 1000; break;
      case 'унция': outVal = inGrams / 28.35; break;
      case 'фунт': outVal = inGrams / 453.59; break;
    }

    setResult(outVal.toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
  };

  useEffect(() => {
    convert();
  }, [amount, fromUnit, toUnit]);

  // --- TIMER STATE ---
  const [time, setTime] = useState(0); // seconds
  const [isRunning, setIsRunning] = useState(false);
  const [initialTime, setInitialTime] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && time > 0) {
      interval = setInterval(() => {
        setTime((prev) => prev - 1);
      }, 1000);
    } else if (time === 0) {
      setIsRunning(false);
      if (initialTime > 0 && isRunning) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, time]);

  const startTimer = (min: number) => {
    setTime(min * 60);
    setInitialTime(min * 60);
    setIsRunning(true);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // SVG Progress calculation
  const radius = 120;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = initialTime > 0 ? circumference - (time / initialTime) * circumference : 0;

  return (
    <div className="px-5 pt-10 pb-20 animate-fade-in min-h-screen">
      <h1 className="text-3xl font-extrabold dark:text-white mb-8">Инструменты</h1>

      {/* CONVERTER */}
      <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2rem] shadow-sm mb-6 border border-gray-100 dark:border-white/5">
         <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
            Калькулятор веса
         </h2>
         
         <div className="relative">
            {/* Input Group */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center bg-gray-50 dark:bg-black/20 rounded-2xl p-2 pr-4">
                    <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="flex-1 bg-transparent p-3 text-2xl font-bold outline-none dark:text-white placeholder-gray-300"
                    />
                    <select 
                        value={fromUnit} 
                        onChange={(e) => setFromUnit(e.target.value)}
                        className="bg-white dark:bg-[#2a2a35] shadow-sm rounded-xl py-2 px-3 font-bold text-sm outline-none dark:text-white border border-gray-100 dark:border-white/5"
                    >
                        <option value="г">г</option>
                        <option value="кг">кг</option>
                        <option value="мл">мл</option>
                        <option value="л">л</option>
                        <option value="унция">oz</option>
                    </select>
                </div>

                <div className="flex justify-center -my-3 z-10">
                     <div className="bg-gray-200 dark:bg-white/10 rounded-full p-1.5 border-4 border-white dark:border-[#1e1e24]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-gray-500 dark:text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                        </svg>
                     </div>
                </div>

                <div className="flex items-center bg-sky-50 dark:bg-sky-900/10 rounded-2xl p-2 pr-4 border border-sky-100 dark:border-sky-500/20">
                    <div className="flex-1 p-3 text-2xl font-bold text-sky-600 dark:text-sky-400 truncate">
                         {result || '0'}
                    </div>
                    <select 
                        value={toUnit} 
                        onChange={(e) => setToUnit(e.target.value)}
                        className="bg-white dark:bg-[#2a2a35] shadow-sm rounded-xl py-2 px-3 font-bold text-sm outline-none dark:text-white border border-gray-100 dark:border-white/5"
                    >
                        <option value="г">г</option>
                        <option value="кг">кг</option>
                        <option value="мл">мл</option>
                        <option value="л">л</option>
                        <option value="унция">oz</option>
                    </select>
                </div>
            </div>
         </div>
      </div>

      {/* TIMER */}
      <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
         <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6">
            Кухонный таймер
         </h2>
         
         <div className="flex justify-center mb-8 relative">
             <div className="relative w-64 h-64 flex items-center justify-center">
                 {/* SVG Circle */}
                 <svg
                    height={radius * 2}
                    width={radius * 2}
                    className="transform -rotate-90"
                 >
                    <circle
                        stroke="currentColor"
                        className="text-gray-100 dark:text-white/5"
                        strokeWidth={stroke}
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        fill="transparent"
                    />
                    <circle
                        stroke="currentColor"
                        className={`transition-all duration-1000 ease-linear ${isRunning ? 'text-orange-500' : 'text-sky-500'}`}
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset }}
                        strokeLinecap="round"
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        fill="transparent"
                    />
                 </svg>
                 <div className="absolute text-5xl font-black font-mono tracking-wider text-gray-900 dark:text-white">
                    {formatTime(time)}
                 </div>
             </div>
         </div>

         <div className="grid grid-cols-4 gap-3 mb-6">
             {[1, 5, 10, 15].map(m => (
                 <button 
                    key={m}
                    onClick={() => startTimer(m)}
                    className="bg-gray-50 dark:bg-white/5 py-3 rounded-xl font-bold text-xs hover:bg-gray-100 dark:hover:bg-white/10 transition dark:text-gray-300 border border-transparent active:border-sky-500"
                 >
                    +{m} м
                 </button>
             ))}
         </div>

         <div className="flex gap-4">
             <button 
                onClick={() => setIsRunning(!isRunning)}
                className={`flex-1 py-4 rounded-2xl font-bold text-white transition-all shadow-lg active:scale-95 ${isRunning ? 'bg-orange-500 shadow-orange-500/20' : 'bg-gray-900 dark:bg-sky-500 shadow-gray-900/20 dark:shadow-sky-500/30'}`}
             >
                 {isRunning ? 'Пауза' : (time > 0 && initialTime > 0 ? 'Продолжить' : 'Старт')}
             </button>
             <button 
                onClick={() => { setIsRunning(false); setTime(0); setInitialTime(0); }}
                className="px-6 py-4 bg-gray-100 dark:bg-white/5 rounded-2xl font-bold text-gray-600 dark:text-gray-300 transition hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95"
             >
                 Сброс
             </button>
         </div>
      </div>

    </div>
  );
};

export default Tools;