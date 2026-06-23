"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface DateTimePickerProps {
  value: string; // YYYY-MM-DDTHH:MM
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

export default function DateTimePicker({ value, onChange, label, required = false }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial value or default to current time
  const getInitialDate = () => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const [currentDate, setCurrentDate] = useState<Date>(getInitialDate());
  const [selectedDate, setSelectedDate] = useState<Date>(getInitialDate());

  // Keep local states synced if value changes from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setCurrentDate(d);
      }
    }
  }, [value]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, "0");

  // Format local Date object to YYYY-MM-DDTHH:MM
  const formatLocalDateTime = (date: Date) => {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  };

  // Human readable format for the trigger button
  const formatHumanReadable = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return date.toLocaleString("en-US", options);
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDaySelect = (dayNum: number) => {
    const updated = new Date(selectedDate);
    updated.setFullYear(year);
    updated.setMonth(month);
    updated.setDate(dayNum);
    setSelectedDate(updated);
    onChange(formatLocalDateTime(updated));
  };

  const handleTimeChange = (type: "hour" | "minute" | "ampm", val: string) => {
    const updated = new Date(selectedDate);
    let h = updated.getHours();
    const m = updated.getMinutes();

    if (type === "hour") {
      const targetHour = parseInt(val);
      const isPM = h >= 12;
      if (isPM) {
        h = targetHour === 12 ? 12 : targetHour + 12;
      } else {
        h = targetHour === 12 ? 0 : targetHour;
      }
    } else if (type === "minute") {
      updated.setMinutes(parseInt(val));
    } else if (type === "ampm") {
      const isPM = val === "PM";
      const current12Hour = h % 12 || 12;
      if (isPM) {
        h = current12Hour === 12 ? 12 : current12Hour + 12;
      } else {
        h = current12Hour === 12 ? 0 : current12Hour;
      }
    }

    if (type === "hour" || type === "ampm") {
      updated.setHours(h);
    }

    setSelectedDate(updated);
    onChange(formatLocalDateTime(updated));
  };

  // Convert 24h to 12h for inputs
  const currentHours24 = selectedDate.getHours();
  const currentHours12 = currentHours24 % 12 || 12;
  const currentMinutes = selectedDate.getMinutes();
  const currentAMPM = currentHours24 >= 12 ? "PM" : "AM";

  // Generate calendar cells
  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} className="w-9 h-9" />);
  }
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const isSelected =
      selectedDate.getDate() === dayNum &&
      selectedDate.getMonth() === month &&
      selectedDate.getFullYear() === year;

    const isToday =
      new Date().getDate() === dayNum &&
      new Date().getMonth() === month &&
      new Date().getFullYear() === year;

    cells.push(
      <button
        key={`day-${dayNum}`}
        type="button"
        onClick={() => handleDaySelect(dayNum)}
        className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm transition-all relative ${
          isSelected
            ? "bg-brand-500 text-white font-semibold shadow-lg shadow-brand-500/20"
            : isToday
            ? "border border-brand-500 text-brand-400 font-medium"
            : "text-text-primary hover:bg-bg-surface-elevated hover:text-white"
        }`}
      >
        {dayNum}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="premium-input flex items-center justify-between text-left cursor-pointer hover:border-brand-500/50"
      >
        <span className={value ? "text-white" : "text-text-tertiary"}>
          {value ? formatHumanReadable(selectedDate) : "Select date and time..."}
        </span>
        <svg
          className="w-5 h-5 text-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 z-50 mt-2 w-[340px] glass-card p-5 bg-bg-surface/95 border border-border-strong shadow-2xl backdrop-blur-xl"
          >
            {/* Header: Month & Year Selector */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg bg-bg-surface-elevated border border-border-strong text-text-secondary hover:text-white transition-all hover:bg-bg-surface-elevated/80"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-semibold text-white">
                {months[month]} {year}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg bg-bg-surface-elevated border border-border-strong text-text-secondary hover:text-white transition-all hover:bg-bg-surface-elevated/80"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                <div key={dayName} className="text-xs font-bold text-text-tertiary uppercase py-1">
                  {dayName}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 justify-items-center mb-4">
              {cells}
            </div>

            {/* Time Picker Section */}
            <div className="border-t border-border-strong pt-4 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-tertiary uppercase">Time</span>
                <div className="flex items-center gap-1.5">
                  {/* Hours Select */}
                  <select
                    value={currentHours12}
                    onChange={(e) => handleTimeChange("hour", e.target.value)}
                    className="bg-bg-surface-elevated border border-border-strong text-white text-sm font-semibold rounded-lg p-1.5 focus:outline-none focus:border-brand-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>
                        {pad(h)}
                      </option>
                    ))}
                  </select>

                  <span className="text-text-secondary font-bold">:</span>

                  {/* Minutes Select */}
                  <select
                    value={currentMinutes}
                    onChange={(e) => handleTimeChange("minute", e.target.value)}
                    className="bg-bg-surface-elevated border border-border-strong text-white text-sm font-semibold rounded-lg p-1.5 focus:outline-none focus:border-brand-500"
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>
                        {pad(m)}
                      </option>
                    ))}
                  </select>

                  {/* AM/PM Button */}
                  <button
                    type="button"
                    onClick={() => handleTimeChange("ampm", currentAMPM === "AM" ? "PM" : "AM")}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-border-strong bg-bg-surface-elevated text-brand-400 hover:bg-bg-surface-elevated/80 transition-all cursor-pointer"
                  >
                    {currentAMPM}
                  </button>
                </div>
              </div>
            </div>

            {/* Action Row */}
            <div className="border-t border-border-strong pt-4 mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setSelectedDate(now);
                  onChange(formatLocalDateTime(now));
                }}
                className="text-xs text-text-secondary hover:text-white font-medium"
              >
                Set Current Time
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="bg-brand-500 hover:bg-brand-400 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-all"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
