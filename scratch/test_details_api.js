const fetch = require('node-fetch');

async function testApi() {
  const busId = '001'; // From screenshot, there's a bus 001. Wait, IDs are usually UUIDs or numbers.
  // I'll fetch all buses first to get a valid ID.
  try {
    const res = await fetch('http://localhost:5500/api/buses');
    const buses = await res.json();
    if (buses.length > 0) {
      const id = buses[0].id;
      console.log(`Testing details for bus ${id}...`);
      const detailRes = await fetch(`http://localhost:5500/api/buses/${id}/details`);
      const details = await detailRes.json();
      console.log('Response:', JSON.stringify(details, null, 2));
    } else {
      console.log('No buses found');
    }
  } catch (e) {
    console.error('Test failed:', e);
  }
}

testApi();
