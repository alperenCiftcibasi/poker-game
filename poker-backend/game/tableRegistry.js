// Aktif masaların merkezi kaydı. server.js ve route'lar aynı Map'e erişir.
// Kimlik (identity) = user id; bir kullanıcı aynı anda yalnızca TEK masada oturabilir.

const activeTables = new Map();

// Verilen kullanıcının OTURDUĞU (izleyici değil) başka bir masayı bul.
// exceptTable: taranırken hariç tutulacak masa (genellikle oturulmak istenen masa).
function findSeatedTable(userId, exceptTable = null) {
    for (const table of activeTables.values()) {
        if (table === exceptTable) continue;
        if (table.players.some(p => p.id === userId)) return table;
    }
    return null;
}

module.exports = { activeTables, findSeatedTable };
