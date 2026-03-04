import './Navbar.css'
import React from 'react';
import WelcomeBanner from "../WelcomeBanner";

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="nav-logo">DiscoverCase</div>
      <div className="nav-links">
        <a href="#all" className="nav-link active">Dashboard</a>
        <a href="#recent" className="nav-link">Groups</a>
        <a href="#saved" className="nav-link">Your Group</a>
      </div>
      <div className="nav-actions">
        <WelcomeBanner variant="dark" /> 
      </div>
    </nav>
  );
};

export default Navbar;