import React, { useEffect, useState } from "react";
import "./ScavengerHunt.css";
import { getScavengerChallenges, getScavengerState, submitScavengerPhoto } from "../../api";

export default function ScavengerHuntPlayer() {
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [challenges, scavengerState] = await Promise.all([
          getScavengerChallenges(),
          getScavengerState(),
        ]);
        setData(challenges);
        setState(scavengerState);
      } catch (err) {
        setError(err.message || "Failed to load scavenger challenges");
      }
    }
    load();
  }, []);

  // Periodically refresh review status so players see host decisions
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const scavengerState = await getScavengerState();
        if (!cancelled) setState(scavengerState);
      } catch {
        // ignore background refresh errors
      }
    }
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const categories = data?.categories || [];
  const submissions = state?.submissions || [];

  function latestSubmissionForChallenge(challengeId) {
    const list = submissions.filter((s) => s.challengeId === challengeId);
    if (list.length === 0) return null;
    return list.reduce((latest, s) =>
      !latest || new Date(s.createdAt) > new Date(latest.createdAt) ? s : latest
    , null);
  }

  async function handleUpload(challengeId, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (jpg, png, etc.).");
      return;
    }

    setUploadingId(challengeId);
    setError("");

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const imageData = reader.result;
          const playerName =
            localStorage.getItem("dc_username") || "Player";
          await submitScavengerPhoto({ challengeId, imageData, playerName });
          const scavengerState = await getScavengerState();
          setState(scavengerState);
        } catch (err) {
          setError(err.message || "Failed to submit photo");
        } finally {
          setUploadingId(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Failed to read image file.");
      setUploadingId(null);
    }
  }

  function handleFileChange(challengeId, event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    handleUpload(challengeId, file);
  }

  return (
    <div className="scavenger-host-screen">
      <div className="category-selection">
        <h2>Scavenger Hunt Challenges</h2>
        <p>Work with your team to complete as many as you can!</p>

        {error && <p className="scavenger-error">{error}</p>}

        <div className="category-cards">
          {categories.map((cat) => (
            <div key={cat.id} className="category-card full-width">
              <h3>{cat.name}</h3>
              <p className="category-description">{cat.description}</p>
              <ul className="challenge-list">
                {cat.challenges.map((ch) => {
                  const latest = latestSubmissionForChallenge(ch.id);
                  return (
                    <li key={ch.id} className="challenge-item">
                      <div className="challenge-header">
                        <span className="challenge-title">{ch.title}</span>
                        <span className="challenge-points">{ch.points} pts</span>
                      </div>
                      <p className="challenge-description">{ch.description}</p>

                      <div className="challenge-upload-row">
                        <label className="upload-button">
                          {uploadingId === ch.id ? "Uploading..." : "Upload photo"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(ch.id, e)}
                            disabled={uploadingId === ch.id}
                            style={{ display: "none" }}
                          />
                        </label>
                        {latest && (
                          <div className="challenge-status">
                            <span>
                              Status:{" "}
                              {latest.approved === null
                                ? "Pending review"
                                : latest.approved
                                  ? "Approved"
                                  : "Denied"}
                            </span>
                            {latest.comment && (
                              <span className="challenge-comment">
                                {" "}
                                • Host comment: {latest.comment}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

