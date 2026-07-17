import { NextResponse } from 'next/server';
import { extractWithClaude } from '@/lib/extractors/claude-extractor';
import { extractWithGemini } from '@/lib/extractors/gemini-extractor';
import { getProviderImagePrompt } from '@/lib/extractors/provider-prompts';
import { getProviderByRut } from '@/lib/providers';
import { runPipeline } from '@/lib/supplier-rules';
import { processEquivalences, fetchTaxRates } from '@/lib/equivalence-service';
import { normalizeRut, parseDiscountPercentage } from '@/lib/invoice-utils';

// Permitir más tiempo para procesamiento de imágenes/PDF
export const maxDuration = 60;

const MAX_XML_SIZE = 2 * 1024 * 1024; // 2MB para XML
const MAX_FILE_BASE64_SIZE = 10 * 1024 * 1024; // ~7.5MB archivo real (10MB en base64)
const TOTAL_MISMATCH_THRESHOLD = 0.02; // 2% de tolerancia

interface TotalValidation {
  valid: boolean;
  sum: number;
  total: number;
  diff: number;
  diffPct: number;
}

function isCocaCola(data: any): boolean {
  const rut = normalizeRut(data.rutEmisor || '');
  const name = (data.razonSocial || '').toUpperCase();
  return rut === '93281000K' || name.includes('COCA COLA') || name.includes('COCA-COLA') || name.includes('EMBONOR');
}

function validateTotals(data: any): TotalValidation {
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    return { valid: true, sum: 0, total: 0, diff: 0, diffPct: 0 };
  }

  let total = Number(data.totalNetoFactura);
  if (!total || total <= 0) {
    return { valid: true, sum: 0, total: 0, diff: 0, diffPct: 0 };
  }

  const sum = data.items.reduce((acc: number, item: any) => {
    return acc + (Number(item.subtotalNeto) || 0);
  }, 0);

  // Para Coca-Cola el NETO del pie incluye fletes; la suma de subtotalNeto de ítems no.
  // Se resta el total de fletes para comparar contra la base neta real (NETO - FLETES).
  if (isCocaCola(data)) {
    const totalFletes = data.items.reduce((acc: number, item: any) => {
      return acc + (Number(item.fleteTotal) || 0);
    }, 0);
    total = total - totalFletes;
  }

  const discountRate = parseDiscountPercentage(data.descuentoGlobal?.porcentaje);
  const discountAmount = Number(data.descuentoGlobal?.monto) || 0;
  let adjustedSum = sum;
  if (discountRate > 0) {
    adjustedSum = sum * (1 - discountRate);
  } else if (discountAmount > 0) {
    adjustedSum = sum - discountAmount;
  }

  const diff = Math.abs(adjustedSum - total);
  const diffPct = total > 0 ? diff / total : 0;

  return {
    valid: diffPct <= TOTAL_MISMATCH_THRESHOLD,
    sum: adjustedSum,
    total,
    diff,
    diffPct,
  };
}

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
    let extractionWarning: string | undefined;

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

    let { data, sourceFormat, multipleInvoices } = extractionResult;

    // 2b. Validación cruzada de totales para PDF/imagen: si no cuadra, reintentar con Gemini.
    if (fileBase64 && !multipleInvoices && data.totalNetoFactura) {
      const claudeValidation = validateTotals(data);
      if (!claudeValidation.valid) {
        console.warn(
          `Totales no cuadran con Claude: sum=${claudeValidation.sum}, total=${claudeValidation.total}, diffPct=${(claudeValidation.diffPct * 100).toFixed(1)}%`
        );
        try {
          const geminiResult = await extractWithGemini({ xmlContent, fileBase64, fileType, docPromptOverride });
          const geminiValidation = validateTotals(geminiResult.data);
          if (geminiValidation.valid) {
            console.log('Gemini corrigió la extracción: totales cuadran.');
            extractionResult = geminiResult;
            data = geminiResult.data;
            extractorUsed = 'gemini';
          } else {
            console.warn(
              `Gemini tampoco cuadró: sum=${geminiValidation.sum}, total=${geminiValidation.total}, diffPct=${(geminiValidation.diffPct * 100).toFixed(1)}%`
            );
            extractionWarning = `Diferencia detectada: suma de ítems (${Math.round(claudeValidation.sum)}) no cuadra con total factura (${Math.round(claudeValidation.total)}). Revisar cantidades y montos manualmente.`;
          }
        } catch (geminiRetryErr: any) {
          console.warn('Retry con Gemini falló tras discrepancia de totales:', geminiRetryErr.message);
          extractionWarning = `Diferencia detectada: suma de ítems (${Math.round(claudeValidation.sum)}) no cuadra con total factura (${Math.round(claudeValidation.total)}). Revisar cantidades y montos manualmente.`;
        }
      }
    }

    // 3. Fallback a datos conocidos
    if (!data.rutEmisor && knownRut) data.rutEmisor = knownRut;
    if (!data.razonSocial && knownName) data.razonSocial = knownName;
    if (knownName && !data.razonSocial) data.razonSocial = knownName;

    // 4. Obtener tax rates de Supabase
    const taxRates = await fetchTaxRates();

    // 5. Procesar múltiples facturas si es el caso
    if (multipleInvoices && Array.isArray(data)) {
      const processedInvoices = [];
      
      for (let i = 0; i < data.length; i++) {
        const invoiceData = data[i];
        
        // Fallback a datos conocidos para cada factura
        if (!invoiceData.rutEmisor && knownRut) invoiceData.rutEmisor = knownRut;
        if (!invoiceData.razonSocial && knownName) invoiceData.razonSocial = knownName;
        if (knownName && !invoiceData.razonSocial) invoiceData.razonSocial = knownName;

        const rutEmisor = normalizeRut(invoiceData.rutEmisor || '');

        // Ejecutar pipeline de reglas para cada factura
        const processedInvoice = runPipeline(invoiceData, taxRates, sourceFormat, extractorUsed);

        // Procesar equivalencias SKU para cada factura
        if (processedInvoice.items && processedInvoice.items.length > 0) {
          await processEquivalences(processedInvoice.items, rutEmisor);
        }

        processedInvoices.push({
          ...invoiceData,
          rutEmisor: invoiceData.rutEmisor || knownRut || '',
          razonSocial: processedInvoice.razonSocial,
          folio: processedInvoice.folio,
          items: processedInvoice.items,
          descuentoGlobal: processedInvoice.descuentoGlobal,
          extractionWarning,
          extractorUsed,
        });
      }

      return NextResponse.json({
        multipleInvoices: true,
        invoices: processedInvoices,
      });
    }

    // Procesamiento normal para una sola factura
    const rutEmisor = normalizeRut(data.rutEmisor || '');

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
      descuentoGlobal: invoiceData.descuentoGlobal,
      extractionWarning,
      extractorUsed,
    });
  } catch (error: any) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: 'Error al procesar el documento' }, { status: 500 });
  }
}
