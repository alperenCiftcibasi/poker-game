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

        // B14: Şema mutasyonu (alter) yalnızca development'ta. Production'da alter
        // riskli olabileceğinden sadece eksik tabloları oluşturan düz sync kullanılır.
        if (process.env.NODE_ENV === 'production') {
            await sequelize.sync();
        } else {
            await sequelize.sync({ alter: true });
        }
        console.log('✅ Veritabanı tabloları hazır!');

        // NOT: Eskiden burada her boot'ta `UPDATE Users SET isApproved = 1 ...`
        // çalışıyordu; bu admin onay sistemini deldiği için kaldırıldı (B14).
    } catch (error) {
        console.error('❌ Veritabanı Bağlantı Hatası:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };