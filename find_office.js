// Consultar officeId de la sucursal Valdivia en Bsale
// Se ejecuta contra la API de producción via Vercel

async function getOffices() {
  try {
    const res = await fetch('https://gestor-facturas-beta.vercel.app/api/test-bsale?docId=1');
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

getOffices();
