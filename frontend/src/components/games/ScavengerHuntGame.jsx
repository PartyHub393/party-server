import React, { useEffect, useState } from "react";
import "./ScavengerHunt.css";
import {
  getScavengerChallenges,
  getScavengerState,
  setScavengerTeamName,
  reviewScavengerSubmission,
} from "../../api";

export default function ScavengerHuntStart() {
  const [teamName, setTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [state, setState] = useState(null);
  const [challenges, setChallenges] = useState(null);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [challengeData, stateData] = await Promise.all([
          getScavengerChallenges(),
          getScavengerState(),
        ]);
        setChallenges(challengeData);
        setState(stateData);
        setTeamName(stateData.teamName || "");
      } catch (err) {
        setError(err.message || "Failed to load scavenger hunt data");
      }
    }
    loadData();
  }, []);

  // Periodically refresh scavenger state so new submissions and metrics appear
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const newState = await getScavengerState();
        if (!cancelled) setState(newState);
      } catch {
        // ignore periodic refresh errors
      }
    }
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleSaveTeamName() {
    if (!teamName.trim()) return;
    setSavingTeam(true);
    setSaveMessage("");
    setError("");
    try {
      const res = await setScavengerTeamName(teamName.trim());
      setTeamName(res.teamName);
      setSaveMessage("Team name saved!");
    } catch (err) {
      setError(err.message || "Failed to save team name");
    } finally {
      setSavingTeam(false);
      setTimeout(() => setSaveMessage(""), 2000);
    }
  }

  const categoryStats = state?.categoryStats || [];

  const getChallengeById = (id) => {
    if (!challenges?.categories) return null;
    for (const cat of challenges.categories) {
      const found = cat.challenges.find((c) => c.id === id);
      if (found) return { ...found, categoryName: cat.name };
    }
    return null;
  };

  function handleCommentChange(submissionId, value) {
    setCommentDrafts((prev) => ({
      ...prev,
      [submissionId]: value,
    }));
  }

  async function handleReview(submissionId, approved) {
    const draft = commentDrafts[submissionId] || "";
    setReviewingId(submissionId);
    setError("");
    try {
      const { state: newState } = await reviewScavengerSubmission({
        submissionId,
        approved,
        comment: draft,
      });
      setState(newState);
    } catch (err) {
      setError(err.message || "Failed to review submission");
    } finally {
      setReviewingId(null);
      setEditingId(null);
    }
  }

  return (
    <div className="scavenger-host-screen">
      <div className="category-selection">
        <h2>Scavenger Hunt Dashboard</h2>

        {error && <p className="scavenger-error">{error}</p>}

        <div className="category-cards">
          {/* Team Name Card */}
          <div className="category-card full-width">
            <h3>Team Name</h3>
            <input
              type="text"
              placeholder="Enter your team name..."
              className="team-name-input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button
              className="save-team-button"
              onClick={handleSaveTeamName}
              disabled={savingTeam || !teamName.trim()}
            >
              {savingTeam ? "Saving..." : "Save"}
            </button>
            {saveMessage && <p className="scavenger-success">{saveMessage}</p>}
          </div>

          {/* Total Points */}
          <div className="category-card">
            <h3>Total Points</h3>
            <p>{state?.totalPoints ?? 0}</p>
          </div>

          {/* Completed */}
          <div className="category-card">
            <h3>Challenges Completed</h3>
            <p>{state?.challengesCompleted ?? 0}</p>
          </div>
        </div>

        {/* Category Progress */}
        <div className="category-cards">
          {categoryStats.map((cat) => {
            const pct =
              cat.totalChallenges > 0
                ? Math.round((cat.completedChallenges / cat.totalChallenges) * 100)
                : 0;
            return (
              <div key={cat.id} className="category-card">
                <h3>{cat.name}</h3>
                <p>
                  {cat.completedChallenges} / {cat.totalChallenges} completed
                </p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Category Challenges (host view) */}
        <div className="category-cards">
          {challenges?.categories?.map((cat) => (
            <div key={cat.id} className="category-card full-width">
              <h3>{cat.name} Challenges</h3>
              <p className="category-description">{cat.description}</p>
              <ul className="challenge-list">
                {cat.challenges.map((ch) => (
                  <li key={ch.id} className="challenge-item">
                    <div className="challenge-header">
                      <span className="challenge-title">{ch.title}</span>
                      <span className="challenge-points">{ch.points} pts</span>
                    </div>
                    <p className="challenge-description">{ch.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Photo Section */}
        <div className="category-cards">
          <div className="category-card full-width">
            <h3>Photo Gallery</h3>
            {state?.submissions && state.submissions.length > 0 ? (
              <div className="photo-gallery-grid">
                {state.submissions.map((sub) => {
                  const isPending = sub.approved === null;
                  const isEditing = isPending || editingId === sub.id;
                  const hasComment = !!sub.comment;
                  const commentValue = commentDrafts[sub.id] ?? sub.comment ?? "";

                  return (
                    <div key={sub.id} className="photo-card">
                      <p className="photo-challenge-label">
                        {getChallengeById(sub.challengeId)?.title || sub.challengeId}
                      </p>
                      <p className="photo-uploader-label">
                        Uploaded by <strong>{sub.playerName || "Player"}</strong>
                      </p>
                      <img src={sub.imageData} alt={sub.challengeId} />

                      {isEditing ? (
                        <textarea
                          className="photo-comment-input"
                          placeholder="Optional comment to player..."
                          value={commentValue}
                          onChange={(e) => handleCommentChange(sub.id, e.target.value)}
                        />
                      ) : hasComment ? (
                        <div className="photo-comment-display">
                          Comment: <span>{sub.comment}</span>
                        </div>
                      ) : null}

                      {isEditing ? (
                        <div className="photo-actions">
                          <button
                            type="button"
                            className="photo-approve-button"
                            onClick={() => handleReview(sub.id, true)}
                            disabled={reviewingId === sub.id}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="photo-deny-button"
                            onClick={() => handleReview(sub.id, false)}
                            disabled={reviewingId === sub.id}
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <div className="photo-actions">
                          <button
                            type="button"
                            className="photo-edit-button"
                            onClick={() => setEditingId(sub.id)}
                          >
                            Edit review
                          </button>
                        </div>
                      )}

                      {sub.approved !== null && (
                        <p className="photo-status">
                          Status: {sub.approved ? "Approved" : "Denied"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No photos uploaded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
