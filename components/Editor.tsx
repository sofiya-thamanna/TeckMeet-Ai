import React from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import { ICONS, SUPPORTED_LANGUAGES } from '../constants';

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  onLanguageChange: (lang: string) => void;
  onRun: () => void;
  isRunning: boolean;
  onToggleQuestion?: () => void;
  showQuestionButton?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
  code, 
  language, 
  onChange, 
  onLanguageChange, 
  onRun, 
  isRunning,
  onToggleQuestion,
  showQuestionButton = false
}) => {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl border border-gray-700">
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700 h-12 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-gray-300">
            <ICONS.Code2 className="w-4 h-4" />
            <span className="text-sm font-medium hidden sm:inline">Editor</span>
          </div>
          
          <div className="relative">
             <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 outline-none border border-gray-600 focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: `right 0.2rem center`,
                backgroundSize: `1.5em 1.5em`,
                backgroundRepeat: 'no-repeat'
              }}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {showQuestionButton && (
            <button
              onClick={onToggleQuestion}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs text-blue-400 font-medium transition-colors"
              title="Toggle Problem View"
            >
              <ICONS.FileText className="w-3 h-3" />
              <span>Problem</span>
            </button>
          )}
        </div>

        <button
          onClick={onRun}
          disabled={isRunning}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm font-medium transition-colors
            ${isRunning 
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
        >
          <ICONS.Play className="w-3 h-3 fill-current" />
          <span>{isRunning ? 'Running...' : 'Run'}</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-auto code-editor-font relative">
        <Editor
          value={code}
          onValueChange={onChange}
          highlight={code => Prism.highlight(code, Prism.languages[language] || Prism.languages.javascript, language)}
          padding={16}
          className="min-h-full font-mono text-sm"
          style={{
            fontFamily: '"Fira Code", "Fira Mono", monospace',
            fontSize: 14,
            backgroundColor: '#1e1e1e',
            color: '#f8f8f2'
          }}
          textareaClassName="focus:outline-none"
        />
      </div>
    </div>
  );
};

export default CodeEditor;