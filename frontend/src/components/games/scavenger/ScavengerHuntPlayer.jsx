import React, { useEffect, useState } from "react";
import "./ScavengerHuntPlayer.css";
import {
  getScavengerChallenges,
  getScavengerState,
  submitScavengerPhoto,
  cancelScavengerSubmission,
} from "../../../api";

const STATUS_LABEL = {
  null: { text: "Pending review", cls: "badge--pending" },
  true: { text: "Approved ✓", cls: "badge--approved" },
  false: { text: "Denied", cls: "badge--denied" },
};

export default function ScavengerHuntPlayer() {
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

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

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const s = await getScavengerState();
        if (!cancelled) setState(s);
      } catch {}
    }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const categories = data?.categories || [];
  const submissions = state?.submissions || [];

  const totalPts = submissions
    .filter((s) => s.approved === true)
    .reduce((acc, s) => {
      const cat = categories.find((c) => c.challenges.some((ch) => ch.id === s.challengeId));
      const ch = cat?.challenges.find((c) => c.id === s.challengeId);
      return acc + (ch?.points || 0);
    }, 0);

  const approvedCount = submissions.filter((s) => s.approved === true).length;
  const totalChallenges = categories.reduce((a, c) => a + c.challenges.length, 0);

  function latestFor(challengeId) {
    const list = submissions.filter((s) => s.challengeId === challengeId);
    if (!list.length) return null;
    return list.reduce((latest, s) =>
      !latest || new Date(s.createdAt) > new Date(latest.createdAt) ? s : latest, null
    );
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
      await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const playerName = localStorage.getItem("dc_username") || "Player";
            await submitScavengerPhoto({ challengeId, imageData: reader.result, playerName });
            const s = await getScavengerState();
            setState(s);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } catch (err) {
      setError(err.message || "Failed to submit photo");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleCancel(submissionId) {
    setCancellingId(submissionId);
    setError("");
    try {
      const { state: newState } = await cancelScavengerSubmission({ submissionId });
      setState(newState);
    } catch (err) {
      setError(err.message || "Failed to cancel upload");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="sh-player">
      <div className="sh-player__stats">
        <div className="sh-stat">
          <span className="sh-stat__value">{totalPts}</span>
          <span className="sh-stat__label">Points earned</span>
        </div>
        <div className="sh-stat">
          <span className="sh-stat__value">{approvedCount} / {totalChallenges}</span>
          <span className="sh-stat__label">Challenges approved</span>
        </div>
        <div className="sh-stat">
          <span className="sh-stat__value">{submissions.filter(s => s.approved === null).length}</span>
          <span className="sh-stat__label">Pending review</span>
        </div>
      </div>

      {error && <p className="sh-player__error">{error}</p>}

      {categories.length === 0 && !error && (
        <div className="sh-player__loading">Loading challenges…</div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} className="sh-category">
          <div className="sh-category__header">
            <h3 className="sh-category__name">{cat.name}</h3>
            <p className="sh-category__desc">{cat.description}</p>
          </div>

          <ul className="sh-challenges">
            {cat.challenges.map((ch) => {
              const latest = latestFor(ch.id);
              const badge = latest ? STATUS_LABEL[latest.approved] : null;
              const isUploading = uploadingId === ch.id;
              const isCancelling = cancellingId === latest?.id;

              return (
                <li key={ch.id} className={`sh-challenge ${latest ? "sh-challenge--submitted" : ""}${latest?.approved === true ? " sh-challenge--approved" : ""}${latest?.approved === false ? " sh-challenge--denied" : ""}`}>
                  <div className="sh-challenge__top">
                    <span className="sh-challenge__title">{ch.title}</span>
                    <span className="sh-challenge__pts">{ch.points} pts</span>
                  </div>
                  <p className="sh-challenge__desc">{ch.description}</p>

                  <div className="sh-challenge__footer">
                    {badge && (
                      <span className={`sh-badge ${badge.cls}`}>{badge.text}</span>
                    )}
                    {latest?.comment && (
                      <span className="sh-challenge__comment">💬 {latest.comment}</span>
                    )}

                    <div className="sh-challenge__actions">
                      <label className={`sh-upload-btn ${isUploading ? "sh-upload-btn--loading" : ""}`}>
                        {isUploading ? "Uploading…" : latest ? "Re-upload" : "Upload photo"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) handleUpload(ch.id, file);
                          }}
                        />
                      </label>

                      {latest && latest.approved === null && (
                        <button
                          type="button"
                          className="sh-cancel-btn"
                          disabled={isCancelling}
                          onClick={() => handleCancel(latest.id)}
                        >
                          {isCancelling ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
