import React from 'react';
import { ICONS } from '../constants';

interface TerminalProps {
  output: string;
}

const Terminal: React.FC<TerminalProps> = ({ output }) => {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl border border-gray-700">
      <div className="flex items-center space-x-2 px-4 py-2 bg-[#252526] border-b border-gray-700 text-gray-300">
        <ICONS.Monitor className="w-4 h-4" />
        <span className="text-sm font-medium">Console Output</span>
      </div>
      <div className="flex-1 p-4 font-mono text-sm text-gray-300 overflow-auto whitespace-pre-wrap">
        {output || <span className="text-gray-500 italic">Run code to see output...</span>}
      </div>
    </div>
  );
};

export default Terminal;