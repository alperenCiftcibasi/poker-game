// ⚠️ GELİŞTİRME SCRIPTİ — DİKKAT: ilk kullanıcının şifresini "admin123" yapar!
// Sadece yerel geliştirmede, kilitlenen admin hesabını kurtarmak için elle çalıştırın:
//   node scripts/check-users.js
// Production'da ASLA çalıştırmayın.

const User = require('../models/User');
const { connectDB } = require('../config/db');
const bcrypt = require('bcrypt');

(async () => {
    await connectDB();
    const users = await User.findAll();
    console.log('=== MEVCUT KULLANICILAR ===');
    users.forEach(u => {
        console.log(`ID: ${u.id} | Username: ${u.username} | Admin: ${u.isAdmin} | Onaylı: ${u.isApproved}`);
    });

    if (users.length === 0) {
        console.log('Veritabanında kullanıcı yok.');
    } else {
        console.log('\n=== İLK KULLANICIYI ADMİN VE ONAYLANMIŞ YAP ===');
        const firstUser = users[0];
        firstUser.isAdmin = true;
        firstUser.isApproved = true;

        // Şifreyi admin123 olarak ayarla
        const salt = await bcrypt.genSalt(10);
        firstUser.password = await bcrypt.hash('admin123', salt);

        await firstUser.save();
        console.log(`✅ ${firstUser.username} admin ve onaylı yapıldı! Şifre: admin123`);
    }

    process.exit(0);
})();
