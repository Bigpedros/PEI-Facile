declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface ExtractOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer | ArrayBuffer;
    path?: string;
  }

  export function extractRawText(options: ExtractOptions): Promise<MammothResult>;
  export function convertToHtml(options: ExtractOptions): Promise<MammothResult>;
}

declare module 'utif' {
  export interface IFD {
    width: number;
    height: number;
    data: Uint8Array;
    [key: string]: any;
  }

  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[];
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
}
