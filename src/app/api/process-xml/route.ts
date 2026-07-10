import { NextResponse } from 'next/server';
import { extractWithClaude } from '@/lib/extractors/claude-extractor';
import { extractWithGemini } from '@/lib/extractors/gemini-extractor';
import { getProviderImagePrompt } from '@/lib/extractors/provider-prompts';
import { getProviderByRut } from '@/lib/providers';
import { runPipeline } from '@/lib/supplier-rules';
import { processEquivalences, fetchTaxRates } from '@/lib/equivalence-service';
import { normalizeRut } from '@/lib/invoice-utils';

// Permitir más tiempo para procesamiento de imágenes/PDF
export const maxDuration = 60;

const MAX_XML_SIZE = 2 * 1024 * 1024; // 2MB para XML
const MAX_FILE_BASE64_SIZE = 10 * 1024 * 1024; // ~7.5MB archivo real (10MB en base64)

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { xmlContent, fileBase64, fileType, knownRut, knownName } = body;

    if (!xmlContent && !fileBase64) {
      return NextResponse.json({ error: 'Falta contenido para procesar (XML, PDF o imagen)' }, { status: 400 });
    }

    if (xmlContent && xmlContent.length > MAX_XML_SIZE) {
      return NextResponse.json({ error: 'El XML excede el tamaño máximo permitido (2MB).' }, { status: 413 });
    }

    if (fileBase64 && fileBase64.length > MAX_FILE_BASE64_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo permitido.' }, { status: 413 });
    }

    if (fileType && !['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(fileType)) {
      return NextResponse.json({ error: 'Tipo de archivo no soportado.' }, { status: 400 });
    }

    // 1. Determinar prompt específico de proveedor para imagen/PDF
    const provider = fileBase64 ? getProviderByRut(knownRut) : undefined;
    const docPromptOverride = fileBase64 ? getProviderImagePrompt(provider?.documentPromptKey) : undefined;

    // 2. Extracción con Claude (fallback a Gemini si falla)
    let extractionResult;
    let extractorUsed: 'claude' | 'gemini' = 'claude';
    try {
      extractionResult = await extractWithClaude({ xmlContent, fileBase64, fileType, docPromptOverride });
    } catch (claudeErr: any) {
      console.warn('Claude falló, intentando con Gemini como fallback:', claudeErr.message);
      try {
        extractionResult = await extractWithGemini({ xmlContent, fileBase64, fileType, docPromptOverride });
        extractorUsed = 'gemini';
      } catch (geminiErr: any) {
        const preview = (geminiErr.message || '').substring(0, 300);
        return NextResponse.json({
          error: `Error al procesar factura (Claude y Gemini fallaron): ${preview}...`,
        }, { status: 500 });
      }
    }

    const { data, sourceFormat } = extractionResult;

    // 3. Fallback a datos conocidos
    if (!data.rutEmisor && knownRut) data.rutEmisor = knownRut;
    if (!data.razonSocial && knownName) data.razonSocial = knownName;
    if (knownName && !data.razonSocial) data.razonSocial = knownName;

    const rutEmisor = normalizeRut(data.rutEmisor || '');

    // 4. Obtener tax rates de Supabase
    const taxRates = await fetchTaxRates();

    // 5. Ejecutar pipeline de reglas
    const invoiceData = runPipeline(data, taxRates, sourceFormat, extractorUsed);

    // 6. Procesar equivalencias SKU
    if (invoiceData.items && invoiceData.items.length > 0) {
      await processEquivalences(invoiceData.items, rutEmisor);
    }

    // 7. Respuesta compatible con frontend existente
    // Devolver rutEmisor sin normalizar para compatibilidad con equivalencias en Supabase
    return NextResponse.json({
      ...data,
      rutEmisor: data.rutEmisor || knownRut || '',
      razonSocial: invoiceData.razonSocial,
      folio: invoiceData.folio,
      items: invoiceData.items,
    });
  } catch (error: any) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: 'Error al procesar el documento' }, { status: 500 });
  }
}
