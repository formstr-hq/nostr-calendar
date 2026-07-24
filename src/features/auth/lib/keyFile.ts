const KEY_FILE_NAME = "key.txt";

export function downloadNcryptsec(ncryptsec: string) {
  const url = URL.createObjectURL(
    new Blob([ncryptsec], { type: "text/plain" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = KEY_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readNcryptsecFile(file: File): Promise<string> {
  const isTextFile =
    file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
  if (!isTextFile) throw new Error("keyFileInvalid");

  const value = (await file.text()).trim();
  if (!value) throw new Error("keyFileEmpty");
  return value;
}
