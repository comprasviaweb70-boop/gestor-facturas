import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  try {
    let invoices = [];
    
    if (!token || token === 'ejemplo_temporal') {
      console.log('Modo simulación Bsale para facturas de compra');
      invoices = [
        {
          id: 1,
          emissionDate: Math.floor(Date.now() / 1000) - 86400 * 2,
          number: '1001',
          totalAmount: 150000,
          document_type: { name: 'Factura Electrónica' },
          supplier: { code: '81094100-6', company: 'COLUN' }
        },
        {
          id: 2,
          emissionDate: Math.floor(Date.now() / 1000) - 86400 * 5,
          number: '1002',
          totalAmount: 250000,
          document_type: { name: 'Factura Electrónica' },
          supplier: { code: '76123456-7', company: 'Distribuidora Sur' }
        }
      ];
    } else {
      // Intentamos con el endpoint que mencionaste: documents/search/from_third_party
      // Probamos con la extensión .json que exige Bsale
      let res = await fetch('https://api.bsale.cl/v1/documents/search/from_third_party.json?limit=50', {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      // Si da 404, intentamos como parámetro de búsqueda en el search general
      if (!res.ok) {
        console.log('Falló /documents/search/from_third_party.json, intentando como parámetro...');
        res = await fetch('https://api.bsale.cl/v1/documents/search.json?from_third_party=1&limit=50', {
          headers: {
            'access_token': token,
            'Accept': 'application/json'
          }
        });
      }
      
      if (!res.ok) {
        throw new Error(`Error en la API de Bsale: ${res.status}`);
      }
      
      const data = await res.json();
      invoices = data.items || [];
    }
    
    const oneMonthAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const facturas = invoices.filter((inv: any) => {
      const isRecent = inv.emissionDate >= oneMonthAgo;
      const isFactura = inv.document_type?.name?.includes('Factura') || inv.document_type_id === 33;
      
      const rutEmisor = inv.supplier?.code || inv.issuer?.code || '';
      const isFromThirdParty = rutEmisor !== '77777777-7'; // Ajustar si es necesario
      
      return isRecent && isFactura && isFromThirdParty;
    });
    
    const folios = facturas.map((f: any) => f.number.toString());
    
    const { data: processed, error: dbError } = await supabase
      .from('invoice_processing')
      .select('folio, rut_emisor')
      .in('folio', folios);
      
    const result = facturas.map((f: any) => {
      const rutEmisor = f.supplier?.code || f.issuer?.code || 'S/R';
      const isProcessed = processed?.some((p: any) => p.folio === f.number.toString() && p.rut_emisor === rutEmisor);
      
      return {
        id: f.id,
        fecha: new Date(f.emissionDate * 1000).toLocaleDateString('es-CL'),
        rutProveedor: rutEmisor,
        razonSocial: f.supplier?.company || f.supplier?.name || 'Sin Nombre',
        montoTotal: f.totalAmount,
        folio: f.number.toString(),
        procesada: isProcessed || false
      };
    });
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Error en fetch-invoices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
