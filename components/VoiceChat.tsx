"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useId, useRef, useState, useCallback } from 'react';
import { AlertCircle, Keyboard, LogOut, Mic, MicOff, Phone, PhoneCall, PhoneOff, Settings, SignalHigh, SignalLow, SignalMedium, SignalZero, Volume2, VolumeX, X } from 'lucide-react';
import { supabaseClient } from '../lib/supabase';

type VoiceChannel = ReturnType<typeof supabaseClient.channel>;

type CandidatePairStats = RTCStats & {
  currentRoundTripTime?: number;
  nominated?: boolean;
  selected?: boolean;
  state?: string;
};

type TransportStats = RTCStats & {
  selectedCandidatePairId?: string;
};

type AudioKeepAliveNodes = {
  source: MediaStreamAudioSourceNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gateGain: GainNode;
  analyser: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  timer: ReturnType<typeof setInterval>;
};

type AudioContextWithKeepAlive = AudioContext & {
  _keepAlive?: AudioKeepAliveNodes;
};

type WebKitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type VoiceStatus =
  | 'Voice Off'
  | 'Requesting Mic...'
  | 'Connecting...'
  | 'Reconnecting...'
  | 'Connected'
  | 'Mic Muted'
  | 'Deafened'
  | 'Opponent Left'
  | 'Mic Permission Denied'
  | 'Voice Error'
  | 'NS Error';

type VoiceSignalKind = 'offer' | 'answer' | 'ice-candidate';

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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }, // tambahkan backup STUN
];

const RECONNECT_GRACE_MS = 4000;
const RECONNECT_CLEANUP_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: [
      process.env.NEXT_PUBLIC_TURN_URL,
      process.env.NEXT_PUBLIC_TURN_URL.replace('443', '80'), // fallback
    ],
    username: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
  });
}

// Global state to persist connection across page navigation (Lobby -> Game)
const globalVoiceState = {
  roomId: null as string | null,
  meId: null as string | null,
  status: 'Voice Off' as VoiceStatus,
  isMuted: false,
  isDeafened: false,
  hasJoined: false,
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  pc: null as RTCPeerConnection | null,
  channel: null as VoiceChannel | null,
  presenceChannel: null as VoiceChannel | null,
  pendingIceCandidates: [] as RTCIceCandidateInit[],
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
  voiceFocus: 'Balanced' as 'Balanced' | 'Strict',
  micSensitivity: 'Medium' as 'Low' | 'Medium' | 'High',
  isPushToTalk: false,
  isPttActive: false,
  isOpponentInVoice: false,

  // VAD & Quality
  isLocalSpeaking: false,
  isRemoteSpeaking: false,
  ping: null as number | null,
  connectionQuality: 'Unknown' as 'Excellent' | 'Good' | 'Poor' | 'Unknown',
  remoteVolume: 1,
  micPermissionHelp: null as string | null,
};

type GlobalVoiceState = typeof globalVoiceState;
type VoiceInstanceRegistration = {
  setVoiceState: Dispatch<SetStateAction<GlobalVoiceState>>;
  setIsActive: Dispatch<SetStateAction<boolean>>;
};

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let activeSetState: Dispatch<SetStateAction<GlobalVoiceState>> | null = null;
let activeVoiceInstanceId: string | null = null;
let localVadAnimationFrame: number | null = null;
let remoteVadAnimationFrame: number | null = null;
let localVadRunId = 0;
let remoteVadRunId = 0;
const voiceInstanceRegistrations = new Map<string, VoiceInstanceRegistration>();

const updateGlobalState = (updates: Partial<typeof globalVoiceState>) => {
  Object.assign(globalVoiceState, updates);
  if (activeSetState) activeSetState({ ...globalVoiceState });
};

const clearCleanupTimer = () => {
  if (!cleanupTimer) return;
  clearTimeout(cleanupTimer);
  cleanupTimer = null;
};

const syncVoiceInstanceOwnership = () => {
  const activeRegistration = activeVoiceInstanceId
    ? voiceInstanceRegistrations.get(activeVoiceInstanceId)
    : undefined;

  activeSetState = activeRegistration?.setVoiceState ?? null;

  voiceInstanceRegistrations.forEach((registration, instanceId) => {
    registration.setIsActive(instanceId === activeVoiceInstanceId);
  });

  if (activeSetState) activeSetState({ ...globalVoiceState });
};

const promoteNextVoiceInstance = () => {
  const instanceIds = Array.from(voiceInstanceRegistrations.keys());
  activeVoiceInstanceId = instanceIds[instanceIds.length - 1] ?? null;
  syncVoiceInstanceOwnership();
};

const clearReconnectTimer = () => {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const clearConnectTimeoutTimer = () => {
  if (!connectTimeoutTimer) return;
  clearTimeout(connectTimeoutTimer);
  connectTimeoutTimer = null;
};

const stopLocalVadLoop = () => {
  localVadRunId += 1;
  if (localVadAnimationFrame === null) return;

  cancelAnimationFrame(localVadAnimationFrame);
  localVadAnimationFrame = null;
};

const stopRemoteVadLoop = () => {
  remoteVadRunId += 1;
  if (remoteVadAnimationFrame === null) return;

  cancelAnimationFrame(remoteVadAnimationFrame);
  remoteVadAnimationFrame = null;
};

const stopVadLoops = () => {
  stopLocalVadLoop();
  stopRemoteVadLoop();
};

const scheduleConnectTimeout = (pc: RTCPeerConnection) => {
  clearConnectTimeoutTimer();

  connectTimeoutTimer = setTimeout(() => {
    connectTimeoutTimer = null;

    if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
    if (!globalVoiceState.hasJoined) return;
    if (globalVoiceState.status !== 'Connecting...' && globalVoiceState.status !== 'Reconnecting...') return;

    performHardCleanup('Voice Error');
  }, CONNECT_TIMEOUT_MS);
};

const getConnectedVoiceStatus = (): VoiceStatus => {
  if (globalVoiceState.isDeafened) return 'Deafened';
  if (globalVoiceState.isMuted) return 'Mic Muted';
  return 'Connected';
};

const getMicEnabled = () => (
  globalVoiceState.isPushToTalk
    ? (globalVoiceState.isPttActive && !globalVoiceState.isMuted)
    : !globalVoiceState.isMuted
);

const syncMicTrackEnabled = () => {
  const micEnabled = getMicEnabled();

  if (globalVoiceState.localStream) {
    globalVoiceState.localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  }

  if (globalVoiceState.processedStream) {
    globalVoiceState.processedStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  }

  return micEnabled;
};

const getActiveVoiceStream = (useCleanVoice = globalVoiceState.isAdvancedCleanupEnabled) => {
  if (useCleanVoice && globalVoiceState.processedStream) {
    return globalVoiceState.processedStream;
  }

  return globalVoiceState.localStream;
};

const syncActiveVoiceSender = async (useCleanVoice = globalVoiceState.isAdvancedCleanupEnabled) => {
  const pc = globalVoiceState.pc;
  const activeStream = getActiveVoiceStream(useCleanVoice);
  const activeTrack = activeStream?.getAudioTracks()[0];

  if (!pc || !activeStream || !activeTrack) return;

  activeTrack.enabled = syncMicTrackEnabled();

  const audioSender = pc.getSenders().find(sender => sender.track?.kind === 'audio');
  if (audioSender) {
    if (audioSender.track !== activeTrack) {
      await audioSender.replaceTrack(activeTrack);
    }
    return;
  }

  pc.addTrack(activeTrack, activeStream);
};

const flushPendingIceCandidates = async (pc: RTCPeerConnection) => {
  if (!pc.remoteDescription || globalVoiceState.pendingIceCandidates.length === 0) return;

  const pendingCandidates = [...globalVoiceState.pendingIceCandidates];
  updateGlobalState({ pendingIceCandidates: [] });

  for (const candidate of pendingCandidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding queued ICE candidate:', err);
    }
  }
};

const queueOrAddIceCandidate = async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
  if (!pc.remoteDescription) {
    updateGlobalState({
      pendingIceCandidates: [...globalVoiceState.pendingIceCandidates, candidate],
    });
    return;
  }

  await pc.addIceCandidate(new RTCIceCandidate(candidate));
};

const getMicPermissionHelp = (error: unknown) => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Allow microphone access from the browser site settings, then press Join again.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone was detected. Connect or enable a microphone, then try again.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Your microphone is busy in another app. Close the other app or tab, then try again.';
    }
  }

  return 'Check your browser microphone permission and system input settings, then press Join again.';
};

const getRoundTripTimeMs = (stats: RTCStatsReport) => {
  let selectedPairId: string | undefined;

  stats.forEach((report) => {
    if (report.type === 'transport') {
      const transport = report as TransportStats;
      if (transport.selectedCandidatePairId) {
        selectedPairId = transport.selectedCandidatePairId;
      }
    }
  });

  if (selectedPairId) {
    const selectedPair = stats.get(selectedPairId) as CandidatePairStats | undefined;
    if (typeof selectedPair?.currentRoundTripTime === 'number') {
      return selectedPair.currentRoundTripTime * 1000;
    }
  }

  let fallbackRtt: number | null = null;

  stats.forEach((report) => {
    if (report.type !== 'candidate-pair') return;

    const pair = report as CandidatePairStats;
    const isUsablePair = pair.selected || pair.nominated || pair.state === 'succeeded';
    if (isUsablePair && typeof pair.currentRoundTripTime === 'number') {
      fallbackRtt = pair.currentRoundTripTime * 1000;
    }
  });

  return fallbackRtt;
};

const sendVoicePresenceBroadcast = (
  event: 'voice-ping' | 'voice-pong' | 'voice-join' | 'voice-leave',
  extraPayload: Record<string, unknown> = {}
) => {
  if (!globalVoiceState.presenceChannel || !globalVoiceState.roomId || !globalVoiceState.meId) return;

  globalVoiceState.presenceChannel.send({
    type: 'broadcast',
    event,
    payload: {
      roomId: globalVoiceState.roomId,
      from: globalVoiceState.meId,
      timestamp: Date.now(),
      ...extraPayload,
    },
  });
};

const sendVoiceLeaveBroadcast = (reason: VoiceStatus) => {
  if (!globalVoiceState.joined || !globalVoiceState.roomId || !globalVoiceState.meId) return;

  const payload = {
    roomId: globalVoiceState.roomId,
    from: globalVoiceState.meId,
    reason,
    timestamp: Date.now(),
  };

  globalVoiceState.channel?.send({
    type: 'broadcast',
    event: 'voice-leave',
    payload,
  });

  sendVoicePresenceBroadcast('voice-leave', { reason });
};

// Hard cleanup function (called when truly leaving, not just navigating quickly)
const performHardCleanup = (newStatus: VoiceStatus = 'Voice Off') => {
  clearCleanupTimer();
  clearReconnectTimer();
  clearConnectTimeoutTimer();
  stopVadLoops();

  sendVoiceLeaveBroadcast(newStatus);

  if (globalVoiceState.audioContext) {
    const keepAlive = (globalVoiceState.audioContext as AudioContextWithKeepAlive)._keepAlive;
    if (keepAlive) clearInterval(keepAlive.timer);
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
    localStream: null,
    remoteStream: null,
    pc: null,
    channel: null,
    pendingIceCandidates: [],
    status: newStatus,
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
    voiceFocus: 'Balanced',
    micSensitivity: 'Medium',
    isPushToTalk: false,
    isPttActive: false,
    isOpponentInVoice: false,
    isLocalSpeaking: false,
    isRemoteSpeaking: false,
    ping: null,
    connectionQuality: 'Unknown',
    remoteVolume: 1,
    micPermissionHelp: null,
  });

  if (newStatus === 'Opponent Left' || newStatus === 'Voice Error') {
    setTimeout(() => {
      if (globalVoiceState.status === newStatus && !globalVoiceState.hasJoined) {
        updateGlobalState({ status: 'Voice Off' });
      }
    }, 3000);
  }
};


export default function VoiceChat({
  roomId,
  meId,
  player1Id,
  opponentId,
  disabled,
  popoverPosition = 'up',
}: VoiceChatProps) {
  const [localState, setLocalState] = useState(globalVoiceState);
  const [isActiveInstance, setIsActiveInstance] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const voiceInstanceId = useId();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalValidationCacheRef = useRef(new Map<string, Promise<boolean>>());

  const validateVoiceSignalRole = useCallback((signal: VoiceSignalKind, from?: string | null, to?: string | null) => {
    if (!from || !to || !roomId || !player1Id || !opponentId) return false;

    const player2Id = player1Id === meId ? opponentId : meId;
    const fromPlayer1 = from === player1Id && to === player2Id;
    const fromPlayer2 = from === player2Id && to === player1Id;
    const isBetweenPlayers = fromPlayer1 || fromPlayer2;
    if (!isBetweenPlayers) return false;

    if (signal === 'offer') return fromPlayer1;
    if (signal === 'answer') return fromPlayer2;
    return true;
  }, [meId, opponentId, player1Id, roomId]);

  const validateVoiceSignal = useCallback((signal: VoiceSignalKind, from?: string | null, to?: string | null) => {
    if (!from || !to || !roomId) return Promise.resolve(false);
    if (from !== meId || to !== opponentId) return Promise.resolve(false);

    const validateLocallyForDev = () => {
      if (process.env.NODE_ENV === 'production') return false;
      return validateVoiceSignalRole(signal, from, to);
    };

    if (!validateVoiceSignalRole(signal, from, to)) return Promise.resolve(false);

    const cacheKey = `${roomId}:${signal}:${from}:${to}`;
    const cached = signalValidationCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const validateViaApi = async () => {
      try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return false;

        const response = await fetch('/api/voice/validate-signal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            roomId,
            from,
            to,
            signal,
          }),
        });

        if (!response.ok) {
          console.error('Voice signal API validation failed:', response.status);
          return validateLocallyForDev();
        }

        const result = await response.json() as { valid?: boolean };
        return result.valid === true;
      } catch (err) {
        console.error('Voice signal API validation failed:', err);
        return validateLocallyForDev();
      }
    };

    const validation = Promise.resolve(supabaseClient.rpc('validate_voice_signal', {
        input_room_id: roomId,
        input_from: from,
        input_to: to,
        input_signal: signal,
      }))
      .then(async ({ data, error }) => {
        if (data === true) return true;

        const localDevValid = validateLocallyForDev();
        if (localDevValid) return true;

        if (error) {
          console.error('Voice signal validation failed:', error);
          signalValidationCacheRef.current.delete(cacheKey);
        }

        const apiValid = await validateViaApi();
        if (!apiValid) signalValidationCacheRef.current.delete(cacheKey);
        return apiValid;
      })
      .catch(async (err) => {
        console.error('Voice signal validation failed:', err);
        const apiValid = await validateViaApi();
        if (!apiValid) signalValidationCacheRef.current.delete(cacheKey);
        return apiValid;
      });

    signalValidationCacheRef.current.set(cacheKey, validation);
    return validation;
  }, [meId, opponentId, roomId, validateVoiceSignalRole]);

  const validateIncomingVoiceSignal = useCallback((signal: VoiceSignalKind, from?: string | null, to?: string | null) => {
    if (from !== opponentId || to !== meId) return false;
    return validateVoiceSignalRole(signal, from, to);
  }, [meId, opponentId, validateVoiceSignalRole]);

  useEffect(() => {
    signalValidationCacheRef.current.clear();
  }, [roomId]);

  useEffect(() => {
    voiceInstanceRegistrations.set(voiceInstanceId, {
      setVoiceState: setLocalState,
      setIsActive: setIsActiveInstance,
    });

    if (!activeVoiceInstanceId || !voiceInstanceRegistrations.has(activeVoiceInstanceId)) {
      activeVoiceInstanceId = voiceInstanceId;
    }

    syncVoiceInstanceOwnership();

    return () => {
      const wasActive = activeVoiceInstanceId === voiceInstanceId;
      voiceInstanceRegistrations.delete(voiceInstanceId);

      if (wasActive) {
        promoteNextVoiceInstance();
      } else {
        syncVoiceInstanceOwnership();
      }
    };
  }, [voiceInstanceId]);

  // Re-bind WebRTC event handlers to point to current room's logic
  // and manage component lifecycle
  useEffect(() => {
    if (!isActiveInstance) return;

    updateGlobalState({ meId });

    if (globalVoiceState.roomId !== roomId) {
      // Different room (or first load), ensure cleanup of any old room
      performHardCleanup();
      updateGlobalState({ roomId, meId });
    } else {
      // Same room! We are probably navigating Lobby -> Game. Cancel cleanup!
      clearCleanupTimer();

      // Re-attach audio streams
      if (remoteAudioRef.current && globalVoiceState.remoteStream) {
        remoteAudioRef.current.srcObject = globalVoiceState.remoteStream;
        remoteAudioRef.current.muted = globalVoiceState.isDeafened;
        remoteAudioRef.current.volume = globalVoiceState.remoteVolume;
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!globalVoiceState.isPushToTalk) return;
      if (e.code !== 'Space' && e.code !== 'KeyV') return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      e.preventDefault();
      e.stopPropagation();

      if (!globalVoiceState.isPttActive) {
        updateGlobalState({ isPttActive: true });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!globalVoiceState.isPushToTalk) return;
      if (e.code !== 'Space' && e.code !== 'KeyV') return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      e.preventDefault();
      e.stopPropagation();
      updateGlobalState({ isPttActive: false });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);

      // When unmounting (e.g. user leaves page), wait briefly.
      // If another VoiceChat instance takes over, it keeps the singleton alive.
      const cleanupRoomId = roomId;
      const cleanupInstanceId = voiceInstanceId;
      clearCleanupTimer();
      cleanupTimer = setTimeout(() => {
        cleanupTimer = null;
        const hasAnotherActiveOwner = (
          activeVoiceInstanceId !== null &&
          activeVoiceInstanceId !== cleanupInstanceId &&
          voiceInstanceRegistrations.has(activeVoiceInstanceId)
        );

        if (hasAnotherActiveOwner || globalVoiceState.roomId !== cleanupRoomId) return;

        performHardCleanup();
      }, 1000);
    };
  }, [isActiveInstance, roomId, meId, voiceInstanceId]);

  // Dedicated presence channel to avoid conflicts with WebRTC signaling
  useEffect(() => {
    if (!isActiveInstance || !roomId || !opponentId) return;

    const presenceChannel = supabaseClient.channel(`voice-presence:${roomId}`);
    updateGlobalState({ presenceChannel });

    presenceChannel
      .on('broadcast', { event: 'voice-ping' }, ({ payload }) => {
        if (payload.roomId && payload.roomId !== roomId) return;
        if (payload.from === opponentId && globalVoiceState.joined) {
          sendVoicePresenceBroadcast('voice-pong');
        }
      })
      .on('broadcast', { event: 'voice-pong' }, ({ payload }) => {
        if (payload.roomId && payload.roomId !== roomId) return;
        if (payload.from === opponentId) updateGlobalState({ isOpponentInVoice: true });
      })
      .on('broadcast', { event: 'voice-join' }, ({ payload }) => {
        if (payload.roomId && payload.roomId !== roomId) return;
        if (payload.from === opponentId) updateGlobalState({ isOpponentInVoice: true });
      })
      .on('broadcast', { event: 'voice-leave' }, ({ payload }) => {
        if (payload.roomId && payload.roomId !== roomId) return;
        if (payload.from === opponentId) updateGlobalState({ isOpponentInVoice: false });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sendVoicePresenceBroadcast('voice-ping');
        }
      });

    return () => {
      if (globalVoiceState.presenceChannel === presenceChannel) {
        updateGlobalState({ presenceChannel: null });
      }
      supabaseClient.removeChannel(presenceChannel);
    };
  }, [isActiveInstance, roomId, opponentId, meId]);

  // Sync remote playback settings
  useEffect(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.muted = localState.isDeafened;
    remoteAudioRef.current.volume = localState.remoteVolume;
  }, [localState.isDeafened, localState.remoteVolume]);

  // Sync mic track enabled state with PTT and Mute status
  useEffect(() => {
    syncMicTrackEnabled();
  }, [localState.isMuted, localState.isPushToTalk, localState.isPttActive]);


  // Initialize WebRTC
  const initWebRTC = useCallback(() => {
    if (globalVoiceState.pc) return globalVoiceState.pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    updateGlobalState({ pc });

    pc.onicecandidate = async (event) => {
      if (event.candidate && globalVoiceState.channel) {
        const canSendCandidate = await validateVoiceSignal('ice-candidate', meId, opponentId);
        if (!canSendCandidate) return;

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

    let statsInterval: NodeJS.Timeout | null = null;

    const startConnectionStats = () => {
      if (statsInterval) clearInterval(statsInterval);

      statsInterval = setInterval(async () => {
         if (pc.connectionState !== 'connected') {
            if (statsInterval) clearInterval(statsInterval);
            statsInterval = null;
            return;
         }
         try {
            const stats = await pc.getStats();
            const rtt = getRoundTripTimeMs(stats);
            if (rtt !== null) {
                let quality: GlobalVoiceState['connectionQuality'] = 'Excellent';
                if (rtt > 250) quality = 'Poor';
                else if (rtt > 100) quality = 'Good';

                updateGlobalState({
                    ping: Math.round(rtt),
                    connectionQuality: quality
                });
            }
         } catch(err) {
             console.error("Error occurred while fetching stats:", err);
         }
      }, 2000);
    };

    const sendReconnectOffer = async () => {
      if (!globalVoiceState.channel || globalVoiceState.makingOffer || pc.signalingState !== 'stable') return;

      try {
        updateGlobalState({ makingOffer: true });

        const canSendOffer = await validateVoiceSignal('offer', meId, opponentId);
        if (!canSendOffer) return;

        updateGlobalState({ status: 'Reconnecting...' });
        pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);

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
      } catch (err) {
        console.error('Error creating reconnect offer:', err);
      } finally {
        updateGlobalState({ makingOffer: false });
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimer || !globalVoiceState.hasJoined) return;

      updateGlobalState({
        status: 'Reconnecting...',
        connectionQuality: 'Poor',
      });
      scheduleConnectTimeout(pc);

      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;

        if (meId === player1Id) {
          await sendReconnectOffer();
        }

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
          performHardCleanup('Opponent Left');
        }, RECONNECT_CLEANUP_MS);
      }, RECONNECT_GRACE_MS);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearReconnectTimer();
        clearConnectTimeoutTimer();
        updateGlobalState({ status: getConnectedVoiceStatus() });
        startConnectionStats();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = null;
        scheduleReconnect();
      } else if (pc.connectionState === 'closed') {
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = null;
        clearReconnectTimer();
        clearConnectTimeoutTimer();
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      updateGlobalState({ remoteStream: stream });
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.muted = globalVoiceState.isDeafened;
        remoteAudioRef.current.volume = globalVoiceState.remoteVolume;
      }

      stopRemoteVadLoop();

      // Setup Remote VAD
      if (globalVoiceState.audioContext && globalVoiceState.audioContext.state !== 'closed') {
        try {
           const currentRemoteVadRunId = remoteVadRunId;
           const remoteSource = globalVoiceState.audioContext.createMediaStreamSource(stream);
           const remoteAnalyser = globalVoiceState.audioContext.createAnalyser();
           remoteSource.connect(remoteAnalyser);

           const dataArray = new Float32Array(remoteAnalyser.frequencyBinCount);
           let remoteSilenceFrames = 12;

           const processRemoteAudio = () => {
             if (currentRemoteVadRunId !== remoteVadRunId) return;

             if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
               remoteVadAnimationFrame = null;
               if (globalVoiceState.isRemoteSpeaking) {
                 updateGlobalState({ isRemoteSpeaking: false });
               }
               return;
             }

             remoteAnalyser.getFloatTimeDomainData(dataArray);
             let sumSquares = 0;
             for (let i=0; i<dataArray.length; i++) sumSquares += dataArray[i]*dataArray[i];
             const rms = Math.sqrt(sumSquares / dataArray.length);

             const isSpeaking = rms > 0.01;
             if (isSpeaking) {
                 remoteSilenceFrames = 0;
             } else {
                 remoteSilenceFrames++;
             }

             const remoteActive = remoteSilenceFrames <= 10;

             if (remoteActive !== globalVoiceState.isRemoteSpeaking) {
                 updateGlobalState({ isRemoteSpeaking: remoteActive });
             }

             remoteVadAnimationFrame = requestAnimationFrame(processRemoteAudio);
           };
           remoteVadAnimationFrame = requestAnimationFrame(processRemoteAudio);
        } catch(err) { console.error("Remote VAD setup failed", err); }
      }
    };

    syncActiveVoiceSender().catch((err) => {
      console.error('Failed to attach active voice track:', err);
    });

    return pc;
  }, [roomId, meId, opponentId, player1Id, validateVoiceSignal]);

  const requestMicrophone = async () => {
    try {
      let supported = false;
      let supportedConstraints: MediaTrackSupportedConstraints = {};
      if (navigator.mediaDevices && navigator.mediaDevices.getSupportedConstraints) {
         supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
         supported = !!supportedConstraints.noiseSuppression;
      }

      updateGlobalState({ isNoiseSuppressionSupported: supported, micPermissionHelp: null });

      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
      };

      if (supportedConstraints.echoCancellation) {
        audioConstraints.echoCancellation = true;
      }

      if (supportedConstraints.noiseSuppression) {
        audioConstraints.noiseSuppression = globalVoiceState.isNoiseSuppressionEnabled;
      }

      if (supportedConstraints.autoGainControl) {
        audioConstraints.autoGainControl = false;
      }

      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      let finalStream = rawStream;
      let audioContext: AudioContext | null = null;

      try {
        const AudioCtx = window.AudioContext || (window as WebKitAudioWindow).webkitAudioContext;
        if (!AudioCtx) {
          throw new Error('Web Audio API is not available in this browser.');
        }

        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') {
           await audioContext.resume();
        }
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
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.45;

        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(compressor);
        compressor.connect(gateGain);
        gateGain.connect(destination);
        lowpass.connect(analyser); // Analyse filtered input before gate/compression.

        // Ensure AudioContext stays alive
        const keepAliveTimer = setInterval(() => {
           if (audioContext && audioContext.state === 'suspended') {
              audioContext.resume().catch(() => {});
           }
        }, 1000);

        // Prevent Web Audio API garbage collection bug (Chromium issue 933677)
        (audioContext as AudioContextWithKeepAlive)._keepAlive = {
          source,
          highpass,
          lowpass,
          compressor,
          gateGain,
          analyser,
          destination,
          timer: keepAliveTimer,
        };

        finalStream = destination.stream;

        let lastVoiceActivity = 0;
        let noiseFloor = 0.003;
        let gateOpen = false;
        let voiceFrames = 0;
        let silenceFrames = 0;
        const dataArray = new Float32Array(analyser.frequencyBinCount);
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const binHz = audioContext.sampleRate / analyser.fftSize;

        const getBandAverage = (fromHz: number, toHz: number) => {
          const startBin = Math.max(0, Math.floor(fromHz / binHz));
          const endBin = Math.min(frequencyData.length - 1, Math.ceil(toHz / binHz));
          if (endBin <= startBin) return 0;

          let total = 0;
          for (let i = startBin; i <= endBin; i++) total += frequencyData[i];
          return total / (endBin - startBin + 1);
        };

        stopLocalVadLoop();
        const currentLocalVadRunId = localVadRunId;

        const processAudio = () => {
          if (currentLocalVadRunId !== localVadRunId) return;
          if (!audioContext || audioContext.state === 'closed') {
            localVadAnimationFrame = null;
            if (globalVoiceState.isLocalSpeaking) {
              updateGlobalState({ isLocalSpeaking: false });
            }
            return;
          }

          analyser.getFloatTimeDomainData(dataArray);
          analyser.getByteFrequencyData(frequencyData);

          let sumSquares = 0;
          let peak = 0;
          let zeroCrossings = 0;
          for (let i = 0; i < dataArray.length; i++) {
             const val = Math.abs(dataArray[i]);
             sumSquares += val * val;
             if (val > peak) peak = val;
             if (i > 0 && dataArray[i - 1] * dataArray[i] < 0) zeroCrossings++;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);
          const zcr = zeroCrossings / dataArray.length;

          let openThreshold = 0.009; // Medium
          let closeThreshold = 0.0055;
          let hangoverMs = 220;
          let requiredVoiceFrames = 2;
          let minVoiceRatio = 0.44;
          let noiseOpenMultiplier = 2.25;
          let noiseCloseMultiplier = 1.35;
          let humanScoreThreshold = 0.46;
          let minVocalCore = 3;
          let minVocalPresence = 2;
          let voiceDominanceRatio = 0.72;
          if (globalVoiceState.micSensitivity === 'Low') {
             openThreshold = 0.016;
             closeThreshold = 0.009;
             hangoverMs = 170;
             requiredVoiceFrames = 3;
             minVoiceRatio = 0.52;
             noiseOpenMultiplier = 2.85;
             noiseCloseMultiplier = 1.7;
             humanScoreThreshold = 0.54;
             minVocalCore = 2.4;
             minVocalPresence = 1.5;
             voiceDominanceRatio = 0.66;
          }
          if (globalVoiceState.micSensitivity === 'High') {
             openThreshold = 0.0055;
             closeThreshold = 0.003;
             hangoverMs = 260;
             requiredVoiceFrames = 1;
             minVoiceRatio = 0.36;
             noiseOpenMultiplier = 1.85;
             noiseCloseMultiplier = 1.15;
             humanScoreThreshold = 0.40;
             minVocalCore = 2;
             minVocalPresence = 1.2;
             voiceDominanceRatio = 0.58;
          }
          if (globalVoiceState.voiceFocus === 'Strict') {
             if (globalVoiceState.micSensitivity === 'Low') {
                minVoiceRatio += 0.02;
                humanScoreThreshold += 0.02;
             } else {
                requiredVoiceFrames += 1;
                minVoiceRatio += 0.08;
                humanScoreThreshold += 0.08;
                noiseOpenMultiplier += 0.25;
             }
          }

          const isTransient = peak > 0.50 && rms > 0.055 && peak / Math.max(rms, 0.0001) > 5.0;
          const voiceBand = getBandAverage(250, 3400);
          const vocalCore = getBandAverage(300, 1200);
          const vocalPresence = getBandAverage(1200, 3400);
          const lowBand = getBandAverage(80, 220);
          const highBand = getBandAverage(3600, 7600);
          const voiceRatio = voiceBand / Math.max(voiceBand + lowBand + highBand, 1);
          const zcrLooksLikeVoice = zcr > 0.018 && zcr < 0.28;

          const adaptiveOpenThreshold = Math.max(openThreshold, noiseFloor * noiseOpenMultiplier);
          const adaptiveCloseThreshold = Math.max(closeThreshold, noiseFloor * noiseCloseMultiplier);
          const voiceDominatesNoise = voiceBand > Math.max(lowBand, highBand) * voiceDominanceRatio;
          const strongVoiceLevel = rms > adaptiveOpenThreshold * 1.2 && voiceDominatesNoise;
          const corePresenceBalance = vocalCore > minVocalCore && vocalPresence > minVocalPresence;
          const voiceToNoiseRatio = voiceBand / Math.max(lowBand + highBand, 1);
          const humanVoiceScore =
            voiceRatio * 0.58 +
            Math.min(1, voiceToNoiseRatio / 2.2) * 0.24 +
            (zcrLooksLikeVoice ? 0.18 : 0);
          const balancedVoiceShape = voiceRatio >= minVoiceRatio || (zcrLooksLikeVoice && voiceBand > 4) || strongVoiceLevel;
          const strictVoiceShape =
            humanVoiceScore >= humanScoreThreshold &&
            corePresenceBalance &&
            zcr > 0.014 &&
            zcr < 0.25 &&
            voiceDominatesNoise;
          const hasVoiceShape = globalVoiceState.voiceFocus === 'Strict'
            ? strictVoiceShape || (strongVoiceLevel && humanVoiceScore >= humanScoreThreshold - 0.04)
            : balancedVoiceShape;
          const frameLooksLikeVoice = !isTransient && hasVoiceShape && (
            gateOpen ? rms > adaptiveCloseThreshold : rms > adaptiveOpenThreshold
          );

          if (!gateOpen && !frameLooksLikeVoice && !isTransient) {
             noiseFloor = Math.min(0.045, Math.max(0.0015, noiseFloor * 0.97 + rms * 0.03));
          }

          if (frameLooksLikeVoice) {
             voiceFrames = Math.min(8, voiceFrames + 1);
             silenceFrames = 0;
          } else {
             voiceFrames = Math.max(0, voiceFrames - 1);
             silenceFrames++;
          }

          const detectedVoice = gateOpen
            ? frameLooksLikeVoice || silenceFrames <= 2
            : voiceFrames >= requiredVoiceFrames;

          let targetGain = 1;
          const now = Date.now();

          const bypassNoiseGate = !globalVoiceState.isAdvancedCleanupEnabled || !globalVoiceState.isNoiseSuppressionEnabled;

          if (bypassNoiseGate) {
             targetGain = 1;
             gateOpen = false;
             voiceFrames = 0;
             silenceFrames = 0;
          } else if (isTransient) {
             targetGain = 0;
             lastVoiceActivity = 0;
             gateOpen = false;
          } else if (detectedVoice) {
             lastVoiceActivity = now;
             gateOpen = true;
             targetGain = 1;
          } else if (gateOpen && now - lastVoiceActivity <= hangoverMs) {
             targetGain = 1;
          } else {
             targetGain = 0;
             gateOpen = false;
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

          const canTransmitMic = !globalVoiceState.isMuted && !(globalVoiceState.isPushToTalk && !globalVoiceState.isPttActive);
          const ungatedSpeechLevel = rms > Math.max(0.005, noiseFloor * 1.4);
          const isSpeaking = canTransmitMic && !isTransient && (
            bypassNoiseGate
              ? ungatedSpeechLevel
              : detectedVoice || (gateOpen && now - lastVoiceActivity <= hangoverMs)
          );

          if (isSpeaking !== globalVoiceState.isLocalSpeaking) {
             updateGlobalState({ isLocalSpeaking: isSpeaking });
          }

          localVadAnimationFrame = requestAnimationFrame(processAudio);
        };

        localVadAnimationFrame = requestAnimationFrame(processAudio);
      } catch(err) {
        console.error("Advanced audio cleanup failed, using raw stream:", err);
      }

      updateGlobalState({ localStream: rawStream, processedStream: finalStream, audioContext, micPermissionHelp: null });
      return true;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      updateGlobalState({ status: 'Mic Permission Denied', micPermissionHelp: getMicPermissionHelp(err) });
      return false;
    }
  };

  const createOffer = async (pc: RTCPeerConnection) => {
    if (pc.signalingState !== 'stable' || globalVoiceState.makingOffer) return;
    try {
      updateGlobalState({ makingOffer: true });

      const canSendOffer = await validateVoiceSignal('offer', meId, opponentId);
      if (!canSendOffer) return;

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

    updateGlobalState({ roomId, meId, status: 'Requesting Mic...', micPermissionHelp: null });

    const hasMic = await requestMicrophone();
    if (!hasMic) return;

    updateGlobalState({ status: 'Connecting...', hasJoined: true, joined: true });

    const pc = initWebRTC();
    scheduleConnectTimeout(pc);

    // Broadcast join on presence channel so the opponent (if waiting) knows we joined
    sendVoicePresenceBroadcast('voice-join');

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
            const canSendOffer = await validateVoiceSignal('offer', meId, opponentId);
            if (!canSendOffer) return;

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

          const isValidOffer = validateIncomingVoiceSignal('offer', payload.from, payload.to);
          if (!isValidOffer) return;

          if (!globalVoiceState.localStream && globalVoiceState.joined) {
             await requestMicrophone();
             await syncActiveVoiceSender();
          }

          if (pc.signalingState !== 'stable') {
            if (meId === player1Id) return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          await flushPendingIceCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const canSendAnswer = await validateVoiceSignal('answer', meId, opponentId);
          if (!canSendAnswer) return;

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

          const isValidAnswer = validateIncomingVoiceSignal('answer', payload.from, payload.to);
          if (!isValidAnswer) return;

          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushPendingIceCandidates(pc);
        } catch (err) {
          console.error('Error handling answer:', err);
        } finally {
          updateGlobalState({ processingAnswer: false });
        }
      })
      .on('broadcast', { event: 'voice-ice-candidate' }, async ({ payload }) => {
        if (payload.from === meId || payload.to !== meId || payload.roomId !== roomId) return;
        try {
          const isValidCandidate = validateIncomingVoiceSignal('ice-candidate', payload.from, payload.to);
          if (!isValidCandidate) return;

          if (payload.candidate) {
            await queueOrAddIceCandidate(pc, payload.candidate);
          }
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      })
      .on('broadcast', { event: 'voice-leave' }, async ({ payload }) => {
        if (payload.from === meId || payload.roomId !== roomId) return;
        performHardCleanup('Opponent Left');
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

  const handleRemoteVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value) / 100));

    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = nextVolume;
    }

    updateGlobalState({ remoteVolume: nextVolume });
  };

  const handleToggleNoiseSuppression = async () => {
    if (!globalVoiceState.localStream) return;
    const audioTrack = globalVoiceState.localStream.getAudioTracks()[0];
    const newEnabled = !localState.isNoiseSuppressionEnabled;
    const prevStatus = localState.status;

    try {
      if (audioTrack && localState.isNoiseSuppressionSupported) {
        const constraints: MediaTrackConstraints = {
          noiseSuppression: newEnabled,
        };

        if (navigator.mediaDevices?.getSupportedConstraints?.().autoGainControl) {
          constraints.autoGainControl = false;
        }

        await audioTrack.applyConstraints(constraints);
      }

      updateGlobalState({ isNoiseSuppressionEnabled: newEnabled });
    } catch (err) {
      console.error("Failed to apply noise suppression constraints:", err);
      if (!newEnabled) {
        updateGlobalState({ isNoiseSuppressionEnabled: false });
      } else {
        updateGlobalState({ status: 'NS Error' });
        setTimeout(() => updateGlobalState({ status: prevStatus }), 2000);
      }
    }
  };

  const handleToggleAdvancedCleanup = async () => {
    const newEnabled = !localState.isAdvancedCleanupEnabled;
    const prevStatus = localState.status;

    try {
      updateGlobalState({ isAdvancedCleanupEnabled: newEnabled });
      await syncActiveVoiceSender(newEnabled);
    } catch (err) {
      console.error('Failed to switch clean voice track:', err);
      updateGlobalState({ status: 'Voice Error' });
      setTimeout(() => updateGlobalState({ status: prevStatus }), 2000);
    }
  };

  const cycleVoiceFocus = () => {
    updateGlobalState({ voiceFocus: localState.voiceFocus === 'Balanced' ? 'Strict' : 'Balanced' });
  };

  const cycleSensitivity = () => {
    const next = localState.micSensitivity === 'Low' ? 'Medium' : localState.micSensitivity === 'Medium' ? 'High' : 'Low';
    updateGlobalState({ micSensitivity: next });
  };

  const handleTogglePTT = () => {
    updateGlobalState({ isPushToTalk: !localState.isPushToTalk, isPttActive: false });
  };

  const startPushToTalk = () => {
    if (!globalVoiceState.isPushToTalk || globalVoiceState.isMuted) return;
    updateGlobalState({ isPttActive: true });
  };

  const stopPushToTalk = () => {
    if (!globalVoiceState.isPushToTalk) return;
    updateGlobalState({ isPttActive: false });
  };

  const handleLeaveVoice = () => {
    setIsSettingsOpen(false);
    performHardCleanup();
  };

  const shouldRenderThisInstance = (
    isActiveInstance ||
    activeVoiceInstanceId === null ||
    activeVoiceInstanceId === voiceInstanceId
  );

  if (!shouldRenderThisInstance) {
    return null;
  }

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

  const shouldShowIdleStatus = (
    localState.status === 'Voice Error' ||
    localState.status === 'Mic Permission Denied' ||
    localState.status === 'NS Error' ||
    localState.status === 'Opponent Left'
  );
  const voiceStatusLabel = !localState.hasJoined
    ? shouldShowIdleStatus
      ? localState.status
      : localState.isOpponentInVoice
        ? 'Opponent is waiting!'
        : 'Join Voice Chat?'
    : localState.status;
  const shouldHideIdleJoinButton = (
    localState.status === 'Voice Error' ||
    (!localState.isOpponentInVoice && localState.status === 'Opponent Left')
  );

  const StatusIcon = !localState.hasJoined
    ? localState.status === 'Opponent Left'
      ? PhoneOff
      : shouldShowIdleStatus
        ? AlertCircle
      : localState.isOpponentInVoice
        ? PhoneCall
        : Mic
    : localState.isPushToTalk
      ? Keyboard
      : localState.status === 'Connected'
        ? Phone
      : localState.status === 'Mic Muted'
        ? MicOff
        : localState.status === 'Deafened'
          ? VolumeX
          : Mic;
  const statusIconColor = localState.hasJoined && localState.status === 'Connected'
    ? '#10b981'
    : undefined;

  const remoteVolumePercent = Math.round(localState.remoteVolume * 100);
  const RemoteVolumeIcon = localState.isDeafened || remoteVolumePercent === 0 ? VolumeX : Volume2;
  const speakingDotStyle = (isSpeaking: boolean) => ({
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    background: isSpeaking ? '#10b981' : 'rgba(148,163,184,0.45)',
    flexShrink: 0,
  });
  const speakingPillStyle = (isSpeaking: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '14px',
    padding: '0 4px',
    borderRadius: '999px',
    border: isSpeaking ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(148,163,184,0.16)',
    background: isSpeaking ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.08)',
    color: isSpeaking ? '#34d399' : 'var(--text-muted)',
    flex: '0 0 auto',
  });
  const pingTone = localState.connectionQuality === 'Excellent'
    ? { text: '#34d399', border: 'rgba(16,185,129,0.55)', background: 'rgba(16,185,129,0.16)' }
    : localState.connectionQuality === 'Good'
      ? { text: '#fbbf24', border: 'rgba(245,158,11,0.55)', background: 'rgba(245,158,11,0.16)' }
      : localState.connectionQuality === 'Poor'
        ? { text: '#f87171', border: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.16)' }
        : { text: 'var(--text-muted)', border: 'rgba(148,163,184,0.28)', background: 'rgba(148,163,184,0.10)' };
  const PingIcon = localState.connectionQuality === 'Excellent'
    ? SignalHigh
    : localState.connectionQuality === 'Good'
      ? SignalMedium
      : localState.connectionQuality === 'Poor'
        ? SignalLow
        : SignalZero;
  const pingPillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '15px',
    padding: '0 5px',
    borderRadius: '999px',
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(148,163,184,0.08)',
    color: 'var(--text-muted)',
    flex: '0 0 auto',
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: '1 1 auto', minWidth: 0 }}>
          <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'transparent',
              transition: 'all 0.1s ease',
              flexShrink: 0
          }}>
            <StatusIcon size={18} strokeWidth={2.2} color={statusIconColor} aria-hidden="true" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', overflow: 'hidden', flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', flex: '1 1 auto', minWidth: 0, color: shouldShowIdleStatus ? '#ef4444' : (localState.isOpponentInVoice && !localState.hasJoined) ? '#10b981' : 'var(--text)' }}>
                {voiceStatusLabel}
              </span>
            </div>
            {localState.hasJoined && (
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px', maxWidth: '100%', overflow: 'visible' }}>
                <span style={speakingPillStyle(localState.isLocalSpeaking)}>
                  <span style={speakingDotStyle(localState.isLocalSpeaking)} /> You
                </span>
                <span style={speakingPillStyle(localState.isRemoteSpeaking)}>
                  <span style={speakingDotStyle(localState.isRemoteSpeaking)} /> Opp
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {!localState.hasJoined ? (
            shouldHideIdleJoinButton ? null : (
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '16px', ...(localState.isOpponentInVoice ? { boxShadow: '0 0 12px rgba(16,185,129,0.4)', backgroundColor: '#10b981', borderColor: '#10b981', color: 'white' } : {}) }} onClick={handleJoinVoice}>
                {localState.isOpponentInVoice ? 'Connect' : 'Join'}
              </button>
            )
          ) : (
            <>
              <button
                className={`btn ${
                  localState.isPushToTalk
                    ? localState.isMuted
                      ? 'btn-danger'
                      : localState.isPttActive
                        ? 'btn-primary'
                        : 'btn-secondary'
                    : localState.isMuted
                      ? 'btn-danger'
                      : 'btn-secondary'
                }`}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  minWidth: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(localState.isPushToTalk ? { touchAction: 'none', userSelect: 'none' } : {}),
                }}
                onClick={localState.isPushToTalk && !localState.isMuted ? undefined : handleToggleMic}
                onMouseDown={localState.isPushToTalk && !localState.isMuted ? startPushToTalk : undefined}
                onMouseUp={localState.isPushToTalk && !localState.isMuted ? stopPushToTalk : undefined}
                onMouseLeave={localState.isPushToTalk && !localState.isMuted ? stopPushToTalk : undefined}
                onTouchStart={localState.isPushToTalk && !localState.isMuted ? (event) => { event.preventDefault(); startPushToTalk(); } : undefined}
                onTouchEnd={localState.isPushToTalk && !localState.isMuted ? (event) => { event.preventDefault(); stopPushToTalk(); } : undefined}
                onTouchCancel={localState.isPushToTalk && !localState.isMuted ? (event) => { event.preventDefault(); stopPushToTalk(); } : undefined}
                title={localState.isPushToTalk ? (localState.isMuted ? 'Unmute Push-to-Talk' : 'Hold to Talk') : (localState.isMuted ? 'Unmute Mic' : 'Mute Mic')}
                aria-label={localState.isPushToTalk ? (localState.isMuted ? 'Unmute Push-to-Talk' : 'Hold to Talk') : (localState.isMuted ? 'Unmute Mic' : 'Mute Mic')}
                aria-pressed={localState.isPushToTalk ? localState.isPttActive : undefined}
              >
                {localState.isPushToTalk
                  ? <Keyboard size={16} aria-hidden="true" />
                  : localState.isMuted
                    ? <MicOff size={16} aria-hidden="true" />
                    : <Mic size={16} aria-hidden="true" />}
              </button>
              <button
                className={`btn ${localState.isDeafened ? 'btn-danger' : 'btn-secondary'}`}
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', minWidth: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={handleToggleDeafen}
                title={localState.isDeafened ? 'Undeafen' : 'Deafen'}
              >
                {localState.isDeafened ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
              </button>
              <button
                className={`btn ${isSettingsOpen ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', minWidth: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                title="Settings"
              >
                <Settings size={16} aria-hidden="true" />
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '16px', color: '#ef4444', minWidth: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={handleLeaveVoice}
                title="Leave Voice"
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {localState.hasJoined && (
        <div
          aria-label={`Voice ping ${localState.ping !== null ? `${localState.ping} milliseconds` : 'not available yet'}`}
          style={{
            ...pingPillStyle,
            position: 'absolute',
            top: '-9px',
            right: '4px',
            zIndex: 3,
            height: '16px',
            padding: '0 6px',
            borderColor: pingTone.border,
            background: pingTone.background,
            color: pingTone.text,
            boxShadow: `0 4px 12px rgba(0,0,0,0.22), 0 0 8px ${pingTone.background}`,
            fontSize: '0.56rem',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          <PingIcon size={9} strokeWidth={2.5} aria-hidden="true" />
          {localState.ping !== null ? `${localState.ping}ms` : '--ms'}
        </div>
      )}

      {localState.status === 'Mic Permission Denied' && localState.micPermissionHelp && (
        <div
          className="card animate-fade-in"
          role="alert"
          style={{
            padding: '10px 12px',
            marginTop: '-2px',
            marginBottom: '10px',
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
            <AlertCircle size={15} aria-hidden="true" /> Microphone access needed
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.4 }}>
            {localState.micPermissionHelp}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '0.75rem', borderRadius: '14px' }}
            onClick={handleJoinVoice}
          >
            Try Again
          </button>
        </div>
      )}

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
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsSettingsOpen(false)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <RemoteVolumeIcon size={14} aria-hidden="true" /> Remote Volume
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {localState.isDeafened ? 'Muted' : `${remoteVolumePercent}%`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={remoteVolumePercent}
              onChange={handleRemoteVolumeChange}
              aria-label="Remote voice volume"
              style={{ width: '100%', accentColor: 'var(--accent-violet)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Clean Voice</span>
            <button className={`btn ${localState.isAdvancedCleanupEnabled ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleToggleAdvancedCleanup}>
              {localState.isAdvancedCleanupEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Noise Suppress</span>
            <button className={`btn ${localState.isNoiseSuppressionEnabled ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleToggleNoiseSuppression}>
              {localState.isNoiseSuppressionEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {localState.isNoiseSuppressionEnabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Voice Focus</span>
              <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', width: '82px' }} onClick={cycleVoiceFocus}>
                {localState.voiceFocus}
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
            <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Push-to-Talk
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <kbd style={{ fontSize: '0.62rem', lineHeight: 1, padding: '3px 5px', borderRadius: '5px', border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(148,163,184,0.10)', color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 700 }}>Space</kbd>
                <kbd style={{ fontSize: '0.62rem', lineHeight: 1, padding: '3px 5px', borderRadius: '5px', border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(148,163,184,0.10)', color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 700 }}>V</kbd>
              </span>
            </span>
            <button className={`btn ${localState.isPushToTalk ? 'btn-secondary' : 'btn-ghost'}`} style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '50px' }} onClick={handleTogglePTT}>
              {localState.isPushToTalk ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
