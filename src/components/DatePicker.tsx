import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface DatePickerWithPresetsProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

const presets = [
  {
    label: 'Today',
    getValue: () => new Date()
  },
  {
    label: '3 months ago',
    getValue: () => {
      const date = new Date();
      date.setMonth(date.getMonth() - 3);
      return date;
    }
  },
  {
    label: '6 months ago',
    getValue: () => {
      const date = new Date();
      date.setMonth(date.getMonth() - 6);
      return date;
    }
  },
  {
    label: '1 year ago',
    getValue: () => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 1);
      return date;
    }
  },
  {
    label: 'Start date (1/1/2024)',
    getValue: () => new Date('2024-01-01')
  }
];

export function DatePickerWithPresets({
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  maxDate,
  className = ''
}: DatePickerWithPresetsProps) {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedPreset = presets.find(p => p.label === e.target.value);
    if (selectedPreset) {
      const presetDate = selectedPreset.getValue();
      onChange(presetDate);
    }
    // Reset select to placeholder
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <DatePicker
        selected={value}
        onChange={onChange}
        placeholderText={placeholder}
        minDate={minDate}
        maxDate={maxDate}
        className={`w-full rounded-xl border px-3 py-2 ${className}`}
        dateFormat="yyyy-MM-dd"
        isClearable
        renderCustomHeader={({
          date,
          decreaseMonth,
          increaseMonth,
          prevMonthButtonDisabled,
          nextMonthButtonDisabled,
        }) => (
          <div className="flex items-center justify-between p-2 border-b">
            <button
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
              className="p-1 hover:bg-gray-100 rounded"
            >
              ←
            </button>
            <span className="font-semibold">
              {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={increaseMonth}
              disabled={nextMonthButtonDisabled}
              className="p-1 hover:bg-gray-100 rounded"
            >
              →
            </button>
          </div>
        )}
        renderDayContents={(day) => (
          <span className="text-sm">{day}</span>
        )}
        popperContainer={({ children }) => (
          <div className="z-50">
            {children}
          </div>
        )}
        popperModifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 8],
            },
          },
        ]}
      />
      
      {/* Preset select dropdown */}
      <select
        onChange={handlePresetChange}
        className="w-full text-xs rounded-lg border border-gray-200 px-2 py-1 bg-white text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        defaultValue=""
      >
        <option value="" disabled>Quick select...</option>
        {presets.map((preset) => (
          <option key={preset.label} value={preset.label}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}
