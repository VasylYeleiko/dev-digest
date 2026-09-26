/** Read a File as base64 (client-side, no dependency) — the server's
 *  `/skills/import` takes `{ filename, content_base64 }` to avoid a
 *  multipart plugin. Reads via `FileReader.readAsArrayBuffer` rather than
 *  `File.prototype.arrayBuffer()` — jsdom (this package's test environment)
 *  doesn't implement the latter, and FileReader works in every real browser
 *  too. Chunked to avoid blowing the call stack on large files. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}
