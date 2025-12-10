import React, { useState, useEffect, useRef } from 'react';
import { ICONS, LANGUAGE_BOILERPLATES } from './constants';
import { AppState, InterviewStatus, Role, Question, EvaluationReport } from './types';
import CodeEditor from './components/Editor';
import Terminal from './components/Terminal';
import VideoGrid from './components/VideoGrid';
import ReportCard from './components/ReportCard';
import { GeminiService } from './services/geminiService';
import { API } from './backend/api';
import Peer from 'peerjs';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LOBBY);
  const [accessCode, setAccessCode] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('candidate');
  
  // App State
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(LANGUAGE_BOILERPLATES['javascript']);
  const [output, setOutput] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Question Management (Simulating DB)
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [isQuestionExpanded, setIsQuestionExpanded] = useState(true);
  
  // Media & Network
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteVolume, setRemoteVolume] = useState(0); 
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.DISCONNECTED);
  
  const geminiRef = useRef<GeminiService | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null); 
  const callRef = useRef<any>(null);

  // Load questions from "Backend" on mount
  useEffect(() => {
    API.getQuestions().then(data => {
      setQuestions(data);
      // Default to first question
      if(data.length > 0) {
        setCurrentQuestion(data[0]);
        setCode(data[0].starterCode['javascript']);
      }
    });
  }, []);

  const startInterview = async () => {
    if (!username || !accessCode) return;
    setAppState(AppState.INTERVIEW);
    setStatus(InterviewStatus.CONNECTING);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      // 1. Candidate AI logic
      if (role === 'candidate') {
        // Initialize Gemini Service
        geminiRef.current = new GeminiService();
        
        // Attempt connection but don't block the whole flow if it fails
        geminiRef.current.connect(
          stream,
          (vol) => setRemoteVolume(vol),
          () => console.log("AI Disconnected"),
          (err) => {
             // Only log runtime errors, connection errors are caught below
             console.error("AI Runtime Error", err);
          }
        ).then(() => {
          console.log("AI Connected Successfully");
          // Start Video Loop only if connected
          if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
          videoIntervalRef.current = window.setInterval(() => {
            const videos = document.querySelectorAll('video');
            const localVideo = videos.length > 1 ? videos[1] : videos[0];
            if (localVideo && geminiRef.current) geminiRef.current.sendVideoFrame(localVideo as HTMLVideoElement);
          }, 1000);
        }).catch((e) => {
          console.warn("AI Connection Failed (Proceeding with manual interview)", e);
          // AI failed, but we continue to Peer connection
          if (geminiRef.current) {
            geminiRef.current.disconnect();
            geminiRef.current = null;
          }
        });
      }
      
      // 2. Peer Connection
      initPeer(stream);
      setStatus(InterviewStatus.CONNECTED);

    } catch (err) {
      console.error("Failed to start", err);
      setStatus(InterviewStatus.ERROR);
      setAppState(AppState.LOBBY);
    }
  };

  const initPeer = (stream: MediaStream) => {
    const myId = `${accessCode}-${role}`;
    const targetId = `${accessCode}-${role === 'candidate' ? 'interviewer' : 'candidate'}`;
    
    const peer = new Peer(myId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      if (role === 'interviewer') {
        connectToPeer(targetId, stream);
      }
    });

    peer.on('call', (call) => {
      call.answer(stream);
      callRef.current = call;
      call.on('stream', (rs: MediaStream) => setRemoteStream(rs));
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      setupDataConnection(conn);
    });
  };

  const connectToPeer = (targetId: string, stream: MediaStream) => {
    if (!peerRef.current) return;

    const call = peerRef.current.call(targetId, stream);
    callRef.current = call;
    call.on('stream', (rs: MediaStream) => setRemoteStream(rs));

    const conn = peerRef.current.connect(targetId);
    connRef.current = conn;
    
    conn.on('open', () => {
      // Sync initial state to candidate
      conn.send({ 
        type: 'SYNC_STATE', 
        payload: { 
          code, 
          language, 
          questionId: currentQuestion?.id 
        } 
      });
    });

    setupDataConnection(conn);
  };

  const setupDataConnection = (conn: any) => {
    conn.on('data', (data: any) => {
      if (data.type === 'CODE_CHANGE') setCode(data.payload);
      if (data.type === 'LANG_CHANGE') {
         setLanguage(data.payload.language);
         setCode(data.payload.code);
      }
      if (data.type === 'SYNC_STATE') {
        setLanguage(data.payload.language);
        setCode(data.payload.code);
        const q = questions.find(q => q.id === data.payload.questionId);
        if (q) setCurrentQuestion(q);
      }
      if (data.type === 'QUESTION_CHANGE') {
        const q = questions.find(q => q.id === data.payload.questionId);
        if (q) {
          setCurrentQuestion(q);
          setLanguage(data.payload.language);
          setCode(data.payload.code);
        }
      }
    });
  };

  const handleQuestionChange = (questionId: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q) return;

    // Logic to reset code to starter template when question changes
    const newCode = q.starterCode[language] || q.starterCode['javascript'];
    
    setCurrentQuestion(q);
    setCode(newCode);

    if (connRef.current?.open) {
      connRef.current.send({ 
        type: 'QUESTION_CHANGE', 
        payload: { questionId: q.id, code: newCode, language } 
      });
    }
  };

  const endInterview = async () => {
    if (geminiRef.current) geminiRef.current.disconnect();
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (callRef.current) callRef.current.close();
    if (peerRef.current) peerRef.current.destroy();
    
    setLocalStream(null);
    setRemoteStream(null);
    setAppState(AppState.ENDED);

    // Call "Backend" to generate report
    setIsGeneratingReport(true);
    const result = await API.generateReport(
      code, 
      language, 
      currentQuestion?.title || "Coding Problem"
    );
    setReport(result);
    setIsGeneratingReport(false);
  };

  // Reset state to Lobby without page reload
  const returnToLobby = () => {
    setAppState(AppState.LOBBY);
    setReport(null);
    setAccessCode('');
    setStatus(InterviewStatus.DISCONNECTED);
    setOutput('');
    setRemoteVolume(0);
    setLanguage('javascript');
    
    // Reset question state
    if (questions.length > 0) {
      setCurrentQuestion(questions[0]);
      setCode(questions[0].starterCode['javascript']);
    } else {
      setCode(LANGUAGE_BOILERPLATES['javascript']);
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    // Try to preserve code if it's not default, otherwise switch to starter
    // For simplicity, let's switch to starter for that language if we have a question
    let newCode = LANGUAGE_BOILERPLATES[newLang];
    if (currentQuestion && currentQuestion.starterCode[newLang]) {
      newCode = currentQuestion.starterCode[newLang];
    }
    
    setCode(newCode);
    
    if (connRef.current?.open) {
      connRef.current.send({ type: 'LANG_CHANGE', payload: { language: newLang, code: newCode } });
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (connRef.current?.open) {
      connRef.current.send({ type: 'CODE_CHANGE', payload: newCode });
    }
  };

  const handleRunCode = async () => {
    setIsRunningCode(true);
    let service = geminiRef.current;
    if (!service) service = new GeminiService();
    const result = await service.runCode(code, language);
    setOutput(result);
    setIsRunningCode(false);
  };

  if (appState === AppState.LOBBY) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
           <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <ICONS.Cpu className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-2">TechMeet AI</h1>
          <p className="text-gray-400 text-center mb-6">Join your technical interview session</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Ex: John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Access Code</label>
              <input 
                type="text" 
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Ex: 123-456"
              />
            </div>

            <div className="flex gap-4 p-1 bg-gray-700 rounded-lg">
              <button
                onClick={() => setRole('candidate')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  role === 'candidate' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Candidate
              </button>
              <button
                onClick={() => setRole('interviewer')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  role === 'interviewer' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Interviewer
              </button>
            </div>
            
            <button 
              onClick={startInterview}
              disabled={!username || !accessCode}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <ICONS.Video className="w-5 h-5" />
              Join as {role === 'candidate' ? 'Candidate' : 'Interviewer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === AppState.ENDED) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative">
        {isGeneratingReport ? (
           <div className="text-center">
             <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
             <h2 className="text-xl font-bold text-white">Generating Feedback Report...</h2>
             <p className="text-gray-400">Analyzing code complexity and quality</p>
           </div>
        ) : report ? (
           <ReportCard report={report} onClose={returnToLobby} />
        ) : (
           <div className="text-center">
             <h2 className="text-2xl font-bold text-white mb-4">Interview Ended</h2>
             <button onClick={returnToLobby} className="bg-gray-700 px-6 py-2 rounded text-white">Home</button>
           </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ICONS.Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">TechMeet AI</h1>
            <span className="text-xs text-gray-400 font-normal">Role: {role}</span>
          </div>
        </div>
        
        {/* Interviewer Controls for Question Selection */}
        {role === 'interviewer' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Current Problem:</span>
            <select 
              className="bg-gray-700 text-sm text-white px-3 py-1.5 rounded border border-gray-600 outline-none"
              value={currentQuestion?.id}
              onChange={(e) => handleQuestionChange(e.target.value)}
            >
              {questions.map(q => (
                <option key={q.id} value={q.id}>{q.title}</option>
              ))}
            </select>
          </div>
        )}
        
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            status === InterviewStatus.CONNECTED ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
               status === InterviewStatus.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            }`} />
            {status === InterviewStatus.CONNECTED ? 'LIVE' : 'CONNECTING...'}
          </div>
          <button 
            onClick={endInterview}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <ICONS.PhoneOff className="w-4 h-4" />
            Finish & Report
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        <div className="flex-[3] flex flex-col gap-4 min-w-0">
          <div className="flex-1 min-h-0 relative">
             {/* Problem Description Collapsible Panel */}
             {currentQuestion && isQuestionExpanded && (
               <div className="absolute top-14 right-4 z-20 max-w-[400px] w-full transition-all duration-300 ease-in-out flex justify-end">
                   <div className="bg-gray-800/95 backdrop-blur border border-gray-600 rounded-lg shadow-2xl overflow-hidden flex flex-col w-full animate-fade-in-down">
                     <div 
                       className="flex items-center justify-between px-4 py-2 bg-gray-700/50 border-b border-gray-600 cursor-pointer hover:bg-gray-700 transition-colors"
                       onClick={() => setIsQuestionExpanded(false)}
                     >
                        <h3 className="font-bold text-sm text-white flex items-center gap-2">
                          <ICONS.FileText className="w-4 h-4 text-blue-400" />
                          {currentQuestion.title}
                        </h3>
                        <button className="text-gray-400 hover:text-white">
                          <ICONS.ChevronUp className="w-4 h-4" />
                        </button>
                     </div>
                     <div className="p-4 text-sm text-gray-300 max-h-48 overflow-y-auto leading-relaxed">
                       {currentQuestion.description}
                     </div>
                   </div>
               </div>
             )}
            <CodeEditor 
              code={code} 
              language={language}
              onChange={handleCodeChange} 
              onLanguageChange={handleLanguageChange}
              onRun={handleRunCode}
              isRunning={isRunningCode}
              onToggleQuestion={() => setIsQuestionExpanded(prev => !prev)}
              showQuestionButton={!!currentQuestion}
            />
          </div>
          <div className="h-1/3 min-h-0">
            <Terminal output={output} />
          </div>
        </div>

        <div className="flex-[2] flex flex-col gap-4 min-w-0">
          <div className="flex-1 min-h-0">
            <VideoGrid 
              localStream={localStream} 
              remoteStream={remoteStream} 
              remoteVolume={remoteVolume} 
              role={role}
            />
          </div>
          <div className="h-1/3 bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col">
            <div className="flex items-center gap-2 text-gray-300 mb-3 font-medium border-b border-gray-700 pb-2">
              <ICONS.MessageSquare className="w-4 h-4" />
              <span>Interview Context</span>
            </div>
            <div className="flex-1 overflow-y-auto text-sm text-gray-400 space-y-2">
              <p className="bg-gray-700/50 p-2 rounded">
                <span className="text-blue-400 font-bold block mb-1">Status</span>
                {remoteStream ? "Connected to Human Interviewer." : "Waiting for Interviewer..."}
              </p>
              {role === 'candidate' && (
                <p className="bg-gray-700/50 p-2 rounded">
                  <span className="text-blue-400 font-bold block mb-1">Active Task</span>
                  {currentQuestion ? currentQuestion.title : "Waiting for question..."}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;