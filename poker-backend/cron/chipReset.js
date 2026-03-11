const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');

const startCronJobs = () => {
    // '0 0 * * *' -> Her gece saat 00:00'da çalışır
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ Gece 00:00 - Çip kontrolü ve yenileme işlemi başlatılıyor...');
        try {
            const [updatedRows] = await User.update(
                { chips: 3000 },
                { 
                    where: { 
                        chips: { [Op.lt]: 3000 } // Sadece çipi 3000'den az olanlar
                    } 
                }
            );
            console.log(`✅ Çip yenileme tamamlandı. Çipi 3000'e tamamlanan oyuncu sayısı: ${updatedRows}`);
        } catch (error) {
            console.error('❌ Çip yenileme sırasında hata oluştu:', error);
        }
    });
};

module.exports = startCronJobs;