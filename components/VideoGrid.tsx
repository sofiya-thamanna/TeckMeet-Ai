import React, { useEffect, useRef } from 'react';
import { ICONS } from '../constants';
import { Role } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null; // Human interviewer/candidate stream
  role: Role;
  isMicOn: boolean;
  isCameraOn: boolean;
}

const VideoGrid: React.FC<VideoGridProps> = ({ localStream, remoteStream, role, isMicOn, isCameraOn }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOn]); 

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const showHumanRemote = !!remoteStream;

  return (
    <div className="grid grid-rows-2 gap-4 h-full">
      {/* Remote View */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700 flex items-center justify-center group shadow-inner">
        
        {showHumanRemote ? (
           <>
             <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white flex items-center gap-2 z-10 backdrop-blur-sm">
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
        ) : (
           <div className="text-gray-500 flex flex-col items-center">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mb-2"></div>
             <span>Waiting for {role === 'candidate' ? 'Interviewer' : 'Candidate'}...</span>
           </div>
        )}
      </div>

      {/* Local (User) View */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-inner">
         <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white z-10 backdrop-blur-sm flex items-center gap-2">
          <span>You ({role})</span>
          {!isMicOn && <ICONS.MicOff className="w-3 h-3 text-red-400" />}
        </div>
        
        {!isMicOn && (
          <div className="absolute top-4 right-4 bg-red-500/80 p-1.5 rounded-full z-10">
             <ICONS.MicOff className="w-4 h-4 text-white" />
          </div>
        )}

        {localStream && isCameraOn ? (
          <video 
            ref={localVideoRef}
            autoPlay 
            muted 
            playsInline
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-750">
            <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-3">
               <span className="text-2xl font-bold">{role === 'candidate' ? 'C' : 'I'}</span>
            </div>
            <p className="text-sm font-medium">Camera Off</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGrid;