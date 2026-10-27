"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export default function TerminalPage() {
  const params = useParams();
  const router = useRouter();
  const sandboxId = params.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchConversation = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?sandbox_id=${sandboxId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.conversations?.length > 0) {
          const conv = data.conversations[0];
          setConversationId(conv.id);
          const msgRes = await fetch(`/api/conversations/${conv.id}`);
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            setMessages(msgData.messages || []);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  }, [sandboxId]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      let convId = conversationId;
      if (!convId) {
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandbox_id: sandboxId, title: currentInput.slice(0, 50) }),
        });
        if (createRes.ok) {
          const data = await createRes.json();
          convId = data.id;
          setConversationId(convId);
        }
      }

      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: currentInput }),
      });

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          model: "openai/gpt-5.4-nano",
          stream: true,
        }),
      });

      if (!chatRes.ok) throw new Error("Chat request failed");

      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let assistantMessage: Message | null = null;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || parsed.content || "";
              if (delta) {
                assistantContent += delta;
                if (!assistantMessage) {
                  assistantMessage = { role: "assistant", content: assistantContent, timestamp: Date.now() };
                  setMessages((prev) => [...prev, assistantMessage!]);
                } else {
                  setMessages((prev) => prev.map((m) => (m === assistantMessage ? { ...m, content: assistantContent } : m)));
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      if (assistantMessage && convId) {
        await fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: assistantContent }),
        });
      }
    } catch (err) {
      console.error("Send failed:", err);
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${err}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">← Back</button>
          <h1 className="font-mono font-semibold">Sandbox {sandboxId.slice(0, 12)}…</h1>
          <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
            Connected
          </span>
        </div>
        <button
          onClick={() => router.refresh()}
          className="text-sm text-gray-500 hover:text-gray-700"
          disabled={isLoading}
        >
          Refresh
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            <div
              className={`max-w-[80%] px-4 py-2 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : msg.role === "assistant"
                  ? "bg-white text-gray-900 rounded-bl-none border"
                  : "bg-yellow-100 text-yellow-800 rounded text-sm"
              }`}
            >
              <pre className="whitespace-pre-wrap font-mono text-sm">{msg.content}</pre>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <form onSubmit={sendMessage} className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}