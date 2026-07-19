const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    chips: {
        type: DataTypes.INTEGER,
        defaultValue: 3000 // İlk kayıtta 3000 çip verilir
    },
    tournamentChips: {
        // Normal çipten bağımsız ikinci para birimi: yalnızca turnuva masalarında oynanır.
        // Kayıtta 0 başlar; yalnızca admin ekler/çıkarır. Gece cron'u bu alana DOKUNMAZ.
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false // Varsayılan olarak admin değil
    },
    isApproved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false // Varsayılan olarak onaysız (admin onayı bekler)
    },
    avatar: {
        // Profil fotoğrafı: istemcide küçültülüp sıkıştırılmış base64 data URL
        // (ör. "data:image/jpeg;base64,...."). Yoksa null → baş harf avatarı gösterilir.
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    }
}, {
    timestamps: true
});

module.exports = User;