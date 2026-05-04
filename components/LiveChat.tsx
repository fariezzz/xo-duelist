"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseClient } from "../lib/supabase";
import styles from "./LiveChat.module.css";

type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};

type LiveChatProps = {
  roomId: string;
  meId: string | null;
  playerName?: string | null;
};

export default function LiveChat({ roomId, meId, playerName }: LiveChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);

  const displayName = playerName?.trim() || "Player";

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    if (!roomId || !meId) return;

    let active = true;

    async function loadMessages() {
      setLoading(true);

      const { data, error } = await supabaseClient
        .from("chat_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(60);

      if (!active) return;

      if (error) {
        console.error("Gagal load chat:", error.message);
        setMessages([]);
      } else {
        setMessages([...(data ?? [])].reverse() as ChatMessage[]);
      }

      setLoading(false);
    }

    loadMessages();

    const channel = supabaseClient
      .channel(`room-chat-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;

          setMessages((prev) => {
            const exists = prev.some((msg) => msg.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage].slice(-60);
          });

          if (!openRef.current && newMessage.sender_id !== meId) {
            setUnread((value) => value + 1);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabaseClient.removeChannel(channel);
    };
  }, [roomId, meId]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();

    const cleanText = text.trim();

    if (!cleanText || !meId || sending) return;

    if (cleanText.length > 300) {
      alert("Pesan maksimal 300 karakter.");
      return;
    }

    setSending(true);

    const { data, error } = await supabaseClient
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: meId,
        sender_name: displayName,
        message: cleanText,
      })
      .select()
      .single();

    if (error) {
      console.error("Gagal kirim chat:", error.message);
      alert("Chat gagal dikirim. Cek koneksi atau policy Supabase.");
    } else if (data) {
      setMessages((prev) => {
        const exists = prev.some((msg) => msg.id === data.id);
        if (exists) return prev;
        return [...prev, data as ChatMessage].slice(-60);
      });
      setText("");
    }

    setSending(false);
  }

  return (
    <div className={styles.chatRoot}>
      {!open ? (
        <button className={styles.chatToggle} onClick={() => setOpen(true)}>
          <span>💬</span>
          <span>Chat</span>
          {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
        </button>
      ) : (
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div>
              <h3>Live Chat</h3>
              <p>Room #{roomId.slice(0, 8)}</p>
            </div>

            <button onClick={() => setOpen(false)} title="Tutup chat">
              ✕
            </button>
          </div>

          <div className={styles.chatBody}>
            {loading ? (
              <div className={styles.emptyState}>Memuat chat...</div>
            ) : messages.length === 0 ? (
              <div className={styles.emptyState}>Belum ada pesan.</div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === meId;

                return (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${
                      isMine ? styles.mine : styles.other
                    }`}
                  >
                    <div className={styles.messageBubble}>
                      <div className={styles.messageName}>
                        {isMine ? "Kamu" : msg.sender_name}
                      </div>

                      <div className={styles.messageText}>{msg.message}</div>

                      <div className={styles.messageTime}>
                        {new Date(msg.created_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={bottomRef} />
          </div>

          <form className={styles.chatForm} onSubmit={sendMessage}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={meId ? "Ketik pesan..." : "Login diperlukan"}
              maxLength={300}
              disabled={!meId || sending}
            />

            <button type="submit" disabled={!text.trim() || !meId || sending}>
              {sending ? "..." : "Kirim"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}