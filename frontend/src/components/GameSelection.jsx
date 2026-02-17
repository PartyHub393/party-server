import { Link } from "react-router-dom";
import WelcomeBanner from "./WelcomeBanner";
import "./GameSelection.css";

export default function GameSelection() {
  return (
    <div className="games-page">
      <WelcomeBanner />
      <div className="games-container">
        <h1 className="games-title">Orientation Week Games</h1>
        <p className="games-subtitle">
          Choose your game and start the fun!
        </p>

        <div className="games-grid">
          {/* Scavenger Hunt */}
          <div className="game-card">
            <div className="game-card__header scavenger">
              <h2>Scavenger Hunt</h2>
              <p>
                Explore campus and complete photo challenges with your team
              </p>
            </div>

            <div className="game-card__body">
              <div className="game-meta">
                <span>Team Game</span>
                <span>10 Challenges</span>
              </div>

              <ul className="game-features purple">
                <li>Upload photos for each challenge</li>
                <li>Earn points for your team</li>
                <li>Compete on the leaderboard</li>
              </ul>

              <Link to="/scavenger-hunt" className="game-link purple-link">
                Start Hunting →
              </Link>
            </div>
          </div>

          {/* Trivia */}
          <div className="game-card">
            <div className="game-card__header trivia">
              <h2>Campus Trivia</h2>
              <p>
                Test your knowledge about campus history and fun facts
              </p>
            </div>

            <div className="game-card__body">
              <div className="game-meta">
                <span>Solo or Team</span>
                <span>15 Questions</span>
              </div>

              <ul className="game-features orange">
                <li>Multiple choice questions</li>
                <li>Learn campus facts & history</li>
                <li>Beat your high score</li>
              </ul>

              <Link to="/trivia" className="game-link orange-link">
                Start Quiz →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
