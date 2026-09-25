/**
 * Canonical Template Engine (CTE) - Release R07
 * TemplateImportService
 *
 * Acquires and imports canonical templates from:
 * 1. PDF ministeriali
 * 2. Word (.docx)
 * 3. PDF vettoriali
 * 4. PDF raster (scanned documents)
 *
 * Guarantees zero code changes when new ministerial models are released:
 * models are ingested dynamically, structurally fingerprinted, scientifically
 * validated, checked against duplicates, and registered into the CanonicalTemplateRegistry.
 */

import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  DocumentSourceType,
  ImportTemplateOptions,
  RegistryValidationReport,
  TemplateVersion,
} from '../types';
import { CanonicalTemplateRegistry } from './canonicalRegistry';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import { computeSha256 } from '../../templateAcquisitionService';
import { DocxFormatAdapter } from '../../documentAdapters/docxAdapter';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Service for dynamic acquisition and ingestion of canonical PEI templates.
 */
export class TemplateImportService {
  private registry: CanonicalTemplateRegistry;
  private analyzer: PdfDocumentAnalyzer;
  private docxAdapter: DocxFormatAdapter;

  constructor(options?: {
    registry?: CanonicalTemplateRegistry;
    analyzer?: PdfDocumentAnalyzer;
  }) {
    this.registry = options?.registry || new CanonicalTemplateRegistry();
    this.analyzer = options?.analyzer || new PdfDocumentAnalyzer();
    this.docxAdapter = new DocxFormatAdapter();
  }

  /**
   * Returns the underlying registry.
   */
  getRegistry(): CanonicalTemplateRegistry {
    return this.registry;
  }

  /**
   * Imports a ministerial or vector PDF document into the registry.
   */
  async importFromPdf(
    data: ArrayBuffer | Uint8Array,
    options: ImportTemplateOptions
  ): Promise<{ template: TemplateVersion; report: RegistryValidationReport }> {
    const rawBytes =
      data instanceof Uint8Array ? data : new Uint8Array(data);
    const buffer = rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    );

    // Compute cryptographic SHA-256
    const hash = await computeSha256(rawBytes);

    // Analyze document structure, fingerprint, and geometry
    const analysis = await this.analyzer.analyze(buffer);
    const fingerprint = analysis.structuralFingerprint;
    const geometry = analysis.geometricAnalysis || {
      overallGeometryScore: 95.0,
      overallSkewAngle: 0,
      pages: analysis.pages.map(p => ({
        pageNumber: p.pageNumber,
        widthPt: p.width,
        heightPt: p.height,
        fields: [],
      })),
    };

    // Determine if raster or vector
    const isRaster = Boolean(analysis.hasRaster && !analysis.hasVectors);
    const isVector = Boolean(analysis.hasVectors);

    const detectedSourceType: DocumentSourceType =
      options.sourceType ||
      (isRaster
        ? DocumentSourceType.SCAN
        : isVector
          ? DocumentSourceType.PDF
          : DocumentSourceType.PDF);

    // Synthesize schema from extracted sections if not explicitly provided
    const templateSchema =
      options.templateSchema || {
        sections: analysis.pages.map(p => ({
          pageNumber: p.pageNumber,
          textLength: p.text.length,
          preview: p.text.substring(0, 100),
        })),
        fieldCount: analysis.pages.reduce(
          (acc, p) => acc + (p.charCount > 0 ? 1 : 0),
          0
        ),
        schemaType: isVector ? 'VECTOR_PDF_MINISTERIAL' : 'RASTER_PDF_MINISTERIAL',
      };

    const templateId =
      options.id ||
      `MOD_${options.ordineScolastico.toUpperCase()}_${String(options.annoValidita).replace(/\D/g, '')}_${hash.substring(0, 8)}`;

    const templateVersion: TemplateVersion = {
      id: templateId,
      nome: options.nome,
      descrizione:
        options.descrizione ||
        `Modello ${options.nome} - Versione ministeriale ${options.versioneMinisteriale} (a.s. ${options.annoValidita})`,
      ordineScolastico: options.ordineScolastico,
      versioneMinisteriale: options.versioneMinisteriale,
      versione: options.versioneMinisteriale,
      annoValidita: options.annoValidita,
      validFromYear: options.validFromYear,
      validToYear: options.validToYear,
      hash,
      fingerprint,
      geometry,
      templateSchema,
      dataRegistrazione: new Date().toISOString(),
      stato: options.status || 'active',
      sourceType: detectedSourceType,
      metadata: {
        ...options.metadata,
        isRaster,
        isVector,
        byteSize: rawBytes.byteLength,
        pageCount: analysis.totalPages,
      },
    };

    // Validate against registry rules (including strict duplicate check)
    const report = this.registry.validate(templateVersion);
    if (!report.isValid) {
      if (options.throwOnError !== false) {
        throw new Error(report.summary);
      }
      return { template: templateVersion, report };
    }

    // Register into active catalog
    this.registry.register(templateVersion, { throwOnError: true });
    return { template: templateVersion, report };
  }

  /**
   * Imports a Word (.docx) document into the registry.
   */
  async importFromWord(
    data: ArrayBuffer | Uint8Array,
    options: ImportTemplateOptions
  ): Promise<{ template: TemplateVersion; report: RegistryValidationReport }> {
    const rawBytes =
      data instanceof Uint8Array ? data : new Uint8Array(data);
    const buffer = rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    );

    const hash = await computeSha256(rawBytes);

    // Extract pages / text chunks using DocxFormatAdapter
    const extractedPages = await this.docxAdapter.extractPages(
      buffer,
      options.fileName || 'document.docx'
    );

    // Construct CanonicalDocumentFingerprint from parsed Word pages
    const pageFingerprints: CanonicalPageFingerprint[] = extractedPages.map(
      (ep, idx) => {
        const textCount = ep.text.split(/\s+/).filter(Boolean).length;
        return {
          pageIndex: idx,
          pageWidth: A4_WIDTH_PT,
          pageHeight: A4_HEIGHT_PT,
          rotation: 0,
          mediaBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
          cropBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
          vectorObjectCount: 0,
          rasterImageCount: 0,
          textObjectCount: textCount,
          fontFamilies: ['Calibri', 'Arial'],
          geometryHash: `geo_word_${idx}_${A4_WIDTH_PT}_${A4_HEIGHT_PT}`,
          structureHash: `struct_word_${idx}_${textCount}_${hash.substring(0, 8)}`,
          confidence: 0.95,
        };
      }
    );

    const docGeometryHash = `dgh_word_${pageFingerprints.length}_${A4_WIDTH_PT}x${A4_HEIGHT_PT}`;
    const docStructureHash = `dsh_word_${pageFingerprints.map(p => p.structureHash).join('_')}`;
    const masterFingerprint = `FP_WORD_${hash.substring(0, 16)}_${pageFingerprints.length}P`;

    const fingerprint: CanonicalDocumentFingerprint = {
      pageCount: pageFingerprints.length,
      pages: pageFingerprints,
      documentGeometryHash: docGeometryHash,
      documentStructureHash: docStructureHash,
      fingerprint: masterFingerprint,
    };

    const geometry = options.geometry || {
      overallGeometryScore: 92.0,
      overallSkewAngle: 0,
      pages: extractedPages.map((_, idx) => ({
        pageNumber: idx + 1,
        widthPt: A4_WIDTH_PT,
        heightPt: A4_HEIGHT_PT,
        fields: [],
      })),
    };

    const templateSchema =
      options.templateSchema || {
        sections: extractedPages.map(ep => ({
          pageNumber: ep.pageNumber,
          preview: ep.text.substring(0, 120),
          length: ep.nativeCharCount,
        })),
        source: 'WORD_DOCX',
      };

    const templateId =
      options.id ||
      `MOD_DOCX_${options.ordineScolastico.toUpperCase()}_${String(options.annoValidita).replace(/\D/g, '')}_${hash.substring(0, 8)}`;

    const templateVersion: TemplateVersion = {
      id: templateId,
      nome: options.nome,
      descrizione:
        options.descrizione ||
        `Modello Word DOCX ${options.nome} - a.s. ${options.annoValidita}`,
      ordineScolastico: options.ordineScolastico,
      versioneMinisteriale: options.versioneMinisteriale,
      versione: options.versioneMinisteriale,
      annoValidita: options.annoValidita,
      validFromYear: options.validFromYear,
      validToYear: options.validToYear,
      hash,
      fingerprint,
      geometry,
      templateSchema,
      dataRegistrazione: new Date().toISOString(),
      stato: options.status || 'active',
      sourceType: DocumentSourceType.DOCX,
      metadata: {
        ...options.metadata,
        fileName: options.fileName,
        byteSize: rawBytes.byteLength,
        extractedSectionsCount: extractedPages.length,
      },
    };

    const report = this.registry.validate(templateVersion);
    if (!report.isValid) {
      if (options.throwOnError !== false) {
        throw new Error(report.summary);
      }
      return { template: templateVersion, report };
    }

    this.registry.register(templateVersion, { throwOnError: true });
    return { template: templateVersion, report };
  }

  /**
   * Generic import entry point that inspects data header/extension and delegates to appropriate importer.
   */
  async importTemplate(
    source: ArrayBuffer | Uint8Array,
    options: ImportTemplateOptions
  ): Promise<{ template: TemplateVersion; report: RegistryValidationReport }> {
    const rawBytes =
      source instanceof Uint8Array ? source : new Uint8Array(source);

    // Inspect magic bytes
    const isPdf =
      rawBytes.length >= 4 &&
      rawBytes[0] === 0x25 && // %
      rawBytes[1] === 0x50 && // P
      rawBytes[2] === 0x44 && // D
      rawBytes[3] === 0x46; // F

    const isZip =
      rawBytes.length >= 4 &&
      rawBytes[0] === 0x50 && // P
      rawBytes[1] === 0x4b && // K
      rawBytes[2] === 0x03 &&
      rawBytes[3] === 0x04;

    const fileName = (options.fileName || '').toLowerCase();

    if (isZip || fileName.endsWith('.docx') || options.sourceType === DocumentSourceType.DOCX) {
      return this.importFromWord(rawBytes, options);
    }

    if (isPdf || fileName.endsWith('.pdf') || options.sourceType === DocumentSourceType.PDF) {
      return this.importFromPdf(rawBytes, options);
    }

    // Default fallback to PDF analyzer
    return this.importFromPdf(rawBytes, options);
  }
}
