import { useState } from "react";
import wartburgLogo from "./assets/still_pictures/wartburg_knights_logo_main.png";
import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";

function App() {
  const [opacity] = useState(0.7);

  return (
    <>
      <Background imageUrl={wartburgDroneShot} opacity={opacity} />
      <div className="hero">
        <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />
        <h1 className="acme-regular">Welcome, click an option below!</h1>
      </div>
    </>
  );
}

export default App;
