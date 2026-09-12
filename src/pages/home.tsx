import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";
import NavMenu from "../components/navMenu";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Core", path: "/core" },
];

function Home() {
  return (
    <>
      <nav className="left-res-drop">
        <NavMenu label="View WXC Resources" items={resourceLinks} />
      </nav>

      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />

      <h1 className="welcome-text acme-regular">
        Welcome, what do you want to do today?
      </h1>
    </>
  );
}

export default Home;
