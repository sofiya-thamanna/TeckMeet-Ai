import React from 'react';
import { EvaluationReport } from '../types';
import { ICONS } from '../constants';

interface ReportCardProps {
  report: EvaluationReport;
  onClose: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ report, onClose }) => {
  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <ICONS.Cpu className="w-6 h-6 text-blue-500" />
          Interview Report
        </h2>
        <div className={`text-2xl font-bold ${report.score >= 70 ? 'text-green-500' : 'text-yellow-500'}`}>
          {report.score}/100
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 p-4 rounded-lg">
          <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Time Complexity</span>
          <span className="text-lg font-mono text-blue-300">{report.timeComplexity}</span>
        </div>
        <div className="bg-gray-900 p-4 rounded-lg">
          <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Space Complexity</span>
          <span className="text-lg font-mono text-purple-300">{report.spaceComplexity}</span>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-gray-300 font-semibold mb-2">Summary</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{report.feedback}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <h3 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
            <span className="text-lg">✓</span> Strengths
          </h3>
          <ul className="text-sm text-gray-400 space-y-1 list-disc pl-4">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
            <span className="text-lg">!</span> Improvements
          </h3>
          <ul className="text-sm text-gray-400 space-y-1 list-disc pl-4">
            {report.improvements.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      </div>

      <button 
        onClick={onClose}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
      >
        Close & Return Home
      </button>
    </div>
  );
};

export default ReportCard;