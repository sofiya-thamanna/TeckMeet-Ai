import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ICONS, LANGUAGE_BOILERPLATES } from './constants';
import { AppState, InterviewStatus, Role } from './types';
import CodeEditor from './components/Editor';
import Terminal from './components/Terminal';
import VideoGrid from './components/VideoGrid';
import { GeminiService } from './services/geminiService';
import Peer from 'peerjs';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LOBBY);
  const [accessCode, setAccessCode] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('candidate');
  
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(LANGUAGE_BOILERPLATES['javascript']);
  const [output, setOutput] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteVolume, setRemoteVolume] = useState(0); // For AI
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.DISCONNECTED);
  
  const geminiRef = useRef<GeminiService | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  
  // PeerJS Refs
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null); // Data connection
  const callRef = useRef<any>(null); // Media call

  const startInterview = async () => {
    if (!username || !accessCode) return;
    setAppState(AppState.INTERVIEW);
    setStatus(InterviewStatus.CONNECTING);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      // 1. Initialize Gemini AI (Only for Candidate)
      // Even if interviewer joins, candidate keeps AI connection for "monitoring" or fallback, 
      // though visual priority changes.
      if (role === 'candidate') {
        geminiRef.current = new GeminiService();
        await geminiRef.current.connect(
          (vol) => setRemoteVolume(vol),
          () => console.log("AI Disconnected"),
          (err) => console.error("AI Error", err)
        );
        
        // Start sending video frames to AI
        videoIntervalRef.current = window.setInterval(() => {
          const videoEl = document.querySelector('video'); // Selects the first video element (User's)
          if (videoEl && geminiRef.current) {
             // We need to ensure we are selecting the LOCAL video, not remote.
             // VideoGrid renders remote first then local. Local has scale-x-[-1].
             // To be safe, we can pass the stream tracks or manage ID. 
             // For now, let's assume VideoGrid structure: Remote is Top, Local is Bottom.
             // QuerySelectorAll might be safer.
             const videos = document.querySelectorAll('video');
             const localVideo = videos.length > 1 ? videos[1] : videos[0];
             if (localVideo) geminiRef.current.sendVideoFrame(localVideo as HTMLVideoElement);
          }
        }, 1000);
      }
      
      // 2. Initialize PeerJS for Human Connection
      initPeer(stream);
      
      setStatus(InterviewStatus.CONNECTED);

    } catch (err) {
      console.error("Failed to start", err);
      setStatus(InterviewStatus.ERROR);
      setAppState(AppState.LOBBY);
    }
  };

  const initPeer = (stream: MediaStream) => {
    // Deterministic IDs: room-candidate, room-interviewer
    const myId = `${accessCode}-${role}`;
    const targetId = `${accessCode}-${role === 'candidate' ? 'interviewer' : 'candidate'}`;
    
    const peer = new Peer(myId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID:', id);
      
      // If Interviewer, initiate call to Candidate
      if (role === 'interviewer') {
        connectToPeer(targetId, stream);
      }
    });

    // Handle Incoming Call
    peer.on('call', (call) => {
      console.log('Incoming call from', call.peer);
      call.answer(stream); // Answer with my stream
      callRef.current = call;
      
      call.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream');
        setRemoteStream(remoteStream);
      });
    });

    // Handle Incoming Data Connection (for Code Sync)
    peer.on('connection', (conn) => {
      console.log('Incoming data connection from', conn.peer);
      connRef.current = conn;
      setupDataConnection(conn);
    });
    
    peer.on('error', (err) => {
      console.warn("Peer error:", err.type);
      // 'peer-unavailable' is common if the other person hasn't joined yet.
    });
  };

  const connectToPeer = (targetId: string, stream: MediaStream) => {
    if (!peerRef.current) return;

    // Call for Video
    const call = peerRef.current.call(targetId, stream);
    callRef.current = call;
    
    call.on('stream', (remoteStream: MediaStream) => {
       console.log('Received remote stream (outbound call)');
       setRemoteStream(remoteStream);
    });

    // Connect for Data (Code)
    const conn = peerRef.current.connect(targetId);
    connRef.current = conn;
    
    conn.on('open', () => {
      console.log("Data connection opened");
      // Send initial code state
      conn.send({ type: 'SYNC_CODE', payload: { code, language } });
    });

    setupDataConnection(conn);
  };

  const setupDataConnection = (conn: any) => {
    conn.on('data', (data: any) => {
      if (data.type === 'CODE_CHANGE') {
        // Only update if content is different to avoid cursor jump/loops
        // Simple implementation: just update. 
        setCode(data.payload); 
      }
      if (data.type === 'SYNC_CODE') {
        setCode(data.payload.code);
        setLanguage(data.payload.language);
      }
      if (data.type === 'LANG_CHANGE') {
        setLanguage(data.payload);
        setCode(LANGUAGE_BOILERPLATES[data.payload]);
      }
    });
  };

  const endInterview = () => {
    if (geminiRef.current) geminiRef.current.disconnect();
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerRef.current) peerRef.current.destroy();
    
    setLocalStream(null);
    setRemoteStream(null);
    setAppState(AppState.ENDED);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const newCode = LANGUAGE_BOILERPLATES[newLang];
    setCode(newCode);
    
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'LANG_CHANGE', payload: newLang });
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'CODE_CHANGE', payload: newCode });
    }
  };

  const handleRunCode = async () => {
    setIsRunningCode(true);
    // If Interviewer runs code, they might not have Gemini instance if we only init for Candidate.
    // For this demo, let's create a temporary instance for Interviewer or assume Candidate runs it.
    // Better: Allow Interviewer to run it too via their own API key (shared env).
    
    let service = geminiRef.current;
    if (!service) {
        service = new GeminiService(); // Temporary instance for Interviewer execution
    }
    
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
                  role === 'candidate' 
                    ? 'bg-blue-600 text-white shadow' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Candidate
              </button>
              <button
                onClick={() => setRole('interviewer')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  role === 'interviewer' 
                    ? 'bg-blue-600 text-white shadow' 
                    : 'text-gray-400 hover:text-white'
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl text-center border border-gray-700">
          <ICONS.PhoneOff className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Interview Ended</h2>
          <p className="text-gray-400 mb-6">Thank you for participating.</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ICONS.Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">TechMeet AI</h1>
            <span className="text-xs text-gray-400 font-normal">Role: {role}</span>
          </div>
          <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400 font-mono ml-2">Code: {accessCode}</span>
        </div>
        
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
            End Call
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left: Code Editor (60%) */}
        <div className="flex-[3] flex flex-col gap-4 min-w-0">
          <div className="flex-1 min-h-0">
            <CodeEditor 
              code={code} 
              language={language}
              onChange={handleCodeChange} 
              onLanguageChange={handleLanguageChange}
              onRun={handleRunCode}
              isRunning={isRunningCode}
            />
          </div>
          <div className="h-1/3 min-h-0">
            <Terminal output={output} />
          </div>
        </div>

        {/* Right: Video & Chat (40%) */}
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
                {remoteStream 
                  ? "Connected to Human Interviewer." 
                  : role === 'candidate' 
                    ? "Waiting for Interviewer. AI Recruiter is active." 
                    : "Waiting for Candidate..."}
              </p>
              {role === 'candidate' && !remoteStream && (
                <p className="bg-gray-700/50 p-2 rounded">
                  <span className="text-blue-400 font-bold block mb-1">AI System</span>
                  The AI is listening. You can start coding or talking.
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