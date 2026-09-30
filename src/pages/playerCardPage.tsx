import PlayerCard from "../components/playerCard";
import { useUser } from "../context/UserContext";
import { Link } from "react-router-dom";

function PlayerCardPage() {
  const { athlete } = useUser();

  if (!athlete) return null;

  return (
    <div className="player-card-page">
      <p className="player-card-directory-prompt">
        View full directory of player cards:{" "}
        <Link to="/player-cards">View directory</Link>
      </p>
      <PlayerCard athlete={athlete} />
    </div>
  );
}

export default PlayerCardPage;
