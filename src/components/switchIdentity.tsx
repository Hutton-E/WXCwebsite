import { useState } from "react";
import { useUser } from "../context/UserContext";

function SwitchIdentityPrompt() {
  const { clearName } = useUser();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="switch-identity-confirm">
        <span className="switch-identity-confirm-text acme-regular text-outline">
          Not you? This will reset your selection.
        </span>
        <button className="switch-identity-confirm-yes" onClick={clearName}>
          Yes, switch
        </button>
        <button
          className="switch-identity-confirm-no"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className="switch-identity-link acme-regular text-outline"
      onClick={() => setConfirming(true)}
    >
      Not you?
    </button>
  );
}

export default SwitchIdentityPrompt;
