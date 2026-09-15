import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { Bot } from 'lucide-react';

export const AIAssistantFAB: React.FC = () => {
  const { currentPage, navigateTo } = usePlatform();

  if (currentPage === 'dashboard' || currentPage === 'settings') {
    return null;
  }

  return (
    <button
      onClick={() => navigateTo('ai-assistant')}
      title="AI Assistant"
      className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-white text-dark-950 shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] active:scale-95 transition-all flex items-center justify-center"
    >
      <Bot size={20} />
    </button>
  );
};