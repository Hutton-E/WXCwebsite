import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/home";
import Lookup from "./pages/name_lookup";
import ErrorPage from "./pages/error";
import AboutInfo from "./pages/about";
import MileagePage from "./pages/mileagePage";
import CorePage from "./pages/corePage";
import BackButton from "./components/backButton";

const BACK_BUTTON_ROUTES = new Set(["/"]);

function AppContent() {
  const location = useLocation();

  const isKnownRoute = [
    "/",
    "/lookup",
    "/about",
    "/mileage",
    "/core",
    "/error",
  ].includes(location.pathname);
  const showBackButton =
    isKnownRoute && !BACK_BUTTON_ROUTES.has(location.pathname);

  return (
    <>
      {showBackButton && <BackButton />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="*" element={<ErrorPage />} />
        <Route path="/about" element={<AboutInfo />} />
        <Route path="/mileage" element={<MileagePage />} />
        <Route path="/core" element={<CorePage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Background imageUrl={wartburgDroneShot} opacity={0.7} />
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
