declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PDFData>;
  export = pdfParse;
}

declare module 'mammoth' {
  interface ExtractionResult {
    value: string;
    messages: any[];
  }

  interface Options {
    buffer?: Buffer;
    path?: string;
  }

  export function extractRawText(options: Options): Promise<ExtractionResult>;
  export function convertToHtml(options: Options): Promise<ExtractionResult>;
}
