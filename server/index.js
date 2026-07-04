// Same Sky — signaling server
// Purely relays WebRTC handshake messages (offer/answer/ICE candidates) and
// small app messages (frame picks, countdown sync) between exactly two
// sockets in the same "room" (the room code the couple shares). No video
// or camera data ever touches this server — that goes directly between the
// two browsers once WebRTC is connected.

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.get("/", (_req, res) => {
  res.send("Same Sky signaling server is running.");
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: [...rooms.keys()] });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 4000;

// room -> Set of socket ids
const rooms = new Map();

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

io.on("connection", (socket) => {
  log("socket connected", socket.id);

  socket.on("join", (room) => {
    if (!room || typeof room !== "string") return;
    const existing = rooms.get(room) || new Set();

    if (existing.size >= 2) {
      log(`room "${room}" is full, rejecting`, socket.id);
      socket.emit("room-full");
      return;
    }

    existing.add(socket.id);
    rooms.set(room, existing);
    socket.join(room);
    socket.data.room = room;

    const role = existing.size === 1 ? "host" : "guest";
    log(`socket ${socket.id} joined room "${room}" as ${role} (size=${existing.size})`);
    socket.emit("role", role);

    if (role === "guest") {
      socket.to(room).emit("peer-joined");
    }
  });

  socket.on("signal", (data) => {
    const room = socket.data.room;
    if (!room) return;
    log(`relaying signal type="${data?.type}" in room "${room}" from ${socket.id}`);
    socket.to(room).emit("signal", data);
  });

  socket.on("app-message", (data) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit("app-message", data);
  });

  socket.on("disconnect", (reason) => {
    const room = socket.data.room;
    log("socket disconnected", socket.id, reason);
    if (room && rooms.has(room)) {
      const set = rooms.get(room);
      set.delete(socket.id);
      if (set.size === 0) {
        rooms.delete(room);
        log(`room "${room}" is now empty, removed`);
      } else {
        socket.to(room).emit("peer-left");
      }
    }
  });
});

server.listen(PORT, () => {
  log(`Same Sky signaling server listening on port ${PORT}`);
});
