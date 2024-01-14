const { v4 } = require('uuid');

class Room {
    constructor(createdBy) {
        this._name = Math.random().toString(36).substring(7);
        this._id = v4();
        this._createdBy = createdBy;
        this._players = [createdBy];
        this._songs = [];
        this._started = false;
    }

    // Getter for name
    get name() {
        return this._name;
    }

    // Getter for id
    get id() {
        return this._id;
    }

    // Getter for createdBy
    get createdBy() {
        return this._createdBy;
    }

    // Setter for createdBy
    set createdBy(player) {
        this._createdBy = player;
    }

    // Add Player
    addPlayer(player) {
        this._players.push(player);
    }
    removePlayer(player) {
        const index = this._players.indexOf(player);
        if (index !== -1) {
            this._players.splice(index, 1);
        }
    }
    // Getter for players 
    get players() {
        return this._players;
    }

}
module.exports = Room;
