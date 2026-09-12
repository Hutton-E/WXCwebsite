import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";

function Home() {
  return (
    <div className="hero">
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />
      <h1 className="welcome-text acme-regular">
        Welcome, what do you want to do today?
      </h1>
    </div>
  );
}

export default Home;
