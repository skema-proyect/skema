import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import ChatView from "@/pages/ChatView";
import NotesView from "@/pages/NotesView";
import AgendaView from "@/pages/AgendaView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ChatView />} />
          <Route path="notas"  element={<NotesView />} />
          <Route path="agenda" element={<AgendaView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
