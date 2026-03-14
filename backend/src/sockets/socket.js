const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerGameHandlers } = require('./handlers/gameHandlers');
const { registerModerationHandlers } = require('./handlers/moderationHandlers');

module.exports = function(io) {
  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerModerationHandlers(io, socket);
  });
};
