import React, { useState } from "react";
import VoiceChatPanel from "./components/VoiceChatPanel";
import TextChatPanel from "./components/TextChatPanel";
import ConversationHistory from "./components/ConversationHistory";

function App() {
  const [mode, setMode] = useState(null); // "voice" or "chat"
  const [history, setHistory] = useState([]);

  return (
    <div>
      <h1>AI Mental Health Coach</h1>
      <button onClick={() => setMode("voice")}>Talk with AI Agent</button>
      <button onClick={() => setMode("chat")}>Chat with AI Agent</button>
      <ConversationHistory history={history} />
      {mode === "voice" && <VoiceChatPanel history={history} setHistory={setHistory} />}
      {mode === "chat" && <TextChatPanel history={history} setHistory={setHistory} />}
    </div>
  );
}

export default App;