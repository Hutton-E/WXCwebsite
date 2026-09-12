import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";
import NavMenu from "../components/navMenu";
import IdentityLookup from "../components/identityLookup";
import SwitchIdentityPrompt from "../components/switchIdentity";
import { useUser } from "../context/UserContext";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Core", path: "/core" },
];

function Home() {
  const { name } = useUser();

  return (
    <>
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />

      <h1 className="welcome-text acme-regular text-outline">
        {name
          ? `Welcome, ${name}`
          : "Welcome, please type your name and select it to view resources."}
      </h1>

      {!name && <IdentityLookup />}
      {name && (
        <>
          <nav className="left-res-drop">
            <NavMenu label="View WXC Resources" items={resourceLinks} />
          </nav>

          <SwitchIdentityPrompt />
        </>
      )}
    </>
  );
}

export default Home;
