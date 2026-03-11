const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Table = sequelize.define('Table', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    maxPlayers: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 6 // Örneğin: 2, 6 veya 9 kişilik
    },
    smallBlind: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    bigBlind: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    minBuyIn: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    maxBuyIn: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'waiting' // waiting (bekliyor), playing (oynanıyor)
    }
}, {
    timestamps: true
});

module.exports = Table;