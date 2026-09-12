import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";
import NavMenu from "../components/navMenu";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Core", path: "/core" },
];

function Home() {
  return (
    <>
      <nav style={{ position: "fixed", top: 20, right: 20, zIndex: 15 }}>
        <NavMenu label="View WXC Resources" items={resourceLinks} />
      </nav>
      <div className="hero">
        <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />
        <h1 className="welcome-text acme-regular">
          Welcome, what do you want to do today?
        </h1>
      </div>
    </>
  );
}

export default Home;
