const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // İstek başlığından (header) token'ı alıyoruz
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ message: 'Erişim reddedildi. Giriş yapmalısınız.' });
    }

    try {
        // Genelde token "Bearer <token>" formatında gelir, sadece token kısmını alıyoruz
        const tokenWithoutBearer = token.split(' ')[1] || token;
        
        // Şifreyi kendi gizli anahtarımızla çözüyoruz
        const verified = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);
        req.user = verified; // Çözülen kullanıcı bilgilerini isteğin içine koyuyoruz
        
        next(); // Güvenlikten geçti, işleme devam et
    } catch (error) {
        res.status(400).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    }
};

module.exports = verifyToken;