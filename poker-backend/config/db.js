const { Sequelize } = require('sequelize');
const path = require('path');

// SQLite veritabanını projenin kök dizininde oluşturuyoruz
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../poker-database.sqlite'), 
    logging: false // Terminali kalabalıklaştırmaması için logları kapattık
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ SQLite Veritabanı Bağlantısı Başarılı!');
        
        // Modelleri veritabanıyla senkronize et (Tabloları oluştur/güncelle)
        await sequelize.sync({ alter: true }); // alter: true - Mevcut tabloları günceller
        console.log('✅ Veritabanı tabloları güncellendi!');
        
        // Mevcut kullanıcılar için isApproved değerini güncelle (NULL olanları true yap)
        await sequelize.query(`UPDATE Users SET isApproved = 1 WHERE isApproved IS NULL`);
        console.log('✅ Mevcut kullanıcılar için isApproved güncellendi!');
    } catch (error) {
        console.error('❌ Veritabanı Bağlantı Hatası:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };