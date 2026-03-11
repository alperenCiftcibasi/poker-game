const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyAdmin = async (req, res, next) => {
    // Önce token kontrolü
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ message: 'Erişim reddedildi. Giriş yapmalısınız.' });
    }

    try {
        // Token'ı çöz
        const tokenWithoutBearer = token.split(' ')[1] || token;
        const verified = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);
        
        // Kullanıcıyı veritabanından kontrol et
        const user = await User.findByPk(verified.id);
        
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        
        // Admin yetkisi kontrolü
        if (!user.isAdmin) {
            return res.status(403).json({ message: 'Bu işlem için admin yetkisi gereklidir.' });
        }
        
        req.user = verified;
        req.adminUser = user;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    }
};

module.exports = verifyAdmin;
