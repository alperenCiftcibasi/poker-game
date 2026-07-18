const { Sequelize } = require('sequelize');
const path = require('path');

// Veritabanı seçimi:
//  - DATABASE_URL tanımlıysa (ör. Supabase Postgres) yönetilen Postgres kullanılır.
//    Render gibi efemer diskli host'larda veri kalıcılığı için gerekli.
//  - Tanımlı değilse yerel SQLite dosyasına düşülür (LAN/geliştirme, sıfır-config).
const DATABASE_URL = process.env.DATABASE_URL;
const DB_KIND = DATABASE_URL ? 'Postgres' : 'SQLite';

const sequelize = DATABASE_URL
    ? new Sequelize(DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        // Supabase (ve çoğu yönetilen Postgres) SSL ister.
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
    })
    : new Sequelize({
        dialect: 'sqlite',
        storage: path.join(__dirname, '../poker-database.sqlite'),
        logging: false // Terminali kalabalıklaştırmaması için logları kapattık
    });

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log(`✅ ${DB_KIND} Veritabanı Bağlantısı Başarılı!`);

        // B14: Şema mutasyonu (alter) yalnızca development'ta. Production'da alter
        // riskli olabileceğinden sadece eksik tabloları oluşturan düz sync kullanılır.
        if (process.env.NODE_ENV === 'production') {
            await sequelize.sync();
        } else {
            await sequelize.sync({ alter: true });
        }
        console.log('✅ Veritabanı tabloları hazır!');

        // Şema koruması: `avatar` sütunu eski kurulumlarda olmayabilir. Production'da
        // plain sync() var olan tabloya sütun EKLEMEZ; dev'de alter:true ekler ama bu
        // guard her iki ortamda da idempotenttir. Diyalektten bağımsız çalışır.
        try {
            const qi = sequelize.getQueryInterface();
            const table = await qi.describeTable('Users');
            if (!table.avatar) {
                await qi.addColumn('Users', 'avatar', {
                    type: Sequelize.DataTypes.TEXT,
                    allowNull: true
                });
                console.log('🛠️  Users.avatar sütunu eklendi.');
            }
        } catch (e) {
            console.warn('⚠️  avatar sütunu kontrolü atlandı:', e.message);
        }

        // NOT: Eskiden burada her boot'ta `UPDATE Users SET isApproved = 1 ...`
        // çalışıyordu; bu admin onay sistemini deldiği için kaldırıldı (B14).
    } catch (error) {
        console.error('❌ Veritabanı Bağlantı Hatası:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };