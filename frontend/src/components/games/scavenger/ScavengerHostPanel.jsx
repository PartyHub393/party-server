import React, { useEffect, useState } from 'react';
import {
  getScavengerChallenges,
  getScavengerState,
  reviewScavengerSubmission,
} from '../../../api';
import './ScavengerHostPanel.css';

export default function ScavengerHostPanel() {
  const [challenges, setChallenges] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const [cd, sd] = await Promise.all([getScavengerChallenges(), getScavengerState()]);
        setChallenges(cd);
        setState(sd);
      } catch (err) {
        setError(err.message || 'Failed to load scavenger data');
      }
    }
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const sd = await getScavengerState();
        if (!cancelled) setState(sd);
      } catch {}
    }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function getChallengeTitle(challengeId) {
    if (!challenges?.categories) return challengeId;
    for (const cat of challenges.categories) {
      const ch = cat.challenges.find((c) => c.id === challengeId);
      if (ch) return ch.title;
    }
    return challengeId;
  }

  async function handleReview(submissionId, approved) {
    const comment = commentDrafts[submissionId] ?? '';
    setReviewingId(submissionId);
    setError('');
    try {
      const { state: newState } = await reviewScavengerSubmission({ submissionId, approved, comment });
      setState(newState);
      setEditingId(null);
      setCommentDrafts((prev) => { const n = { ...prev }; delete n[submissionId]; return n; });
    } catch (err) {
      setError(err.message || 'Failed to review submission');
    } finally {
      setReviewingId(null);
    }
  }

  const submissions = state?.submissions || [];
  const pending = submissions.filter((s) => s.approved === null);
  const reviewed = submissions.filter((s) => s.approved !== null);
  const totalPoints = state?.totalPoints ?? 0;
  const totalApproved = submissions.filter((s) => s.approved === true).length;

  return (
    <div className="sh-host-panel">
      <div className="sh-host-panel__stats">
        <div className="sh-host-stat">
          <span className="sh-host-stat__val">{pending.length}</span>
          <span className="sh-host-stat__lbl">Pending</span>
        </div>
        <div className="sh-host-stat">
          <span className="sh-host-stat__val">{totalApproved}</span>
          <span className="sh-host-stat__lbl">Approved</span>
        </div>
        <div className="sh-host-stat">
          <span className="sh-host-stat__val">{totalPoints}</span>
          <span className="sh-host-stat__lbl">Total pts</span>
        </div>
      </div>

      {error && <p className="sh-host-panel__error">{error}</p>}

      {submissions.length === 0 && (
        <p className="sh-host-panel__empty">No photo submissions yet. Waiting for players…</p>
      )}

      {pending.length > 0 && (
        <div className="sh-host-section">
          <h4 className="sh-host-section__title">Needs Review ({pending.length})</h4>
          <div className="sh-host-grid">
            {pending.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                title={getChallengeTitle(sub.challengeId)}
                isEditing={true}
                isReviewing={reviewingId === sub.id}
                commentDraft={commentDrafts[sub.id] ?? ''}
                onCommentChange={(v) => setCommentDrafts((p) => ({ ...p, [sub.id]: v }))}
                onApprove={() => handleReview(sub.id, true)}
                onDeny={() => handleReview(sub.id, false)}
                onEditToggle={null}
              />
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="sh-host-section">
          <h4 className="sh-host-section__title">Reviewed ({reviewed.length})</h4>
          <div className="sh-host-grid">
            {reviewed.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                title={getChallengeTitle(sub.challengeId)}
                isEditing={editingId === sub.id}
                isReviewing={reviewingId === sub.id}
                commentDraft={commentDrafts[sub.id] ?? sub.comment ?? ''}
                onCommentChange={(v) => setCommentDrafts((p) => ({ ...p, [sub.id]: v }))}
                onApprove={() => handleReview(sub.id, true)}
                onDeny={() => handleReview(sub.id, false)}
                onEditToggle={() => setEditingId((prev) => (prev === sub.id ? null : sub.id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ sub, title, isEditing, isReviewing, commentDraft, onCommentChange, onApprove, onDeny, onEditToggle }) {
  const statusCls = sub.approved === true ? 'sh-card--approved' : sub.approved === false ? 'sh-card--denied' : '';

  return (
    <div className={`sh-card ${statusCls}`}>
      <div className="sh-card__meta">
        <span className="sh-card__title">{title}</span>
        <span className="sh-card__uploader">by {sub.playerName || 'Player'}</span>
      </div>

      <img className="sh-card__img" src={sub.imageData} alt={title} />

      {sub.approved !== null && !isEditing && (
        <span className={`sh-card__badge ${sub.approved ? 'sh-card__badge--approved' : 'sh-card__badge--denied'}`}>
          {sub.approved ? 'Approved ✓' : 'Denied ✗'}
        </span>
      )}
      {sub.comment && !isEditing && (
        <p className="sh-card__comment">💬 {sub.comment}</p>
      )}

      {isEditing && (
        <textarea
          className="sh-card__comment-input"
          placeholder="Optional comment to player…"
          value={commentDraft}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={2}
        />
      )}

      <div className="sh-card__actions">
        {isEditing ? (
          <>
            <button
              type="button"
              className="sh-card__btn sh-card__btn--approve"
              onClick={onApprove}
              disabled={isReviewing}
            >
              {isReviewing ? '…' : 'Approve'}
            </button>
            <button
              type="button"
              className="sh-card__btn sh-card__btn--deny"
              onClick={onDeny}
              disabled={isReviewing}
            >
              {isReviewing ? '…' : 'Deny'}
            </button>
          </>
        ) : onEditToggle ? (
          <button type="button" className="sh-card__btn sh-card__btn--edit" onClick={onEditToggle}>
            Edit review
          </button>
        ) : null}
      </div>
    </div>
  );
}
