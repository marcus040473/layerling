import { AsyncZipDeflate, Zip, ZipDeflate, ZipPassThrough, type DeflateOptions } from "fflate";

// fflate.zip starts one worker per large entry. Bound jobs during project saves,
// including the automatic save performed before an imported project opens.
export function boundedProjectZip(files: Record<string, Uint8Array>, level: DeflateOptions["level"] = 6) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const entries = Object.entries(files);
    const chunks: Uint8Array[] = [];
    let length = 0;
    let next = 0;
    let active = 0;
    let completed = 0;
    let settled = false;
    let ending = false;
    const workers = new Set<AsyncZipDeflate>();
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      for (const worker of workers) worker.terminate();
      archive.terminate();
      reject(error);
    };
    const archive = new Zip((error, data, final) => {
      if (settled) return;
      if (error) {
        fail(error);
        return;
      }
      try {
        chunks.push(data);
        length += data.byteLength;
        if (final) {
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          settled = true;
          resolve(bytes);
        }
      } catch (error) {
        fail(error);
      }
    });
    function pump() {
      if (settled || ending) return;
      try {
        if (completed === entries.length) {
          ending = true;
          archive.end();
          return;
        }
        while (active < 2 && next < entries.length && !settled) {
          const [name, bytes] = entries[next++];
          const stream = level === 0 ? new ZipPassThrough(name)
            : bytes.length < 160_000 ? new ZipDeflate(name, { level })
              : new AsyncZipDeflate(name, { level });
          if (stream instanceof AsyncZipDeflate) workers.add(stream);
          // DOS dates use local getters; UTC midnight can become 1979 west of UTC.
          stream.mtime = new Date(1980, 0, 1);
          archive.add(stream);
          if (settled) return;
          const forward = stream.ondata;
          active++;
          stream.ondata = (error, data, final) => {
            if (settled) return;
            try {
              forward(error, data, final);
            } catch (failure) {
              fail(failure);
              return;
            }
            if (error) {
              fail(error);
              return;
            }
            if (final) {
              if (stream instanceof AsyncZipDeflate) workers.delete(stream);
              active--;
              completed++;
              queueMicrotask(pump);
            }
          };
          // AsyncZipDeflate transfers its input buffer to the worker. Keep the
          // caller's assets intact, as the previous zip() API did by default.
          stream.push(stream instanceof AsyncZipDeflate ? bytes.slice() : bytes, true);
        }
      } catch (error) {
        fail(error);
      }
    }
    pump();
  });
}
