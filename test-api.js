const http = require('http');

http.get('http://localhost:5500/api/buses', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const buses = JSON.parse(data);
    const bus1 = buses.find(b => b.number === '001');
    if (bus1) {
      http.get('http://localhost:5500/api/buses/' + bus1.id + '/details', (res2) => {
        let details = '';
        res2.on('data', chunk => details += chunk);
        res2.on('end', () => console.log('Details:', details));
      });
    } else {
      console.log('Bus 001 not found');
    }
  });
}).on('error', err => console.log('Error:', err.message));
