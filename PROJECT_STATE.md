# Estado del Proyecto: SIAI - Pantalla de Validación

## Visión General
Sistema integral de gestión de facturas electrónicas chilenas (DTE) y mapeo de SKUs diseñado para Emporio Iciz. Permite extraer automáticamente datos de facturas en formato XML, PDF o imagen mediante inteligencia artificial (Claude/Gemini), validar productos contra el ERP Bsale, mapear códigos de proveedor a SKUs internos, calcular precios de costo unitario (PCU) y precios de venta unitario (PVU), gestionar recepciones de stock y exportar datos a Excel. Resuelve el problema de la carga manual de facturas y la discrepancia entre códigos de proveedor y el catálogo interno.

## Decisiones Estratégicas
- **Arquitectura Next.js Full-Stack**: Se utiliza Next.js 16.2.6 con App Router para unificar frontend y API routes en un solo proyecto, simplificando el despliegue y la comunicación cliente-servidor.
- **Extracción de IA con Fallback**: Claude (Anthropic) es el extractor principal; Gemini (Google) actúa como fallback automático si Claude falla o si hay discrepancias en la validación cruzada de totales.
- **Supabase como Backend Serverless**: Se eligió Supabase sobre una API propia o BDD local porque proporciona PostgreSQL administrado, autenticación lista y SDK cliente sin necesidad de backend propio.
- **Integración Nativa con Bsale**: El sistema se conecta directamente a la API REST v1 de Bsale (Chile) para buscar productos por SKU/código de barras, obtener facturas electrónicas y realizar recepciones de stock automáticas.
- **Pipeline de Reglas por Proveedor**: Se implementó un sistema de reglas por proveedor (`supplier-rules`) que permite aplicar multiplicadores de cantidad, tasas de impuestos adicionales (ILA) y post-procesamientos específicos sin alterar el código base.
- **Cálculo de Costos Estandarizado**: La fórmula de PCU incluye explícitamente flete (`(subtotalNeto + impuestosAdicionales + fleteTotal) / cantidad`) y el PVU aplica margen + IVA (`pcu * (1 + margen/100) * 1.19`). Esta fórmula no debe ser modificada sin autorización del negocio.
- **Idioma de Comunicación**: Todo el código, UI y documentación interna está en español, incluyendo nombres de variables, comentarios y mensajes de usuario, dado que el usuario final y los proveedores son de Chile.
- **Flujo Git Automatizado**: Al finalizar cada tarea con cambios en el código, la IA debe hacer automáticamente `commit + push a origin main` para que Vercel despliegue los cambios. No se requiere que el usuario lo solicite.
- **Clasificación de Proveedores por Formato**: Los proveedores se dividen en dos categorías según el formato de entrada:
  - **Proveedores XML**: Hiperkor, DIMAK, BAT Chile (detectan RUT automáticamente; no requieren selector en carga manual).
  - **Proveedores Imagen/PDF**: Coca-Cola Embonor, VCT, IDEAL, CCU, Bundor, Zapata, MAD CHARLIES, NORKOSHE (requieren selección explícita en el `UploadModule` para extraer con prompts específicos).

## Progreso Actual
- [x] Módulo de carga manual de facturas (XML, PDF, JPG, PNG) con drag & drop
- [x] Extracción automática con Claude + fallback a Gemini
- [x] Validación cruzada de totales (2% tolerancia) para detección de discrepancias
- [x] Pipeline de reglas por proveedor (multiplier, tax, post-process)
- [x] Tabla de validación editable con búsqueda por código de barras/SKU en Bsale
- [x] Gestión de equivalencias SKU (supplier_code → internal_sku) con persistencia en Supabase
- [x] Exportación a Excel con formato corporativo (colores, totales, auto-ajuste)
- [x] Módulo de Recepción Automática desde Bsale (fetch de facturas electrónicas)
- [x] Módulo de Auto-Recepción de stock con preview de cantidades y oficinas Bsale
- [x] Cálculo de PCU y PVU con margen configurable
- [x] Guardado de nombres de fantasía por proveedor
- [x] Sistema de cola de validación (`validation_queue`) para productos sin mapear
- [x] Soporte para múltiples facturas en un solo archivo PDF/imagen
- [x] Preferencias de extracción por proveedor (XML vs Visión/PDF)
- [x] Ignorar facturas que no representan aumento de stock
- [x] Registro de proveedores de imagen/PDF en selector: Coca-Cola, VCT, IDEAL, CCU, Bundor, Zapata, MAD CHARLIES, NORKOSHE
- [ ] Tests de integración con Bsale en producción
- [ ] Dashboard de métricas de procesamiento
- [ ] Autenticación de usuarios y roles

## Inventario de Reglas por Proveedor Implementadas
| Proveedor | RUT | Multiplier (Cantidad) | Tax (ILA/Flete) | Post-Process (Descuento/Distribución) | Formato |
|---|---|---|---|---|---|
| **Hiperkor** | 78.753.810-? | Pack auto (detecta multiplicador en nombre) | Cálculo inverso bruto→neto con ILA según nombre (cerveza/agua) | — | XML |
| **DIMAK** | 788.095.600-? | Pack auto (detecta multiplicador en nombre) | ILA según grado alcohólico en nombre | Descuento global proporcional al neto + recálculo de ILA | XML |
| **BAT Chile** | 885.029.000-? | Pack auto (detecta multiplicador en nombre) | — | — | XML |
 | **Coca-Cola Embonor** | 93.281.000-K | Pack 6×4 (antes×después) desde nombre | — | — | Imagen/PDF |

> **Nota técnica (Jul 2026)**: El modelo de visión confundía frecuentemente la columna **I.V.A.** con **Flete Total** en facturas de Coca-Cola, porque I.V.A. está físicamente entre ambas columnas (`Neto Total | Flete Total | I.V.A. | Adicional`). La corrección final consistió en tres capas:
> 1. **Prompt reforzado con chain-of-thought**: El modelo DEBE escribir un paso a paso identificando cada columna por nombre y valor antes de emitir el JSON. Se incluyeron ejemplos concretos de filas CON Adicional (Coca-Cola) y SIN Adicional (BENEDICTINO = 0).
> 2. **Extractor invertido**: Para Coca-Cola se usa **Gemini como extractor primario** y Claude como fallback. Gemini manejó mejor los layouts con columnas contiguas.
> 3. **Post-proceso conservador (`cocaColaPostProcessRule`)**: Únicamente para productos de agua (BENEDICTINO, AGUA, MINERAL) donde sabemos con certeza que no llevan Adicional, si la IA metió un valor en `impuestosAdicionales` se limpia a 0 con un warning. No recalcula nada; solo corrige errores de lectura evidentes.
| **VCT** | 85.037.900-9 | CAJ multiplica × packSize; BOT usa cantidad directa | — | Servicio logístico se extrae como flete y distribuye proporcionalmente | Imagen/PDF |
| **IDEAL** | 82.623.500-4 | — | — | — | Imagen/PDF |
| **CCU** | 99.554.560-8 | Pack desde nombre (ej: 6PFX4) | 4-pasos: IA pie → grado alcoh. → keywords BD → fallback 18% | Cálculo de flete desde PTU (precioBrutoUnitario) | Imagen/PDF |
| **Bundor** | 76.424.467-2 | — | ILA según grado alcohólico; salta líneas de flete/delivery | Flete/delivery se extrae como ítem y distribuye proporcionalmente entre productos | Imagen/PDF |
| **Zapata** | 79.576.940-4 | — | Flete oculto bruto con fórmula específica: `(Bruto - (Neto*(1+0.19+ILA)))/1.19` | — | Imagen/PDF |
| **MAD CHARLIES** | 77.659.607-8 | — | ILA 10% (sin alcohol) / 20.5% (con alcohol) | Delivery/flete se distribuye proporcionalmente entre productos | Imagen/PDF |
| **NORKOSHE** | 76.484.106-8 | — | — | — | Imagen/PDF |

## Hitos Alcanzados
- Hito 1: Arquitectura de extracción dual (Claude + Gemini) con validación cruzada
- Hito 2: Pipeline de reglas por proveedor extensible
- Hito 3: Conexión bidireccional con Bsale (lectura de facturas + escritura de stock)
- Hito 4: Sistema de equivalencias SKU con matching por RUT y fallback global
- Hito 5: Exportación Excel con cálculos de costeo integrados
- Hito 6: Módulo de recepción automática desde Bsale con selección de oficinas

## Pendientes Críticos
- **Bloqueador 1**: Dependencia de tokens de API de terceros (Anthropic, Google, Bsale) configurados solo como variables de entorno; no hay UI de configuración.
- **Bloqueador 2**: La tabla `ignored_invoices` en Supabase podría no existir en nuevas instalaciones; el sistema la maneja con try/catch pero no es robusto.
- **Riesgo 1**: El modelo de Claude (`claude-haiku-4-5-20251001`) puede ser deprecado; el código usa beta headers (`pdfs-2024-09-25`, `prompt-caching-2024-07-31`) que podrían cambiar.
- **Riesgo 2**: Next.js 16.2.6 tiene breaking changes respecto a versiones anteriores; las convenciones de App Router y APIs pueden diferir de la documentación estándar.
- **Riesgo 3**: No hay sistema de autenticación; cualquier persona con acceso a la URL puede ver y modificar datos de facturas y equivalencias.

## Próximos Pasos
- [ ] Implementar autenticación con Supabase Auth y proteger rutas/APIs sensibles
- [ ] Crear panel de administración para gestionar tokens de API y proveedores
- [ ] Agregar tests E2E para el flujo completo de carga → validación → exportación
- [ ] Mejorar manejo de errores de red y reintentos en llamadas a Bsale
- [ ] Implementar caché de búsquedas Bsale para reducir latencia en validación de SKUs
- [ ] Añadir soporte para notas de crédito y guías de despacho
- [ ] Documentar API interna con OpenAPI/Swagger
- [ ] Preparar migración de datos si se actualiza Next.js a versión mayor
