import React from 'react';

// Oval çuha. Merkezde pot + topluluk kartları (children), etrafında koltuklar (children).
function TableFelt({ children }) {
  return (
    <div className="pk-felt">
      <div className="pk-felt-inner" />
      {children}
    </div>
  );
}

export default TableFelt;
