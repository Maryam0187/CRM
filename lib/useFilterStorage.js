import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to save and restore filter state in localStorage
 * @param {string} key - localStorage key
 * @param {object} defaultFilters - default filter values
 */
export function useFilterStorage(key, defaultFilters) {
  const [filters, setFilters] = useState(() => {
    // Check if we're in the browser (client-side)
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsedFilters = JSON.parse(saved);
          return { ...defaultFilters, ...parsedFilters };
        }
      } catch (error) {
        console.error('Error loading filters from localStorage:', error);
      }
    }
    return defaultFilters;
  });

  const isFirstRender = useRef(true);

  // Save filters to localStorage whenever they change (but not on first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    // Only save to localStorage if we're in the browser
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(filters));
      } catch (error) {
        console.error('Error saving filters to localStorage:', error);
      }
    }
  }, [key, filters]);

  const updateFilter = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return {
    filters,
    updateFilter,
    resetFilters,
    setFilters
  };
}
