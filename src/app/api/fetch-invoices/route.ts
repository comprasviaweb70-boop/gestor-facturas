import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  try {
    let dtes = [];
    
    if (!token || token === 'ejemplo_temporal') {
      console.log('Modo simulación Bsale para facturas');
      // Datos simulados
      dtes = [
        {
          id: 1,
          emissionDate: Math.floor(Date.now() / 1000) - 86400 * 2, // Hace 2 días
          folio: '1001',
          totalAmount: 150000,
          documentType: { name: 'Factura Electrónica' },
          client: { code: '81094100-6', company: 'COLUN' }
        },
        {
          id: 2,
          emissionDate: Math.floor(Date.now() / 1000) - 86400 * 5, // Hace 5 días
          folio: '1002',
          totalAmount: 250000,
          documentType: { name: 'Factura Electrónica' },
          client: { code: '76123456-7', company: 'Distribuidora Sur' }
        },
        {
          id: 3,
          emissionDate: Math.floor(Date.now() / 1000) - 86400 * 40, // Hace 40 días (fuera de rango)
          folio: '999',
          totalAmount: 50000,
          documentType: { name: 'Factura Electrónica' },
          client: { code: '81094100-6', company: 'COLUN' }
        }
      ];
    } else {
      // Consulta real a Bsale
      // Intentamos traer los últimos 50 DTEs
      const res = await fetch('https://api.bsale.cl/v1/dtes.json?limit=50', {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error en la API de Bsale: ${res.status}`);
      }
      
      const data = await res.json();
      dtes = data.items || [];
    }
    
    // Filtrar por Factura Electrónica y último mes
    const oneMonthAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const facturas = dtes.filter((dte: any) => {
      // Verificamos si es Factura Electrónica (en Bsale suele ser documentTypeId 33 o el nombre)
      const isFactura = dte.documentType?.name?.includes('Factura') || dte.documentTypeId === 33;
      const isRecent = dte.emissionDate >= oneMonthAgo;
      return isFactura && isRecent;
    });
    
    // Cruzar con Supabase para evitar duplicados
    const folios = facturas.map((f: any) => f.folio.toString());
    
    const { data: processed, error: dbError } = await supabase
      .from('invoice_processing')
      .select('folio, rut_emisor')
      .in('folio', folios);
      
    if (dbError) {
      console.error('Error consultando Supabase:', dbError);
    }
    
    // Mapear resultados para la interfaz
    const result = facturas.map((f: any) => {
      const rutEmisor = f.client?.code || 'S/R';
      const isProcessed = processed?.some((p: any) => p.folio === f.folio.toString() && p.rut_emisor === rutEmisor);
      
      return {
        id: f.id,
        fecha: new Date(f.emissionDate * 1000).toLocaleDateString('es-CL'),
        rutProveedor: rutEmisor,
        razonSocial: f.client?.company || 'Sin Nombre',
        montoTotal: f.totalAmount,
        folio: f.folio.toString(),
        procesada: isProcessed || false
      };
    });
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Error en fetch-invoices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
