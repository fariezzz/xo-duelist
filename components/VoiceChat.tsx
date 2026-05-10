"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabaseClient } from '../lib/supabase';

type VoiceStatus = 
  | 'Voice Off'
  | 'Requesting Mic...'
  | 'Connecting...'
  | 'Connected'
  | 'Mic Muted'
  | 'Deafened'
  | 'Opponent Left'
  | 'Mic Permission Denied'
  | 'Voice Error'
  | 'NS Error';

interface VoiceChatProps {
  roomId: string;
  meId: string;
  player1Id?: string | null;
  player2Id?: string | null;
  opponentId?: string | null;
  disabled?: boolean;
  compact?: boolean;
  popoverPosition?: 'up' | 'down';
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    // @ts-ignore
    username: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
    // @ts-ignore
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
  });
}

// Global state to persist connection across page navigation (Lobby -> Game)
const globalVoiceState = {
  roomId: null as string | null,
  status: 'Voice Off' as VoiceStatus,
  isMuted: false,
  isDeafened: false,
  hasJoined: false,
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  pc: null as RTCPeerConnection | null,
  channel: null as any,
  joined: false,
  makingOffer: false,
  processingOffer: false,
  processingAnswer: false,
  isNoiseSuppressionEnabled: true,
  isNoiseSuppressionSupported: false,
  
  // Advanced Audio DSP
  audioContext: null as AudioContext | null,
  processedStream: null as MediaStream | null,
  isAdvancedCleanupEnabled: true,
  micSensitivity: 'Medium' as 'Low' | 'Medium' | 'High',
  isPushToTalk: false,
  isPttActive: false,
};

let cleanupTimer: any = null;
let activeSetState: any = null;

const updateGlobalState = (updates: Partial<typeof globalVoiceState>) => {
  Object.assign(globalVoiceState, updates);
  if (activeSetState) activeSetState({ ...globalVoiceState });
};

// Hard cleanup function (called when truly leaving, not just navigating quickly)
const performHardCleanup = () => {
  if (globalVoiceState.channel && globalVoiceState.joined) {
    globalVoiceState.channel.send({
      type: 'broadcast',
      event: 'voice-leave',
      payload: { roomId: globalVoiceState.roomId, timestamp: Date.now() }
    });
  }

  if (globalVoiceState.audioContext && globalVoiceState.audioContext.state !== 'closed') {
    globalVoiceState.audioContext.close();
  }

  if (globalVoiceState.processedStream) {
    globalVoiceState.processedStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }

  if (globalVoiceState.localStream) {
    globalVoiceState.localStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }

  if (globalVoiceState.pc) {
    globalVoiceState.pc.close();
  }

  if (globalVoiceState.channel) {
    supabaseClient.removeChannel(globalVoiceState.channel);
  }

  updateGlobalState({
    roomId: null,
    localStream: null,
    remoteStream: null,
    pc: null,
    channel: null,
    status: 'Voice Off',
    isMuted: false,
    isDeafened: false,
    hasJoined: false,
    joined: false,
    makingOffer: false,
    processingOffer: false,
    processingAnswer: false,
    isNoiseSuppressionEnabled: true,
    isNoiseSuppressionSupported: false,
    audioContext: null,
    processedStream: null,
    isAdvancedCleanupEnabled: true,
    micSensitivity: 'Medium',
    isPushToTalk: false,
    isPttActive: false,
  });
};


export default function VoiceChat({
  roomId,
  meId,
  player1Id,
  player2Id,
  opponentId,
  disabled,
  compact,
  popoverPosition = 'up',
}: VoiceChatProps) {
  // We use local state purely to trigger re-renders based on global state
  const [localState, setLocalState] = useState(globalVoiceState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Re-bind WebRTC event handlers to point to current room's logic
  // and manage component lifecycle
  useEffect(() => {
    activeSetState = setLocalState;

    if (globalVoiceState.roomId !== roomId) {
      // Different room (or first load), ensure cleanup of any old room
      performHardCleanup();
    } else {
      // Same room! We are probably navigating Lobby -> Game. Cancel cleanup!
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      
      // Re-attach audio streams
      if (remoteAudioRef.current && globalVoiceState.remoteStream) {
        remoteAudioRef.current.srcObject = globalVoiceState.remoteStream;
        remoteAudioRef.current.muted = globalVoiceState.isDeafened;
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!globalVoiceState.isPushToTalk) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' || e.code === 'KeyV') {
        if (!globalVoiceState.isPttActive) {
          updateGlobalState({ isPttActive: true });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!globalVoiceState.isPushToTalk) return;
      if (e.code === 'Space' || e.code === 'KeyV') {
        updateGlobalState({ isPttActive: false });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      activeSetState = null;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);

      // When unmounting (e.g. user leaves page), wait 1000ms.
      // If they land on Game page, the new component mounts and clears this timer.
      // Otherwise, the hard cleanup runs and terminates the call.
      cleanupTimer = setTimeout(() => {
        performHardCleanup();
      }, 1000);
    };
  }, [roomId]);

  // Sync mic track enabled state with PTT and Mute status
  useEffect(() => {
    const micEnabled = localState.isPushToTalk 
      ? (localState.isPttActive && !localState.isMuted) 
      : !localState.isMuted;
      
    if (globalVoiceState.localStream) {
      globalVoiceState.localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    }
    if (globalVoiceState.processedStream) {
      globalVoiceState.processedStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    }
  }, [localState.isMuted, localState.isPushToTalk, localState.isPttActive]);


  // Initialize WebRTC
  const initWebRTC = useCallback(() => {
    if (globalVoiceState.pc) return globalVoiceState.pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    updateGlobalState({ pc });

    pc.onicecandidate = (event) => {
      if (event.candidate && globalVoiceState.channel) {
        globalVoiceState.channel.send({
          type: 'broadcast',
          event: 'voice-ice-candidate',
          payload: {
            roomId,
            from: meId,
            to: opponentId,
            candidate: event.candidate,
            timestamp: Date.now(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        updateGlobalState({ status: globalVoiceState.isMuted ? 'Mic Muted' : 'Connected' });
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        updateGlobalState({ status: 'Voice Error' });
      }
    };

    pc.ontrack = (event) => {
      updateGlobalState({ remoteStream: event.streams[0] });
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    const currentStream = globalVoiceState.processedStream || globalVoiceState.localStream;
    if (currentStream) {
      currentStream.getTracks().forEach((track: MediaStreamTrack) => {
        pc.addTrack(track, currentStream);
      });
    }

    return pc;
  }, [roomId, meId, opponentId]);

  const requestMicrophone = async () => {
    try {
      let supported = false;
      if (navigator.mediaDevices && navigator.mediaDevices.getSupportedConstraints) {
         const constraints = navigator.mediaDevices.getSupportedConstraints();
         supported = !!constraints.noiseSuppression;
      }
      
      updateGlobalState({ isNoiseSuppressionSupported: supported });

      const rawStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
           echoCancellation: true,
           autoGainControl: true,
           noiseSuppression: supported ? globalVoiceState.isNoiseSuppressionEnabled : undefined,
           channelCount: 1,
        }
      });
      
      let finalStream = rawStream;
      let audioContext = null;

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(rawStream);
        const destination = audioContext.createMediaStreamDestination();
        
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 100;
        
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 3600;
        
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;
        
        const gateGain = audioContext.createGain();
        gateGain.gain.value = 1;
        
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(compressor);
        compressor.connect(gateGain);
        gateGain.connect(destination);
        source.connect(analyser); // Analyser before gate to detect original signal
        
        finalStream = destination.stream;
        
        let lastVoiceActivity = 0;
        const dataArray = new Float32Array(analyser.frequencyBinCount);
        
        const processAudio = () => {
          if (!globalVoiceState.audioContext || globalVoiceState.audioContext.state === 'closed') return;
          
          analyser.getFloatTimeDomainData(dataArray);
          
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
             const val = Math.abs(dataArray[i]);
             sumSquares += val * val;
             if (val > peak) peak = val;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);
          
          let sensitivityThreshold = 0.03; // Medium
          if (globalVoiceState.micSensitivity === 'Low') sensitivityThreshold = 0.04;
          if (globalVoiceState.micSensitivity === 'High') sensitivityThreshold = 0.02;
          
          const isTransient = peak > 0.50 && rms > 0.055 && peak / Math.max(rms, 0.0001) > 5.0;
          
          let targetGain = 1;
          const now = Date.now();
          
          if (!globalVoiceState.isAdvancedCleanupEnabled) {
             targetGain = 1;
          } else if (isTransient) {
             targetGain = 0;
             lastVoiceActivity = 0;
          } else if (rms > sensitivityThreshold) {
             lastVoiceActivity = now;
             targetGain = 1;
          } else if (now - lastVoiceActivity > 220) {
             targetGain = 0; // Hangover 220ms
          }
          
          // Mute and PTT logic handled at track.enabled level, 
          // but we additionally cut gain for maximum silence.
          if (globalVoiceState.isMuted) targetGain = 0;
          if (globalVoiceState.isPushToTalk && !globalVoiceState.isPttActive) targetGain = 0;
          
          const currentTime = audioContext!.currentTime;
          if (targetGain === 0) {
             gateGain.gain.setTargetAtTime(0, currentTime, 0.02);
          } else {
             gateGain.gain.setTargetAtTime(1, currentTime, 0.03);
          }
          
          requestAnimationFrame(processAudio);
        };
        
        processAudio();
      } catch(err) {
        console.error("Advanced audio cleanup failed, using raw stream:", err);
      }
      
      updateGlobalState({ localStream: rawStream, processedStream: finalStream, audioContext });
      return true;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      updateGlobalState({ status: 'Mic Permission Denied' });
      return false;
    }
  };

  const createOffer = async (pc: RTCPeerConnection) => {
    if (pc.signalingState !== 'stable' || globalVoiceState.makingOffer) return;
    try {
      updateGlobalState({ makingOffer: true });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (globalVoiceState.channel) {
        globalVoiceState.channel.send({
          type: 'broadcast',
          event: 'voice-offer',
          payload: {
            roomId,
            from: meId,
            to: opponentId,
            offer: pc.localDescription,
            timestamp: Date.now(),
          }
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
    } finally {
      updateGlobalState({ makingOffer: false });
    }
  };

  const handleJoinVoice = async () => {
    if (disabled || !opponentId) return;

    updateGlobalState({ roomId, status: 'Requesting Mic...' });
    
    const hasMic = await requestMicrophone();
    if (!hasMic) return;

    updateGlobalState({ status: 'Connecting...', hasJoined: true, joined: true });

    const pc = initWebRTC();

    // Setup signaling channel
    const channelName = `voice:${roomId}`;
    const channel = supabaseClient.channel(channelName);
    updateGlobalState({ channel });

    channel
      .on('broadcast', { event: 'voice-join' }, async ({ payload }) => {
        if (payload.from === meId || payload.roomId !== roomId) return;
        // If I am player 1, I should initiate the offer when the other person joins
        if (meId === player1Id) {
          if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
            channel.send({
              type: 'broadcast',
              event: 'voice-offer',
              payload: {
                roomId,
                from: meId,
                to: opponentId,
                offer: pc.localDescription,
                timestamp: Date.now(),
              }
            });
          } else {
            createOffer(pc);
          }
        }
      })
      .on('broadcast', { event: 'voice-offer' }, async ({ payload }) => {
        if (payload.from === meId || payload.to !== meId || payload.roomId !== roomId) return;
        if (globalVoiceState.processingOffer) return;
        
        try {
          updateGlobalState({ processingOffer: true });
          if (!globalVoiceState.localStream && globalVoiceState.joined) {
             await requestMicrophone();
             const currentStream = globalVoiceState.processedStream || globalVoiceState.localStream;
             if (currentStream) {
                currentStream.getTracks().forEach((track: MediaStreamTrack) => {
                  pc.addTrack(track, currentStream);
                });
             }
          }

          if (pc.signalingState !== 'stable') {
            if (meId === player1Id) return; 
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          channel.send({
            type: 'broadcast',
            event: 'voice-answer',
            payload: {
              roomId,
              from: meId,
              to: opponentId,
              answer: pc.localDescription,
              timestamp: Date.now(),
            }
          });
        } catch (err) {
          console.error('Error handling offer:', err);
        } finally {
          updateGlobalState({ processingOffer: false });
        }
      })
      .on('broadcast', { event: 'voice-answer' }, async ({ payload }) => {
        if (payload.from === meId || payload.to !== meId || payload.roomId !== roomId) return;
        if (globalVoiceState.processingAnswer || pc.signalingState !== 'have-local-offer') return;
        try {
          updateGlobalState({ processingAnswer: true });
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        } catch (err) {
          console.error('Error handling answer:', err);
        } finally {
          updateGlobalState({ processingAnswer: false });
        }
      })
      .on('broadcast', { event: 'voice-ice-candidate' }, async ({ payload }) => {
        if (payload.from === meId || payload.to !== meId || payload.roomId !== roomId) return;
        try {
          if (payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      })
      .on('broadcast', { event: 'voice-leave' }, async ({ payload }) => {
        if (payload.from === meId || payload.roomId !== roomId) return;
        updateGlobalState({ status: 'Opponent Left' });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'voice-join',
            payload: { roomId, from: meId, timestamp: Date.now() }
          });

          if (meId === player1Id) {
             createOffer(pc);
          }
        }
      });
  };

  const handleToggleMic = () => {
    const newMuted = !localState.isMuted;
    
    let newStatus = localState.status;
    if (localState.status === 'Connected' || localState.status === 'Mic Muted') {
       newStatus = newMuted ? 'Mic Muted' : 'Connected';
    }
    
    updateGlobalState({ isMuted: newMuted, status: newStatus });
  };

  const handleToggleDeafen = () => {
    if (!remoteAudioRef.current) return;
    const newDeafened = !localState.isDeafened;
    remoteAudioRef.current.muted = newDeafened;
    
    let newStatus = localState.status;
    if (localState.status === 'Connected' || localState.status === 'Deafened' || localState.status === 'Mic Muted') {
        if (newDeafened) newStatus = 'Deafened';
        else newStatus = localState.isMuted ? 'Mic Muted' : 'Connected';
    }
    
    updateGlobalState({ isDeafened: newDeafened, status: newStatus });
  };

  const handleToggleNoiseSuppression = async () => {
    if (!globalVoiceState.localStream || !localState.isNoiseSuppressionSupported) return;
    
    const audioTrack = globalVoiceState.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !localState.isNoiseSuppressionEnabled;
    const prevStatus = localState.status;
    
    try {
      await audioTrack.applyConstraints({
         noiseSuppression: newEnabled
      });
      updateGlobalState({ isNoiseSuppressionEnabled: newEnabled });
    } catch (err) {
      console.error("Failed to apply noise suppression constraints:", err);
      updateGlobalState({ status: 'NS Error' });
      setTimeout(() => updateGlobalState({ status: prevStatus }), 2000);
    }
  };
  
  const handleToggleAdvancedCleanup = () => {
    updateGlobalState({ isAdvancedCleanupEnabled: !localState.isAdvancedCleanupEnabled });
  };
  
  const cycleSensitivity = () => {
    const next = localState.micSensitivity === 'Low' ? 'Medium' : localState.micSensitivity === 'Medium' ? 'High' : 'Low';
    updateGlobalState({ micSensitivity: next });
  };
  
  const handleTogglePTT = () => {
    updateGlobalState({ isPushToTalk: !localState.isPushToTalk, isPttActive: false });
  };

  const handleLeaveVoice = () => {
    setIsSettingsOpen(false);
    performHardCleanup();
  };

  if (disabled) {
    return (
      <div className="card compact" style={{ padding: '6px 12px', textAlign: 'center', borderColor: 'var(--border)', borderRadius: '24px' }}>
         <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Voice chat unavailable</span>
      </div>
    );
  }

  if (!opponentId) {
     return null; // Don't show if opponent is not yet there
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div className="card" style={{ 
        padding: '6px 12px', 
        marginBottom: '10px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        borderRadius: '24px',
        height: '48px',
        border: isSettingsOpen ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--border)',
      }}>
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
        
        {/* Status Icon & Text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
            {localState.status === 'Connected' ? (localState.isPushToTalk && !localState.isPttActive ? '⌨️' : '📞') : localState.status === 'Mic Muted' ? '🙊' : localState.status === 'Deafened' ? '🙉' : '🎙️'}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: localState.status === 'Voice Error' || localState.status === 'Mic Permission Denied' || localState.status === 'NS Error' ? '#ef4444' : 'var(--text)' }}>
            {localState.status}
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {!localState.hasJoined ? (
            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '16px' }} onClick={handleJoinVoice}>
              Join
            </button>
          ) : (
            <>
              <button 
                className={`btn ${localState.isMuted ? 'btn-danger' : 'btn-secondary'}`} 
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', minWidth: '32px' }} 
                onClick={handleToggleMic}
                title={localState.isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {localState.isMuted ? '🔇' : '🎙️'}
              </button>
              <button 
                className={`btn ${localState.isDeafened ? 'btn-danger' : 'btn-secondary'}`} 
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', minWidth: '32px' }} 
                onClick={handleToggleDeafen}
                title={localState.isDeafened ? 'Undeafen' : 'Deafen'}
              >
                {localState.isDeafened ? '🔇' : '🔈'}
              </button>
              <button 
                className={`btn ${isSettingsOpen ? 'btn-primary' : 'btn-ghost'}`} 
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', minWidth: '32px' }} 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                title="Settings"
              >
                ⚙️
              </button>
              <button 
                className="btn btn-ghost" 
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', color: '#ef4444', minWidth: '32px' }} 
                onClick={handleLeaveVoice}
                title="Leave"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {/* Settings Panel Popover */}
      {isSettingsOpen && localState.hasJoined && (
        <div className="card animate-fade-in" style={{ 
          position: 'absolute', 
          ...(popoverPosition === 'up' ? { bottom: '56px' } : { top: '56px' }),
          right: '0', 
          padding: '16px', 
          zIndex: 100, 
          width: '260px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(124,58,237,0.3)',
          background: 'var(--bg-layer-2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Voice Settings</h4>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '0.7rem' }} onClick={() => setIsSettingsOpen(false)}>✕</button>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Clean Voice</span>
            <button className={`btn ${localState.isAdvancedCleanupEnabled ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleToggleAdvancedCleanup}>
              {localState.isAdvancedCleanupEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {localState.isNoiseSuppressionSupported && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Noise Suppress</span>
              <button className={`btn ${localState.isNoiseSuppressionEnabled ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleToggleNoiseSuppression}>
                {localState.isNoiseSuppressionEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Sensitivity</span>
            <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', width: '70px' }} onClick={cycleSensitivity}>
              {localState.micSensitivity}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Push-to-Talk</span>
            <button className={`btn ${localState.isPushToTalk ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleTogglePTT}>
              {localState.isPushToTalk ? 'ON' : 'OFF'}
            </button>
          </div>

          {localState.isPushToTalk && (
            <div style={{ marginTop: '4px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '12px' }}>
              <button 
                className={`btn ${localState.isPttActive ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: '100%', padding: '8px', fontSize: '0.85rem', fontWeight: 600 }}
                onMouseDown={() => updateGlobalState({ isPttActive: true })}
                onMouseUp={() => updateGlobalState({ isPttActive: false })}
                onMouseLeave={() => updateGlobalState({ isPttActive: false })}
                onTouchStart={(e) => { e.preventDefault(); updateGlobalState({ isPttActive: true }); }}
                onTouchEnd={(e) => { e.preventDefault(); updateGlobalState({ isPttActive: false }); }}
              >
                🎙️ Hold to Talk
              </button>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Hold <b>Space</b> or <b>V</b> on Desktop
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
