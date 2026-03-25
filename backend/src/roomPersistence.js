const { normalizeAssignedGroup } = require('./roomAssignments');

async function resolveGroupByCode(pool, code) {
  const res = await pool.query(
    'SELECT id, created_by FROM groups WHERE code = $1',
    [code]
  );

  if (!res.rows.length) return null;

  return {
    groupId: res.rows[0].id,
    createdBy: res.rows[0].created_by,
  };
}

async function loadRoomSnapshot(pool, groupId) {
  const players = [];
  /** @type {Record<string, string | null>} */
  const assignedGroupsByUserId = {};
  /** @type {Record<string, number>} */
  const assignmentScores = {};

  const assignmentRes = await pool.query(
    `SELECT rag.name, rag.score, ram.user_id
     FROM room_assignment_groups rag
     LEFT JOIN room_assignment_members ram ON ram.assignment_group_id = rag.id
     WHERE rag.group_id = $1`,
    [groupId]
  );

  for (const row of assignmentRes.rows) {
    const assignmentName = normalizeAssignedGroup(row.name);
    if (!assignmentName) continue;
    assignmentScores[assignmentName] = Number(row.score) || 0;
    if (row.user_id) {
      assignedGroupsByUserId[row.user_id] = assignmentName;
    }
  }

  const membersRes = await pool.query(
    `SELECT u.id as user_id, u.username, gm.joined_at
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  for (const row of membersRes.rows) {
    players.push({
      id: row.user_id,
      userId: row.user_id,
      socketId: null,
      username: row.username || 'Player',
      joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
      online: false,
      assignedGroup: assignedGroupsByUserId[row.user_id] || null,
    });
  }

  return {
    players,
    assignmentScores,
  };
}

module.exports = {
  resolveGroupByCode,
  loadRoomSnapshot,
};
