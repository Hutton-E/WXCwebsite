import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/home";
import ErrorPage from "./pages/error";
import BackButton from "./components/backButton";
import RequireIdentity from "./components/requireIdentity";
import ComingSoon from "./components/comingSoon";
import TfrrsStats from "./pages/tfrrsStats";
import Workouts from "./pages/workoutPages";
import AdminLogin from "./pages/adminLogin";
import RequireAdmin from "./components/requireAdmin";
import AdminDashboard from "./pages/adminDashboard";
import AdminPreview from "./pages/adminPreview";
import MileagePage from "./pages/mileagePage";
import CorePage from "./pages/corePage";
import AdminFmsAssignments from "./pages/adminFmsAssignments";
import FmsPage from "./pages/fmsPage";
import LiftingSheet from "./pages/liftingSheet";
import SchedulePage from "./pages/schedulePage";
import SeasonSchedulePage from "./pages/seasonSchedulePage";
import TimeTrials from "./pages/timeTrials";

const BACK_BUTTON_ROUTES = new Set(["/", "/time-trials"]);

function AppContent() {
  const location = useLocation();

  const isKnownRoute = [
    "/",
    "/home",
    "/lookup",
    "/about",
    "/mileage",
    "/core",
    "/schedule",
    "/season-schedule",
    "/error",
    "/fms",
    "/lifting_sheet",
    "/tfrrs-stats",
    "/time-trials",
    "/personal-records",
    "/season-bests",
    "/workouts",
    "/admin",
    "/admin/dashboard",
    "/admin/preview",
    "/admin/fms",
  ].includes(location.pathname);

  const showBackButton =
    isKnownRoute && !BACK_BUTTON_ROUTES.has(location.pathname);

  return (
    <>
      {showBackButton && <BackButton />}

      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/error" element={<ErrorPage />} />

        <Route path="*" element={<ErrorPage />} />

        <Route
          path="/about"
          element={
            <RequireIdentity>
              <ComingSoon />
            </RequireIdentity>
          }
        />

        <Route
          path="/mileage"
          element={
            <RequireIdentity>
              <MileagePage />
            </RequireIdentity>
          }
        />

        <Route
          path="/core"
          element={<CorePage />}
        />

        <Route
          path="/schedule"
          element={
            <RequireIdentity>
              <SchedulePage />
            </RequireIdentity>
          }
        />

        <Route
          path="/season-schedule"
          element={<SeasonSchedulePage />}
        />

        <Route
          path="/lookup"
          element={
            <RequireIdentity>
              <ComingSoon />
            </RequireIdentity>
          }
        />

        <Route
          path="/fms"
          element={
            <RequireIdentity>
              <FmsPage />
            </RequireIdentity>
          }
        />

        <Route
          path="/lifting_sheet"
          element={
            <RequireIdentity>
              <LiftingSheet />
            </RequireIdentity>
          }
        />

        <Route
          path="/tfrrs-stats"
          element={
            <RequireIdentity>
              <TfrrsStats />
            </RequireIdentity>
          }
        />

        <Route
          path="/time-trials"
          element={
            <RequireIdentity>
              <TimeTrials />
            </RequireIdentity>
          }
        />

        <Route
          path="/personal-records"
          element={
            <RequireIdentity>
              <ComingSoon message="Personal records aren't tracked yet — check back soon!" />
            </RequireIdentity>
          }
        />

        <Route
          path="/season-bests"
          element={
            <RequireIdentity>
              <ComingSoon message="Season bests aren't tracked yet — check back soon!" />
            </RequireIdentity>
          }
        />

        <Route
          path="/workouts"
          element={
            <RequireIdentity>
              <Workouts />
            </RequireIdentity>
          }
        />

        <Route path="/admin" element={<AdminLogin />} />

        <Route
          path="/admin/dashboard"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />

        <Route
          path="/admin/preview"
          element={
            <RequireAdmin>
              <AdminPreview />
            </RequireAdmin>
          }
        />

        <Route
          path="/admin/fms"
          element={
            <RequireAdmin>
              <AdminFmsAssignments />
            </RequireAdmin>
          }
        />
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
