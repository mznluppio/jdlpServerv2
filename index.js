const httpServer = require("http").createServer();
const Redis = require("ioredis");

const redisClient = new Redis("redis://red-cmi3nifqd2ns7380j710:6379");
const Room = require('./room');

const io = require("socket.io")(httpServer, {
  cors: {
    origin: "*",
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const { RedisMessageStore } = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

const { RedisRoomStore } = require("./ roomStore.js");
const { userInfo } = require("os");
const sanitize = require("validator");
const roomStore = new RedisRoomStore(redisClient);

const EVENTS = {
  CREATE_ROOM: "create room",
  JOIN_ROOM: "join room",
  RESPONSE_CREATE_ROOM: "response create room",
  RESPONSE_JOIN_ROOM: "response join room",
  NEW_PLAYER: "new player",
  GET_ROOM_DATA: "get room data",
  RESPONSE_GET_ROOM_DATA: "response get room data",
  ERROR: "error",

};

io.use(async (socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      return next();
    }
  }
  const username = socket.handshake.auth.username;
  const id = socket.handshake.auth.id
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.sessionID = randomId();
  socket.userID = id;
  socket.username = username;
  next();
});

io.on("connection", async (socket) => {

  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
    username: socket.username
  });


  socket.on(EVENTS.CREATE_ROOM, async (createdBy) => {
    const room = new Room(createdBy);
    roomStore.saveRoom(room.name, room);
    socket.join(room.name);
    socket.emit(EVENTS.RESPONSE_CREATE_ROOM, room);
    io.to(room.name).emit(EVENTS.NEW_PLAYER, room);
  });

  socket.on('join room', async (data) => {
    const { roomName, player } = data;
    const room = await roomStore.findRoom(roomName);

    if (!room) {
      socket.emit("unable to join", "La room n'existe pas.");
      return;
    }

    if (room._started) {
      socket.emit("unable to join", "La room a déjà démarré.");
      return;
    }

    room._players.push(player);
    roomStore.saveRoom(roomName, room);

    socket.join(roomName);
    socket.emit(EVENTS.RESPONSE_JOIN_ROOM, room);
    io.to(roomName).emit("new player", room);
  });


  socket.on(EVENTS.GET_ROOM_DATA, async (roomName) => {
    const room = await roomStore.findRoom(roomName);
    if (room) {
      socket.emit(EVENTS.RESPONSE_GET_ROOM_DATA, room);
    } else {
      console.log("Room not found");
    }
  });

  socket.on("start room", async (data) => {
    const { roomData, player } = data;
    let room = await roomStore.findRoom(roomData._name);

    if (room && !room._started) {
      room._started = true;
      roomStore.saveRoom(roomData._name, room);
      io.to(roomData._name).emit("game start", player);
    } else {
      socket.emit("unable to start", "La room a déjà démarré ou n'existe pas.");
    }
  })

  socket.on("send song", async (data) => {
    const { songs, roomData } = data;
    let room = await roomStore.findRoom(roomData._name);
    if (room) {
      room._songs.push(songs);
      roomStore.saveRoom(roomData._name, room);
      socket.emit("response send song");
      //MODIFIER LA LOGIQUE. IL FAUT VERIFIER SI AU MOINS TOUS LES JOUEURS ONT CHOISIS AU MOINS UN SON
      if (room._songs.length === room._players.length) {
        io.to(roomData._name).emit("all player send song", await roomStore.findRoom(roomData._name));
      }
    }
  })

  socket.on("want next song", async (data) => {
    const { player, roomData } = data;
    let room = await roomStore.findRoom(roomData._name);
    if (room) {
      io.to(roomData._name).emit("next song", player);
    }
  })

  socket.on("want reveal player", async (data) => {
    const { player, roomData } = data;
    let room = await roomStore.findRoom(roomData._name);
    if (room) {
      io.to(roomData._name).emit("reveal player", player);
    }
  })

  socket.on("quit room", async (roomData) => {
    socket.leave(roomData._name)
    socket.emit("response quit room");
  });

  socket.on("disconnecting", async () => {
    let roomsArray = Array.from(socket.rooms);
    let roomName = roomsArray[1];

    if (roomName !== undefined) {
      socket.leave(roomName);

      let room = await roomStore.findRoom(roomName);

      if (room) {
        room._players = room._players.filter(player => player.userID !== socket.userID);

        roomStore.saveRoom(roomName, room);

        io.to(roomName).emit('player disconnected', { room: room, player: socket.username });
        if (room._players.length === 1) {
          io.to(roomName).emit("quit")
        }
      }
    }
  });


  socket.on("disconnect", async () => {
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;
    if (isDisconnected) {
      // notify other users
      socket.broadcast.emit("user disconnected", socket.userID);
      // update the connection status of the session
      sessionStore.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
      });
    }
  });

});

setupWorker(io);
