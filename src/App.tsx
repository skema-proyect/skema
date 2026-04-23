import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import VoiceStudio from "@/pages/VoiceStudio";
import Documents from "@/pages/Documents";
import Sketch from "@/pages/Sketch";
import Normativa from "@/pages/Normativa";
import Research from "@/pages/Research";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="voz" element={<VoiceStudio />} />
          <Route path="documentos" element={<Documents />} />
          <Route path="planos" element={<Sketch />} />
          <Route path="normativa" element={<Normativa />} />
          <Route path="investigacion" element={<Research />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
