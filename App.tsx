import React, { useState, useEffect, useRef } from 'react';
import { ICONS, LANGUAGE_BOILERPLATES } from './constants';
import { AppState, InterviewStatus, Role, Question, EvaluationReport, ChatMessage } from './types';
import CodeEditor from './components/Editor';
import Terminal from './components/Terminal';
import VideoGrid from './components/VideoGrid';
import ReportCard from './components/ReportCard';
import ChatBox from './components/ChatBox';
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
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.DISCONNECTED);
  
  // Media Controls State
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const webcamVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'chat'>('info');

  // Alerts / Malpractice
  const [alerts, setAlerts] = useState<{id: number, text: string}[]>([]);
  
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

  // Monitoring Logic for Candidate
  useEffect(() => {
    if (appState !== AppState.INTERVIEW || role !== 'candidate') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const msg = "Candidate switched tabs or minimized the window.";
        // Notify local (hidden) logic if needed, but primarily notify remote
        if (connRef.current?.open) {
          connRef.current.send({ type: 'ALERT', payload: msg });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appState, role]);

  const addAlert = (text: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, text }]);
    // Auto remove after 5 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, 5000);
  };

  const startInterview = async () => {
    if (!username || !accessCode) return;
    setAppState(AppState.INTERVIEW);
    setStatus(InterviewStatus.CONNECTING);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      // Store original webcam track for switching back from screen share
      webcamVideoTrackRef.current = stream.getVideoTracks()[0];

      // 1. Candidate AI logic (Hidden Proctor Mode)
      if (role === 'candidate') {
        // Cleanup previous instance if exists
        if (geminiRef.current) {
          geminiRef.current.disconnect();
        }
        // Initialize Gemini Service
        geminiRef.current = new GeminiService();
        
        // Connect but don't bind volume to UI since we removed AI visualizer
        geminiRef.current.connect(
          stream,
          (vol) => {}, // No visualizer
          () => console.log("AI Disconnected"),
          (err) => {
             const msg = err?.message || err?.toString() || '';
             if (msg.toLowerCase().includes('network error')) {
               console.warn("AI Network Fluctuation:", msg);
             } else {
               console.error("AI Runtime Error:", err);
             }
          }
        ).then(() => {
          console.log("AI Proctor Connected Successfully");
          if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
          videoIntervalRef.current = window.setInterval(() => {
            const videos = document.querySelectorAll('video');
            const localVideo = videos.length > 1 ? videos[1] : videos[0];
            if (localVideo && geminiRef.current) geminiRef.current.sendVideoFrame(localVideo as HTMLVideoElement);
          }, 1000);
        }).catch((e) => {
          console.warn("AI Connection Failed (Proceeding with manual interview)", e);
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
      if (data.type === 'CHAT_MESSAGE') {
        setChatMessages(prev => [...prev, data.payload]);
        if (activeTab !== 'chat') setActiveTab('chat'); // Notify user
      }
      if (data.type === 'ALERT') {
        // Received malpractice alert
        addAlert(`⚠️ ${data.payload}`);
      }
    });
  };

  // --- Media Controls ---

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMicOn;
      });
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      // If screen sharing, we don't toggle camera tracks usually, 
      // but let's assume this toggles the "video" component regardless of source
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop Screen Share
      stopScreenShare();
    } else {
      // Start Screen Share
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];

        // Handle user clicking "Stop sharing" from browser UI
        screenTrack.onended = () => {
          stopScreenShare();
        };

        if (localStream) {
          // Replace track in PeerConnection (sends to remote)
          // Ensure peerConnection exists before accessing it
          if (callRef.current && callRef.current.peerConnection) {
            const sender = callRef.current.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(screenTrack);
            }
          }

          // Update local stream to show screen share locally
          const newStream = new MediaStream([screenTrack, ...localStream.getAudioTracks()]);
          setLocalStream(newStream);
          setIsScreenSharing(true);
        }
      } catch (err) {
        console.error("Error sharing screen:", err);
      }
    }
  };

  const stopScreenShare = () => {
    if (webcamVideoTrackRef.current && localStream) {
      // Replace track back to webcam in PeerConnection
      if (callRef.current && callRef.current.peerConnection) {
        const sender = callRef.current.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(webcamVideoTrackRef.current);
        }
      }

      // Restore local stream
      const newStream = new MediaStream([webcamVideoTrackRef.current, ...localStream.getAudioTracks()]);
      setLocalStream(newStream);
      setIsScreenSharing(false);
    }
  };

  // --- Chat ---

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'Me',
      text,
      timestamp: Date.now()
    };
    
    setChatMessages(prev => [...prev, newMessage]);

    // Send to peer
    if (connRef.current?.open) {
      const peerMessage: ChatMessage = {
        ...newMessage,
        sender: role === 'candidate' ? 'Candidate' : 'Interviewer' 
      };
      connRef.current.send({ type: 'CHAT_MESSAGE', payload: peerMessage });
    }
  };

  // --- App Logic ---

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
    setAlerts([]);

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
    if (geminiRef.current) {
      geminiRef.current.disconnect();
      geminiRef.current = null;
    }
    setAppState(AppState.LOBBY);
    setReport(null);
    setAccessCode('');
    setStatus(InterviewStatus.DISCONNECTED);
    setOutput('');
    setLanguage('javascript');
    setChatMessages([]);
    setIsMicOn(true);
    setIsCameraOn(true);
    setIsScreenSharing(false);
    setAlerts([]);
    
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
    <div className="h-screen flex flex-col bg-gray-900 relative">
      {/* Alert Overlays */}
      <div className="absolute top-20 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm border border-red-400 animate-fade-in-left max-w-sm flex items-start gap-3">
            <div className="bg-white rounded-full p-1 mt-0.5">
               <ICONS.VideoOff className="w-3 h-3 text-red-600" />
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-1">Alert</h4>
              <p className="text-sm font-medium">{alert.text}</p>
            </div>
          </div>
        ))}
      </div>

      <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ICONS.Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">TechMeet AI</h1>
            <span className="text-xs text-gray-400 font-normal">Role: {role}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Interviewer Controls for Question Selection */}
          {role === 'interviewer' && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Problem:</span>
              <select 
                className="bg-gray-700 text-sm text-white px-3 py-1.5 rounded border border-gray-600 outline-none max-w-[150px]"
                value={currentQuestion?.id}
                onChange={(e) => handleQuestionChange(e.target.value)}
              >
                {questions.map(q => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </select>
            </div>
          )}

           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            status === InterviewStatus.CONNECTED ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
               status === InterviewStatus.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            }`} />
            {status === InterviewStatus.CONNECTED ? 'LIVE' : 'WAITING'}
          </div>
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
              role={role}
              isMicOn={isMicOn}
              isCameraOn={isCameraOn}
            />
          </div>
          <div className="h-1/3 bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden">
             {/* Tabs */}
             <div className="flex border-b border-gray-700">
               <button 
                 onClick={() => setActiveTab('info')}
                 className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'info' ? 'bg-gray-700/50 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
               >
                 <ICONS.Settings className="w-4 h-4" />
                 Context
               </button>
               <button 
                 onClick={() => setActiveTab('chat')}
                 className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-gray-700/50 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
               >
                 <ICONS.MessageSquare className="w-4 h-4" />
                 Chat 
                 {chatMessages.length > 0 && (
                   <span className="bg-blue-600 text-[10px] px-1.5 rounded-full">{chatMessages.length}</span>
                 )}
               </button>
             </div>

             {/* Tab Content */}
             <div className="flex-1 min-h-0 overflow-hidden">
               {activeTab === 'info' ? (
                 <div className="p-4 overflow-y-auto h-full text-sm text-gray-400 space-y-2">
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
               ) : (
                 <ChatBox 
                   messages={chatMessages} 
                   onSendMessage={handleSendMessage}
                 />
               )}
             </div>
          </div>
        </div>
      </main>
      
      {/* Footer Media Controls */}
      <footer className="h-16 bg-gray-800 border-t border-gray-700 flex items-center justify-center gap-4 px-6 shrink-0 z-20">
         <div className="flex items-center gap-3">
           <button 
             onClick={toggleMic}
             className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMicOn ? 'bg-gray-700 hover:bg-gray-600 text-white shadow-lg' : 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'}`}
             title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
           >
             {isMicOn ? <ICONS.Mic className="w-5 h-5" /> : <ICONS.MicOff className="w-5 h-5" />}
           </button>
           <button 
             onClick={toggleCamera}
             className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600 text-white shadow-lg' : 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'}`}
             title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
           >
             {isCameraOn ? <ICONS.Video className="w-5 h-5" /> : <ICONS.VideoOff className="w-5 h-5" />}
           </button>
           <button 
             onClick={toggleScreenShare}
             className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-700 hover:bg-gray-600 text-white shadow-lg'}`}
             title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
           >
             <ICONS.Monitor className="w-5 h-5" />
           </button>
           
           <div className="h-8 w-px bg-gray-600 mx-2"></div>
           
           <button 
            onClick={endInterview}
            className="px-6 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-lg flex items-center gap-2"
          >
            <ICONS.PhoneOff className="w-5 h-5" />
            <span className="hidden sm:inline">End Call</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;