import JSZip from "jszip";

/**
 * Extracts all .ics file contents from a ZIP archive.
 *
 * Handles nested directory structures (e.g. Google Takeout exports)
 * by recursively scanning all entries in the archive.
 *
 * @param zipData - The raw ZIP file as an ArrayBuffer
 * @returns Array of { filename, content } for each .ics file found
 */
export async function extractICSFromZip(
  zipData: ArrayBuffer,
): Promise<{ filename: string; content: string }[]> {
  const zip = await JSZip.loadAsync(zipData);
  const results: { filename: string; content: string }[] = [];

  const filePromises: Promise<void>[] = [];

  zip.forEach((relativePath, entry) => {
    // Skip directories
    if (entry.dir) return;

    // Filter for .ics files (case-insensitive)
    if (!relativePath.toLowerCase().endsWith(".ics")) return;

    filePromises.push(
      entry.async("text").then((content) => {
        results.push({ filename: relativePath, content });
      }),
    );
  });

  await Promise.all(filePromises);

  return results;
}
