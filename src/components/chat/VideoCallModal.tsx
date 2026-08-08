import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface VideoCallModalProps {
  conversationId: string;
  participantId: string;
  participantName: string;
  isIncoming?: boolean;
  audioOnly?: boolean;
  onClose: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // Free TURN fallback via Open Relay Project
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 8,
};

const RINGING_TIMEOUT_MS = 45_000;

const VideoCallModal = ({
  conversationId,
  participantId,
  participantName,
  isIncoming = false,
  audioOnly = false,
  onClose,
}: VideoCallModalProps) => {
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(audioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callStatus, setCallStatus] = useState<
    "connecting" | "ringing" | "connected" | "reconnecting" | "ended"
  >(isIncoming ? "ringing" : "connecting");
  const [durationSec, setDurationSec] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteDescSetRef = useRef(false);
  const mountedRef = useRef(true);
  // Queue ICE candidates that arrive before remote description is set
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // ─── helpers ─────────────────────────────────────────────────────────────────
  const drainIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of iceCandidateQueueRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
    iceCandidateQueueRef.current = [];
  }, []);

  // ─── cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (user) {
      supabase
        .from("webrtc_signals" as any)
        .delete()
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq("conversation_id", conversationId)
        .then(() => {});
    }
  }, [user, conversationId]);

  // ─── main call setup ────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !audioOnly,
        audio: true,
      });
      localStreamRef.current = stream;

      // Show local preview — muted so no echo
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
        if (mountedRef.current) setCallStatus("connected");
      };

      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        await supabase.from("webrtc_signals" as any).insert({
          conversation_id: conversationId,
          sender_id: user.id,
          receiver_id: participantId,
          signal_type: "ice-candidate",
          signal_data: event.candidate.toJSON(),
        } as any);
      };

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        if (pc.connectionState === "connected") setCallStatus("connected");
        else if (pc.connectionState === "disconnected") setCallStatus("reconnecting");
        else if (pc.connectionState === "failed" || pc.connectionState === "closed")
          setCallStatus("ended");
      };

      // ─── signalling channel ──────────────────────────────────────────────────
      const channel = supabase
        .channel(`webrtc-${conversationId}-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "webrtc_signals", filter: `receiver_id=eq.${user.id}` },
          async (payload) => {
            if (!mountedRef.current) return;
            const signal = payload.new as any;
            if (signal.conversation_id !== conversationId) return;
            try {
              if (signal.signal_type === "offer" && !remoteDescSetRef.current) {
                remoteDescSetRef.current = true;
                await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                await drainIceCandidates(pc);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await supabase.from("webrtc_signals" as any).insert({
                  conversation_id: conversationId, sender_id: user.id, receiver_id: participantId,
                  signal_type: "answer", signal_data: answer,
                } as any);
              } else if (signal.signal_type === "answer" && !remoteDescSetRef.current) {
                remoteDescSetRef.current = true;
                await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                await drainIceCandidates(pc);
                if (mountedRef.current) setCallStatus("connected");
              } else if (signal.signal_type === "ice-candidate") {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data));
                } else {
                  // Queue until remote description is set
                  iceCandidateQueueRef.current.push(signal.signal_data);
                }
              } else if (signal.signal_type === "hangup") {
                if (mountedRef.current) setCallStatus("ended");
              }
            } catch (e) { console.warn("[VideoCall] signalling error:", e); }
          }
        )
        .subscribe();

      channelRef.current = channel;

      // ─── caller: send offer ──────────────────────────────────────────────────
      if (!isIncoming) {
        setCallStatus("ringing");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await supabase.from("webrtc_signals" as any).insert({
          conversation_id: conversationId, sender_id: user.id, receiver_id: participantId,
          signal_type: "offer", signal_data: offer,
        } as any);
      } else {
        // ─── callee: process queued signals ─────────────────────────────────
        const { data: pending } = await supabase
          .from("webrtc_signals" as any).select("*")
          .eq("conversation_id", conversationId).eq("receiver_id", user.id).eq("sender_id", participantId)
          .order("created_at", { ascending: true });
        for (const sig of (pending as any[]) || []) {
          try {
            if (sig.signal_type === "offer" && !remoteDescSetRef.current) {
              remoteDescSetRef.current = true;
              await pc.setRemoteDescription(new RTCSessionDescription(sig.signal_data));
              await drainIceCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await supabase.from("webrtc_signals" as any).insert({
                conversation_id: conversationId, sender_id: user.id, receiver_id: participantId,
                signal_type: "answer", signal_data: answer,
              } as any);
            } else if (sig.signal_type === "ice-candidate") {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(sig.signal_data));
              } else {
                iceCandidateQueueRef.current.push(sig.signal_data);
              }
            }
          } catch (e) { console.warn("[VideoCall] pending signal error:", e); }
        }
      }
    } catch (err) {
      console.error("[VideoCall] failed to start:", err);
      if (mountedRef.current) setCallStatus("ended");
    }
  }, [user, conversationId, participantId, isIncoming, audioOnly, drainIceCandidates]);

  // ─── lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    startCall();
    return () => { mountedRef.current = false; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (callStatus === "ended") {
      const t = setTimeout(() => { cleanup(); onClose(); }, 1500);
      return () => clearTimeout(t);
    }
  }, [callStatus, cleanup, onClose]);

  useEffect(() => {
    if (callStatus !== "connected") return;
    const t = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callStatus]);

  useEffect(() => {
    if (callStatus !== "ringing" && callStatus !== "connecting") return;
    const t = setTimeout(() => setCallStatus((s) => (s === "connected" ? s : "ended")), RINGING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [callStatus]);

  // ─── controls ────────────────────────────────────────────────────────────────
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsMuted((m) => !m);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsVideoOff((v) => !v);
    }
  };

  const toggleScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    if (isScreenSharing) {
      // Revert to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(camTrack);
        if (localVideoRef.current && localStreamRef.current)
          localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } catch (e) { console.warn("[VideoCall] screen share denied", e); }
    }
  };

  const hangUp = async () => {
    if (user) {
      await supabase.from("webrtc_signals" as any).insert({
        conversation_id: conversationId, sender_id: user.id, receiver_id: participantId,
        signal_type: "hangup", signal_data: {},
      } as any);
    }
    setCallStatus("ended");
  };

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Remote video */}
      <div className="flex-1 relative bg-card">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />

        {callStatus !== "connected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-primary">{participantName[0]?.toUpperCase()}</span>
            </div>
            <p className="text-lg font-semibold text-foreground">{participantName}</p>
            <p className="text-sm text-muted-foreground mt-1 animate-pulse">
              {callStatus === "connecting" && "Connecting..."}
              {callStatus === "ringing" && "Ringing..."}
              {callStatus === "reconnecting" && "Reconnecting..."}
              {callStatus === "ended" && "Call ended"}
            </p>
          </div>
        )}

        {callStatus === "connected" && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-white font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {Math.floor(durationSec / 60).toString().padStart(2, "0")}:{(durationSec % 60).toString().padStart(2, "0")}
          </div>
        )}

        {/* Local video overlay — hidden in audio-only mode */}
        {!audioOnly && (
          <div className="absolute top-4 right-4 w-32 h-44 rounded-xl overflow-hidden border-2 border-border shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn("w-full h-full object-cover", isVideoOff && !isScreenSharing && "hidden")}
            />
            {isVideoOff && !isScreenSharing && (
              <div className="w-full h-full bg-secondary flex items-center justify-center">
                <VideoOff className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {isScreenSharing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground text-xs px-3 py-1 rounded-full font-medium">
            Sharing screen
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-card/90 backdrop-blur-sm border-t border-border p-6">
        <div className="flex items-center justify-center gap-4">
          <button onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground")}>
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {!audioOnly && (
            <button onClick={toggleVideo} title={isVideoOff ? "Turn on camera" : "Turn off camera"}
              className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                isVideoOff ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground")}>
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          {!audioOnly && (
            <button onClick={toggleScreenShare} title={isScreenSharing ? "Stop sharing" : "Share screen"}
              className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                isScreenSharing ? "bg-primary/20 text-primary" : "bg-secondary text-foreground")}>
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>
          )}

          <button onClick={hangUp}
            className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCallModal;
