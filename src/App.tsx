import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import Lookup from "./pages/name_lookup";
import ErrorPage from "./pages/error";
import AboutInfo from "./pages/about";

function App() {
  return (
    <BrowserRouter>
      <Background imageUrl={wartburgDroneShot} opacity={0.7} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="*" element={<ErrorPage />} />
        <Route path="/about" element={<AboutInfo />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
