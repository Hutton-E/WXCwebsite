import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

interface DropdownItem {
  label: string;
  path: string;
}

interface NavMenuProps {
  label: string;
  items: DropdownItem[];
}

function NavMenu({ label, items }: NavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside of it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="nav-menu" ref={menuRef}>
      <button
        className="nav-menu-trigger acme-regular text-outline"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <span className={`nav-menu-arrow ${isOpen ? "open" : ""}`}>▾</span>
      </button>

      {isOpen && (
        <div className="nav-menu-dropdown acme-regular text-outline">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="nav-menu-item"
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default NavMenu;
