import { db } from '../lib/db';

async function listAll() {
  const allBuses = await db.query.buses.findMany({
    with: { route: true }
  });
  const allRoutes = await db.query.routes.findMany();
  
  console.log('--- BUSES ---');
  allBuses.forEach(b => {
    console.log(`ID: ${b.id}, Number: ${b.number}, Status: ${b.status}, Route: ${b.route?.name || 'None'}`);
  });
  
  console.log('\n--- ROUTES ---');
  allRoutes.forEach(r => {
    console.log(`ID: ${r.id}, Number: ${r.number}, Name: ${r.name}`);
  });
}

listAll().catch(console.error);
