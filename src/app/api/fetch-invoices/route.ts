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
      // Consulta a Bsale usando el endpoint sugerido por el usuario para facturas de compra
      // Probamos con /v1/purchase_invoices.json como base
      const res = await fetch('https://api.bsale.cl/v1/purchase_invoices.json?limit=50', {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      if (!res.ok) {
        // Si falla, intentamos con received_dtes.json como segunda opción sugerida
        const resFallback = await fetch('https://api.bsale.cl/v1/received_dtes.json?limit=50', {
          headers: {
            'access_token': token,
            'Accept': 'application/json'
          }
        });
        
        if (!resFallback.ok) {
          throw new Error(`Error en la API de Bsale (Purchase): ${res.status} | (Received): ${resFallback.status}`);
        }
        
        const data = await resFallback.json();
        invoices = data.items || [];
      } else {
        const data = await res.json();
        invoices = data.items || [];
      }
    }
    
    const oneMonthAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    // Filtrar por RUT del emisor distinto al de Emporio Iciz
    // Asumimos que el RUT de Emporio Iciz es el del receptor. 
    // Para la prueba, filtraremos los que vengan de RUTs conocidos como propios si fuera el caso.
    // Por defecto, en facturas de compra el emisor SIEMPRE es el tercero (proveedor).
    
    const facturas = invoices.filter((inv: any) => {
      const isRecent = inv.emissionDate >= oneMonthAgo;
      const isFactura = inv.document_type?.name?.includes('Factura') || inv.document_type_id === 33;
      
      // Obtenemos el RUT del emisor (proveedor)
      const rutEmisor = inv.supplier?.code || inv.issuer?.code || '';
      
      // Filtrar si el RUT emisor es igual al de la empresa (suponiendo que no queremos auto-facturas)
      // Como no tenemos el RUT exacto de Emporio Iciz, dejamos la condición lista:
      const isFromThirdParty = rutEmisor !== '77777777-7'; // Reemplazar por el RUT real de Emporio Iciz si es necesario
      
      return isRecent && isFactura && isFromThirdParty;
    });
    
    const folios = facturas.map((f: any) => f.number.toString());
    
    const { data: processed, error: dbError } = await supabase
      .from('invoice_processing')
      .select('folio, rut_emisor')
      .in('folio', folios);
      
    if (dbError) {
      console.error('Error consultando Supabase:', dbError);
    }
    
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
