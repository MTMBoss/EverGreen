const { WebSocketServer } = require("ws");

const rooms = new Map();
const ROOM_BROADCAST_MESSAGES = [
  "whiteboard",
  "whiteboard-clear",
  "stage-image",
  "stage-rotate",
  "stage-clear",
];

function attachVoiceSignalingServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/voice",
  });

  wss.on("connection", socket => {
    let currentRoomId = "";
    let currentPeerId = "";

    socket.on("message", raw => {
      let message;

      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message.type === "join") {
        const nextRoomId = normalizeRoomId(message.roomId);
        const nextPeerId = normalizePeerId(message.peerId || message.from);
        if (!nextRoomId || !nextPeerId) return;

        if (
          currentRoomId &&
          (currentRoomId !== nextRoomId || currentPeerId !== nextPeerId)
        ) {
          leaveCurrentRoom();
        }

        currentRoomId = nextRoomId;
        currentPeerId = nextPeerId;

        const room = getRoom(currentRoomId);
        const existingPeer = room.get(currentPeerId);
        const participant = {
          socket,
          peerId: currentPeerId,
          name: String(message.name || "Player").slice(0, 40),
          leader: Boolean(message.leader),
        };

        const peers = [...room.values()]
          .filter(peer => peer.socket !== socket && peer.peerId !== currentPeerId)
          .map(formatPeer);
        room.set(currentPeerId, participant);

        if (existingPeer && existingPeer.socket !== socket) {
          existingPeer.socket.close(4000, "Duplicate peer id");
        }

        send(socket, {
          type: "peers",
          roomId: currentRoomId,
          peers,
        });

        broadcast(currentRoomId, currentPeerId, {
          type: "peer-joined",
          roomId: currentRoomId,
          peerId: participant.peerId,
          name: participant.name,
          leader: participant.leader,
        });
        return;
      }

      if (message.type === "leave") {
        leaveCurrentRoom();
        return;
      }

      if (!currentRoomId || !currentPeerId) return;

      if (["offer", "answer", "ice"].includes(message.type)) {
        routeToPeer(currentRoomId, currentPeerId, message);
        return;
      }

      if (ROOM_BROADCAST_MESSAGES.includes(message.type)) {
        if (message.to) {
          routeToPeer(currentRoomId, currentPeerId, message);
          return;
        }

        broadcast(currentRoomId, currentPeerId, {
          ...message,
          roomId: currentRoomId,
          from: currentPeerId,
        });
      }
    });

    socket.on("close", leaveCurrentRoom);
    socket.on("error", leaveCurrentRoom);

    function leaveCurrentRoom() {
      if (!currentRoomId || !currentPeerId) return;

      const room = rooms.get(currentRoomId);
      const participant = room?.get(currentPeerId);
      if (participant?.socket !== socket) {
        currentRoomId = "";
        currentPeerId = "";
        return;
      }

      room?.delete(currentPeerId);
      if (room && room.size === 0) {
        rooms.delete(currentRoomId);
      }

      broadcast(currentRoomId, currentPeerId, {
        type: "peer-left",
        roomId: currentRoomId,
        peerId: currentPeerId,
      });

      currentRoomId = "";
      currentPeerId = "";
    }
  });

  console.log("✅ WebSocket vocale pronto su /voice");
}

function normalizeRoomId(roomId) {
  return String(roomId || "")
    .trim()
    .slice(0, 80);
}

function normalizePeerId(peerId) {
  return String(peerId || "")
    .trim()
    .slice(0, 100);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function formatPeer(peer) {
  return {
    peerId: peer.peerId,
    name: peer.name,
    leader: peer.leader,
  };
}

function routeToPeer(roomId, fromPeerId, message) {
  const targetPeerId = normalizePeerId(message.to);
  if (!targetPeerId) return;

  const room = rooms.get(roomId);
  const target = room?.get(targetPeerId);
  const sender = room?.get(fromPeerId);
  if (!target) return;

  send(target.socket, {
    ...message,
    roomId,
    from: fromPeerId,
    name: sender?.name || "Player",
    leader: Boolean(sender?.leader),
  });
}

function broadcast(roomId, fromPeerId, message) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.forEach(peer => {
    if (peer.peerId === fromPeerId) return;
    send(peer.socket, message);
  });
}

function send(socket, message) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

module.exports = {
  attachVoiceSignalingServer,
};
