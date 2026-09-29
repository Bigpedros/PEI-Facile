declare module 'pdfjs-dist' {
  export const OPS: any;
  export const GlobalWorkerOptions: any;
  export function getDocument(...args: any[]): any;
  export type PDFPageProxy = any;
  export type PDFDocumentProxy = any;
}
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const OPS: any;
  export const GlobalWorkerOptions: any;
  export function getDocument(...args: any[]): any;
}
declare module 'tesseract.js' {
  export function createWorker(...args: any[]): Promise<any>;
}
declare module 'pdf-lib' {
  export const PDFDocument: any;
  export const pushGraphicsState: any;
  export const popGraphicsState: any;
  export const concatTransformationMatrix: any;
  export const degrees: any;
}

declare const process: any;
