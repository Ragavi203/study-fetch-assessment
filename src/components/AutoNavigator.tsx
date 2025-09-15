"use client";
import { useState, useEffect, useRef } from 'react';
import { parseAutoNavigationCues } from '@/lib/chatUtils';

interface AutoNavigatorProps {
  content: string;
  isActive?: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function AutoNavigator({ 
  content, 
  isActive,
  currentPage,
  onPageChange
}: AutoNavigatorProps) {
  const [navigationCues, setNavigationCues] = useState<{page: number, delayMs: number}[]>([]);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  
  // Extract navigation cues when content changes
  useEffect(() => {
    if (!content || !isActive) return;
    
    const cues = parseAutoNavigationCues(content);
    setNavigationCues(cues);
    
    if (cues.length > 0) {
      setIsNavigating(true);
      setActiveStep(0);
    }
  }, [content, isActive]);
  
  // Handle auto-navigation steps
  useEffect(() => {
    // Clear any existing timers
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current = [];
    
    if (!isNavigating || navigationCues.length === 0) {
      return;
    }
    
    let cumulativeDelay = 0;
    
    // Set up timers for each navigation step
    navigationCues.forEach((cue, index) => {
      cumulativeDelay += index === 0 ? cue.delayMs : (cue.delayMs - navigationCues[index - 1].delayMs);
      
      const timer = setTimeout(() => {
        // Change page and update active step
        onPageChange(cue.page);
        setActiveStep(index);
        
        // If this is the last step, end navigation
        if (index === navigationCues.length - 1) {
          setTimeout(() => setIsNavigating(false), 1000);
        }
      }, cumulativeDelay);
      
      timersRef.current.push(timer);
    });
    
    // Cleanup function
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, [isNavigating, navigationCues, onPageChange]);
  
  // Skip auto-navigation if user manually changes page
  useEffect(() => {
    if (isNavigating && navigationCues.length > 0) {
      const currentCue = navigationCues[activeStep];
      if (currentCue && currentPage !== currentCue.page) {
        // User manually changed the page, stop auto-navigation
        setIsNavigating(false);
        timersRef.current.forEach(timer => clearTimeout(timer));
      }
    }
  }, [currentPage, isNavigating, navigationCues, activeStep]);
  
  // Render navigation indicator when active
  if (isNavigating && navigationCues.length > 0) {
    return (
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900/95 rounded-md px-4 py-2 text-white text-sm font-medium flex items-center gap-2 shadow-lg border border-blue-500/30">
        <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full"></div>
        <span>Auto-navigating page {activeStep + 1}/{navigationCues.length}</span>
        <button 
          onClick={() => {
            setIsNavigating(false);
            timersRef.current.forEach(timer => clearTimeout(timer));
          }}
          className="ml-2 text-xs bg-gray-700 hover:bg-gray-600 rounded-md px-3 py-1 flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Stop
        </button>
      </div>
    );
  }
  
  return null;
}