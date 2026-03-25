const express = require('express');

function createScavengerState() {
  return {
    teamName: '',
    totalPoints: 0,
    completedChallengeIds: [],
    submissions: [],
  };
}

/**
 * @param {object} options
 * @param {object} options.scavengerChallenges - Same shape as scavengerChallenges.json
 * @param {ReturnType<typeof createScavengerState>} options.scavengerState - Mutable in-memory state
 */
function createScavengerRouter({ scavengerChallenges, scavengerState }) {
  const router = express.Router();

  router.get('/api/scavenger/challenges', (req, res) => {
    res.json(scavengerChallenges);
  });

  router.get('/api/scavenger/state', (req, res) => {
    const { teamName, totalPoints, completedChallengeIds, submissions } = scavengerState;

    const categories = scavengerChallenges.categories || [];
    const categoryStats = categories.map((cat) => {
      const total = cat.challenges.length;
      const completed = cat.challenges.filter((c) =>
        completedChallengeIds.includes(c.id)
      ).length;
      return {
        id: cat.id,
        name: cat.name,
        totalChallenges: total,
        completedChallenges: completed,
      };
    });

    res.json({
      teamName,
      totalPoints,
      challengesCompleted: completedChallengeIds.length,
      categoryStats,
      submissions,
    });
  });

  router.post('/api/scavenger/team', (req, res) => {
    const { teamName } = req.body;
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ error: 'Team name is required.' });
    }
    scavengerState.teamName = teamName.trim();
    return res.json({ teamName: scavengerState.teamName });
  });

  router.post('/api/scavenger/submit', (req, res) => {
    const { challengeId, imageData, playerName } = req.body;

    if (!challengeId || !imageData) {
      return res.status(400).json({ error: 'challengeId and imageData are required.' });
    }

    if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed.' });
    }

    const categories = scavengerChallenges.categories || [];
    const category = categories.find((cat) =>
      cat.challenges.some((c) => c.id === challengeId)
    );
    if (!category) {
      return res.status(400).json({ error: 'Unknown challengeId.' });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const submission = {
      id,
      challengeId,
      imageData,
      playerName: (playerName || 'Player').trim(),
      approved: null,
      comment: '',
      createdAt: new Date().toISOString(),
    };

    scavengerState.submissions.push(submission);

    return res.status(201).json({ submission });
  });

  router.post('/api/scavenger/review', (req, res) => {
    const { submissionId, approved, comment } = req.body;

    if (!submissionId || typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'submissionId and approved (boolean) are required.' });
    }

    const submission = scavengerState.submissions.find((s) => s.id === submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    submission.approved = approved;
    submission.comment = (comment || '').trim();

    if (approved && !scavengerState.completedChallengeIds.includes(submission.challengeId)) {
      scavengerState.completedChallengeIds.push(submission.challengeId);

      const cats = scavengerChallenges.categories || [];
      const cat = cats.find((c) =>
        c.challenges.some((ch) => ch.id === submission.challengeId)
      );
      const challenge = cat
        ? cat.challenges.find((ch) => ch.id === submission.challengeId)
        : null;

      if (challenge && typeof challenge.points === 'number') {
        scavengerState.totalPoints += challenge.points;
      }
    }

    return res.json({
      submission,
      state: scavengerState,
    });
  });

  router.post('/api/scavenger/cancel', (req, res) => {
    const { submissionId } = req.body;

    if (!submissionId) {
      return res.status(400).json({ error: 'submissionId is required.' });
    }

    const index = scavengerState.submissions.findIndex((s) => s.id === submissionId);
    if (index === -1) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    const submission = scavengerState.submissions[index];
    if (submission.approved !== null) {
      return res
        .status(400)
        .json({ error: 'Cannot cancel a submission after it has been reviewed.' });
    }

    scavengerState.submissions.splice(index, 1);

    return res.json({ state: scavengerState });
  });

  return router;
}

module.exports = {
  createScavengerRouter,
  createScavengerState,
};
