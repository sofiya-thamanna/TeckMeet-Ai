import React, { useEffect, useRef } from 'react';
import { ICONS } from '../constants';
import { Role } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null; // Human interviewer/candidate stream
  remoteVolume: number; // For AI visualizer
  role: Role;
}

const VideoGrid: React.FC<VideoGridProps> = ({ localStream, remoteStream, remoteVolume, role }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Visualizer bars for AI
  const bars = 5;
  const barHeight = Math.min(100, Math.max(10, remoteVolume * 2));

  // Determine what to show in the "Remote" slot
  // If there is a human remote stream, show it.
  // Otherwise, if role is candidate, show AI.
  // If role is interviewer and no candidate yet, show waiting.
  const showHumanRemote = !!remoteStream;
  const showAi = !showHumanRemote && role === 'candidate';

  return (
    <div className="grid grid-rows-2 gap-4 h-full">
      {/* Remote View (Interviewer or AI or Candidate) */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700 flex items-center justify-center group">
        
        {showHumanRemote ? (
           <>
             <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white flex items-center gap-2 z-10">
               <div className="w-2 h-2 rounded-full bg-green-500"></div>
               {role === 'candidate' ? 'Interviewer' : 'Candidate'}
             </div>
             <video 
               ref={remoteVideoRef}
               autoPlay 
               playsInline
               className="w-full h-full object-cover"
             />
           </>
        ) : showAi ? (
            <>
              <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white flex items-center gap-2 z-10">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                AI Interviewer
              </div>
              
              {/* Audio Visualizer Avatar */}
              <div className="flex items-end justify-center space-x-2 h-24">
                {[...Array(bars)].map((_, i) => (
                  <div 
                      key={i}
                      className="w-4 bg-blue-500 rounded-full transition-all duration-75"
                      style={{ 
                        height: `${Math.max(15, barHeight * (0.5 + Math.random() * 0.5))}px`,
                        opacity: 0.6 + (barHeight / 200)
                      }}
                  />
                ))}
              </div>
            </>
        ) : (
           <div className="text-gray-500 flex flex-col items-center">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mb-2"></div>
             <span>Waiting for participant...</span>
           </div>
        )}
      </div>

      {/* Local (User) View */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
         <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white z-10">
          You ({role})
        </div>
        {localStream ? (
          <video 
            ref={localVideoRef}
            autoPlay 
            muted 
            playsInline
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <ICONS.VideoOff className="w-12 h-12 mb-2" />
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGrid;