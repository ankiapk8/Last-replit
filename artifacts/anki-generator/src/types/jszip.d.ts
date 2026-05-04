declare module "jszip" {
  interface JSZipObject {
    name: string;
    async(type: "string"): Promise<string>;
    async(type: "blob"): Promise<Blob>;
    async(type: "arraybuffer"): Promise<ArrayBuffer>;
  }

  interface OutputByType {
    base64: string;
    text: string;
    binarystring: string;
    array: number[];
    uint8array: Uint8Array;
    arraybuffer: ArrayBuffer;
    blob: Blob;
    nodebuffer: Buffer;
  }

  interface JSZipGeneratorOptions<T extends keyof OutputByType = keyof OutputByType> {
    type?: T;
    compression?: string;
    compressionOptions?: { level: number };
    comment?: string;
    mimeType?: string;
    encodeFileName?: (filename: string) => string;
    streamFiles?: boolean;
    platform?: string;
  }

  interface JSZip {
    file(name: string, data: string | Blob | ArrayBuffer | Uint8Array): this;
    file(name: string): JSZipObject | null;
    folder(name: string): JSZip;
    generateAsync<T extends keyof OutputByType>(options: JSZipGeneratorOptions<T>): Promise<OutputByType[T]>;
    forEach(callback: (relativePath: string, file: JSZipObject) => void): void;
  }

  interface JSZipConstructor {
    new(): JSZip;
    (): JSZip;
  }

  const JSZip: JSZipConstructor;
  export default JSZip;
}
