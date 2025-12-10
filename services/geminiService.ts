import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decodeAudioData, decode, blobToBase64 } from './audioUtils';
import { PCM_SAMPLE_RATE, AUDIO_OUTPUT_SAMPLE_RATE, SYSTEM_INSTRUCTION } from '../constants';

export class GeminiService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private cleanupCallbacks: (() => void)[] = [];
  private isConnected = false;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async runCode(code: string, language: string): Promise<string> {
    try {
      const prompt = `
        You are a ${language} code execution engine. 
        Execute the following code and return the output. 
        If there are errors, return the error message.
        Do not provide explanations, only the console output or return value.
        
        CODE:
        ${code}
      `;
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || "No output";
    } catch (error) {
      console.error("Code execution failed", error);
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  async connect(
    stream: MediaStream,
    onAudioData: (visualData: number) => void,
    onClose: () => void,
    onError: (err: any) => void
  ) {
    // Reset state
    this.disconnect();
    this.isConnected = false;

    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: PCM_SAMPLE_RATE
    });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: AUDIO_OUTPUT_SAMPLE_RATE
    });

    // Ensure AudioContexts are running (handling autoplay policies)
    if (this.inputAudioContext.state === 'suspended') {
      await this.inputAudioContext.resume();
    }
    if (this.outputAudioContext.state === 'suspended') {
      await this.outputAudioContext.resume();
    }

    // Setup Input from existing stream
    const source = this.inputAudioContext.createMediaStreamSource(stream);
    const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      if (!this.isConnected || !this.sessionPromise) return;

      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData);
      
      this.sessionPromise.then((session) => {
        try {
          session.sendRealtimeInput({ media: pcmBlob });
        } catch (e) {
          // Silent catch for send errors to prevent loop noise
        }
      }).catch(() => {
          // Ignore errors from the session promise if it failed to connect
      });
    };
    
    source.connect(scriptProcessor);
    scriptProcessor.connect(this.inputAudioContext.destination);

    // Setup Output Node for Visualization
    const analyser = this.outputAudioContext.createAnalyser();
    analyser.fftSize = 256;
    const outputGain = this.outputAudioContext.createGain();
    outputGain.connect(analyser);
    analyser.connect(this.outputAudioContext.destination);

    // Visualization Loop
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationFrameId: number;

    const updateVisuals = () => {
      if (!this.isConnected) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      onAudioData(sum / bufferLength);
      animationFrameId = requestAnimationFrame(updateVisuals);
    };

    // Connect to Gemini
    try {
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            this.isConnected = true;
            updateVisuals();
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            
            if (base64Audio && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              
              try {
                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  this.outputAudioContext,
                  AUDIO_OUTPUT_SAMPLE_RATE,
                  1
                );
                
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGain); // Connect to gain/analyser
                
                source.addEventListener('ended', () => {
                  this.sources.delete(source);
                });

                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
                this.sources.add(source);
              } catch (e) {
                console.error("Error decoding/playing audio", e);
              }
            }
          },
          onclose: (e) => {
            console.log("Gemini Live Closed", e);
            this.isConnected = false;
            onClose();
          },
          onerror: (e) => {
             // Only report error if we were previously connected.
             // We avoid logging here to prevent duplication with App.tsx which receives this callback.
            if (this.isConnected) {
               this.isConnected = false;
               onError(e);
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });
      
      // Wait for initial connection to confirm success
      await this.sessionPromise;
      
    } catch (e) {
      this.disconnect();
      throw e; // Re-throw to be caught by App.tsx
    }

    this.cleanupCallbacks.push(() => {
        this.isConnected = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        source.disconnect();
        scriptProcessor.disconnect();
        outputGain.disconnect();
        analyser.disconnect();
        this.inputAudioContext?.close();
        this.outputAudioContext?.close();
    });
  }

  async sendVideoFrame(videoEl: HTMLVideoElement) {
    if (!this.isConnected || !this.sessionPromise) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoEl, 0, 0);
    
    // Low quality jpeg for speed
    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          const base64Data = await blobToBase64(blob);
          // Check connection again before sending
          if (this.isConnected && this.sessionPromise) {
            this.sessionPromise.then(session => {
              try {
                 session.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'image/jpeg' }
                });
              } catch (e) {
                // Ignore send errors
              }
            }).catch(() => {});
          }
        } catch (e) {
          // Ignore blob errors
        }
      }
    }, 'image/jpeg', 0.5);
  }

  disconnect() {
    this.cleanupCallbacks.forEach(cb => cb());
    this.cleanupCallbacks = [];
    this.sources.forEach(s => s.stop());
    this.sources.clear();
    this.isConnected = false;
    this.sessionPromise = null;
  }
}