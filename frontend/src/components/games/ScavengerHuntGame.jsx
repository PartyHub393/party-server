import React from "react";
import "./ScavengerHunt.css";

export default function ScavengerHuntStart() {
  return (
    <div className="scavenger-host-screen">
      <div className="category-selection">
        <h2>Scavenger Hunt Dashboard</h2>

        <div className="category-cards">

          {/* Team Name Card */}
          <div className="category-card full-width">
            <h3>Team Name</h3>
            <input
              type="text"
              placeholder="Enter your team name..."
              className="team-name-input"
            />
            <button className="save-team-button">
              Save
            </button>
          </div>

          {/* Total Points */}
          <div className="category-card">
            <h3>Total Points</h3>
            <p>0</p>
          </div>

          {/* Completed */}
          <div className="category-card">
            <h3>Challenges Completed</h3>
            <p>0</p>
          </div>

        </div>

        {/* Category Progress */}
        <div className="category-cards">

          <div className="category-card">
            <h3>Campus</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: "0%" }} />
            </div>
          </div>

          <div className="category-card">
            <h3>Team</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: "0%" }} />
            </div>
          </div>

          <div className="category-card">
            <h3>Creative</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: "0%" }} />
            </div>
          </div>

          <div className="category-card">
            <h3>Academic</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: "0%" }} />
            </div>
          </div>

        </div>

        {/* Photo Section */}
        <div className="category-cards">
          <div className="category-card full-width">
            <h3>Photo Gallery</h3>
            <p>No photos uploaded yet.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
