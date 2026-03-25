import './Navbar.css'
import React from 'react';
import { NavLink } from 'react-router-dom';
import WelcomeBanner from "../WelcomeBanner";
import { useAuth } from '../../contexts/AuthContext';

const Navbar = () => {
  const { user } = useAuth();
  const isHost = user?.role === 'host';

  return (
    <nav className="navbar">
      <NavLink to={isHost ? '/dashboard' : '/join-group'} className="nav-logo nav-logo-link">DiscoverCase</NavLink>
      
      <div className="nav-links">
        {isHost ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/host-games" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Games
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/waiting-room" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Waiting Room
            </NavLink>
          </>
        )}
      </div>
      <div className="nav-actions">
        <WelcomeBanner variant="dark" /> 
      </div>
    </nav>
  );
};

export default Navbar;