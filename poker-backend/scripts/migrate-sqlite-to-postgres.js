// 🔄 SQLite -> Postgres (Supabase) tek seferlik, KAYIPSIZ veri taşıma script'i.
//
// Kaynak SQLite dosyasına DOKUNULMAZ (yalnızca okunur). Hesap ve çip verisi
// (Users, Tables) hedef Postgres'e ID'ler ve zaman damgaları korunarak yazılır.
//
// Kullanım (poker-backend klasöründe):
//   1) Kaynak dosyayı önce YEDEKLEYİN (kopyasını ayrı bir yere alın).
//   2) Kimse oynamıyorken (yazma yokken) çalıştırın.
//   3) Hedef Postgres bağlantısını ve gerekiyorsa kaynak yolu env ile verin:
//        DATABASE_URL="postgresql://...supabase.com:5432/postgres" node scripts/migrate-sqlite-to-postgres.js
//      (Kaynak yol varsayılan: ../poker-database.sqlite; SQLITE_PATH ile değiştirilebilir.)
//   4) Bitince Supabase Table editor'da satır sayıları + birkaç kullanıcının
//      chips/isAdmin/isApproved değerlerini SQLite ile karşılaştırıp DOĞRULAYIN.
//
// Not: Hedefe TEKRAR çalıştırmadan önce tabloları temizleyin (aksi halde ID
// çakışması olur). İlk taşımada hedef boş olmalıdır.

require('dotenv').config();
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL tanımlı değil. Hedef Supabase/Postgres bağlantı dizesini verin.');
    process.exit(1);
}

const sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(__dirname, '../poker-database.sqlite');

// Şema tanımları — models/User.js ve models/Table.js ile birebir aynı olmalı.
function defineModels(sequelize) {
    const User = sequelize.define('User', {
        username: { type: DataTypes.STRING, allowNull: false, unique: true },
        password: { type: DataTypes.STRING, allowNull: false },
        chips: { type: DataTypes.INTEGER, defaultValue: 3000 },
        tournamentChips: { type: DataTypes.INTEGER, defaultValue: 0 },
        isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
        isApproved: { type: DataTypes.BOOLEAN, defaultValue: false },
    }, { timestamps: true });

    const Table = sequelize.define('Table', {
        name: { type: DataTypes.STRING, allowNull: false },
        maxPlayers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
        smallBlind: { type: DataTypes.INTEGER, allowNull: false },
        bigBlind: { type: DataTypes.INTEGER, allowNull: false },
        minBuyIn: { type: DataTypes.INTEGER, allowNull: false },
        maxBuyIn: { type: DataTypes.INTEGER, allowNull: false },
        status: { type: DataTypes.STRING, defaultValue: 'waiting' },
        type: { type: DataTypes.STRING, defaultValue: 'normal' },
    }, { timestamps: true });

    return { User, Table };
}

(async () => {
    const source = new Sequelize({ dialect: 'sqlite', storage: sqlitePath, logging: false });
    const target = new Sequelize(DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    });

    const src = defineModels(source);
    const dst = defineModels(target);

    try {
        await source.authenticate();
        console.log(`✅ Kaynak SQLite açıldı: ${sqlitePath}`);
        await target.authenticate();
        console.log('✅ Hedef Postgres bağlantısı başarılı.');

        // Hedef şemayı kur (var olan tabloları bozmadan eksikleri oluşturur).
        await target.sync();

        // ID ve zaman damgalarını KORUYARAK taşı (silent: true -> updatedAt override edilmez).
        for (const name of ['User', 'Table']) {
            const rows = await src[name].findAll({ raw: true });
            if (rows.length === 0) {
                console.log(`ℹ️  ${name}: kaynakta 0 satır, atlanıyor.`);
                continue;
            }
            await dst[name].bulkCreate(rows, { silent: true });
            const count = await dst[name].count();
            console.log(`✅ ${name}: ${rows.length} satır okundu → hedef toplam: ${count}`);
        }

        // Postgres auto-increment sequence'ini en yüksek ID'ye ilerlet
        // (explicit ID yazıldığı için sonraki INSERT'lerde çakışmayı önler).
        for (const table of ['Users', 'Tables']) {
            await target
                .query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`)
                .catch(err => console.warn(`⚠️  ${table} sequence güncellenemedi (tablo boşsa önemsiz):`, err.message));
        }

        console.log('🎉 Taşıma tamamlandı. Supabase Table editor\'da satır sayılarını ve bakiyeleri DOĞRULAYIN.');
    } catch (err) {
        console.error('❌ Taşıma hatası:', err);
        process.exitCode = 1;
    } finally {
        await source.close();
        await target.close();
    }
})();
