/* abstract */ class RoomStore {
    findRoom(roomName) { }
    saveRoom(roomName, roomData) { }
    findAllRooms() { }
}

class InMemoryRoomStore extends RoomStore {
    constructor() {
        super();
        this.rooms = new Map();
    }



    findRoom(roomName) {
        return this.rooms.get(roomName);
    }

    saveRoom(roomName, roomData) {
        this.rooms.set(roomName, roomData);
    }

    findAllRooms() {
        return [...this.rooms.values()];
    }
}

class RedisRoomStore extends RoomStore {
    constructor(redisClient) {
        super();
        this.redisClient = redisClient;
    }

    findRoom(roomName) {
        return this.redisClient.get(`room:${roomName}`).then((roomData) => {
            return roomData ? JSON.parse(roomData) : null;
        });
    }

    saveRoom(roomName, roomData) {
        this.redisClient.set(`room:${roomName}`, JSON.stringify(roomData));
    }

    async findAllRooms() {
        const keys = await this.redisClient.keys("room:*");
        const roomDataPromises = keys.map((key) =>
            this.redisClient.get(key).then((roomData) => JSON.parse(roomData))
        );
        return Promise.all(roomDataPromises);
    }
}

module.exports = {
    InMemoryRoomStore,
    RedisRoomStore,
};
