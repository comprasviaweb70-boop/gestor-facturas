import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  if (!id) {
    return NextResponse.json({ error: 'Se requiere el ID del DTE' }, { status: 400 });
  }
  
  try {
    if (!token || token === 'ejemplo_temporal') {
      console.log(`Modo simulación XML para DTE ID: ${id}`);
      // XML simulado básico
      const simXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="F${id}T33">
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>${id === '1' ? '1001' : '1002'}</Folio>
        <FchEmis>2026-05-10</FchEmis>
      </IdDoc>
      <Emisor>
        <RUTEmisor>${id === '1' ? '81094100-6' : '76123456-7'}</RUTEmisor>
        <RznSoc>${id === '1' ? 'COLUN' : 'Distribuidora Sur'}</RznSoc>
      </Emisor>
      <Receptor>
        <RUTRecep>77777777-7</RUTRecep>
        <RznSocRecep>Mi Empresa</RznSocRecep>
      </Receptor>
      <Totales>
        <MntNeto>100000</MntNeto>
        <IVA>19000</IVA>
        <MntTotal>119000</MntTotal>
      </Totales>
    </Encabezado>
    <Detalle>
      <NroLinDR>1</NroLinDR>
      <CdgItem>
        <TpoCodigo>INT</TpoCodigo>
        <VlrCodigo>2801798</VlrCodigo>
      </CdgItem>
      <NmbItem>Producto Simulado ${id}</NmbItem>
      <QtyItem>10</QtyItem>
      <PrcItem>10000</PrcItem>
      <MntItem>100000</MntItem>
    </Detalle>
  </Documento>
</DTE>`;
      
      return new Response(simXml, {
        headers: { 'Content-Type': 'application/xml' }
      });
    } else {
      // Consulta real a Bsale
      const res = await fetch(`https://api.bsale.cl/v1/dtes/xml.json?id=${id}`, {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error en la API de Bsale al obtener XML: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Bsale suele devolver el XML en un campo llamado 'xml' (como string o base64)
      // O a veces el JSON completo tiene una estructura específica.
      // Vamos a asumir que viene en data.xml (que es lo más común en su API para esto)
      const xmlContent = data.xml || JSON.stringify(data);
      
      return new Response(xmlContent, {
        headers: { 'Content-Type': 'application/xml' }
      });
    }
  } catch (error: any) {
    console.error('Error en fetch-xml:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
